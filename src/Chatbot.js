import React, { useState, useEffect, useRef } from 'react';
import './Chatbot.css';

const Chatbot = () => {
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [loading, setLoading] = useState(false);
  const videoRef = useRef(null);
  const [isFrameRecording, setIsFrameRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [whisperLoading, setWhisperLoading] = useState(false);
  const mediaRecorderRef = useRef(null);
  const recordedChunks = useRef([]);

  const [listening, setListening] = useState(false); // To indicate if the system is listening
  const [wakeupDetected, setWakeupDetected] = useState(false); // To indicate if the wake-up word is detected

  const [frameCount, setFrameCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [playbackFrame, setPlaybackFrame] = useState(null);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState('');

  // Function to fetch the next question from the backend
  const fetchNextQuestion = async () => {
    try {
      const response = await fetch(`http://localhost:8001/get_question/${currentQuestionIndex}`);
      if (!response.ok) {
        throw new Error(`Error fetching question: ${response.statusText}`);
      }
      const data = await response.json();
      setCurrentQuestion(data.question);
      setCurrentQuestionIndex(prevIndex => prevIndex + 1);
      utterQuestion(data.question); // Use Google Text-to-Speech to speak the question
    } catch (error) {
      console.error("Error fetching next question:", error);
    }
  };

  // Function to play the current question using Google Text-to-Speech
  const utterQuestion = (question) => {
    const utterance = new SpeechSynthesisUtterance(question);
    window.speechSynthesis.speak(utterance);
  };

  // Function to send transcription to the LLM
  const sendTranscriptionToLLM = async (text) => {
    setLoading(true);
    try {
      console.log("Sending transcription to backend...");

      const response = await fetch('http://localhost:8000/process_llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcription_text: text })  // Use the provided text
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setMessages((prevMessages) => [
        ...prevMessages,
        { sender: 'bot', text: data.response }
      ]);

      // Utter the response from the LLM
      utterQuestion(data.response); // Speak the LLM's response

    } catch (error) {
      console.error("Error fetching LLM response:", error);
    } finally {
      setLoading(false);
    }
  };

  // Initialize WebRTC
  useEffect(() => {
    const initializeWebRTC = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          startListening(stream); // Start listening for the wake-up word
        }
      } catch (error) {
        console.error('Error accessing webcam and microphone:', error);
      }
    };
    initializeWebRTC();
  }, []);

  // Function to start listening for wake-up word
  const startListening = (stream) => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const input = audioContext.createMediaStreamSource(stream);
    const recorder = new MediaRecorder(stream);

    recorder.ondataavailable = async (event) => {
      if (event.data.size > 0) {
        const formData = new FormData();
        formData.append('audio', event.data, 'audio.webm');

        try {
          const response = await fetch('http://localhost:5000/transcribe', {
            method: 'POST',
            body: formData,
          });
          const data = await response.json();

          // Check for the wake-up word in the transcription
          if (data.transcript && data.transcript.includes("bot")) {
            setWakeupDetected(true);
            console.log("Wake-up word 'bot' detected!");
            handleWakeWordDetected(); // Handle the wake-up word action
          }
        } catch (error) {
          console.error('Error sending audio for transcription:', error);
        }
      }
    };

    recorder.start();
    setListening(true); // Set listening state
  };

  // Function to handle wake word detection
  const handleWakeWordDetected = () => {
    // Handle the logic when the wake-up word is detected
    // For example, start recording the next commands or respond visually
    console.log("Listening for commands...");
    setListening(false); // Stop the listening prompt
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (userInput.trim() === '') return;

    const newMessages = [...messages, { sender: 'user', text: userInput }];
    newMessages.push({ sender: 'bot', text: 'Thinking...' });
    setMessages(newMessages);
    setUserInput('');
    setLoading(true);

    try {
      const response = await fetch('http://localhost:8000/process_llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcription_text: userInput })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setMessages((prevMessages) =>
        prevMessages.map((msg, idx) =>
          idx === prevMessages.length - 1 ? { ...msg, text: data.response } : msg
        )
      );
    } catch (error) {
      console.error('Error fetching LLM response:', error);
      setMessages((prevMessages) =>
        prevMessages.map((msg, idx) =>
          idx === prevMessages.length - 1 ? { ...msg, text: 'Error: Could not fetch response.' } : msg
        )
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chatbot">
      <div className="media-row">
        <div className="video-container">
          <video ref={videoRef} autoPlay playsInline muted className="video-stream" />
        </div>
        <div className="image-container">
          <img src="/lucky_bot0.png" alt="Interview Agent" className="image-display" />
        </div>
      </div>
      <div className="listening-indicator">
        {listening ? <p>Listening...</p> : null}
        {wakeupDetected ? <p>Wake-up word detected!</p> : null}
      </div>
      <div className="chat-window">
        <div className="messages">
          {messages.map((message, index) => (
            <div key={index} className={`message ${message.sender}`}>
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
          <button type="submit" disabled={loading}>Send</button>
        </form>
      </div>
      <div className="agent-questions">
        <button onClick={fetchNextQuestion}>Next Question</button>
      </div>
      <div className="transcript-window">
        <h3>Transcript from Whisper:</h3>
        {whisperLoading ? <p>Processing transcription...</p> : <p>{transcript || "No transcription available"}</p>}
      </div>
    </div>
  );
};

export default Chatbot;
