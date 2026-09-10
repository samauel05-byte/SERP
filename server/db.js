'use strict';
const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'vault.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS credentials (
    id          TEXT PRIMARY KEY,
    institution TEXT NOT NULL,
    category    TEXT NOT NULL,
    iv          TEXT NOT NULL,
    ct          TEXT NOT NULL,
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch('now','subsec') * 1000)
  );
`);

module.exports = db;
