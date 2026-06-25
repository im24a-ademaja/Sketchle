import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import socket from '../socket/socket';
import DrawingCanvas from '../components/DrawingCanvas';

const BASE_URL = 'http://localhost:4000';

export default function Lobby() {
  const [lobbyCode, setLobbyCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [players, setPlayers] = useState([]);
  const [inLobby, setInLobby] = useState(false);
  const [word, setWord] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [roundActive, setRoundActive] = useState(false);
  const [roundId, setRoundId] = useState(null);
  const canvasRef = useRef(null);
  const navigate = useNavigate();

  const token = localStorage.getItem('token');
  const username = localStorage.getItem('username');

  useEffect(() => {
    socket.connect();

    socket.on('player-joined', ({ username }) => {
      setPlayers(prev => [...new Set([...prev, username])]);
    });

    socket.on('player-left', ({ username }) => {
      setPlayers(prev => prev.filter(p => p !== username));
    });

    socket.on('round-started', ({ word, startTime, duration, roundId }) => {
      setWord(word);
      setRoundId(roundId);
      setRoundActive(true);
      setTimeLeft(Math.max(0, Math.ceil((startTime + duration - Date.now()) / 1000)));
    });

    socket.on('round-ended', () => {
      const image = canvasRef.current?.getImageData();
      if (image) {
        submitDrawing(image);
      }
      setRoundActive(false);
      setTimeLeft(0);
    });

    return () => {
      socket.off('player-joined');
      socket.off('player-left');
      socket.off('round-started');
      socket.off('round-ended');
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!roundActive) return;

    const interval = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [roundActive]);

  async function createLobby() {
    const res = await fetch(`${BASE_URL}/api/lobbies`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setLobbyCode(data.code);
    socket.emit('join-lobby', { lobbyCode: data.code, username });
    setPlayers([username]);
    setInLobby(true);
  }

  async function joinLobby() {
    const res = await fetch(`${BASE_URL}/api/lobbies/${joinCode}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.error) return alert(data.error);
    setLobbyCode(data.code);
    socket.emit('join-lobby', { lobbyCode: data.code, username });
    setPlayers([username]);
    setInLobby(true);
  }

  async function submitDrawing(dataUrl) {
    if (!dataUrl || !roundId) return;

    try {
      const res = await fetch(`${BASE_URL}/api/drawings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ roundId, imageData: dataUrl }),
      });
      const data = await res.json();
      console.log('Bewertung:', data.ai_score, data.ai_feedback);
    } catch (error) {
      console.error('Submit fehlgeschlagen:', error);
    }
  }

  function logout() {
    localStorage.clear();
    navigate('/');
  }

  if (inLobby) return (
    <div style={{ maxWidth: 480, margin: '100px auto' }}>
      <h2>Lobby: {lobbyCode}</h2>
      <p>Players:</p>
      <ul>{players.map(p => <li key={p}>{p}</li>)}</ul>

      <div style={{ marginTop: 16 }}>
        {!roundActive ? (
          <button onClick={() => socket.emit('start-round')}>Start Round</button>
        ) : (
          <div>
            <p><strong>Word:</strong> {word}</p>
            <p><strong>Time left:</strong> {timeLeft}s</p>
          </div>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        {roundActive ? (
          <DrawingCanvas
            ref={canvasRef}
            onSubmit={submitDrawing}
            disabled={!roundActive}
          />
        ) : (
          <p>Time is up</p>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 400, margin: '100px auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1>Welcome, {username}</h1>
      <button onClick={createLobby}>Create Lobby</button>
      <hr />
      <input placeholder="Lobby Code" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} />
      <button onClick={joinLobby}>Join Lobby</button>
      <hr />
      <button onClick={logout}>Logout</button>
    </div>
  );
}

