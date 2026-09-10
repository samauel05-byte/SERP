const { sql, ensureSchema } = require('../lib/db');

module.exports = async (req, res) => {
  try {
    await ensureSchema();
    if (req.method !== 'GET') return res.status(405).end();

    const since = parseInt(req.query.since, 10) || 0;
    const serverTime = Date.now();
    const { rows } = await sql`
      SELECT id,institution,category,iv,ct,updated_at FROM credentials
      WHERE updated_at > ${since} ORDER BY updated_at ASC
    `;
    return res.json({ ok: true, updates: rows, serverTime });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
