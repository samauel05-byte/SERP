// Test double for the OpenAI Chat Completions endpoint (tests only; the
// product talks to api.openai.com). Responses are fixtures registered per
// "<document name>#<first page>", read from the prompt NALA sends, so tests
// exercise the real request/response path, retries and error handling.
const http = require('http');

function start({ port }) {
  const fixtures = new Map(); // key -> { responses: [..], calls }
  const log = [];
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks).toString();
    if (req.url === '/__fixtures' && req.method === 'POST') {
      const { key, responses } = JSON.parse(body);
      fixtures.set(key, { responses, calls: 0 });
      res.writeHead(200); return res.end('{}');
    }
    if (req.url === '/__log') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(log)); }
    if (req.url !== '/v1/chat/completions') { res.writeHead(404); return res.end(); }
    if (!String(req.headers.authorization || '').startsWith('Bearer ')) { res.writeHead(401); return res.end('{"error":"no key"}'); }
    const payload = JSON.parse(body);
    const content = payload.messages[0].content;
    const text = content.find(c => c.type === 'text').text;
    const m = /Documento: (.+?) \(páginas (\d+)-(\d+)\)/.exec(text);
    const key = m ? `${m[1]}#${m[2]}` : '?';
    const attachments = content.filter(c => c.type !== 'text').map(c => c.type === 'file' ? { type: 'file', filename: c.file.filename, bytes: c.file.file_data.length } : { type: 'image', bytes: c.image_url.url.length });
    log.push({ key, model: payload.model, schema: payload.response_format?.json_schema?.name, attachments });
    const fx = fixtures.get(key);
    if (!fx) { res.writeHead(500, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message: `sin fixture para ${key}` } })); }
    const response = fx.responses[Math.min(fx.calls, fx.responses.length - 1)];
    fx.calls++;
    if (response.status && response.status !== 200) { res.writeHead(response.status, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message: response.message || 'fallo simulado' } })); }
    if (response.delayMs) await new Promise(r => setTimeout(r, response.delayMs));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ model: payload.model, choices: [{ message: { role: 'assistant', content: JSON.stringify(response.body) } }], usage: { total_tokens: 1 } }));
  });
  return new Promise(resolve => server.listen(port, () => resolve({ server, fixtures, log })));
}

module.exports = { start };
