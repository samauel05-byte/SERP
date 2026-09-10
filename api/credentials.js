const { sql, ensureSchema } = require('../lib/db');

module.exports = async (req, res) => {
  try {
    await ensureSchema();

    if (req.method === 'GET') {
      const { rows } = await sql`SELECT id,institution,category,iv,ct,updated_at FROM credentials ORDER BY updated_at DESC`;
      return res.json({ ok: true, credentials: rows });
    }

    res.status(405).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
