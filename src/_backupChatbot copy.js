import React, { useState, useEffect, useRef, useCallback } from 'react';
import './Chatbot.css';

const API_ENDPOINTS = {
  LLM: process.env.REACT_APP_LLM_ENDPOINT || 'http://localhost:8000',
  WHISPER: process.env.REACT_APP_WHISPER_ENDPOINT || 'http://localhost:5000',
  QUESTIONS: process.env.REACT_APP_QUESTIONS_ENDPOINT || 'http://localhost:8001'
};

const Chatbot = () => {
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [listeningPrompt, setListeningPrompt] = useState('Click Start to begin conversation');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState('');

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);
  const utteranceRef = useRef(null);
  const audioContextRef = useRef(null);
  const gainNodeRef = useRef(null);
  const micSourceRef = useRef(null);

  // Initialize audio context and gain node
  const initAudioContext = useCallback(async () => {
    try {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      gainNodeRef.current = audioContextRef.current.createGain();
      gainNodeRef.current.connect(audioContextRef.current.destination);

      // Set initial gain to 0 (muted)
      gainNodeRef.current.gain.value = 0;
    } catch (error) {
      console.error('Error initializing audio context:', error);
      setError('Failed to initialize audio system');
    }
  }, []);

  // Function to mute/unmute microphone
  const setMicrophoneGain = useCallback((value) => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = value;
    }
  }, []);

  // Function to fetch next question
  const fetchNextQuestion = useCallback(async () => {
    try {
      const response = await fetch(`${API_ENDPOINTS.QUESTIONS}/get_question/${currentQuestionIndex}`);
      if (!response.ok) {
        throw new Error(`Error fetching question: ${response.statusText}`);
      }
      const data = await response.json();
      
      setCurrentQuestion(data.question);
      setCurrentQuestionIndex(prevIndex => prevIndex + 1);
      
      // Add the question to messages as a system message
      setMessages(prevMessages => [
        ...prevMessages,
        { sender: 'system', text: data.question }
      ]);

      // Speak the question
      utterResponse(data.question);

    } catch (error) {
      console.error("Error fetching next question:", error);
      setError(`Failed to fetch next question: ${error.message}`);
    }
  }, [currentQuestionIndex]);

  const startListening = useCallback(async () => {
    try {
      if (!audioContextRef.current) {
        await initAudioContext();
      }

      console.log('Starting conversation...');
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        throw new Error("Browser doesn't support speech recognition");
      }

      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onstart = () => {
        console.log('Speech recognition started');
        setIsListening(true);
        setListeningPrompt('Listening... Click Stop when done');
        // Unmute microphone when starting to listen
        setMicrophoneGain(1);
      };

      recognitionRef.current.onend = () => {
        console.log('Speech recognition ended');
        // Only restart if we're supposed to be listening
        if (isListening && !isSpeaking) {
          recognitionRef.current.start();
        }
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setError(`Speech recognition error: ${event.error}`);
      };

      recognitionRef.current.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map(result => result[0].transcript)
          .join('');
        
        console.log('Transcript:', transcript);
        setTranscript(transcript);

        // Only send final results
        if (event.results[event.results.length - 1].isFinal) {
          sendTranscriptionToLLM(transcript);
        }
      };

      recognitionRef.current.start();
    } catch (error) {
      console.error('Error starting speech recognition:', error);
      setError('Failed to start speech recognition: ' + error.message);
    }
  }, [isListening, isSpeaking, initAudioContext, setMicrophoneGain]);

  const stopListening = useCallback(() => {
    console.log('Stopping conversation...');
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      setListeningPrompt('Click Start to begin conversation');
      // Mute microphone when stopping
      setMicrophoneGain(0);
    }
  }, [setMicrophoneGain]);

  const stopSpeaking = useCallback(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      // Unmute microphone after interruption if we're still listening
      if (isListening) {
        setMicrophoneGain(1);
      }
    }
  }, [isListening, setMicrophoneGain]);

  const utterResponse = useCallback((text) => {
    if ('speechSynthesis' in window) {
      console.log('Speaking response:', text);
      
      // Mute microphone before speaking
      setMicrophoneGain(0);
      
      // Create new utterance
      utteranceRef.current = new SpeechSynthesisUtterance(text);
      setIsSpeaking(true);
      
      utteranceRef.current.onend = () => {
        console.log('Finished speaking');
        setIsSpeaking(false);
        // Unmute microphone after speaking if we're still listening
        if (isListening) {
          setMicrophoneGain(1);
        }
      };

      utteranceRef.current.onerror = (event) => {
        console.error('Speech synthesis error:', event);
        setIsSpeaking(false);
        if (isListening) {
          setMicrophoneGain(1);
        }
      };

      window.speechSynthesis.speak(utteranceRef.current);
    }
  }, [isListening, setMicrophoneGain]);

  const sendTranscriptionToLLM = useCallback(async (text) => {
    setLoading(true);
    try {
      console.log('Sending to LLM:', text);
      const response = await fetch(`${API_ENDPOINTS.LLM}/process_llm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcription_text: text })
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();

      setMessages(prevMessages => [
        ...prevMessages,
        { sender: 'user', text: text },
        { sender: 'bot', text: data.response }
      ]);

      // Speak the response
      utterResponse(data.response);
    } catch (error) {
      console.error("Error:", error);
      setError(`Failed to get response: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [utterResponse]);

  // Initialize video and audio
  useEffect(() => {
    const initializeMedia = async () => {
      try {
        console.log('Requesting media permissions...');
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: true, 
          audio: true 
        });
        console.log('Media permissions granted');
        
        streamRef.current = stream;
        
        // Initialize audio context and connect microphone
        await initAudioContext();
        
        if (audioContextRef.current) {
          micSourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
          micSourceRef.current.connect(gainNodeRef.current);
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            console.log('Video metadata loaded');
            videoRef.current.play().catch(err => {
              console.error('Error playing video:', err);
            });
          };
        }
      } catch (error) {
        console.error('Error accessing media devices:', error);
        setError(`Media access error: ${error.message}`);
      }
    };

    initializeMedia();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [initAudioContext]);

  return (
    <div className="chatbot" role="main" aria-label="Chatbot Interface">
      <div className="media-row">
        <div className="video-container">
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline
            className="video-stream"
            aria-label="Video feed"
          />
        </div>
        <div className="image-container">
          <img 
            src="/lucky_bot0.png" 
            alt="Interview Agent Avatar" 
            className="image-display"
          />
        </div>
      </div>

      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}

      <div className="control-panel">
        <div className="listening-indicator">
          {isSpeaking ? 'Bot is speaking... (Click Interrupt to stop)' : listeningPrompt}
        </div>
        <div className="control-buttons">
          <button 
            onClick={startListening}
            disabled={isListening || loading}
            className="control-button start-button"
          >
            Start Conversation
          </button>
          <button 
            onClick={stopListening}
            disabled={!isListening || loading}
            className="control-button stop-button"
          >
            Stop Conversation
          </button>
          <button
            onClick={fetchNextQuestion}
            disabled={loading}
            className="control-button next-button"
          >
            Next Question
          </button>
          {isSpeaking && (
            <button 
              onClick={stopSpeaking}
              className="control-button interrupt-button"
            >
              Interrupt
            </button>
          )}
        </div>
      </div>

      <div className="chat-window">
        <div className="messages">
          {messages.map((message, index) => (
            <div 
              key={index} 
              className={`message ${message.sender}`}
              role="article"
            >
              {message.text}
            </div>
          ))}
        </div>

        <form onSubmit={(e) => {
          e.preventDefault();
          if (userInput.trim()) {
            sendTranscriptionToLLM(userInput.trim());
            setUserInput('');
          }
        }} className="input-form">
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Type your question..."
            disabled={loading}
          />
          <button type="submit" disabled={loading}>
            Send
          </button>
        </form>
      </div>

      <div className="transcript-window">
        <h3>Current Transcript:</h3>
        <p>{transcript || "No transcription available"}</p>
      </div>
    </div>
  );
};

export default Chatbot;
