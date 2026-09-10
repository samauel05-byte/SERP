const { sql, ensureSchema } = require('../lib/db');

module.exports = async (req, res) => {
  try {
    await ensureSchema();

    if (req.method === 'GET') {
      const { rows } = await sql`SELECT key, value FROM config`;
      const config = {};
      for (const r of rows) config[r.key] = r.value;
      return res.json({ ok: true, config });
    }

    if (req.method === 'POST') {
      const { key, value } = req.body || {};
      if (!key || value === undefined) return res.status(400).json({ error: 'key and value required' });
      await sql`INSERT INTO config (key,value) VALUES (${key},${value}) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`;
      return res.json({ ok: true });
    }

    res.status(405).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
