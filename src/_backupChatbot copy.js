import React, { useState, useRef, useCallback } from 'react';
import './Chatbot.css';

const API_ENDPOINTS = {
  LLM: process.env.REACT_APP_LLM_ENDPOINT || 'http://localhost:8000',
  QUESTIONS: process.env.REACT_APP_QUESTIONS_ENDPOINT || 'http://localhost:8001',
  TTS: 'http://localhost:8001',
  RESUME: 'http://localhost:8002'
};

const Chatbot = () => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [listeningPrompt, setListeningPrompt] = useState('Click Start to begin conversation');
  const [skills, setSkills] = useState(null);

  // Refs
  const recognitionRef = useRef(null);
  const audioRef = useRef(new Audio());
  const currentAudioUrlRef = useRef(null);

  const cleanupAudioUrl = useCallback(() => {
    if (currentAudioUrlRef.current) {
      URL.revokeObjectURL(currentAudioUrlRef.current);
      currentAudioUrlRef.current = null;
    }
  }, []);

  const playAudioResponse = useCallback(async (text) => {
    try {
      setIsSpeaking(true);

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
      cleanupAudioUrl();

      const audioBlob = await fetch(`data:audio/mp3;base64,${data.audio}`).then(r => r.blob());
      const audioUrl = URL.createObjectURL(audioBlob);
      currentAudioUrlRef.current = audioUrl;

      audioRef.current.src = audioUrl;

      audioRef.current.onended = () => {
        setIsSpeaking(false);
      };

      audioRef.current.onerror = (error) => {
        console.error('Audio playback error:', error);
        setIsSpeaking(false);
        setError('Audio playback failed');
      };

      await audioRef.current.play();

    } catch (error) {
      console.error('Error playing audio response:', error);
      setError(`Failed to play audio response: ${error.message}`);
      setIsSpeaking(false);
    }
  }, [cleanupAudioUrl]);

  const sendTranscriptionToLLM = useCallback(async (text) => {
    if (loading || isSpeaking) return;

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

    } catch (error) {
      console.error("Error:", error);
      setError(`Failed to get response: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [loading, isSpeaking]);

  const fetchNextQuestion = useCallback(async () => {
    if (loading || isSpeaking) return;

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
      setMessages(prevMessages => [...prevMessages, { sender: 'system', text: data.question }]);
      setCurrentQuestionIndex(prevIndex => prevIndex + 1);

      await playAudioResponse(data.question);
    } catch (error) {
      console.error("Error fetching next question:", error);
      setError(`Failed to fetch next question: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [currentQuestionIndex, playAudioResponse, loading, isSpeaking]);

  const stopListening = useCallback(() => {
    console.log('Stopping listening...');
    setIsListening(false);
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setListeningPrompt('Click Start to begin conversation');
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
        console.log('Recognition started');
        setIsListening(true);
        setListeningPrompt('Listening... Click Stop when done');
      };

      recognitionRef.current.onend = () => {
        console.log('Recognition ended. isListening:', isListening);
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setError(`Speech recognition error: ${event.error}`);
      };

      recognitionRef.current.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map(result => result[0].transcript)
          .join('');

        if (event.results[event.results.length - 1].isFinal) {
          sendTranscriptionToLLM(transcript);
        }
      };

      recognitionRef.current.start();
    } catch (error) {
      console.error('Error starting speech recognition:', error);
      setError('Failed to start speech recognition: ' + error.message);
      setIsListening(false);
    }
  }, [sendTranscriptionToLLM]);

  const uploadResume = useCallback(async (file) => {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_ENDPOINTS.RESUME}/upload_resume`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();

      setSkills(data.skills);
    } catch (error) {
      console.error("Error uploading resume:", error);
      setError(`Failed to upload resume: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="chatbot" role="main" aria-label="Chatbot Interface">
      {error && (
        <div className="error-message" role="alert">
          {error}
          <button onClick={() => setError(null)} className="dismiss-error">✕</button>
        </div>
      )}

      <div className="control-panel">
        <div className="listening-indicator">
          {isSpeaking ? 'Bot is speaking...' : listeningPrompt}
        </div>
        <div className="control-buttons">
          <button
            onClick={startListening}
            disabled={isListening || loading || isSpeaking}
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
            disabled={loading || isSpeaking}
            className="control-button next-button"
          >
            Next Question ({currentQuestionIndex})
          </button>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => e.target.files.length > 0 && uploadResume(e.target.files[0])}
            disabled={loading}
          />
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
      </div>

      {skills && (
        <div className="skills-window">
          <h3>Key Skills Extracted:</h3>
          <ul>
            {Object.entries(skills).map(([key, value]) => (
              <li key={key}>{key}: {value}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default Chatbot;
