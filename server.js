const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const DB_DIR = path.join(__dirname, 'db');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR);
const DB_PATH = path.join(DB_DIR, 'greenhouse.db');

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temp REAL,
    humidity REAL,
    soil INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS actuators (
    name TEXT PRIMARY KEY,
    state INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ensure pump and fan rows exist
  const stmt = db.prepare(`INSERT OR IGNORE INTO actuators (name, state) VALUES (?, ?)`);
  stmt.run('pump', 0);
  stmt.run('fan', 0);
  stmt.finalize();
});

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// POST readings from device
app.post('/api/readings', (req, res) => {
  const { temp, humidity, soil } = req.body;
  if (typeof temp !== 'number' || typeof humidity !== 'number' || typeof soil !== 'number') {
    return res.status(400).json({ error: 'temp, humidity, soil numbers required' });
  }
  const stmt = db.prepare(`INSERT INTO readings (temp, humidity, soil) VALUES (?, ?, ?)`);
  stmt.run(temp, humidity, soil, function(err) {
    if (err) return res.status(500).json({ error: 'db error' });
    res.json({ ok: true, id: this.lastID });
  });
});

// Get latest reading
app.get('/api/readings/latest', (req, res) => {
  db.get(`SELECT * FROM readings ORDER BY created_at DESC LIMIT 1`, (err, row) => {
    if (err) return res.status(500).json({ error: 'db error' });
    res.json(row || {});
  });
});

// Get recent readings
app.get('/api/readings', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  db.all(`SELECT * FROM readings ORDER BY created_at DESC LIMIT ?`, [limit], (err, rows) => {
    if (err) return res.status(500).json({ error: 'db error' });
    res.json(rows);
  });
});

// Get actuator states
app.get('/api/actuators', (req, res) => {
  db.all(`SELECT name, state, updated_at FROM actuators`, (err, rows) => {
    if (err) return res.status(500).json({ error: 'db error' });
    const result = {};
    rows.forEach(r => result[r.name] = { state: r.state, updated_at: r.updated_at });
    res.json(result);
  });
});

// Update actuator state (via web UI)
app.post('/api/actuator', (req, res) => {
  const { name, state } = req.body;
  if (!['pump', 'fan'].includes(name) || (state !== 0 && state !== 1)) {
    return res.status(400).json({ error: 'invalid actuator or state' });
  }
  const stmt = db.prepare(`UPDATE actuators SET state = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?`);
  stmt.run(state, name, function(err) {
    if (err) return res.status(500).json({ error: 'db error' });
    res.json({ ok: true, name, state });
  });
});

// Device polling endpoint: returns desired actuator states
app.get('/api/commands', (req, res) => {
  db.all(`SELECT name, state FROM actuators`, (err, rows) => {
    if (err) return res.status(500).json({ error: 'db error' });
    const commands = {};
    rows.forEach(r => commands[r.name] = r.state);
    res.json(commands);
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} to view the web UI`);
});
