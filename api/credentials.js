const { sql, ensureSchema } = require('../lib/db');
const { authenticate } = require('../lib/auth');

module.exports = async (req, res) => {
  const session = authenticate(req);
  if (!session) return res.status(401).json({ error: 'No autorizado' });
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
