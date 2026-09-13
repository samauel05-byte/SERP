const db = require('../lib/db');
const { authenticate } = require('../lib/auth');

module.exports = async (req, res) => {
  const session = await authenticate(req);
  if (!session) return res.status(401).json({ error: 'No autorizado' });
  if (session.role !== 'admin' && !session.access_direct) {
    return res.status(403).json({ error: 'Sin acceso a Direct' });
  }
  try {
    if (req.method === 'GET') {
      if (req.query.poll === '1') {
        const since = parseInt(req.query.since, 10) || 0;
        const updates = await db.getCredentialsSince(session.tenantId, since, session.role === 'admin' ? null : session.portals_direct);
        return res.json({ ok: true, updates, serverTime: Date.now() });
      }
      const credentials = await db.getCredentials(session.tenantId, session.role === 'admin' ? null : session.portals_direct);
      return res.json({ ok: true, credentials });
    }
    if (req.method === 'POST') {
      if (session.role !== 'admin') return res.status(403).json({ error: 'Solo administradores' });
      const { credentials } = req.body || {};
      if (!Array.isArray(credentials) || credentials.length === 0) {
        return res.status(400).json({ error: 'Se requiere un array de credenciales' });
      }
      for (const c of credentials) {
        if (!c.id || !c.institution || !c.iv || !c.ct) {
          return res.status(400).json({ error: 'Cada credencial requiere id, institution, iv, ct' });
        }
      }
      const count = await db.upsertCredentials(session.tenantId, credentials);
      return res.json({ ok: true, count });
    }
    res.status(405).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
