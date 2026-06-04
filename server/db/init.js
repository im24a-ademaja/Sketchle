const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
console.log('DATABASE_URL:', process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

const sql = fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8');

pool.query(sql)
  .then(() => {
    console.log('Erfolgreich erstellt.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fehler:', err);
    process.exit(1);
  });