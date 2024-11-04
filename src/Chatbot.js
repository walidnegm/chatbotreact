import React, { useState, useRef, useCallback, useEffect } from 'react';
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
  const [selectedQuestion, setSelectedQuestion] = useState('');
  const [skills, setSkills] = useState([]);

  // Refs
  const recognitionRef = useRef(null);
  const audioRef = useRef(new Audio());
  const currentAudioUrlRef = useRef(null);
  // UseEffect to test backend connectivity
  useEffect(() => {
    const testEndpoint = async () => {
      try {
        const response = await fetch(`${API_ENDPOINTS.RESUME}/test`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        console.log("Test endpoint response:", await response.json());
      } catch (error) {
        console.error("Test endpoint error:", error);
        setError("Failed to connect to the resume server.");
      }
    };
    testEndpoint();
  }, []);

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
        body: JSON.stringify({ transcription_text: text, question: selectedQuestion })
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
  }, [loading, isSpeaking, selectedQuestion]);

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
      setSelectedQuestion(data.question);
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


// Function to handle resume upload
const uploadResume = useCallback(async (file) => {
  setLoading(true);
  console.log("uploadResume called with file:", file); // Debugging log to verify function call
  setError(null);
  try {
    const formData = new FormData();
    formData.append("file", file);

    console.log("FormData created:", formData); // Debugging log to verify formData

    const response = await fetch(`${API_ENDPOINTS.RESUME}/upload_resume`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();

    console.log("Extracted Skills from response:", data.skills_list); // Debugging log to check response data

    if (Array.isArray(data.skills_list)) {
      setSkills(data.skills_list);
    } else {
      console.error("Skills list is not an array"); // Error log if response is not in expected format
    }
  } catch (error) {
    console.error("Error uploading resume:", error); // Error log for fetch issues
    setError(`Failed to upload resume: ${error.message}`);
  } finally {
    setLoading(false);
  }
}, []);

const handleSubmitResume = (e) => {
  e.preventDefault();
  console.log("handleSubmitResume called"); // Debugging log
  const fileInput = document.getElementById('resumeInput');
  
  // Check if file input is available and file is selected
  if (fileInput && fileInput.files.length > 0) {
    console.log("File selected:", fileInput.files[0]); // Debugging log to check the selected file
    uploadResume(fileInput.files[0]);
  } else {
    console.error("No file selected for upload"); // Error log if no file is selected
    setError("Please select a file to upload."); // Set error message if no file is selected
  }
};


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
          <form onSubmit={handleSubmitResume}>
            <input
              type="file"
              accept="application/pdf"
              id="resumeInput"
              className="upload-input"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading}
              className="control-button upload-button"
            >
              Upload Resume
            </button>
          </form>
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

      {skills.length > 0 && (
        <div className="skills-window">
          <h3>Key Skills Extracted:</h3>
          <table>
            <thead>
              <tr>
                <th>Skill</th>
              </tr>
            </thead>
            <tbody>
              {skills.map((skill, index) => (
                <tr key={index}>
                  <td>{skill}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Chatbot;
