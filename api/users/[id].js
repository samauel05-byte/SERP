const { sql, ensureSchema } = require('../../lib/db');
const { authenticate, hashPassword, randomHex } = require('../../lib/auth');

module.exports = async (req, res) => {
  const session = authenticate(req);
  if (!session) return res.status(401).json({ error: 'No autorizado' });
  if (session.role !== 'admin') return res.status(403).json({ error: 'Solo administradores' });

  const { id } = req.query;
  try {
    await ensureSchema();

    if (req.method === 'PUT') {
      const { username, password, role, portals, userSalt, vaultKeyIv, vaultKeyCt } = req.body || {};
      if (username) await sql`UPDATE users SET username = ${username.toLowerCase().trim()} WHERE id = ${id}`;
      if (role)     await sql`UPDATE users SET role = ${role} WHERE id = ${id}`;
      if (portals)  await sql`UPDATE users SET allowed_portals = ${JSON.stringify(portals)} WHERE id = ${id}`;
      if (vaultKeyIv && vaultKeyCt) await sql`UPDATE users SET vault_key_iv = ${vaultKeyIv}, vault_key_ct = ${vaultKeyCt}, user_key_salt = ${userSalt||''} WHERE id = ${id}`;
      if (password) {
        const passwordSalt = randomHex(16);
        const passwordHash = await hashPassword(password, passwordSalt);
        await sql`UPDATE users SET password_hash = ${passwordHash}, password_salt = ${passwordSalt} WHERE id = ${id}`;
      }
      return res.json({ ok: true });
    }

    if (req.method === 'DELETE') {
      if (session.userId === id) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
      await sql`DELETE FROM users WHERE id = ${id}`;
      return res.json({ ok: true });
    }

    res.status(405).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
