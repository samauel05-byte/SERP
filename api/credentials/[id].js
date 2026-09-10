const { sql, ensureSchema } = require('../../lib/db');
const { authenticate } = require('../../lib/auth');

module.exports = async (req, res) => {
  const session = authenticate(req);
  if (!session) return res.status(401).json({ error: 'No autorizado' });
  const { id } = req.query;
  try {
    await ensureSchema();

    if (req.method === 'PUT') {
      const { institution, category, iv, ct } = req.body || {};
      if (!institution || !category || !iv || !ct) return res.status(400).json({ error: 'missing fields' });
      const ts = Date.now();
      await sql`
        INSERT INTO credentials (id,institution,category,iv,ct,updated_at)
        VALUES (${id},${institution},${category},${iv},${ct},${ts})
        ON CONFLICT (id) DO UPDATE SET
          institution=EXCLUDED.institution, category=EXCLUDED.category,
          iv=EXCLUDED.iv, ct=EXCLUDED.ct, updated_at=EXCLUDED.updated_at
      `;
      return res.json({ ok: true, updated_at: ts });
    }

    if (req.method === 'DELETE') {
      await sql`DELETE FROM credentials WHERE id=${id}`;
      return res.json({ ok: true });
    }

    res.status(405).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
