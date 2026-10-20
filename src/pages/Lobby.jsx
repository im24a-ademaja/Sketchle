import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/client';
import socket from '../socket/socket';
import DrawingCanvas from '../components/DrawingCanvas';

const MIN_PLAYERS = 1;
const MAX_PLAYERS = 10;

export default function Lobby() {
  const [joinCode, setJoinCode] = useState('');
  const [lobbyCode, setLobbyCode] = useState('');
  const [players, setPlayers] = useState([]);
  const [hostUsername, setHostUsername] = useState('');
  const [lobbyStatus, setLobbyStatus] = useState('waiting');
  const [inLobby, setInLobby] = useState(false);
  const [word, setWord] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [roundEndsAt, setRoundEndsAt] = useState(null);
  const [roundActive, setRoundActive] = useState(false);
  const [roundId, setRoundId] = useState(null);
  const [currentRound, setCurrentRound] = useState(0);
  const [roundResults, setRoundResults] = useState([]);
  const [roundResultsReceived, setRoundResultsReceived] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState({});
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [gameFinished, setGameFinished] = useState(false);
  const [gameResults, setGameResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const canvasRef = useRef(null);
  const roundIdRef = useRef(null);
  const hasSubmittedRef = useRef(false);
  const submitDrawingRef = useRef(null);
  const navigate = useNavigate();
  const username = localStorage.getItem('username') || '';
  const token = localStorage.getItem('token');
  const isHost = username === hostUsername;

  const submitDrawing = useCallback(async (imageData) => {
    const activeRoundId = roundIdRef.current;
    if (!imageData || !activeRoundId || hasSubmittedRef.current) return;

    hasSubmittedRef.current = true;
    setHasSubmitted(true);
    setError('');
    try {
      const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundId: activeRoundId, imageData }),
      };
      try {
        await apiFetch('/api/drawings', options);
      } catch (requestError) {
        if (requestError.status) throw requestError;
        await new Promise(resolve => setTimeout(resolve, 350));
        await apiFetch('/api/drawings', options);
      }
    } catch (submitError) {
      if (submitError.status === 502 || submitError.status === 409) {
        setHasSubmitted(true);
      } else {
        hasSubmittedRef.current = false;
        setHasSubmitted(false);
      }
      setError(submitError.message || 'Zeichnung konnte nicht abgegeben werden.');
    }
  }, []);
  submitDrawingRef.current = submitDrawing;

  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true });
      return undefined;
    }

    socket.auth = { token };

    const onLobbyState = (state) => {
      setPlayers(state.players || []);
      setHostUsername(state.hostUsername || '');
      setLobbyStatus(state.status || 'waiting');
      setSubmissionStatus(previous => {
        const next = {};
        (state.players || []).forEach(player => {
          next[player] = previous[player] || false;
        });
        return next;
      });
    };
    const onPlayerSubmitted = ({ username: submittedUsername }) => {
      if (submittedUsername) {
        setSubmissionStatus(previous => ({ ...previous, [submittedUsername]: true }));
      }
    };
    const onRoundStarted = ({ word: newWord, startTime, duration, roundId: newRoundId, roundNumber }) => {
      roundIdRef.current = newRoundId;
      hasSubmittedRef.current = false;
      setRoundId(newRoundId);
      setWord(newWord);
      setCurrentRound(roundNumber);
      setRoundEndsAt(startTime + duration);
      setTimeLeft(Math.max(0, Math.ceil((startTime + duration - Date.now()) / 1000)));
      setRoundActive(true);
      setHasSubmitted(false);
      setRoundResults([]);
      setRoundResultsReceived(false);
      setGameFinished(false);
      setSubmissionStatus(previous => Object.fromEntries(
        Object.keys(previous).map(player => [player, false])
      ));
    };
    const onSubmitRequest = ({ roundId: requestedRoundId }) => {
      if (Number(requestedRoundId) !== Number(roundIdRef.current)) return;
      if (hasSubmittedRef.current) {
        setRoundActive(false);
        setRoundEndsAt(null);
        return;
      }
      const imageData = canvasRef.current?.getImageData();
      if (imageData) void submitDrawingRef.current(imageData);
      setRoundActive(false);
    };
    const onRoundResults = ({ results = [], roundNumber }) => {
      setRoundResults(results);
      if (roundNumber) setCurrentRound(roundNumber);
      setRoundResultsReceived(true);
      setRoundActive(false);
      setRoundEndsAt(null);
      setTimeLeft(0);
    };
    const onGameFinished = ({ results = [] }) => {
      setGameFinished(true);
      setGameResults(results);
      setRoundActive(false);
      setRoundEndsAt(null);
      setTimeLeft(0);
      setLobbyStatus('completed');
    };
    const onLobbyError = ({ message }) => setError(message || 'Im Spiel ist ein Fehler aufgetreten.');
    const onConnectError = (connectError) => setError(connectError.message || 'Die Verbindung zum Spielserver ist fehlgeschlagen.');

    socket.on('lobby-state', onLobbyState);
    socket.on('player-submitted', onPlayerSubmitted);
    socket.on('round-started', onRoundStarted);
    socket.on('round-submit-request', onSubmitRequest);
    socket.on('round-results', onRoundResults);
    socket.on('game-finished', onGameFinished);
    socket.on('lobby-error', onLobbyError);
    socket.on('connect_error', onConnectError);
    socket.connect();

    return () => {
      socket.off('lobby-state', onLobbyState);
      socket.off('player-submitted', onPlayerSubmitted);
      socket.off('round-started', onRoundStarted);
      socket.off('round-submit-request', onSubmitRequest);
      socket.off('round-results', onRoundResults);
      socket.off('game-finished', onGameFinished);
      socket.off('lobby-error', onLobbyError);
      socket.off('connect_error', onConnectError);
      socket.disconnect();
    };
  }, [navigate, token]);

  useEffect(() => {
    if (!roundActive || !roundEndsAt) return undefined;
    const updateTime = () => setTimeLeft(Math.max(0, Math.ceil((roundEndsAt - Date.now()) / 1000)));
    updateTime();
    const interval = setInterval(updateTime, 250);
    return () => clearInterval(interval);
  }, [roundActive, roundEndsAt]);

  useEffect(() => {
    if (!roundActive || !roundEndsAt) return undefined;
    const scheduledRoundId = roundId;
    const timeout = setTimeout(() => {
      if (roundIdRef.current !== scheduledRoundId || hasSubmittedRef.current) return;
      const imageData = canvasRef.current?.getImageData();
      if (imageData) void submitDrawingRef.current(imageData);
    }, Math.max(0, roundEndsAt - Date.now()));

    return () => clearTimeout(timeout);
  }, [roundActive, roundEndsAt, roundId]);

  async function joinSocketLobby(code) {
    if (!socket.connected) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          socket.off('connect', onConnect);
          socket.off('connect_error', onError);
          reject(new Error('Zeitüberschreitung beim Verbinden mit dem Spielserver.'));
        }, 10000);
        const onConnect = () => {
          clearTimeout(timeout);
          socket.off('connect_error', onError);
          resolve();
        };
        const onError = (connectError) => {
          clearTimeout(timeout);
          socket.off('connect', onConnect);
          reject(connectError);
        };
        socket.once('connect', onConnect);
        socket.once('connect_error', onError);
        socket.connect();
      });
    }

    await new Promise((resolve, reject) => {
      socket.emit('join-lobby', { lobbyCode: code }, (result) => {
        if (result?.error) reject(new Error(result.error));
        else resolve();
      });
    });
    setLobbyCode(code);
    setInLobby(true);
    setError('');
  }

  async function createLobby() {
    setIsLoading(true);
    setError('');
    try {
      const lobby = await apiFetch('/api/lobbies', { method: 'POST' });
      await joinSocketLobby(lobby.code);
    } catch (requestError) {
      setError(requestError.message || 'Der Spielraum konnte nicht erstellt werden.');
    } finally {
      setIsLoading(false);
    }
  }

  async function joinLobby(event) {
    event.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      setError('Der Spielraum-Code muss genau 6 Zeichen haben.');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      await apiFetch(`/api/lobbies/${encodeURIComponent(code)}`);
      await joinSocketLobby(code);
    } catch (requestError) {
      setError(requestError.message || 'Der Spielraum konnte nicht betreten werden.');
    } finally {
      setIsLoading(false);
    }
  }

  function startRound() {
    setError('');
    socket.emit('start-round', result => {
      if (result?.error) setError(result.error);
    });
  }

  function leaveLobby() {
    socket.emit('leave-lobby');
    setInLobby(false);
    setLobbyCode('');
    setPlayers([]);
    setHostUsername('');
    setLobbyStatus('waiting');
    setRoundResults([]);
    setRoundResultsReceived(false);
    setGameResults([]);
    setGameFinished(false);
    roundIdRef.current = null;
    setRoundId(null);
    setRoundActive(false);
    setJoinCode('');
    setError('');
  }

  function logout() {
    if (socket.connected) socket.emit('leave-lobby');
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    navigate('/login', { replace: true });
  }

  return (
    <main className="app-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Die Zeichen-Herausforderung</p>
          <h1>Sketchle</h1>
        </div>
        <div className="account-actions">
          <span>Hallo, {username}</span>
          <button className="text-button" onClick={logout}>Abmelden</button>
        </div>
      </header>

      {error && <p className="error-message page-error" role="alert">{error}</p>}

      {!inLobby ? (
        <section className="panel lobby-entry">
          <h2>Gemeinsam zeichnen</h2>
          <p>Erstelle einen Spielraum und spiele mit 1 bis 10 Personen drei Zeichenrunden.</p>
          <button className="primary-button" disabled={isLoading} onClick={createLobby}>
            {isLoading ? 'Spielraum wird erstellt …' : 'Spielraum erstellen'}
          </button>
          <div className="divider"><span>oder</span></div>
          <form className="join-form" onSubmit={joinLobby}>
            <label htmlFor="lobby-code">Spielraum-Code</label>
            <div className="join-controls">
              <input
                autoCapitalize="characters"
                id="lobby-code"
                maxLength={6}
                onChange={event => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                placeholder="6 Zeichen"
                value={joinCode}
              />
              <button className="secondary-button" disabled={isLoading || joinCode.length !== 6} type="submit">
                Beitreten
              </button>
            </div>
          </form>
        </section>
      ) : (
        <section className="panel game-panel">
          <div className="lobby-heading">
            <div>
              <p className="eyebrow">Spielraum-Code</p>
              <h2 className="lobby-code">{lobbyCode}</h2>
            </div>
            <span className={`status-pill ${lobbyStatus}`}>{lobbyStatus === 'waiting' ? 'Wartet auf den Start' : lobbyStatus === 'playing' ? 'Spiel läuft' : lobbyStatus === 'results' ? 'Auswertung' : 'Beendet'}</span>
          </div>

          <div className="players-heading">
            <h3>Spieler</h3>
            <span>{players.length} / {MAX_PLAYERS}</span>
          </div>
          <ul className="player-list">
            {players.map(player => (
              <li key={player}>
                <span>{player}{player === hostUsername ? ' (Spielleitung)' : ''}{player === username ? ' (Du)' : ''}</span>
                {roundActive && <span className={submissionStatus[player] ? 'submitted-tag' : 'waiting-tag'}>
                  {submissionStatus[player] ? 'Abgegeben' : 'Zeichnet …'}
                </span>}
              </li>
            ))}
          </ul>

          {lobbyStatus === 'waiting' && (
            <div className="start-area">
              {players.length < MIN_PLAYERS
                ? <p>{players.length === 0 ? 'Du kannst das Spiel allein starten.' : `Noch ${MIN_PLAYERS - players.length} Spieler bis zum Start.`}</p>
                : <p>Alle bereit? Die Spielleitung kann das Spiel starten.</p>}
              {isHost && <button className="primary-button" disabled={players.length < MIN_PLAYERS} onClick={startRound}>Spiel starten</button>}
              {!isHost && <p>Warte darauf, dass {hostUsername || 'die Spielleitung'} startet.</p>}
            </div>
          )}

          {roundActive && (
            <div className="round-area">
              <div className="round-summary">
                <div>
                  <p className="eyebrow">Runde {currentRound} von 3</p>
                  <h2>{word}</h2>
                </div>
                <div className={`timer ${timeLeft <= 10 ? 'timer-warning' : ''}`} aria-live="polite">{timeLeft} Sek.</div>
              </div>
              <DrawingCanvas
                key={roundId}
                disabled={hasSubmitted || !roundActive}
                onSubmit={submitDrawing}
                ref={canvasRef}
              />
              {hasSubmitted && <p className="success-message">Abgegeben – die anderen Spieler zeichnen noch.</p>}
            </div>
          )}

          {!roundActive && roundResultsReceived && (
            <section className="results-section">
              <p className="eyebrow">Runde {currentRound} abgeschlossen</p>
              <h2>Rundenauswertung</h2>
              {lobbyStatus !== 'completed' && <p className="help-text">Die nächste Runde startet automatisch in wenigen Sekunden.</p>}
              <div className="results-grid">
                {roundResults.map((entry, index) => (
                  <article className="result-card" key={entry.id}>
                    <div className="result-title">
                      <strong>#{index + 1} {entry.username}</strong>
                      <span>{entry.ai_score === null ? '—' : `${entry.ai_score}/100`}</span>
                    </div>
                    <p>{entry.ai_feedback || 'Keine KI-Rückmeldung verfügbar.'}</p>
                    {entry.image_data && <img alt={`${entry.username}s Zeichnung`} src={entry.image_data} />}
                  </article>
                ))}
              </div>
              {roundResults.length === 0 && <p>Noch keine Zeichnungen wurden abgegeben.</p>}
            </section>
          )}

          {gameFinished && (
            <section className="results-section">
              <p className="eyebrow">Drei Runden abgeschlossen</p>
              <h2>Spielergebnis</h2>
              <ol className="leaderboard-list">
                {gameResults.map(entry => (
                  <li key={entry.id}>
                    <span>#{entry.rank} {entry.username}</span>
                    <strong>{entry.total_score} Punkte</strong>
                  </li>
                ))}
              </ol>
              <button className="primary-button" onClick={leaveLobby}>Zurück zur Spielraum-Auswahl</button>
            </section>
          )}

          <button className="text-button leave-button" onClick={leaveLobby}>Spielraum verlassen</button>
        </section>
      )}
    </main>
  );
}
