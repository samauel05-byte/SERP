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
}

module.exports = { sql, ensureSchema };
