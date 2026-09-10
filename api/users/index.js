const { sql, ensureSchema } = require('../../lib/db');
const { authenticate, hashPassword, randomHex } = require('../../lib/auth');

module.exports = async (req, res) => {
  const session = authenticate(req);
  if (!session) return res.status(401).json({ error: 'No autorizado' });
  if (session.role !== 'admin') return res.status(403).json({ error: 'Solo administradores' });

  try {
    await ensureSchema();

    if (req.method === 'GET') {
      const { rows } = await sql`SELECT id, username, role, allowed_portals, created_at FROM users ORDER BY created_at ASC`;
      return res.json({ ok: true, users: rows });
    }

    if (req.method === 'POST') {
      const { username, password, role, portals, userSalt, vaultKeyIv, vaultKeyCt } = req.body || {};
      if (!username || !password) return res.status(400).json({ error: 'Campos requeridos' });

      const passwordSalt = randomHex(16);
      const passwordHash = await hashPassword(password, passwordSalt);
      const id = 'user_' + Date.now();
      const allowedPortals = JSON.stringify(portals || ['dgii','tss','trabajo','sirla']);

      await sql`
        INSERT INTO users (id, username, password_hash, password_salt, user_key_salt, role, allowed_portals, vault_key_iv, vault_key_ct, created_at)
        VALUES (${id}, ${username.toLowerCase().trim()}, ${passwordHash}, ${passwordSalt}, ${userSalt||''},
                ${role||'user'}, ${allowedPortals}, ${vaultKeyIv||null}, ${vaultKeyCt||null}, ${Date.now()})
      `;
      return res.json({ ok: true, id });
    }

    res.status(405).end();
  } catch (e) {
    if (e.message?.includes('unique') || e.message?.includes('duplicate')) return res.status(409).json({ error: 'Usuario ya existe' });
    res.status(500).json({ error: e.message });
  }
};
