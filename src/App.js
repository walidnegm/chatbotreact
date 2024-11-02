import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Chatbot from './Chatbot';
import BotHome from './BotHome';

function App() {
  return (
    <Router>
      <div className="App">
        <h1>Chatbot Interface</h1>
        <Routes>
          <Route path="/" element={<BotHome />} />
          <Route path="/chatbot" element={<Chatbot />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
