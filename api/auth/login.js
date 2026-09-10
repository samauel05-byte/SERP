const { sql, ensureSchema } = require('../../lib/db');
const { createToken, hashPassword } = require('../../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    await ensureSchema();
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Campos requeridos' });

    const { rows } = await sql`
      SELECT id, role, allowed_portals, password_hash, password_salt, user_key_salt, vault_key_iv, vault_key_ct
      FROM users WHERE username = ${username.toLowerCase().trim()}
    `;

    if (!rows.length) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    const user = rows[0];

    const hash = await hashPassword(password, user.password_salt);
    if (hash !== user.password_hash) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

    const portals = JSON.parse(user.allowed_portals || '[]');
    const token = createToken({ userId: user.id, role: user.role, portals, exp: Date.now() + 28800000 });

    return res.json({
      ok: true,
      token,
      role: user.role,
      portals,
      userSalt: user.user_key_salt,
      vaultKeyIv: user.vault_key_iv,
      vaultKeyCt: user.vault_key_ct,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
