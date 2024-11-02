import React, { useState, useEffect, useRef, useCallback } from 'react';
import './Chatbot.css';

const API_ENDPOINTS = {
  LLM: process.env.REACT_APP_LLM_ENDPOINT || 'http://localhost:8000',
  WHISPER: process.env.REACT_APP_WHISPER_ENDPOINT || 'http://localhost:5000',
  QUESTIONS: process.env.REACT_APP_QUESTIONS_ENDPOINT || 'http://localhost:8001',
  TTS: 'http://localhost:8001'  // Update this to match your gTTS server endpoint
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

  // Refs
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);
  const shouldRestartListeningRef = useRef(false);
  const audioRef = useRef(new Audio());
  const currentAudioUrlRef = useRef(null);

  // Function to clean up previous audio URL
  const cleanupAudioUrl = useCallback(() => {
    if (currentAudioUrlRef.current) {
      URL.revokeObjectURL(currentAudioUrlRef.current);
      currentAudioUrlRef.current = null;
    }
  }, []);

  // Function to handle TTS
  const playAudioResponse = useCallback(async (text) => {
    try {
      // If we were listening, we'll want to restart after speaking
      shouldRestartListeningRef.current = isListening;
      
      // Stop listening while speaking
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }

      setIsSpeaking(true);

      // Request speech synthesis from server
      const response = await fetch(`${API_ENDPOINTS.TTS}/synthesize_speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text,
          language: "en"
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Clean up previous audio URL
      cleanupAudioUrl();

      // Convert base64 to blob
      const audioBlob = await fetch(`data:audio/mp3;base64,${data.audio}`).then(r => r.blob());
      const audioUrl = URL.createObjectURL(audioBlob);
      currentAudioUrlRef.current = audioUrl;

      // Set up audio event handlers
      audioRef.current.src = audioUrl;
      
      audioRef.current.onended = () => {
        setIsSpeaking(false);
        // Restart listening if we were listening before
        if (shouldRestartListeningRef.current) {
          recognitionRef.current?.start();
        }
      };

      audioRef.current.onerror = (error) => {
        console.error('Audio playback error:', error);
        setIsSpeaking(false);
        setError('Audio playback failed');
        if (shouldRestartListeningRef.current) {
          recognitionRef.current?.start();
        }
      };

      // Play the audio
      await audioRef.current.play();

    } catch (error) {
      console.error('Error playing audio response:', error);
      setError(`Failed to play audio response: ${error.message}`);
      setIsSpeaking(false);
      if (shouldRestartListeningRef.current) {
        recognitionRef.current?.start();
      }
    }
  }, [isListening, cleanupAudioUrl]);

  const sendTranscriptionToLLM = useCallback(async (text) => {
    setLoading(true);
    try {
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

      await playAudioResponse(data.response);
    } catch (error) {
      console.error("Error:", error);
      setError(`Failed to get response: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [playAudioResponse]);

  const fetchNextQuestion = useCallback(async () => {
    try {
      setLoading(true);
      
      const response = await fetch(`${API_ENDPOINTS.QUESTIONS}/get_question/${currentQuestionIndex}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          setError('No more questions available.');
          return;
        }
        throw new Error(`Error fetching question: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      setCurrentQuestion(data.question);
      setMessages(prevMessages => [...prevMessages, { sender: 'system', text: data.question }]);
      setCurrentQuestionIndex(prevIndex => prevIndex + 1);

      await playAudioResponse(data.question);
    } catch (error) {
      console.error("Error fetching next question:", error);
      setError(`Failed to fetch next question: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [currentQuestionIndex, playAudioResponse]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      setListeningPrompt('Click Start to begin conversation');
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsSpeaking(false);
      
      // Restart listening if we were listening before
      if (shouldRestartListeningRef.current) {
        recognitionRef.current?.start();
      }
    }
  }, []);

  const startListening = useCallback(async () => {
    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        throw new Error("Browser doesn't support speech recognition");
      }

      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onstart = () => {
        setIsListening(true);
        setListeningPrompt('Listening... Click Stop when done');
      };

      recognitionRef.current.onend = () => {
        // Only restart if we're supposed to be listening and not speaking
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
        
        setTranscript(transcript);

        if (event.results[event.results.length - 1].isFinal) {
          sendTranscriptionToLLM(transcript);
        }
      };

      recognitionRef.current.start();
    } catch (error) {
      console.error('Error starting speech recognition:', error);
      setError('Failed to start speech recognition: ' + error.message);
    }
  }, [isListening, isSpeaking, sendTranscriptionToLLM]);

  useEffect(() => {
    const initializeMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: true, 
          audio: true 
        });
        
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
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
      cleanupAudioUrl();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, [cleanupAudioUrl]);

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
          <button onClick={() => setError(null)} className="dismiss-error">✕</button>
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
            Next Question ({currentQuestionIndex})
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