import React, { useState, useEffect, useRef, useCallback } from 'react';
import { debounce } from 'lodash';
import './Chatbot.css';

const API_ENDPOINTS = {
  LLM: process.env.REACT_APP_LLM_ENDPOINT || 'http://localhost:8000',
  WHISPER: process.env.REACT_APP_WHISPER_ENDPOINT || 'http://localhost:5000',
  QUESTIONS: process.env.REACT_APP_QUESTIONS_ENDPOINT || 'http://localhost:8001'
};

const WAKE_WORD = 'hey bot';
const MAX_AUDIO_CHUNK_SIZE = 1024 * 1024 * 5; // 5MB

const Chatbot = () => {
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [whisperLoading, setWhisperLoading] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [listeningPrompt, setListeningPrompt] = useState('Waiting for wake word...');
  const [isActivelyListening, setIsActivelyListening] = useState(false);
  const [mediaPermissions, setMediaPermissions] = useState({ audio: false, video: false });

  const videoRef = useRef(null);
  const recordedChunks = useRef([]);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);

  // Initialize wake word detection
  useEffect(() => {
    initializeWakeWordDetection();
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const initializeWakeWordDetection = () => {
    // Check if browser supports SpeechRecognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Your browser doesn't support speech recognition. Please use Chrome.");
      return;
    }

    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = 'en-US';

    recognitionRef.current.onstart = () => {
      setListeningPrompt('Waiting for wake word...');
    };

    recognitionRef.current.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript.trim().toLowerCase();
        
        // Check for wake word
        if (transcript.includes(WAKE_WORD)) {
          handleWakeWordDetected();
        }
        
        // If actively listening (after wake word), process the speech
        if (isActivelyListening && event.results[i].isFinal) {
          processActiveSpeech(transcript);
        }
      }
    };

    recognitionRef.current.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      // Restart recognition if it stops
      if (event.error !== 'no-speech') {
        recognitionRef.current.stop();
        setTimeout(() => recognitionRef.current.start(), 500);
      }
    };

    recognitionRef.current.onend = () => {
      // Restart recognition if it stops
      recognitionRef.current.start();
    };

    // Start the recognition
    recognitionRef.current.start();
  };

  const handleWakeWordDetected = () => {
    setIsActivelyListening(true);
    setListeningPrompt('Wake word detected! Listening for command...');
    
    // Stop active listening after 10 seconds of no speech
    setTimeout(() => {
      if (isActivelyListening) {
        setIsActivelyListening(false);
        setListeningPrompt('Waiting for wake word...');
      }
    }, 2000);
  };

  const processActiveSpeech = async (transcript) => {
    if (!transcript || transcript === WAKE_WORD) return;
    
    setTranscript(transcript);
    setIsActivelyListening(false);
    setListeningPrompt('Waiting for wake word...');
    
    // Process the command with your LLM
    await sendTranscriptionToLLM(transcript);
  };

  // Initialize video stream
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
        }
        
        setMediaPermissions({ audio: true, video: true });
      } catch (error) {
        console.error('Error accessing media devices:', error);
        setError(`Media access error: ${error.message}`);
        setMediaPermissions({ audio: false, video: false });
      }
    };

    initializeMedia();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Your existing API call functions
  const sendTranscriptionToLLM = async (text) => {
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

      // Speak the response
      utterResponse(data.response);
    } catch (error) {
      console.error("Error:", error);
      setError(`Failed to get response: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Add this function inside the Chatbot component, before the return statement
  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedInput = userInput.trim();
    if (trimmedInput === '') return;

    // Clear input and set loading state
    setUserInput('');
    setLoading(true);

    // Update messages immediately for better UX
    setMessages(prevMessages => [
      ...prevMessages,
      { sender: 'user', text: trimmedInput },
      { sender: 'bot', text: 'Thinking...' }
    ]);

    try {
      const response = await fetch(`${API_ENDPOINTS.LLM}/process_llm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcription_text: trimmedInput })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Update the "Thinking..." message with the actual response
      setMessages(prevMessages =>
        prevMessages.map((msg, idx) =>
          idx === prevMessages.length - 1 
            ? { ...msg, text: data.response }
            : msg
        )
      );

      // Optionally speak the response
      utterResponse(data.response);

    } catch (error) {
      console.error('Error fetching LLM response:', error);
      setError(`Failed to get response: ${error.message}`);
      
      // Update the "Thinking..." message with error
      setMessages(prevMessages =>
        prevMessages.map((msg, idx) =>
          idx === prevMessages.length - 1 
            ? { ...msg, text: 'Error: Could not fetch response.' }
            : msg
        )
      );
    } finally {
      setLoading(false);
    }
  };
  const utterResponse = (text) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utterance);
    }
  };

  // Rest of your component code (handleSubmit, fetchNextQuestion, etc.)
  // ... 

  return (
    <div className="chatbot" role="main" aria-label="Chatbot Interface">
      <div className="media-row">
        <div className="video-container">
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
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

      <div 
        className="listening-indicator" 
        role="status" 
        aria-live="polite"
      >
        {listeningPrompt}
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

        <form onSubmit={handleSubmit} className="input-form">
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