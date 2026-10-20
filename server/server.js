const path = require('path');
const fs = require('fs');
const http = require('http');
const { randomInt } = require('crypto');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const OpenAI = require('openai');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

const port = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET muss gesetzt sein, bevor der Server gestartet wird.');
}
if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY muss gesetzt sein, bevor der Server gestartet wird.');
}
const MAX_ROUNDS = 3;
const ROUND_DURATION = 45000;
const MAX_PLAYERS = 10;
const MIN_PLAYERS = 1;
const SUBMISSION_GRACE = 2000;
const MAX_SCORING_WAIT = 10000;
const SCORE_TIMEOUT = 8000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const uploadsDir = path.resolve(__dirname, 'uploads');
const WORDS = [
  'Katze', 'Haus', 'Sonne', 'Baum', 'Auto', 'Fisch', 'Berg', 'Buch', 'Telefon', 'Blume',
  'Fahrrad', 'Flugzeug', 'Schiff', 'Zug', 'Schlüssel', 'Regenschirm', 'Uhr', 'Brille',
  'Schuh', 'Hut', 'Tasse', 'Gabel', 'Löffel', 'Pizza', 'Apfel', 'Banane', 'Erdbeere',
  'Kuchen', 'Eis', 'Kamera', 'Gitarre', 'Klavier', 'Ball', 'Drachen', 'Kerze', 'Lampe',
  'Stuhl', 'Tisch', 'Bett', 'Tür', 'Fenster', 'Krone', 'Geschenk', 'Rucksack', 'Koffer',
  'Kaktus', 'Pilz', 'Regenbogen', 'Wolke', 'Mond', 'Stern', 'Schneemann', 'Schnecke',
  'Schildkröte', 'Elefant', 'Pinguin', 'Schmetterling', 'Biene', 'Krabbe', 'Wal',
  'Delfin', 'Leuchtturm', 'Rakete', 'Roboter', 'Ananas', 'Karotte', 'Zahnbürste',
  'Briefkasten', 'Burg', 'Pyramide', 'Eule', 'Igel', 'Fuchs', 'Huhn', 'Kuh', 'Schlange',
  'Pferd', 'Giraffe', 'Affe', 'Mütze', 'Schal', 'Handschuh', 'Zelt', 'Besen', 'Eimer',
  'Schaufel', 'Schere', 'Kamm', 'Kissen', 'Spiegel', 'Vase', 'Blitz', 'Bergsee',
  'Schneeflocke', 'Kirsche', 'Wassermelone', 'Kürbis', 'Maiskolben', 'Kronleuchter',
  'U-Boot', 'Heißluftballon', 'Feuerwehrauto', 'Brief', 'Schatztruhe', 'Sandburg',
];
const liveLobbies = new Map();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// Statusprüfung
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Sketchle-Schnittstelle' });
});

app.get('/api/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS now');
    res.json({ now: result.rows[0].now });
  } catch (error) {
    console.error('Datenbankprüfung fehlgeschlagen:', error);
    res.status(500).json({ error: 'Verbindung zur Datenbank fehlgeschlagen', details: error.message });
  }
});

// Anmeldung
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Anmeldetoken fehlt.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Anmeldetoken ist ungültig oder abgelaufen.' });
  }
}

app.post('/api/auth/register', async (req, res) => {
  const body = req.body || {};
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username) ||
    Buffer.byteLength(password, 'utf8') < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ error: 'Der Benutzername muss 3 bis 30 Zeichen lang sein und darf nur Buchstaben, Zahlen und Unterstriche enthalten. Das Passwort muss 8 bis 72 Byte lang sein.' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username, hash]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Dieser Benutzername ist bereits vergeben.' });
    console.error('Registrierung fehlgeschlagen:', err);
    res.status(500).json({ error: 'Registrierung fehlgeschlagen.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: 'Benutzername und Passwort sind erforderlich.' });

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Benutzername oder Passwort ist falsch.' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Benutzername oder Passwort ist falsch.' });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (err) {
    console.error('Anmeldung fehlgeschlagen:', err);
    res.status(500).json({ error: 'Anmeldung fehlgeschlagen.' });
  }
});

// Spielräume
function generateCode() {
  return Array.from({ length: 6 }, () => randomInt(36).toString(36)).join('').toUpperCase();
}

