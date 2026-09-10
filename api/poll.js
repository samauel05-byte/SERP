const { sql, ensureSchema } = require('../lib/db');
const { authenticate } = require('../lib/auth');

module.exports = async (req, res) => {
  const session = authenticate(req);
  if (!session) return res.status(401).json({ error: 'No autorizado' });
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
