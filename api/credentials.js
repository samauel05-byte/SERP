const db = require('../lib/db');
const { authenticate } = require('../lib/auth');

module.exports = async (req, res) => {
  const session = await authenticate(req);
  if (!session) return res.status(401).json({ error: 'No autorizado' });
  try {
    if (req.method === 'GET') {
      const credentials = await db.getCredentials();
      return res.json({ ok: true, credentials });
    }
    res.status(405).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
