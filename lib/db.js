const { sql } = require('@vercel/postgres');

async function ensureSchema() {
  await sql`CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
  await sql`
    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY,
      institution TEXT NOT NULL,
      category TEXT NOT NULL,
      iv TEXT NOT NULL,
      ct TEXT NOT NULL,
      updated_at BIGINT NOT NULL DEFAULT 0
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      user_key_salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      allowed_portals TEXT NOT NULL DEFAULT '["dgii","tss","trabajo","sirla"]',
      vault_key_iv TEXT,
      vault_key_ct TEXT,
      created_at BIGINT NOT NULL DEFAULT 0
    )
  `;
}

module.exports = { sql, ensureSchema };
