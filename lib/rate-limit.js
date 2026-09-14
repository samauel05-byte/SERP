const attempts = new Map();

function clientKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.socket?.remoteAddress || 'unknown');
}

function allow(req, scope, maxAttempts = 10, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const key = `${scope}:${clientKey(req)}`;
  const state = attempts.get(key);
  if (!state || now >= state.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (state.count >= maxAttempts) return false;
  state.count += 1;
  return true;
}

module.exports = { allow };
