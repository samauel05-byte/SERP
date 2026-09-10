const supabase = require('../../lib/supabase');

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const { count } = await supabase
        .from('direct_profiles')
        .select('*', { count: 'exact', head: true });
      return res.json({ hasUsers: (count || 0) > 0 });
    }

    if (req.method === 'POST') {
      const { count } = await supabase
        .from('direct_profiles')
        .select('*', { count: 'exact', head: true });
      if ((count || 0) > 0) return res.status(409).json({ error: 'Ya existe un administrador' });

      const { email, password, vaultKeyIv, vaultKeyCt, userSalt } = req.body || {};
      if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

      const { data: { user }, error } = await supabase.auth.admin.createUser({
        email: email.toLowerCase().trim(),
        password,
        email_confirm: true,
      });
      if (error) return res.status(400).json({ error: error.message });

      const { error: profileError } = await supabase.from('direct_profiles').insert({
        id: user.id,
        role: 'admin',
        access_direct: true,
        access_cami: true,
        access_nala: true,
        portals_direct: ['dgii', 'tss', 'trabajo', 'sirla'],
        user_key_salt: userSalt || null,
        vault_key_iv: vaultKeyIv || null,
        vault_key_ct: vaultKeyCt || null,
      });
      if (profileError) {
        await supabase.auth.admin.deleteUser(user.id);
        return res.status(500).json({ error: profileError.message });
      }

      return res.json({ ok: true });
    }

    res.status(405).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
