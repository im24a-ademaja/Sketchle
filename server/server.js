const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const OpenAI = require('openai');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();
console.log('OPENAI KEY geladen:', !!process.env.OPENAI_API_KEY);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

const port = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const MAX_ROUNDS = 3;
const ROUND_DURATION = 45000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const uploadsDir = path.resolve(__dirname, 'uploads');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// Health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Sketchle API' });
});

app.get('/api/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS now');
    res.json({ now: result.rows[0].now });
  } catch (error) {
    console.error('Postgres test failed:', error);
    res.status(500).json({ error: 'Database connection failed', details: error.message });
  }
});

// Auth
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username und Passwort erforderlich' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username, hash]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
    res.json({ token, user });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already taken' });
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username und Passwort erforderlich' });

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Lobbies
function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

app.post('/api/lobbies', authMiddleware, async (req, res) => {
  const code = generateCode();
  try {
    const result = await pool.query(
      'INSERT INTO lobbies (code, host_id) VALUES ($1, $2) RETURNING *',
      [code, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not create lobby' });
  }
});

app.get('/api/lobbies/:code', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM lobbies WHERE code = $1',
      [req.params.code]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Lobby not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error loading lobby' });
  }
});

// Vision
app.post('/api/vision', async (req, res) => {
  try {
    const { imageUrl, prompt } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'imageUrl is required' });

    const finalPrompt = prompt || 'Describe the content of this image.';
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
    console.error('Vision API error:', error);
    res.status(500).json({ error: 'OpenAI Vision request failed', details: error.message });
  }
});

app.post('/api/drawings', authMiddleware, async (req, res) => {
  const { roundId, imageData } = req.body;
  if (!roundId || !imageData) return res.status(400).json({ error: 'roundId und imageData erforderlich' });

  try {
    const roundResult = await pool.query('SELECT * FROM rounds WHERE id = $1', [roundId]);
    const round = roundResult.rows[0];
    if (!round) return res.status(404).json({ error: 'Runde nicht gefunden' });

    const aiResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Das Stichwort ist "${round.word}". Bewerte wie gut die Zeichnung das Stichwort darstellt, 0-100 Punkte. Antworte NUR mit JSON: {"score": <Zahl>, "feedback": "<kurzer Kommentar>"}`
          },
          { type: 'image_url', image_url: { url: imageData } }
        ]
      }]
    });

    let score = 0;
    let feedback = '';
    try {
      const parsed = JSON.parse(aiResponse.choices[0].message.content.replace(/```json|```/g, '').trim());
      score = parsed.score;
      feedback = parsed.feedback;
    } catch {
      feedback = aiResponse.choices[0].message.content;
    }

    const result = await pool.query(
      'INSERT INTO drawings (round_id, user_id, image_data, ai_score, ai_feedback) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [roundId, req.user.id, imageData, score, feedback]
    );

    const lobbyResult = await pool.query(
      `SELECT l.code
       FROM rounds r
       JOIN lobbies l ON l.id = r.lobby_id
       WHERE r.id = $1`,
      [roundId]
    );

    if (lobbyResult.rows[0]?.code) {
      io.to(lobbyResult.rows[0].code).emit('player-submitted', {
        username: req.user.username,
        roundId,
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Drawing submission error:', err);
    res.status(500).json({ error: 'Bewertung fehlgeschlagen' });
  }
});

app.post('/api/submissions', authMiddleware, async (req, res) => {
  try {
    const { imageData, prompt, lobbyCode } = req.body;
    if (!imageData) {
      return res.status(400).json({ error: 'imageData is required' });
    }

    const match = imageData.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid image format' });
    }

    const [, imageType, base64Data] = match;
    const extension = imageType.split('/')[1] || 'png';
    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, buffer);

    const imageUrl = `http://localhost:${port}/uploads/${fileName}`;
    const finalPrompt = prompt || 'Describe the content of this image.';

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
    console.error('Submission error:', error);
    res.status(500).json({ error: 'Could not process submission', details: error.message });
  }
});

