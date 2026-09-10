'use strict';
const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const path    = require('path');
const db      = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false })); // CSP handled by Nginx
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));

// ── Static frontend ─────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Prepared statements ─────────────────────────────────────────────────────
const stmts = {
  getConfig:  db.prepare('SELECT value FROM config WHERE key = ?'),
  setConfig:  db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)'),

  listCreds:  db.prepare('SELECT id, institution, category, iv, ct, updated_at FROM credentials ORDER BY updated_at DESC'),
  getCred:    db.prepare('SELECT id, institution, category, iv, ct, updated_at FROM credentials WHERE id = ?'),
  upsertCred: db.prepare(`
    INSERT INTO credentials (id, institution, category, iv, ct, updated_at)
    VALUES (@id, @institution, @category, @iv, @ct, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      institution = excluded.institution,
      category    = excluded.category,
      iv          = excluded.iv,
      ct          = excluded.ct,
      updated_at  = excluded.updated_at
  `),
  deleteCred: db.prepare('DELETE FROM credentials WHERE id = ?'),
  sinceTs:    db.prepare('SELECT id, institution, category, iv, ct, updated_at FROM credentials WHERE updated_at > ? ORDER BY updated_at ASC'),
};

// ── Config endpoints ─────────────────────────────────────────────────────────
// GET /api/config  → { exists: bool, salt?, verIv?, verCt? }
app.get('/api/config', (req, res) => {
  const row = stmts.getConfig.get('vault');
  if (!row) return res.json({ exists: false });
  res.json({ exists: true, ...JSON.parse(row.value) });
});

// POST /api/config  body: { salt, verIv, verCt }
app.post('/api/config', (req, res) => {
  const { salt, verIv, verCt } = req.body;
  if (!salt || !verIv || !verCt) return res.status(400).json({ error: 'Campos requeridos: salt, verIv, verCt' });
  stmts.setConfig.run('vault', JSON.stringify({ salt, verIv, verCt }));
  res.json({ ok: true });
});

// ── Credentials endpoints ────────────────────────────────────────────────────
// GET /api/credentials         → array of all credentials
// GET /api/credentials?since=N → only credentials updated after timestamp N
app.get('/api/credentials', (req, res) => {
  const since = parseInt(req.query.since, 10);
  const rows  = since ? stmts.sinceTs.all(since) : stmts.listCreds.all();
  res.json(rows.map(r => ({
    id: r.id, institution: r.institution, category: r.category,
    iv: r.iv, ct: r.ct, updatedAt: r.updated_at
  })));
});

// PUT /api/credentials/:id  body: { institution, category, iv, ct }
app.put('/api/credentials/:id', (req, res) => {
  const { institution, category, iv, ct } = req.body;
  if (!institution || !category || !iv || !ct)
    return res.status(400).json({ error: 'Campos requeridos: institution, category, iv, ct' });
  stmts.upsertCred.run({
    id: req.params.id, institution, category, iv, ct,
    updated_at: Date.now()
  });
  res.json({ ok: true });
});

// DELETE /api/credentials/:id
app.delete('/api/credentials/:id', (req, res) => {
  stmts.deleteCred.run(req.params.id);
  res.json({ ok: true });
});

// ── Polling endpoint for real-time sync ──────────────────────────────────────
// GET /api/poll?since=N  → { credentials: [...], serverTime: N }
app.get('/api/poll', (req, res) => {
  const since = parseInt(req.query.since, 10) || 0;
  const rows  = stmts.sinceTs.all(since);
  res.json({
    credentials: rows.map(r => ({
      id: r.id, institution: r.institution, category: r.category,
      iv: r.iv, ct: r.ct, updatedAt: r.updated_at
    })),
    serverTime: Date.now()
  });
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ ok: true, time: Date.now() }));

// ── Serve frontend for all other routes ──────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Llave Maestra escuchando en puerto ${PORT}`);
});
