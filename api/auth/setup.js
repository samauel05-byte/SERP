const { sql, ensureSchema } = require('../../lib/db');
const { createToken, hashPassword, randomHex } = require('../../lib/auth');

module.exports = async (req, res) => {
  try {
    await ensureSchema();

    if (req.method === 'GET') {
      const { rows } = await sql`SELECT COUNT(*) AS cnt FROM users`;
      return res.json({ hasUsers: parseInt(rows[0].cnt) > 0 });
    }

    if (req.method === 'POST') {
      const { rows: existing } = await sql`SELECT COUNT(*) AS cnt FROM users`;
      if (parseInt(existing[0].cnt) > 0) return res.status(409).json({ error: 'Ya existe un administrador' });

      const { username, password, vaultKeyIv, vaultKeyCt, userSalt } = req.body || {};
      if (!username || !password) return res.status(400).json({ error: 'Campos requeridos' });

      const passwordSalt = randomHex(16);
      const passwordHash = await hashPassword(password, passwordSalt);
      const id = 'user_' + Date.now();

      await sql`
        INSERT INTO users (id, username, password_hash, password_salt, user_key_salt, role, allowed_portals, vault_key_iv, vault_key_ct, created_at)
        VALUES (${id}, ${username.toLowerCase().trim()}, ${passwordHash}, ${passwordSalt}, ${userSalt||''}, 'admin',
                '["dgii","tss","trabajo","sirla"]', ${vaultKeyIv||null}, ${vaultKeyCt||null}, ${Date.now()})
      `;

      const token = createToken({ userId: id, role: 'admin', portals: ['dgii','tss','trabajo','sirla'], exp: Date.now() + 28800000 });
      return res.json({ ok: true, token });
    }

    res.status(405).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