async function getOverallResults(lobbyId) {
  const result = await pool.query(
    `SELECT u.username, COALESCE(SUM(d.ai_score), 0) AS total_score
     FROM drawings d
     JOIN rounds r ON r.id = d.round_id
     JOIN users u ON u.id = d.user_id
     WHERE r.lobby_id = $1
     GROUP BY u.id, u.username
     ORDER BY total_score DESC, u.username ASC`,
    [lobbyId]
  );

  return result.rows;
}

async function startRoundForLobby(lobbyCode) {
  try {
    const lobbyResult = await pool.query('SELECT * FROM lobbies WHERE code = $1', [lobbyCode]);
    const lobby = lobbyResult.rows[0];
    if (!lobby) return;

    const nextRoundNumber = lobby.current_round + 1;
    if (nextRoundNumber > MAX_ROUNDS) {
      const results = await getOverallResults(lobby.id);
      io.to(lobbyCode).emit('game-finished', { results });
      return;
    }

    const word = WORDS[Math.floor(Math.random() * WORDS.length)];

    const roundResult = await pool.query(
      'INSERT INTO rounds (lobby_id, round_number, word, started_at) VALUES ($1, $2, $3, NOW()) RETURNING *',
      [lobby.id, nextRoundNumber, word]
    );
    const round = roundResult.rows[0];

    await pool.query('UPDATE lobbies SET current_round = $1 WHERE id = $2', [nextRoundNumber, lobby.id]);

    const startTime = Date.now();

    io.to(lobbyCode).emit('round-started', {
      word,
      startTime,
      duration: ROUND_DURATION,
      roundId: round.id,
      roundNumber: nextRoundNumber,
      totalRounds: MAX_ROUNDS,
    });

    setTimeout(async () => {
      try {
        const result = await pool.query(
          `SELECT d.*, u.username
           FROM drawings d
           LEFT JOIN users u ON u.id = d.user_id
           WHERE d.round_id = $1
           ORDER BY d.ai_score DESC, d.submitted_at ASC`,
          [round.id]
        );

        io.to(lobbyCode).emit('round-results', { roundId: round.id, results: result.rows });
      } catch (err) {
        console.error('round-results error:', err);
      }

      io.to(lobbyCode).emit('round-ended', { roundId: round.id });

      if (nextRoundNumber < MAX_ROUNDS) {
        setTimeout(() => {
          startRoundForLobby(lobbyCode);
        }, 3000);
      } else {
        const results = await getOverallResults(lobby.id);
        io.to(lobbyCode).emit('game-finished', { results });
      }
    }, ROUND_DURATION);
  } catch (err) {
    console.error('start-round error:', err);
  }
}

// Socket.io
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('join-lobby', ({ lobbyCode, username }) => {
    socket.join(lobbyCode);
    socket.data.lobbyCode = lobbyCode;
    socket.data.username = username;
    io.to(lobbyCode).emit('player-joined', { username });
    console.log(`${username} joined lobby ${lobbyCode}`);
  });

  socket.on('leave-lobby', () => {
    const { lobbyCode, username } = socket.data;
    if (lobbyCode) {
      socket.leave(lobbyCode);
      io.to(lobbyCode).emit('player-left', { username });
    }
  });

const WORDS = ['Cat', 'House', 'Sun', 'Tree', 'Car', 'Fish', 'Mountain', 'Book', 'Phone', 'Flower'];

socket.on('start-round', () => {
  const { lobbyCode } = socket.data;
  if (!lobbyCode) return;

  startRoundForLobby(lobbyCode);
});

  socket.on('disconnect', () => {
    const { lobbyCode, username } = socket.data;
    if (lobbyCode) {
      io.to(lobbyCode).emit('player-left', { username });
    }
    console.log('Socket disconnected:', socket.id);
  });
});

// Frontend fallback
const distPath = path.resolve(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.resolve(distPath, 'index.html'));
  });
}

server.listen(port, () => {
  console.log(`Sketchle backend listening on http://localhost:${port}`);
});
