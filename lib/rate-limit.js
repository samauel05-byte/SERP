const supabase = require('./supabase');

// IP real del cliente. En Vercel, `x-real-ip` lo fija la plataforma y el
// cliente no puede sobrescribirlo, así que es preferible a `x-forwarded-for`
// (que el cliente sí puede falsificar anteponiendo valores). Fuera de Vercel
// (local) caemos a XFF y luego al socket.
function clientKey(req) {
  const realIp = String(req.headers['x-real-ip'] || '').trim();
  if (realIp) return realIp;
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.socket?.remoteAddress || 'unknown');
}

// Devuelve true si la petición está dentro del límite. Usa un store compartido
// en Supabase (rl_hit) para que el límite valga entre instancias serverless.
// Si el limitador falla (p. ej. la BD no responde), se abre (fail-open): no se
// bloquea a usuarios legítimos por un fallo del propio limitador.
async function allow(req, scope, maxAttempts = 10, windowMs = 15 * 60 * 1000, idOverride = null) {
  const key = `${scope}:${idOverride || clientKey(req)}`;
  try {
    const { data, error } = await supabase.rpc('rl_hit', { p_key: key, p_max: maxAttempts, p_window_ms: windowMs });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}

module.exports = { allow, clientKey };
