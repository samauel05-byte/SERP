const db = require('../lib/db');
const { authenticate } = require('../lib/auth');

module.exports = async (req, res) => {
  const session = await authenticate(req);
  if (!session) return res.status(401).json({ error: 'No autorizado' });
  try {
    if (req.method !== 'GET') return res.status(405).end();
    const since = parseInt(req.query.since, 10) || 0;
    const serverTime = Date.now();
    const updates = await db.getCredentialsSince(since);
    return res.json({ ok: true, updates, serverTime });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
