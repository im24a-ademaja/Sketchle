const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

const port = process.env.PORT || 4000;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors());
app.use(express.json());

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

app.post('/api/vision', async (req, res) => {
  try {
    const { imageUrl, prompt } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ error: 'imageUrl is required' });
    }

    const finalPrompt = prompt || 'Describe the content of this image.';
    const response = await openai.responses.create({
      model: 'gpt-image-1',
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: finalPrompt },
            { type: 'input_image', image_url: imageUrl },
          ],
        },
      ],
    });

    res.json({ output: response.output });
  } catch (error) {
    console.error('Vision API error:', error);
    res.status(500).json({ error: 'OpenAI Vision request failed', details: error.message });
  }
});

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('client-message', (data) => {
    io.emit('server-message', { ...data, receivedAt: new Date().toISOString() });
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
  });
});

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
