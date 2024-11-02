import React from 'react';
import ReactDOM from 'react-dom/client'; // Update the import
import './index.css';
import App from './App';
import Chatbot from './Chatbot'; // Import Chatbot directly
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root')); // Create a root
root.render(
  <React.StrictMode>
    <Chatbot />  // Directly render Chatbot
  </React.StrictMode>
);

reportWebVitals();