app.post('/api/lobbies', authMiddleware, async (req, res) => {
  try {
    let lobby;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generateCode();
      try {
        const result = await pool.query(
          'INSERT INTO lobbies (code, host_id) VALUES ($1, $2) RETURNING *',
          [code, req.user.id]
        );
        lobby = result.rows[0];
        break;
      } catch (err) {
        if (err.code !== '23505') throw err;
      }
    }
    if (!lobby) throw new Error('Es konnte kein eindeutiger Spielraum-Code erstellt werden.');
    res.json(lobby);
  } catch (err) {
    console.error('Spielraum konnte nicht erstellt werden:', err);
    res.status(500).json({ error: 'Spielraum konnte nicht erstellt werden.' });
  }
});

app.get('/api/lobbies/:code', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM lobbies WHERE code = $1',
      [req.params.code]
    );
    const lobby = result.rows[0];
    if (!lobby) return res.status(404).json({ error: 'Spielraum nicht gefunden.' });
    const runtime = liveLobbies.get(lobby.code);
    const playerCount = runtime?.players.size || 0;
    if (lobby.status !== 'waiting') {
      return res.status(409).json({ error: 'Dieses Spiel hat bereits begonnen oder ist beendet.' });
    }
    if (playerCount >= MAX_PLAYERS) {
      return res.status(409).json({ error: `Dieser Spielraum ist voll (höchstens ${MAX_PLAYERS} Spieler).` });
    }
    res.json({ code: lobby.code, status: lobby.status, playerCount });
  } catch (err) {
    console.error('Spielraum konnte nicht geladen werden:', err);
    res.status(500).json({ error: 'Spielraum konnte nicht geladen werden.' });
  }
});

// Vision
app.post('/api/vision', async (req, res) => {
  try {
    const { imageUrl, prompt } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'Die Bildadresse ist erforderlich.' });

    const finalPrompt = prompt || 'Beschreibe den Inhalt dieses Bildes.';
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: finalPrompt },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      }]
    });

    res.json({ output: response.choices[0].message.content });
  } catch (error) {
    console.error('Bildauswertung fehlgeschlagen:', error);
    res.status(500).json({ error: 'Die KI-Bildauswertung ist fehlgeschlagen.', details: error.message });
  }
});

