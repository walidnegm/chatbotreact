import React from 'react';
import { Link } from 'react-router-dom'; // Import Link for navigation
import './BotHome.css'; // Importing the CSS for styling

const BotHome = () => {
  return (
    <div className="bot-home" style={{ backgroundColor: 'black', color: 'white', minHeight: '100vh' }}>
      <header className="header">
        <h1>Welcome to Bot0</h1>
        <p>Your AI-powered assistant</p>
        <Link to="/chatbot" style={{ color: 'cyan' }}>Go to Chatbot</Link> {/* Navigation link to Chatbot */}
      </header>
      <main className="main-content">
        <h2>About Us</h2>
        <p>
          At Bot0, we harness the power of artificial intelligence to bring you cutting-edge solutions 
          that streamline your tasks and enhance productivity.
        </p>
        <h2>Our Services</h2>
        <ul>
          <li>Intelligent Chatbots</li>
          <li>Automated Customer Support</li>
          <li>Voice Recognition Systems</li>
          <li>Data Analysis and Insights</li>
        </ul>
      </main>
      <footer className="footer">
        <p>&copy; 2024 Bot0. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default BotHome;
