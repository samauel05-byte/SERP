const supabase = require('../../lib/supabase');
const { authenticate } = require('../../lib/auth');

module.exports = async (req, res) => {
  const session = await authenticate(req);
  if (!session) return res.status(401).json({ error: 'No autorizado' });
  if (session.role !== 'admin') return res.status(403).json({ error: 'Solo administradores' });

  try {
    if (req.method === 'GET') {
      const { data: profiles } = await supabase
        .from('direct_profiles')
        .select('id, role, access_direct, access_cami, access_nala, portals_direct, created_at')
        .order('created_at');

      const { data: { users: authUsers } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const emailMap = {};
      for (const u of authUsers || []) emailMap[u.id] = (u.email || '').replace('@direct.local', '');

      const users = (profiles || []).map(p => ({
        id: p.id,
        username: emailMap[p.id] || '',
        role: p.role,
        access_direct: p.access_direct,
        access_cami: p.access_cami,
        access_nala: p.access_nala,
        portals_direct: p.portals_direct,
        created_at: p.created_at,
      }));

      return res.json({ ok: true, users });
    }

    if (req.method === 'POST') {
      const { username, password, role, portals_direct, access_cami, access_nala, userSalt, vaultKeyIv, vaultKeyCt } = req.body || {};
      if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
      const email = username.toLowerCase().trim() + '@direct.local';

      const { data: { user }, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) return res.status(400).json({ error: error.message });

      const { error: profileError } = await supabase.from('direct_profiles').insert({
        id: user.id,
        role: role || 'user',
        access_direct: true,
        access_cami: access_cami || false,
        access_nala: access_nala || false,
        portals_direct: portals_direct || ['dgii', 'tss', 'trabajo', 'sirla'],
        user_key_salt: userSalt || null,
        vault_key_iv: vaultKeyIv || null,
        vault_key_ct: vaultKeyCt || null,
      });
      if (profileError) {
        await supabase.auth.admin.deleteUser(user.id);
        return res.status(500).json({ error: profileError.message });
      }

      return res.json({ ok: true, id: user.id });
    }

    res.status(405).end();
  } catch (e) {
    if (e.message?.includes('already registered') || e.message?.includes('duplicate')) {
      return res.status(409).json({ error: 'Usuario ya registrado' });
    }
    res.status(500).json({ error: e.message });
  }
};
