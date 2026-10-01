// Small emulation of Vercel's routing for local runs and tests: serves
// `public/`, maps /api/* to files in api/ (with [param].js segments; files
// starting with "_" are not routes), applies vercel.json rewrites and adds the
// req.query / req.body / res.status().json() helpers of @vercel/node.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '../../..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.xlsx': 'application/octet-stream' };
const BODY_LIMIT = 4.5 * 1024 * 1024;

function compileRewrites() {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  return (config.rewrites || []).map(({ source, destination }) => {
    const names = [];
    const pattern = source.replace(/\/:(\w+)\*/g, (_, n) => { names.push(n); return '(?:/(.*))?'; }).replace(/:(\w+)/g, (_, n) => { names.push(n); return '([^/]+)'; });
    return { re: new RegExp(`^${pattern}$`), names, destination };
  });
}

function findApiFile(pathname) {
  const parts = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const walk = (dir, idx, params) => {
    if (idx === parts.length) {
      for (const candidate of [dir + '.js', path.join(dir, 'index.js')]) if (fs.existsSync(candidate)) return { file: candidate, params };
      return null;
    }
    const seg = parts[idx];
    if (seg.startsWith('_')) return null;
    const exact = path.join(dir, seg);
    if (idx === parts.length - 1 && fs.existsSync(exact + '.js')) return { file: exact + '.js', params };
    if (fs.existsSync(exact) && fs.statSync(exact).isDirectory()) { const r = walk(exact, idx + 1, params); if (r) return r; }
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;
    for (const entry of fs.readdirSync(dir)) {
      const m = /^\[(\w+)\](\.js)?$/.exec(entry);
      if (!m) continue;
      const next = { ...params, [m[1]]: decodeURIComponent(seg) };
      if (m[2] && idx === parts.length - 1) return { file: path.join(dir, entry), params: next };
      if (!m[2]) { const r = walk(path.join(dir, entry), idx + 1, next); if (r) return r; }
    }
    return null;
  };
  return walk(path.join(ROOT, 'api'), 0, {});
}

async function loadHandler(file) {
  const mod = await import(pathToFileURL(file).href + `?v=${fs.statSync(file).mtimeMs}`);
  return typeof mod.default === 'function' ? mod.default : (typeof mod.default?.default === 'function' ? mod.default.default : mod);
}

function start({ port }) {
  const rewrites = compileRewrites();
  const server = http.createServer(async (req, res) => {
    let url = new URL(req.url, `http://localhost:${port}`);
    const query = Object.fromEntries(url.searchParams);
    let apiMatch = url.pathname.startsWith('/api') ? findApiFile(url.pathname) : null;
    if (url.pathname.startsWith('/api') && !apiMatch) {
      for (const rw of rewrites) {
        const m = rw.re.exec(url.pathname);
        if (!m) continue;
        let dest = rw.destination;
        rw.names.forEach((n, i) => { dest = dest.replace(new RegExp(`:${n}\\*?`), m[i + 1] || ''); });
        const target = new URL(dest, `http://localhost:${port}`);
        for (const [k, v] of target.searchParams) query[k] = v;
        url = target; apiMatch = findApiFile(target.pathname);
        break;
      }
    }
    if (url.pathname.startsWith('/api')) {
      if (!apiMatch) { res.writeHead(404); return res.end('Not found'); }
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > BODY_LIMIT) { res.writeHead(413); return res.end('FUNCTION_PAYLOAD_TOO_LARGE'); } chunks.push(chunk); }
      const raw = Buffer.concat(chunks);
      req.query = { ...query, ...apiMatch.params };
      req.body = /json/.test(req.headers['content-type'] || '') && raw.length ? JSON.parse(raw.toString()) : (raw.length ? raw.toString() : undefined);
      res.status = code => { res.statusCode = code; return res; };
      res.json = body => { if (!res.getHeader('content-type')) res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); return res; };
      res.send = body => { res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); return res; };
      try {
        const handler = await loadHandler(apiMatch.file);
        await handler(req, res);
      } catch (error) {
        console.error(error);
        if (!res.headersSent) { res.statusCode = 500; res.end(JSON.stringify({ error: error.message })); }
      }
      return;
    }
    let file = path.join(ROOT, 'public', decodeURIComponent(url.pathname));
    if (!file.startsWith(path.join(ROOT, 'public'))) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(port, () => resolve(server)));
}

module.exports = { start, findApiFile };
