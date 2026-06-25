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
  const [roundResults, setRoundResults] = useState([]);
  const [submissionStatus, setSubmissionStatus] = useState({});
  const [currentRound, setCurrentRound] = useState(0);
  const [totalRounds, setTotalRounds] = useState(3);
  const [gameFinished, setGameFinished] = useState(false);
  const [gameResults, setGameResults] = useState([]);
  const canvasRef = useRef(null);
  const roundIdRef = useRef(null);
  const tokenRef = useRef(null);
  const navigate = useNavigate();

  const token = localStorage.getItem('token');
  const username = localStorage.getItem('username');

  useEffect(() => {
    roundIdRef.current = roundId;
  }, [roundId]);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    socket.connect();

    socket.on('player-joined', ({ username: joinedUsername }) => {
      setPlayers(prev => [...new Set([...prev, joinedUsername])]);
      setSubmissionStatus(prev => ({ ...prev, [joinedUsername]: false }));
    });

    socket.on('player-left', ({ username: leftUsername }) => {
      setPlayers(prev => prev.filter(p => p !== leftUsername));
      setSubmissionStatus(prev => {
        const next = { ...prev };
        delete next[leftUsername];
        return next;
      });
    });

    socket.on('player-submitted', ({ username: submittedUsername }) => {
      setSubmissionStatus(prev => ({ ...prev, [submittedUsername]: true }));
    });

    socket.on('round-started', ({ word: newWord, startTime, duration, roundId: newRoundId, roundNumber, totalRounds: roundsTotal }) => {
      setWord(newWord);
      setRoundId(newRoundId);
      setCurrentRound(roundNumber || 1);
      setTotalRounds(roundsTotal || 3);
      setGameFinished(false);
      setRoundResults([]);
      setSubmissionStatus(prev => {
        const next = {};
        Object.keys(prev).forEach(player => {
          next[player] = false;
        });
        return next;
      });
      setRoundActive(true);
      setTimeLeft(Math.max(0, Math.ceil((startTime + duration - Date.now()) / 1000)));
    });

    socket.on('round-results', ({ results = [] }) => {
      setRoundResults(results);
    });

    socket.on('game-finished', ({ results = [] }) => {
      setGameFinished(true);
      setGameResults(results);
      setRoundActive(false);
      setTimeLeft(0);
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
      socket.off('player-submitted');
      socket.off('round-started');
      socket.off('round-results');
      socket.off('game-finished');
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
    const currentRoundId = roundIdRef.current;
    if (!dataUrl || !currentRoundId) return;

    try {
      const res = await fetch(`${BASE_URL}/api/drawings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify({ roundId: currentRoundId, imageData: dataUrl }),
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
      <ul>
        {players.map(player => (
          <li key={player}>
            {player}
            <span style={{ marginLeft: 8, color: submissionStatus[player] ? 'green' : '#b36b00' }}>
              {submissionStatus[player] ? '✅ abgegeben' : '⏳ offen'}
            </span>
          </li>
        ))}
      </ul>

      <div style={{ marginTop: 16 }}>
        {!roundActive && !gameFinished ? (
          <button onClick={() => socket.emit('start-round')}>Start Round</button>
        ) : (
          <div>
            <p><strong>Word:</strong> {word}</p>
            <p><strong>Time left:</strong> {timeLeft}s</p>
            <p><strong>Round:</strong> {currentRound}/{totalRounds}</p>
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

      {gameFinished && gameResults.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3>Overall Ranking</h3>
          {gameResults.map((entry, index) => (
            <div key={entry.username} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 10, marginBottom: 8 }}>
              <strong>#{index + 1} {entry.username || 'Unknown'}</strong>
              <div>Total Score: {entry.total_score ?? 0}</div>
            </div>
          ))}
        </div>
      )}

      {roundResults.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3>Round Results</h3>
          {roundResults.map(entry => (
            <div key={entry.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 10, marginBottom: 10 }}>
              <strong>{entry.username || 'Unknown'}</strong>
              <div>Score: {entry.ai_score ?? 0}/100</div>
              <div>Feedback: {entry.ai_feedback || 'No feedback'}</div>
              {entry.image_data ? <img src={entry.image_data} alt="drawing" style={{ width: '100%', marginTop: 8, borderRadius: 6 }} /> : null}
            </div>
          ))}
        </div>
      )}
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

