const crypto = require('crypto');
const SECRET = process.env.SESSION_SECRET || 'direct-session-secret-change-in-prod';

function createToken(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('hex');
  return `${data}.${sig}`;
}

function verifyToken(token) {
  if (!token) return null;
  try {
    const dotIdx = token.lastIndexOf('.');
    if (dotIdx < 1) return null;
    const data = token.slice(0, dotIdx);
    const sig  = token.slice(dotIdx + 1);
    const expected = crypto.createHmac('sha256', SECRET).update(data).digest('hex');
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

function authenticate(req) {
  const token = req.headers['x-session-token'];
  return verifyToken(token);
}

async function hashPassword(password, saltHex) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, Buffer.from(saltHex, 'hex'), 100000, 32, 'sha256',
      (err, key) => err ? reject(err) : resolve(key.toString('hex')));
  });
}

function randomHex(n) {
  return crypto.randomBytes(n).toString('hex');
}

module.exports = { createToken, verifyToken, authenticate, hashPassword, randomHex };
