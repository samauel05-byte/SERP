// Test double for the two public DGII sources NALA reads (tests only):
// the Consulta RNC page (real HTML captured from dgii.gov.do) and the
// DGII_RNC.zip registry file (a few real-format lines).
const http = require('http');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const FIX = path.join(__dirname, '..', 'fixtures');
const LINES = [
  '101010632|BANCO POPULAR DOMINICANO S A BANCO MULTIPLE|BANCO POPULAR DOMINICANO |BANCOS MULTIPLES| | | | |15/08/1984|ACTIVO|NORMAL',
  '131999999|PUBLIC ARTS LEIGA SRL|PUBLIC ARTS LEIGA|SERVICIOS DE PUBLICIDAD| | | | |04/09/2019|ACTIVO|NORMAL',
];

async function start({ port }) {
  const zip = new JSZip();
  zip.file('TMP/DGII_RNC.TXT', Buffer.from(LINES.join('\r\n') + '\r\n', 'latin1'));
  const zipBuf = await zip.generateAsync({ type: 'nodebuffer' });
  const found = fs.readFileSync(path.join(FIX, 'dgii-rnc-encontrado.html'));
  const missing = fs.readFileSync(path.join(FIX, 'dgii-rnc-no-inscrito.html'));
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    if (req.url.endsWith('/DGII_RNC.zip')) { res.writeHead(200, { 'content-type': 'application/x-zip-compressed', 'last-modified': 'Sat, 19 Sep 2026 06:58:43 GMT' }); return res.end(zipBuf); }
    if (req.url.endsWith('/rnc.aspx')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': 'ASP.NET_SessionId=test; path=/' });
      if (req.method === 'GET') return res.end(found);
      const id = new URLSearchParams(Buffer.concat(chunks).toString()).get('ctl00$cphMain$txtRNCCedula');
      return res.end(id === '101010632' ? found : missing);
    }
    res.writeHead(404); res.end();
  });
  await new Promise(r => server.listen(port, r));
  return server;
}

module.exports = { start };
