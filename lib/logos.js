// Official logos, taken from each institution's own website so that a
// redesign there shows up here without code changes. The page is read, the
// published brand icon (or header logo) is located and the image is served
// from our origin, cached for a day.
const SITES = {
  dgii: 'https://dgii.gov.do/',
  tss: 'https://tss.gob.do/',
  trabajo: 'https://mt.gob.do/',
  sirla: 'https://www.sisalril.gob.do/',
  carnet: 'https://www.cardnet.com.do/',
  azul: 'https://www.azul.com.do/',
  idoppril: 'https://www.idoppril.gob.do/',
  onapi: 'https://www.onapi.gob.do/',
  formalizate: 'https://formalizate.gob.do/',
  camara: 'https://www.camarasantodomingo.do/',
  digisign: 'https://facturacion.digisign.do/login',
  gdmail: 'https://mail.gdlinea.com/webmail/',
};

const TTL_MS = 12 * 60 * 60 * 1000;
const MAX_HTML = 3 * 1024 * 1024;
const MAX_IMAGE = 1024 * 1024;
const UA = 'Mozilla/5.0 (compatible; DirectLogos/1.0; +https://app.casalabs.com.do)';
const cache = new Map();

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    out[m[1].toLowerCase()] = (m[3] ?? m[4] ?? m[5] ?? '').replace(/&amp;/g, '&').trim();
  }
  return out;
}

function iconSize(a) {
  const m = /(\d+)x(\d+)/.exec(a.sizes || '') || /(\d+)x(\d+)/.exec(a.href || '');
  return m ? Math.min(Number(m[1]), Number(m[2])) : 0;
}

// Candidates in preference order: a large square brand icon published by the
// site, then the header logo image, then any declared icon, then favicon.ico.
function findLogo(html, pageUrl) {
  const abs = u => { try { const r = new URL(u, pageUrl); return r.protocol === 'https:' || r.protocol === 'http:' ? r.href : null; } catch { return null; } };
  const icons = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const rel = (a.rel || '').toLowerCase();
    if (!/(^|\s)(icon|apple-touch-icon(-precomposed)?)(\s|$)/.test(rel) || !a.href) continue;
    const url = abs(a.href); if (!url) continue;
    const ico = /\.ico(\?|$)/i.test(url);
    icons.push({ url, size: iconSize(a) || (/apple-touch-icon/.test(rel) ? 180 : 0), ico });
  }
  const tile = /msapplication-TileImage["'][^>]*content=["']([^"']+)/i.exec(html) || /content=["']([^"']+)["'][^>]*msapplication-TileImage/i.exec(html);
  if (tile && abs(tile[1])) icons.push({ url: abs(tile[1]), size: iconSize({ href: tile[1] }) || 144, ico: /\.ico(\?|$)/i.test(tile[1]) });
  icons.sort((x, y) => (y.size - x.size) || (x.ico - y.ico));
  const big = icons.find(i => i.size >= 96 && !i.ico);
  if (big) return big.url;

  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const src = a.src || a['data-src'] || a['data-bricks-logo'];
    const hint = `${a.class || ''} ${a.id || ''} ${a.alt || ''} ${src || ''}`.toLowerCase();
    if (!src || src.startsWith('data:') || !/logo/.test(hint)) continue;
    if (/(gob(ierno)?[-_ ]|presidencia|partner|calidad|iso|footer|white|blanco|light)/.test(hint)) continue;
    const url = abs(src); if (url) return url;
  }
  if (icons.length) return icons[0].url;
  return abs('/favicon.ico');
}

async function fetchLimited(url, limit, accept) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(8000), headers: { 'user-agent': UA, accept } });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > limit) throw new Error('archivo demasiado grande');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > limit) throw new Error('archivo demasiado grande');
  return { buf, type: (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase(), url: res.url || url };
}

function imageType(buf, declared, url) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.slice(0, 4).toString() === 'GIF8') return 'image/gif';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) return 'image/x-icon';
  const head = buf.slice(0, 512).toString('utf8').trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';
  if (/^image\//.test(declared) && !/svg/.test(declared)) return declared;
  throw new Error(`no es una imagen (${declared || 'sin tipo'}) en ${url}`);
}

async function getLogo(key) {
  const site = SITES[key];
  if (!site) return null;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;
  try {
    const page = await fetchLimited(site, MAX_HTML, 'text/html');
    const logoUrl = findLogo(page.buf.toString('utf8'), page.url);
    const img = await fetchLimited(logoUrl, MAX_IMAGE, 'image/*');
    const entry = { at: Date.now(), buf: img.buf, type: imageType(img.buf, img.type, logoUrl), source: logoUrl };
    cache.set(key, entry);
    return entry;
  } catch (e) {
    // Keep serving the last good logo if the site is temporarily down.
    if (hit) return hit;
    throw e;
  }
}

module.exports = { SITES, findLogo, getLogo, imageType };
