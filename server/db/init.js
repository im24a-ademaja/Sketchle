const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

const sql = fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8');

pool.query(sql)
  .then(() => {
    console.log('Erfolgreich erstellt.');
    return pool.end();
  })
  .catch((err) => {
    console.error('Fehler:', err);
    return pool.end().finally(() => process.exitCode = 1);
  });