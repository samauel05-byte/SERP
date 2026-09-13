const supabase = require('../../lib/supabase');
const { authenticate } = require('../../lib/auth');
const { allow } = require('../../lib/rate-limit');
const { randomUUID } = require('crypto');

module.exports = async (req, res) => {
  // POST: sign in server-side, return JWT + vault data in one call
  if (req.method === 'POST') {
    if (!allow(req, 'login')) return res.status(429).json({ error: 'Demasiados intentos. Intenta nuevamente en unos minutos.' });
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || !/^[a-zA-Z0-9._-]{3,64}$/.test(username.trim())) {
      return res.status(400).json({ error: 'Credenciales inválidas' });
    }

    const email = username.toLowerCase().trim() + '@direct.local';
    try {
      const authRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': process.env.SUPABASE_ANON_KEY },
        body: JSON.stringify({ email, password }),
      });

      if (!authRes.ok) {
        const errBody = await authRes.json().catch(() => ({}));
        return res.status(401).json({ error: errBody.error_description || errBody.msg || 'Credenciales incorrectas' });
      }

      const { access_token } = await authRes.json();

      const { data: { user }, error: userErr } = await supabase.auth.getUser(access_token);
      if (userErr || !user) return res.status(401).json({ error: 'Token inválido' });

      const { data: profile } = await supabase
        .from('direct_profiles')
        .select('role, access_direct, access_cami, access_nala, portals_direct, user_key_salt, vault_key_iv, vault_key_ct')
        .eq('id', user.id)
        .maybeSingle();

      if (!profile) return res.status(404).json({ error: 'Perfil no encontrado' });

      let session_id = null;
      const nextSessionId = randomUUID();
      const { error: sessionError } = await supabase.from('direct_active_sessions').upsert({
        user_id: user.id, session_id: nextSessionId, issued_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (!sessionError) session_id = nextSessionId;

      return res.json({
        ok: true,
        access_token,
        role: profile.role,
        access_direct: profile.access_direct !== false,
        access_cami: profile.access_cami || false,
        access_nala: profile.access_nala || false,
        portals: profile.portals_direct || [],
        userSalt: profile.user_key_salt,
        vaultKeyIv: profile.vault_key_iv,
        vaultKeyCt: profile.vault_key_ct,
        session_id,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // GET: return vault data for already-authenticated session (token restore)
  if (req.method === 'GET') {
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
        portals: profile.portals_direct || ['dgii', 'tss', 'trabajo', 'sirla', 'carnet', 'azul'],
        userSalt: profile.user_key_salt,
        vaultKeyIv: profile.vault_key_iv,
        vaultKeyCt: profile.vault_key_ct,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).end();
};
