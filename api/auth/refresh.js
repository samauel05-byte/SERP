const supabase = require('../../lib/supabase');
const { allow } = require('../../lib/rate-limit');

// Renueva la sesión sin pedir la contraseña otra vez. El navegador guarda un
// refresh_token (solo durante la vida de la pestaña, en sessionStorage) y lo
// cambia aquí por un access_token nuevo cuando el actual está por vencer o ya
// venció. La anon key de Supabase NUNCA sale del servidor, y se mantiene la
// sesión única por equipo: si este navegador ya fue reemplazado por otro
// (direct_active_sessions), la renovación se rechaza igual que cualquier API.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  if (!await allow(req, 'refresh', 60, 15 * 60 * 1000)) {
    return res.status(429).json({ error: 'Demasiados intentos. Intenta nuevamente en unos minutos.' });
  }
  const { refresh_token } = req.body || {};
  if (typeof refresh_token !== 'string' || refresh_token.length < 10) {
    return res.status(400).json({ error: 'Falta el token de renovación' });
  }
  try {
    const authRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': process.env.SUPABASE_ANON_KEY },
      body: JSON.stringify({ refresh_token }),
    });
    if (!authRes.ok) return res.status(401).json({ error: 'Sesión expirada' });
    const grant = await authRes.json();
    const access_token = grant.access_token;
    const new_refresh = grant.refresh_token;
    if (!access_token || !new_refresh) return res.status(401).json({ error: 'Sesión expirada' });

    // Sesión única por equipo: el navegador que ya fue desplazado por otro no
    // puede seguir renovándose. Se compara contra la sesión activa guardada.
    let user = grant.user;
    if (!user?.id) {
      const { data, error } = await supabase.auth.getUser(access_token);
      if (error || !data?.user) return res.status(401).json({ error: 'Sesión expirada' });
      user = data.user;
    }
    const { data: activeSession, error: sessionError } = await supabase
      .from('direct_active_sessions').select('session_id').eq('user_id', user.id).maybeSingle();
    if (!sessionError && activeSession && activeSession.session_id !== req.headers['x-direct-session']) {
      return res.status(401).json({ error: 'Sesión reemplazada' });
    }

    return res.json({ ok: true, access_token, refresh_token: new_refresh, expires_at: grant.expires_at || null });
  } catch (e) {
    console.error(e); return res.status(500).json({ error: 'Error interno del servidor' });
  }
};
