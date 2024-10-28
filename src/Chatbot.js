import React, { useState, useEffect, useRef } from 'react';
import './Chatbot.css';

const Chatbot = () => {
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [loading, setLoading] = useState(false);
  const videoRef = useRef(null);
  const [backendFrame, setBackendFrame] = useState(null);

  useEffect(() => {
    // Initialize WebRTC video stream for the first video container
    const initializeWebRTC = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error('Error accessing webcam:', error);
      }
    };
    initializeWebRTC();
  }, []);

  // Fetch frame from backend periodically
  useEffect(() => {
    const fetchFrame = async () => {
      try {
        const response = await fetch('http://localhost:5000/video_frame');
        const data = await response.json();
        setBackendFrame(`data:image/jpeg;base64,${data.frame}`);
      } catch (error) {
        console.error('Error fetching frame:', error);
      }
    };

    // Fetch frame every 2 seconds
    const interval = setInterval(fetchFrame, 2000);
    return () => clearInterval(interval);  // Clean up interval on component unmount
  }, []);

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (userInput.trim() === '') return;

    const newMessages = [...messages, { sender: 'user', text: userInput }];
    newMessages.push({ sender: 'bot', text: 'Thinking...' });  // Placeholder for bot response
    setMessages(newMessages);
    setUserInput('');
    setLoading(true);

    try {
      const response = await fetch('http://localhost:5000/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userInput }),
      });
      const data = await response.json();
      setMessages(prevMessages =>
        prevMessages.map((msg, idx) =>
          idx === prevMessages.length - 1 ? { ...msg, text: data.response } : msg
        )
      );
    } catch (error) {
      console.error('Error fetching chatbot response:', error);
      setMessages(prevMessages =>
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
      <div className="video-row">
        {/* Local Video Stream */}
        <div className="video-container">
          <video ref={videoRef} autoPlay playsInline muted className="video-stream" />
        </div>
  
        {/* Video Stream from Backend */}
        <div className="video-container">
          {backendFrame && <img src={backendFrame} alt="Backend Frame" className="video-stream" />}
        </div>
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
    </div>
  );
};

export default Chatbot;
