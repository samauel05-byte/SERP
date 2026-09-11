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
    if (req.method === 'POST') {
      const { credentials } = req.body || {};
      if (!Array.isArray(credentials) || credentials.length === 0) {
        return res.status(400).json({ error: 'Se requiere un array de credenciales' });
      }
      for (const c of credentials) {
        if (!c.id || !c.institution || !c.iv || !c.ct) {
          return res.status(400).json({ error: 'Cada credencial requiere id, institution, iv, ct' });
        }
      }
      const count = await db.upsertCredentials(credentials);
      return res.json({ ok: true, count });
    }
    res.status(405).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
