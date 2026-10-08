const db = require('../../lib/db');
const { authenticate } = require('../../lib/auth');

module.exports = async (req, res) => {
  const session = await authenticate(req);
  if (!session) return res.status(401).json({ error: 'No autorizado' });
  if (session.role !== 'admin') return res.status(403).json({ error: 'Solo administradores' });
  // Sin tenant no se puede garantizar el aislamiento entre firmas: fallar cerrado.
  if (!session.tenantId) return res.status(409).json({ error: 'Falta la migración de empresas' });
  const { id } = req.query;
  try {
    if (req.method === 'PUT') {
      const { institution, category, iv, ct } = req.body || {};
      if (!institution || !category || !iv || !ct) return res.status(400).json({ error: 'missing fields' });
      const ts = Date.now();
      await db.upsertCredential(session.tenantId, id, institution, category, iv, ct, ts);
      return res.json({ ok: true, updated_at: ts });
    }
    if (req.method === 'DELETE') {
      await db.deleteCredential(session.tenantId, id);
      return res.json({ ok: true });
    }
    res.status(405).end();
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'Error interno del servidor' });
  }
};
