// Portal relay (worker.js): DGII navigation must stay inside the proxy so the
// session cookies travel with it. Runs the worker with a fake portal.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PAGE = `<!doctype html><html><head><title>OFV</title></head><body>
<form name="aspnetForm" method="post" action="./Default.aspx?a=1&amp;b=2" id="aspnetForm"></form>
<li onclick='location.href="/OFV/CuestionarioDec/SimuladorImpuestos.aspx"'>Simuladores</li>
<a href="#" onclick="window.location.href = '/OFV/Consulta.aspx'; return false">Consulta</a>
<script>if (location.href == 'x') {} setTimeout(function(){ location.replace("/Ofv/login"); }, 1);</script>
</body></html>`;

let worker, seen;
test.before(async () => {
  globalThis.caches = { default: { match: async () => null, put: async () => {} } };
  globalThis.fetch = async (url, init = {}) => {
    seen = { url: String(url), headers: init.headers || {} };
    if (/reporte\.aspx/.test(url)) return new Response(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]), { headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="r.pdf"' } });
    if (init.headers?.['X-MicrosoftAjax']) return new Response('1|#||4|12|updatePanel|x|', { headers: { 'content-type': 'text/plain; charset=utf-8', 'set-cookie': 'ASP.NET_SessionId=abc; path=/; HttpOnly' } });
    return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8', 'set-cookie': 'ASP.NET_SessionId=abc; domain=.dgii.gov.do; path=/ofv; HttpOnly' } });
  };
  const src = fs.readFileSync(path.join(__dirname, '../../worker.js'), 'utf8');
  worker = (await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'))).default;
});

const proxied = (url, init) => worker.fetch(new Request('https://relay.test/proxy?url=' + encodeURIComponent(url) + '&flow=flow123456', init));

test('los menús de DGII (location.href en línea) pasan por el proxy', async () => {
  const html = await (await proxied('https://www.dgii.gov.do/ofv/login.aspx')).text();
  assert.match(html, /onclick='__serpLoc\.href="\/OFV\/CuestionarioDec\/SimuladorImpuestos\.aspx"'/);
  assert.match(html, /onclick="__serpLoc\.href= '\/OFV\/Consulta\.aspx'/);
  assert.match(html, /__serpLoc\.replace\("\/Ofv\/login"\)/);
  assert.match(html, /location\.href == 'x'/, 'las comparaciones no se tocan');
});

test('el script de navegación no se detiene en location.assign (propiedad no redefinible)', async () => {
  const html = await (await proxied('https://www.dgii.gov.do/ofv/login.aspx')).text();
  assert.match(html, /try\{Object\.defineProperty\(window\.location,'assign'/);
  assert.match(html, /HTMLFormElement\.prototype\.submit=function/);
  assert.match(html, /navigation\.addEventListener\('navigate'/);
  assert.ok(html.indexOf('window.__serpLoc=') < html.indexOf('__serpLoc.href="/OFV'), '__serpLoc existe antes de los menús');
});

test('la acción del formulario conserva todos sus parámetros', async () => {
  const html = await (await proxied('https://www.dgii.gov.do/ofv/login.aspx')).text();
  const action = /<form[^>]+action="([^"]+)"/.exec(html)[1];
  const target = new URL(action).searchParams.get('url');
  assert.strictEqual(target, 'https://www.dgii.gov.do/ofv/Default.aspx?a=1&b=2');
});

test('la cookie de sesión queda en el proxy, aislada por flujo', async () => {
  const res = await proxied('https://www.dgii.gov.do/ofv/login.aspx');
  const cookie = res.headers.get('set-cookie');
  assert.match(cookie, /^serp_flow123456_ASP\.NET_SessionId=abc/);
  assert.doesNotMatch(cookie, /domain=/i);
  assert.match(cookie, /Path=\/$/);
});

test('descargas (PDF) llegan intactas, sin inyectar scripts', async () => {
  const res = await proxied('https://www.dgii.gov.do/ofv/reporte.aspx');
  assert.strictEqual(res.headers.get('content-type'), 'application/pdf');
  assert.match(res.headers.get('content-disposition'), /r\.pdf/);
  assert.deepStrictEqual([...Buffer.from(await res.arrayBuffer())], [0x25, 0x50, 0x44, 0x46, 0x00, 0xff]);
});

test('postbacks parciales (UpdatePanel) reciben la respuesta delta de DGII', async () => {
  const res = await proxied('https://www.dgii.gov.do/ofv/Default.aspx', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-MicrosoftAjax': 'Delta=true' }, body: 'a=1' });
  assert.strictEqual(seen.headers['X-MicrosoftAjax'], 'Delta=true');
  assert.strictEqual(await res.text(), '1|#||4|12|updatePanel|x|');
  assert.match(res.headers.get('set-cookie'), /^serp_flow123456_ASP\.NET_SessionId=abc/);
});

test('robot de la tarjeta DGII: búsquedas bien escapadas y ayuda si no puede llenar', async () => {
  const html = await (await proxied('https://www.dgii.gov.do/ofv/login.aspx')).text();
  // In the page the regex must keep its backslashes (\s), otherwise it looks for a literal "s".
  assert.ok(html.includes('/c[oó]digo\\s+introducido\\s+es\\s+incorrecto/i'));
  assert.ok(html.includes('posici[oó]n|coordenada|c[oó]digo|n[uú]mero|casilla)\\D{0,25}?(\\d{1,3})\\D{0,40}?tarjeta'));
  assert.match(html, /function looseCardInput\(cfg\)/);
  assert.match(html, /function showCardHelp\(position\)/);
  assert.match(html, /no tiene la tarjeta de códigos guardada en Direct/);
});

test('código de la tarjeta según la posición, con cualquier formato guardado', async () => {
  const html = await (await proxied('https://www.dgii.gov.do/ofv/login.aspx')).text();
  const fn = html.match(/function cardCodeForPosition\(codes, position\)\{[\s\S]*?\n  \}/)[0];
  const code = new Function(fn + '; return cardCodeForPosition;')();
  assert.strictEqual(code(['A1', 'B2', 'C3'], 3), 'C3');
  assert.strictEqual(code('A1,B2,C3', 2), 'B2');
  assert.strictEqual(code('A1\nB2\nC3', 3), 'C3');
  assert.strictEqual(code(['A1, B2; C3'], 2), 'B2');
  assert.strictEqual(code('4521 8834 1290', 3), '1290');
  assert.strictEqual(code('1: 4521 2: 8834 3: 1290', 2), '8834');
  assert.strictEqual(code('1-4521\n2-8834\n3-1290', 3), '1290');
  assert.strictEqual(code(['3=1290', '1=4521', '2=8834'], 1), '4521');
  assert.strictEqual(code('4521 8834', 5), '');
  assert.strictEqual(code('A1,B2', 0), '');
});
