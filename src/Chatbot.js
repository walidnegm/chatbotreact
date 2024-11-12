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
  const [currentQuestionId, setCurrentQuestionId] = useState(0);

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

  // Cleanup effect for audio URLs - moved after cleanupAudioUrl definition
  useEffect(() => {
    return () => {
      cleanupAudioUrl();
    };
  }, [cleanupAudioUrl]);

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
        body: JSON.stringify({ 
          transcription_text: text, 
          question: selectedQuestion,
          question_id: currentQuestionId
        })
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();

      // Check if the response indicates moving to next question
      if (data.response === "next_question") {
        setLoading(false);  // Reset loading before calling fetchNextQuestion
        setTimeout(() => fetchNextQuestion(), 0);  // Use setTimeout to break the cycle
        return;
      }

      setMessages(prevMessages => [
        ...prevMessages,
        { 
          sender: 'user', 
          text: text,
          questionId: currentQuestionId 
        },
        { 
          sender: 'bot', 
          text: data.response,
          questionId: currentQuestionId 
        }
      ]);

      // Play the bot's response
      await playAudioResponse(data.response);

    } catch (error) {
      console.error("Error:", error);
      setError(`Failed to get response: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [loading, isSpeaking, selectedQuestion, currentQuestionId, playAudioResponse]); // Removed fetchNextQuestion from dependencies

  const fetchNextQuestion = useCallback(async () => {
    if (loading || isSpeaking) return;

    try {
      setLoading(true);
      
      // First, reset the context for the new question
      await fetch(`${API_ENDPOINTS.LLM}/new_question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: currentQuestionId + 1 })
      });

      // Then fetch the next question
      const questionResponse = await fetch(`${API_ENDPOINTS.QUESTIONS}/get_question/${currentQuestionIndex}`);
      
      if (!questionResponse.ok) {
        if (questionResponse.status === 404) {
          setError('No more questions available.');
          return;
        }
        throw new Error(`Error fetching question: ${questionResponse.statusText}`);
      }

      const questionData = await questionResponse.json();

      // Update state with new question
      setCurrentQuestionId(prevId => prevId + 1);
      setSelectedQuestion(questionData.question);
      setMessages(prevMessages => [
        ...prevMessages, 
        { 
          sender: 'system', 
          text: questionData.question,
          questionId: currentQuestionId + 1 
        }
      ]);

      // Play the new question
      await playAudioResponse(questionData.question);
      setCurrentQuestionIndex(prevIndex => prevIndex + 1);

    } catch (error) {
      console.error("Error fetching next question:", error);
      setError(`Failed to fetch next question: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [currentQuestionIndex, playAudioResponse, loading, isSpeaking, currentQuestionId]);

  const getCurrentQuestionMessages = useCallback(() => {
    return messages.filter(msg => msg.questionId === currentQuestionId);
  }, [messages, currentQuestionId]);

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

      console.log("Sending resume upload request...");
      const response = await fetch(`${API_ENDPOINTS.RESUME}/upload_resume`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const data = await response.json();
      console.log("Raw API Response:", data);

      let skillsList = [];
      if (data.skills_list) {
        skillsList = data.skills_list;
      } else if (data.skills) {
        skillsList = data.skills;
      } else if (Array.isArray(data)) {
        skillsList = data;
      } else if (typeof data === 'object') {
        skillsList = Object.values(data);
      }

      skillsList = skillsList
        .filter(skill => skill && typeof skill === 'string')
        .map(skill => skill.trim());

      console.log("Processed skills list:", skillsList);

      if (skillsList.length > 0) {
        setSkills(skillsList);
      } else {
        throw new Error("No valid skills found in the response");
      }

    } catch (error) {
      console.error("Detailed upload error:", error);
      console.error("Response data:", error.response);
      setError(`Resume upload failed: ${error.message}. Please check the console for details.`);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmitResume = (e) => {
    e.preventDefault();
    console.log("handleSubmitResume called");
    const fileInput = document.getElementById('resumeInput');
    
    if (fileInput && fileInput.files.length > 0) {
      console.log("File selected:", fileInput.files[0]);
      uploadResume(fileInput.files[0]);
    } else {
      console.error("No file selected for upload");
      setError("Please select a file to upload.");
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
          {getCurrentQuestionMessages().map((message, index) => (
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