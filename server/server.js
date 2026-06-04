const path = require('path');
const http = require('http');
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
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors());
app.use(express.json());

// ─── Health ───────────────────────────────────────────────
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

// ─── Auth ─────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Kein Token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Ungültiger Token' });
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
    if (err.code === '23505') return res.status(409).json({ error: 'Username bereits vergeben' });
    res.status(500).json({ error: 'Registrierung fehlgeschlagen' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username und Passwort erforderlich' });

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Ungültige Zugangsdaten' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Ungültige Zugangsdaten' });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (err) {
    res.status(500).json({ error: 'Login fehlgeschlagen' });
  }
});

// ─── Lobbies ──────────────────────────────────────────────
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
    res.status(500).json({ error: 'Lobby konnte nicht erstellt werden' });
  }
});

app.get('/api/lobbies/:code', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM lobbies WHERE code = $1',
      [req.params.code]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Lobby nicht gefunden' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Fehler beim Laden der Lobby' });
  }
});

// ─── Vision ───────────────────────────────────────────────
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

// ─── Socket.io ────────────────────────────────────────────
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

  socket.on('disconnect', () => {
    const { lobbyCode, username } = socket.data;
    if (lobbyCode) {
      io.to(lobbyCode).emit('player-left', { username });
    }
    console.log('Socket disconnected:', socket.id);
  });
});

// ─── Production ───────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(__dirname, '../dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(distPath, 'index.html'));
  });
}

server.listen(port, () => {
  console.log(`Sketchle backend listening on http://localhost:${port}`);
});
