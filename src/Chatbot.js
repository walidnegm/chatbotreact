import React, { useState, useEffect, useRef } from 'react';
import './Chatbot.css';

const Chatbot = () => {
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [loading, setLoading] = useState(false);
  const videoRef = useRef(null);
  const [isFrameRecording, setIsFrameRecording] = useState(false);
  const [isWhisperRecording, setIsWhisperRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [whisperLoading, setWhisperLoading] = useState(false); // Loading indicator for Whisper
  const mediaRecorderRef = useRef(null);
  const recordedChunks = useRef([]);

  const [frameCount, setFrameCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [playbackFrame, setPlaybackFrame] = useState(null);

  useEffect(() => {
    const initializeWebRTC = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error('Error accessing webcam and microphone:', error);
      }
    };
    initializeWebRTC();
  }, []);

  // Frame Recording Functions
  const startFrameRecording = () => {
    setIsFrameRecording(true);
    setFrameCount(0); // Reset frame count for new recording session
  };

  const stopFrameRecording = () => {
    setIsFrameRecording(false);
  };

  useEffect(() => {
    const captureFrame = async () => {
      if (videoRef.current && frameCount < 60) {
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

        const base64Image = canvas.toDataURL('image/jpeg').split(',')[1];
        try {
          await fetch('http://localhost:5000/save_frame', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ frame: base64Image, frameNumber: frameCount }),
          });
          setFrameCount((prevCount) => prevCount + 1);
        } catch (error) {
          console.error('Error sending frame to backend:', error);
        }
      } else if (frameCount >= 60) {
        stopFrameRecording(); // Stop frame recording after 60 frames
      }
    };

    if (isFrameRecording) {
      const interval = setInterval(captureFrame, 100);
      return () => clearInterval(interval);
    }
  }, [isFrameRecording, frameCount]);

  // Whisper Recording Functions
  const startWhisperRecording = () => {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        mediaRecorderRef.current = new MediaRecorder(stream);
        mediaRecorderRef.current.ondataavailable = event => {
          if (event.data.size > 0) recordedChunks.current.push(event.data);
        };
        mediaRecorderRef.current.onstop = sendAudioForTranscription;
        mediaRecorderRef.current.start();
        setIsWhisperRecording(true);
      })
      .catch(error => console.error('Error accessing microphone:', error));
  };

  const stopWhisperRecording = () => {
    mediaRecorderRef.current.stop();
    setIsWhisperRecording(false);
  };

  const sendAudioForTranscription = async () => {
    const audioBlob = new Blob(recordedChunks.current, { type: 'audio/webm' });
    recordedChunks.current = [];
    setWhisperLoading(true);  // Start loading indicator

    const formData = new FormData();
    formData.append('audio', audioBlob, 'audio.webm');

    try {
      const response = await fetch('http://localhost:5000/transcribe', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      setTranscript(data.transcript); // Set the transcription in the state
    } catch (error) {
      console.error('Error sending audio for transcription:', error);
    } finally {
      setWhisperLoading(false);  // End loading indicator
    }
  };

  // Playback frames from backend
  useEffect(() => {
    const playbackFrames = async () => {
      try {
        const response = await fetch(`http://localhost:5000/frames/frame_${currentFrameIndex}.jpg`);
        if (response.ok) {
          setPlaybackFrame(`http://localhost:5000/frames/frame_${currentFrameIndex}.jpg`);
          setCurrentFrameIndex((prevIndex) => prevIndex + 1);
        } else {
          setCurrentFrameIndex(0);
          setIsPlaying(false);
        }
      } catch (error) {
        console.error('Error fetching playback frame:', error);
      }
    };

    if (isPlaying) {
      const interval = setInterval(playbackFrames, 100);
      return () => clearInterval(interval);
    }
  }, [isPlaying, currentFrameIndex]);

  const togglePlayback = () => {
    setIsPlaying(!isPlaying);
    if (!isPlaying) {
      setCurrentFrameIndex(0);
    }
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
      const response = await fetch('http://localhost:5000/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userInput }),
      });
      const data = await response.json();
      setMessages((prevMessages) =>
        prevMessages.map((msg, idx) =>
          idx === prevMessages.length - 1 ? { ...msg, text: data.response } : msg
        )
      );
    } catch (error) {
      console.error('Error fetching chatbot response:', error);
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
      <div className="video-row">
        <div className="video-container">
          <video ref={videoRef} autoPlay playsInline muted className="video-stream" />
        </div>
        <div className="video-container">
          {playbackFrame && <img src={playbackFrame} alt="Playback Frame" className="video-stream" />}
        </div>
      </div>

      <div className="button-container">
        <button onClick={isFrameRecording ? stopFrameRecording : startFrameRecording}>
          {isFrameRecording ? 'Stop Frame Recording' : 'Start Frame Recording'}
        </button>
        <button onClick={isPlaying ? togglePlayback  : togglePlayback}>
          {isPlaying ? 'Stop Playback' : 'Play'}
        </button>
        <button onClick={isWhisperRecording ? stopWhisperRecording : startWhisperRecording}>
          {isWhisperRecording ? 'Stop Whisper Recording' : 'Start Whisper Recording'}
        </button>
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

      <div className="transcript-window">
        <h3>Transcript from Whisper:</h3>
        {whisperLoading ? <p>Processing transcription...</p> : <p>{transcript || "No transcription available"}</p>}
      </div>
    </div>
  );
};

export default Chatbot;
