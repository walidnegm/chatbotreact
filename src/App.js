import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import BotHome from './BotHome';
import Chatbot from './Chatbot';
import HomePage from './HomePage'; // Ensure this path is correct

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/bothome" element={<BotHome />} />
        <Route path="/chatbot" element={<Chatbot />} />
        <Route path="/" element={<HomePage />} /> {/* Ensure HomePage is defined */}
      </Routes>
    </Router>
  );
}

export default App;