app.post('/api/drawings', authMiddleware, async (req, res) => {
  const { roundId, imageData } = req.body || {};
  if (!roundId || typeof imageData !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(imageData)) {
    return res.status(400).json({ error: 'Eine gültige PNG-Zeichnung ist erforderlich.' });
  }
  if (imageData.length > 8 * 1024 * 1024) {
    return res.status(413).json({ error: 'Die Zeichnung ist zu gross.' });
  }

  try {
    const roundResult = await pool.query(
      `SELECT r.*, l.code
       FROM rounds r JOIN lobbies l ON l.id = r.lobby_id
       WHERE r.id = $1`,
      [roundId]
    );
    const round = roundResult.rows[0];
    if (!round) return res.status(404).json({ error: 'Runde nicht gefunden' });

    const runtime = liveLobbies.get(round.code);
    const activeRound = runtime?.round;
    const submissionDeadline = activeRound?.locked
      ? activeRound.submissionDeadline
      : (activeRound?.endsAt || 0) + SUBMISSION_GRACE;
    if (!activeRound || activeRound.id !== Number(roundId) || Date.now() > submissionDeadline) {
      return res.status(409).json({ error: 'Für diese Runde werden keine Zeichnungen mehr angenommen.' });
    }
    if (!activeRound.players.has(String(req.user.id))) {
      return res.status(403).json({ error: 'Du nimmst an dieser Runde nicht teil.' });
    }
    if (activeRound.submissions.has(String(req.user.id))) {
      return res.status(409).json({ error: 'Du hast für diese Runde bereits eine Zeichnung abgegeben.' });
    }

    const userId = String(req.user.id);
    activeRound.submissions.add(userId);
    activeRound.pendingScores += 1;
    let result;
    try {
      result = await pool.query(
        'INSERT INTO drawings (round_id, user_id, image_data) VALUES ($1, $2, $3) RETURNING *',
        [roundId, req.user.id, imageData]
      );
    } catch (error) {
      activeRound.submissions.delete(userId);
      activeRound.pendingScores -= 1;
      throw error;
    }
    io.to(round.code).emit('player-submitted', {
      userId: req.user.id,
      username: req.user.username,
      roundId,
    });

    try {
      const aiResponse = await openai.chat.completions.create({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Das Stichwort lautet „${round.word}“. Bewerte, wie treffend, kreativ und klar die Zeichnung das Stichwort darstellt. Antworte ausschliesslich mit JSON: {"score": ganze Zahl von 0 bis 100, "feedback": ein kurzer Satz auf Deutsch}.`
            },
            { type: 'image_url', image_url: { url: imageData } }
          ]
        }]
      }, { timeout: SCORE_TIMEOUT });
      const parsed = JSON.parse(aiResponse.choices[0].message.content);
      const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score))));
      if (!Number.isFinite(score) || typeof parsed.feedback !== 'string' || !parsed.feedback.trim()) {
        throw new Error('Das Bildmodell hat eine ungültige Punktzahl oder Rückmeldung geliefert.');
      }
      const updated = await pool.query(
        'UPDATE drawings SET ai_score = $1, ai_feedback = $2 WHERE id = $3 RETURNING *',
        [score, parsed.feedback.trim(), result.rows[0].id]
      );
      io.to(round.code).emit('drawing-scored', {
        userId: req.user.id,
        roundId,
        drawing: updated.rows[0],
      });
      res.json(updated.rows[0]);
    } catch (error) {
      console.error('KI-Bewertung der Zeichnung fehlgeschlagen:', error);
      const message = 'AI-Bewertung fehlgeschlagen. Die Zeichnung wurde gespeichert.';
      const updated = await pool.query(
        'UPDATE drawings SET ai_feedback = $1 WHERE id = $2 RETURNING *',
        [message, result.rows[0].id]
      );
      io.to(round.code).emit('drawing-scored', {
        userId: req.user.id,
        roundId,
        drawing: updated.rows[0],
      });
      res.status(502).json({ error: message, drawing: updated.rows[0] });
    } finally {
      activeRound.pendingScores -= 1;
      maybeFinishRound(round.code);
    }
  } catch (err) {
    console.error('Abgabe der Zeichnung fehlgeschlagen:', err);
    res.status(500).json({ error: 'Die Zeichnung konnte nicht bewertet werden.' });
  }
});

app.post('/api/submissions', authMiddleware, async (req, res) => {
  try {
    const { imageData, prompt, lobbyCode } = req.body;
    if (!imageData) {
      return res.status(400).json({ error: 'Die Bilddaten sind erforderlich.' });
    }

    const match = imageData.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Das Bildformat ist ungültig.' });
    }

    const [, imageType, base64Data] = match;
    const extension = imageType.split('/')[1] || 'png';
    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, buffer);

    const imageUrl = `http://localhost:${port}/uploads/${fileName}`;
    const finalPrompt = prompt || 'Beschreibe den Inhalt dieses Bildes.';

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: finalPrompt },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      }]
    });

    res.json({
      savedFile: fileName,
      imageUrl,
      lobbyCode,
      output: response.choices[0].message.content,
    });
  } catch (error) {
    console.error('Abgabe konnte nicht verarbeitet werden:', error);
    res.status(500).json({ error: 'Die Abgabe konnte nicht verarbeitet werden.', details: error.message });
  }
});

