// Chatbot.js
import React, { useState } from 'react';
import { SessionsClient } from 'dialogflow';

const Chatbot = () => {
  const [messages, setMessages] = useState([]);
  const sessionClient = new SessionsClient();
  const sessionPath = sessionClient.projectAgentSessionPath('your-project-id', 'your-session-id');

  const sendMessage = async (message) => {
    const request = {
      session: sessionPath,
      queryInput: {
        text: {
          text: message,
          languageCode: 'en-US',
        },
      },
    };

    const responses = await sessionClient.detectIntent(request);
    const result = responses[0].queryResult;
    setMessages([...messages, { text: result.fulfillmentText }]);
  };

  return (
    <div>
      <h1>Chatbot</h1>
      <div>
        {messages.map((msg, index) => (
          <div key={index}>{msg.text}</div>
        ))}
      </div>
      <input type="text" onKeyPress={(e) => {
        if (e.key === 'Enter') {
          sendMessage(e.target.value);
          e.target.value = '';
        }
      }} />
    </div>
  );
};

export default Chatbot;