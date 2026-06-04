import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import socket from '../socket/socket';

const BASE_URL = 'http://localhost:4000';

export default function LobbyPage() {
  const [lobbyCode, setLobbyCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [players, setPlayers] = useState([]);
  const [inLobby, setInLobby] = useState(false);
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

    return () => {
      socket.disconnect();
    };
  }, []);

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

  function logout() {
    localStorage.clear();
    navigate('/');
  }

  if (inLobby) return (
    <div style={{ maxWidth: 400, margin: '100px auto' }}>
      <h2>Lobby: {lobbyCode}</h2>
      <p>Spieler:</p>
      <ul>{players.map(p => <li key={p}>{p}</li>)}</ul>
    </div>
  );

  return (
    <div style={{ maxWidth: 400, margin: '100px auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1>Willkommen, {username}</h1>
      <button onClick={createLobby}>Lobby erstellen</button>
      <hr />
      <input placeholder="Lobby-Code" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} />
      <button onClick={joinLobby}>Lobby betreten</button>
      <hr />
      <button onClick={logout}>Logout</button>
    </div>
  );
}