async function getOverallResults(lobbyId, playerIds) {
  if (playerIds.length === 0) return [];
  const result = await pool.query(
    `SELECT u.id, u.username, COALESCE(SUM(d.ai_score), 0)::int AS total_score
     FROM users u
     LEFT JOIN rounds r ON r.lobby_id = $1
     LEFT JOIN drawings d ON d.round_id = r.id AND d.user_id = u.id
     WHERE u.id = ANY($2::int[])
     GROUP BY u.id, u.username
     ORDER BY total_score DESC, u.username ASC`,
    [lobbyId, playerIds]
  );
  return result.rows.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

async function finishRound(lobbyCode) {
  const runtime = liveLobbies.get(lobbyCode);
  const round = runtime?.round;
  if (!round || !round.locked || round.finalizing ||
    (!round.scoringCutoff && round.pendingScores > 0) ||
    (!round.graceElapsed && round.submissions.size < round.players.size)) return;
  round.finalizing = true;

  try {
    await pool.query('UPDATE rounds SET ended_at = NOW() WHERE id = $1', [round.id]);
    const result = await pool.query(
      `SELECT d.*, u.username
       FROM drawings d
       JOIN users u ON u.id = d.user_id
       WHERE d.round_id = $1
       ORDER BY d.ai_score DESC NULLS LAST, d.submitted_at ASC`,
      [round.id]
    );
    io.to(lobbyCode).emit('round-results', {
      roundId: round.id,
      roundNumber: round.number,
      results: result.rows,
    });
    runtime.round = null;
    runtime.phase = 'results';
    broadcastLobbyState(lobbyCode);

    if (round.number === MAX_ROUNDS) {
      const results = await getOverallResults(round.lobbyId, [...round.players].map(Number));
      await pool.query("UPDATE lobbies SET status = 'completed' WHERE id = $1", [round.lobbyId]);
      runtime.phase = 'completed';
      broadcastLobbyState(lobbyCode);
      io.to(lobbyCode).emit('game-finished', { results });
    } else {
      setTimeout(() => startRoundForLobby(lobbyCode), 6000);
    }
  } catch (err) {
    console.error('Rundenauswertung fehlgeschlagen:', err);
    runtime.phase = 'error';
    io.to(lobbyCode).emit('lobby-error', { message: 'Die Rundenauswertung ist fehlgeschlagen.' });
  }
}

function maybeFinishRound(lobbyCode) {
  void finishRound(lobbyCode);
}

function closeRound(lobbyCode, expectedRoundId = null) {
  const runtime = liveLobbies.get(lobbyCode);
  const round = runtime?.round;
  if (!round || round.locked || (expectedRoundId !== null && round.id !== expectedRoundId)) return;
  round.locked = true;
  round.submissionDeadline = round.endsAt + SUBMISSION_GRACE;
  round.graceElapsed = false;
  io.to(lobbyCode).emit('round-submit-request', { roundId: round.id });

  setTimeout(() => {
    round.graceElapsed = true;
    maybeFinishRound(lobbyCode);
  }, Math.max(0, round.submissionDeadline - Date.now()));
  setTimeout(() => {
    round.scoringCutoff = true;
    maybeFinishRound(lobbyCode);
  }, MAX_SCORING_WAIT);
  maybeFinishRound(lobbyCode);
}

async function startRoundForLobby(lobbyCode) {
  const runtime = liveLobbies.get(lobbyCode);
  if (!runtime || runtime.phase === 'playing' || runtime.phase === 'completed') return;
  try {
    const lobbyResult = await pool.query('SELECT * FROM lobbies WHERE code = $1', [lobbyCode]);
    const lobby = lobbyResult.rows[0];
    if (!lobby || runtime.players.size < MIN_PLAYERS) return;
    const roundNumber = lobby.current_round + 1;
    if (roundNumber > MAX_ROUNDS) return;

    const usedWordsResult = await pool.query(
      'SELECT word FROM rounds WHERE lobby_id = $1',
      [lobby.id]
    );
    const usedWords = new Set(usedWordsResult.rows.map(({ word: usedWord }) => usedWord));
    const availableWords = WORDS.filter(word => !usedWords.has(word));
    if (availableWords.length === 0) {
      throw new Error(`Keine unbenutzten Stichwörter mehr für Spielraum ${lobbyCode} verfügbar.`);
    }
    const word = availableWords[randomInt(availableWords.length)];
    const roundResult = await pool.query(
      'INSERT INTO rounds (lobby_id, round_number, word, started_at) VALUES ($1, $2, $3, NOW()) RETURNING *',
      [lobby.id, roundNumber, word]
    );
    const round = roundResult.rows[0];
    await pool.query(
      "UPDATE lobbies SET current_round = $1, status = 'in_progress' WHERE id = $2",
      [roundNumber, lobby.id]
    );

    runtime.round = {
      id: round.id,
      number: roundNumber,
      lobbyId: lobby.id,
      endsAt: Date.now() + ROUND_DURATION,
      players: new Set([...runtime.players.keys()]),
      submissions: new Set(),
      pendingScores: 0,
      locked: false,
      submissionDeadline: 0,
      graceElapsed: false,
      scoringCutoff: false,
      finalizing: false,
    };
    runtime.phase = 'playing';
    const startTime = Date.now();
    runtime.round.endsAt = startTime + ROUND_DURATION;
    io.to(lobbyCode).emit('round-started', {
      word,
      startTime,
      duration: ROUND_DURATION,
      roundId: round.id,
      roundNumber,
      totalRounds: MAX_ROUNDS,
    });
    setTimeout(() => closeRound(lobbyCode, round.id), ROUND_DURATION);
    broadcastLobbyState(lobbyCode);
  } catch (err) {
    console.error('Runde konnte nicht gestartet werden:', err);
    runtime.phase = 'error';
    io.to(lobbyCode).emit('lobby-error', { message: 'Die Runde konnte nicht gestartet werden.' });
  }
}

function broadcastLobbyState(lobbyCode) {
  const runtime = liveLobbies.get(lobbyCode);
  if (!runtime) return;
  const host = runtime.players.get(String(runtime.hostId));
  io.to(lobbyCode).emit('lobby-state', {
    players: [...runtime.players.values()].map(player => player.username),
    hostUsername: host?.username || null,
    status: runtime.phase,
    currentRound: runtime.round?.number || 0,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
  });
}

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Anmeldung erforderlich.'));
    socket.data.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next(new Error('Anmeldetoken ist ungültig oder abgelaufen.'));
  }
});

