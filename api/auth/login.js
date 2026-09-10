const supabase = require('../../lib/supabase');
const { authenticate } = require('../../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();
  const session = await authenticate(req);
  if (!session) return res.status(401).json({ error: 'No autorizado' });
  try {
    const { data: profile } = await supabase
      .from('direct_profiles')
      .select('role, access_direct, access_cami, access_nala, portals_direct, user_key_salt, vault_key_iv, vault_key_ct')
      .eq('id', session.userId)
      .maybeSingle();

    if (!profile) return res.status(404).json({ error: 'Perfil no encontrado' });

    return res.json({
      ok: true,
      role: profile.role,
      access_direct: profile.access_direct !== false,
      access_cami: profile.access_cami || false,
      access_nala: profile.access_nala || false,
      portals: profile.portals_direct || ['dgii', 'tss', 'trabajo', 'sirla'],
      userSalt: profile.user_key_salt,
      vaultKeyIv: profile.vault_key_iv,
      vaultKeyCt: profile.vault_key_ct,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
