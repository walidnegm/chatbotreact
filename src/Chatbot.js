import React, { useState } from 'react';
import './Chatbot.css';  // We'll add basic CSS for styling later.

const Chatbot = () => {
  const [messages, setMessages] = useState([]);  // Store chat messages
  const [userInput, setUserInput] = useState('');  // Store user input

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (userInput.trim() === '') return;

    // Add user message to chat
    const newMessages = [...messages, { sender: 'user', text: userInput }];

    // Add a placeholder for bot response (this will be updated later when we integrate LLM)
    newMessages.push({ sender: 'bot', text: 'Thinking...' });

    setMessages(newMessages);
    setUserInput('');  // Clear input field

    // Simulate bot response after 1 second (will be replaced with LLM later)
    setTimeout(() => {
      setMessages(prevMessages => 
        prevMessages.map((msg, idx) => 
          idx === prevMessages.length - 1 ? { ...msg, text: 'Hello! How can I help you?' } : msg
        )
      );
    }, 1000);
  };

  return (
    <div className="chatbot">
      <div className="chat-window">
        <div className="messages">
          {messages.map((message, index) => (
            <div key={index} className={`message ${message.sender}`}>
              {message.text}
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="input-form">
        <input 
          type="text"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder="Type your question..."
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
};

export default Chatbot;