io.on('connection', (socket) => {
  socket.on('join-lobby', async ({ lobbyCode } = {}, acknowledge = () => {}) => {
    const code = typeof lobbyCode === 'string' ? lobbyCode.trim().toUpperCase() : '';
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      acknowledge({ error: 'Gib einen gültigen Spielraum-Code mit sechs Zeichen ein.' });
      return;
    }
    try {
      const result = await pool.query('SELECT * FROM lobbies WHERE code = $1', [code]);
      const lobby = result.rows[0];
      if (!lobby || lobby.status !== 'waiting') {
        acknowledge({ error: 'Dieser Spielraum ist nicht verfügbar oder das Spiel hat bereits begonnen.' });
        return;
      }
      let runtime = liveLobbies.get(code);
      if (!runtime) {
        runtime = { hostId: lobby.host_id, players: new Map(), phase: 'waiting', round: null };
        liveLobbies.set(code, runtime);
      }
      if (runtime.phase !== 'waiting') {
        acknowledge({ error: 'Dieses Spiel hat bereits begonnen.' });
        return;
      }
      const userId = String(socket.data.user.id);
      if (!runtime.players.has(userId) && runtime.players.size >= MAX_PLAYERS) {
        acknowledge({ error: `Dieser Spielraum ist voll (höchstens ${MAX_PLAYERS} Spieler).` });
        return;
      }
      const existingPlayer = runtime.players.get(userId);
      if (existingPlayer && existingPlayer.socketId !== socket.id) {
        acknowledge({ error: 'Dieses Konto ist bereits im Spielraum.' });
        return;
      }
      runtime.players.set(userId, {
        id: userId,
        username: socket.data.user.username,
        socketId: socket.id,
      });
      socket.join(code);
      socket.data.lobbyCode = code;
      acknowledge({ ok: true });
      broadcastLobbyState(code);
    } catch (error) {
      console.error('Beitritt zum Spielraum fehlgeschlagen:', error);
      acknowledge({ error: 'Der Spielraum konnte nicht betreten werden.' });
    }
  });

  socket.on('leave-lobby', () => {
    const lobbyCode = socket.data.lobbyCode;
    removeSocketFromLobby(socket);
    if (lobbyCode) socket.leave(lobbyCode);
    socket.data.lobbyCode = null;
  });

  socket.on('start-round', async (acknowledge = () => {}) => {
    const lobbyCode = socket.data.lobbyCode;
    const runtime = liveLobbies.get(lobbyCode);
    if (!runtime || String(runtime.hostId) !== String(socket.data.user.id)) {
      acknowledge({ error: 'Nur die Spielleitung kann das Spiel starten.' });
      return;
    }
    if (runtime.phase !== 'waiting' || runtime.players.size < MIN_PLAYERS) {
      acknowledge({ error: `Der Spielraum muss warten und mindestens ${MIN_PLAYERS} Spieler enthalten.` });
      return;
    }
    runtime.phase = 'starting';
    acknowledge({ ok: true });
    await startRoundForLobby(lobbyCode);
    broadcastLobbyState(lobbyCode);
  });

  socket.on('disconnect', () => removeSocketFromLobby(socket));
});

function removeSocketFromLobby(socket) {
  const lobbyCode = socket.data.lobbyCode;
  const runtime = liveLobbies.get(lobbyCode);
  if (!lobbyCode || !runtime) return;
  const userId = String(socket.data.user.id);
  if (runtime.players.get(userId)?.socketId === socket.id) {
    runtime.players.delete(userId);
    io.to(lobbyCode).emit('player-left', { username: socket.data.user.username });
    broadcastLobbyState(lobbyCode);
  }
}

// Frontend fallback
const distPath = path.resolve(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Nicht gefunden.' });
    }
    res.sendFile(path.resolve(distPath, 'index.html'));
  });
}

server.listen(port, () => {
  console.log(`Sketchle-Server läuft unter http://localhost:${port}`);
});
