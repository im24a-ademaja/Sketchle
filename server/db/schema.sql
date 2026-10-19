CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(30) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lobbies (
  id SERIAL PRIMARY KEY,
  code VARCHAR(6) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'waiting',
  current_round INT DEFAULT 0,
  host_id INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rounds (
  id SERIAL PRIMARY KEY,
  lobby_id INT REFERENCES lobbies(id),
  round_number INT NOT NULL,
  word TEXT NOT NULL,
  started_at TIMESTAMP,
  ended_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS drawings (
  id SERIAL PRIMARY KEY,
  round_id INT REFERENCES rounds(id),
  user_id INT REFERENCES users(id),
  image_data TEXT NOT NULL,
  ai_score INT,
  ai_feedback TEXT,
  submitted_at TIMESTAMP DEFAULT NOW()
);