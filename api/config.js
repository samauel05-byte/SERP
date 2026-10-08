const db = require('../lib/db');
const { authenticate } = require('../lib/auth');
const logos = require('../lib/logos');

// GET /api/logo/:key (rewritten to ?logo=:key): the institution's official
// logo, read from its own website. Public and cacheable — logos are public
// brand images and the login screen has no session yet.
async function serveLogo(req, res) {
  const key = String(req.query.logo || '');
  if (!Object.prototype.hasOwnProperty.call(logos.SITES, key)) return res.status(404).json({ error: 'Logo no disponible' });
  try {
    const logo = await logos.getLogo(key);
    res.setHeader('Content-Type', logo.type);
    res.setHeader('Cache-Control', 'public, max-age=21600, s-maxage=86400, stale-while-revalidate=604800');
    // An SVG opened directly must not run anything on this origin.
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('X-Logo-Source', logo.source);
    return res.status(200).end(logo.buf);
  } catch (e) {
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=900');
    return res.status(502).json({ error: `No se pudo obtener el logo de ${key}: ${e.message}` });
  }
}

module.exports = async (req, res) => {
  if (req.method === 'GET' && req.query.logo !== undefined) return serveLogo(req, res);
  const session = await authenticate(req);
  if (!session) return res.status(401).json({ error: 'No autorizado' });
  if (req.method === 'POST' && session.role !== 'admin') {
    return res.status(403).json({ error: 'Solo administradores' });
  }
  try {
    if (req.method === 'GET') {
      const config = await db.getConfig(session.tenantId);
      return res.json({ ok: true, config });
    }
    if (req.method === 'POST') {
      const { key, value } = req.body || {};
      if (!key || value === undefined) return res.status(400).json({ error: 'key and value required' });
      await db.setConfig(session.tenantId, key, value);
      return res.json({ ok: true });
    }
    res.status(405).end();
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'Error interno del servidor' });
  }
};
