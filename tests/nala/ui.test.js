// Browser test (Chromium via playwright-core) of the NALA screens on the
// local stack: upload → background processing → audit → approve → export.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright-core');
const { startStack } = require('./support/stack');
const { render, inv } = require('./support/fixtures');

process.env.NALA_RETRY_BASE_SECONDS = '1';
const CLIENT_UNO = '00000000-0000-0000-0000-0000000c0001';
const ADMIN_ID = '00000000-0000-0000-0000-00000000a001';
const SHOTS = process.env.NALA_SHOTS_DIR || null;
let stack; let browser; let page; let dir;
const errors = [];

const shot = async name => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true }); } };

test.before(async () => {
  dir = await render(path.join(os.tmpdir(), 'nala-fixtures'));
  stack = await startStack();
  const fx = (key, responses) => fetch(`${stack.openaiUrl}/__fixtures`, { method: 'POST', body: JSON.stringify({ key, responses }) });
  const ok = facturas => ({ body: { facturas, paginas_sin_factura: [] } });
  const A = { emisor: { nombre: 'Suministros Alfa SRL', rnc_cedula: '131999999' }, receptor: { nombre: 'Cliente Uno SRL', rnc_cedula: '101010632' }, fecha_emision: '2026-08-05', moneda_codigo: 'DOP', moneda_simbolo: 'RD$', forma_pago_codigo: '02', tipo_bienes_servicios_sugerido: '02' };
  await fx('factura-alfa.jpg#1', [{ status: 500 }, ok([inv({ ...A, ncf: 'B0100000101', monto_servicios: '10000.00', subtotal: '10000.00', itbis: '1800.00', total: '11800.00' })])]);
  await fx('simbolo-dolar.jpg#1', [ok([inv({ ...A, emisor: { nombre: 'Tienda Sin Moneda', rnc_cedula: '131999999' }, ncf: 'B0100000701', moneda_codigo: null, moneda_simbolo: '$', monto_servicios: '10000.00', subtotal: '10000.00', itbis: '1800.00', total: '11800.00' })])]);
  await fx('lote-varias.pdf#1', [ok([
    inv({ ...A, emisor: { nombre: 'Gamma Tech SRL', rnc_cedula: '131999999' }, ncf: 'B0100000301', monto_servicios: '10000.00', subtotal: '10000.00', itbis: '1800.00', total: '11800.00' }),
    inv({ ...A, pagina_desde: 2, pagina_hasta: 2, emisor: { nombre: 'Importadora Delta', rnc_cedula: '131999999' }, ncf: 'B0100000501', moneda_codigo: 'USD', moneda_simbolo: 'US$', monto_bienes: '100.00', subtotal: '100.00', itbis: '18.00', total: '118.00' }),
  ])]);
  const login = await fetch(`${stack.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Admin#2026' }) }).then(r => r.json());
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(([t, s, key, prefs]) => { sessionStorage.setItem('dtoken', t); localStorage.setItem('direct_session_id', s); localStorage.setItem(key, prefs); },
    [login.access_token, login.session_id, `nala.prefs.${ADMIN_ID}`, JSON.stringify({ client: CLIENT_UNO, period: '202608', format: '' })]);
  page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
});

test.after(async () => { await browser?.close(); await stack?.stop(); });

test('carga masiva desde la interfaz y procesamiento en segundo plano', async () => {
  await page.goto(`${stack.base}/nala/index.html#/lotes?nuevo=1`);
  await page.fill('#b-name', 'Compras agosto (UI)');
  await page.setInputFiles('#files', ['factura-alfa.jpg', 'simbolo-dolar.jpg', 'lote-varias.pdf', 'facturas.rar'].map(f => path.join(dir, f)));
  assert.match(await page.textContent('#flist'), /RAR no es compatible/);
  await shot('ui-01-carga');
  await page.click('#go');
  await page.waitForURL(/#\/lotes\/[0-9a-f-]{36}/, { timeout: 30000 });
  await page.waitForFunction(() => { const t = document.querySelector('#content')?.textContent || ''; return /En revisión/.test(t) && !/procesando en segundo plano/.test(t); }, null, { timeout: 90000 });
  const text = await page.textContent('#content');
  assert.match(text, /100% · 4\/4 trabajos|100% · \d+\/\d+ trabajos/);
  assert.match(text, /2 int\./, 'muestra el reintento de la factura que falló una vez');
  await shot('ui-02-lote');
});

test('auditoría: visor, corrección de moneda, guardar y aprobar', async () => {
  await page.click('button:has-text("Auditar lote")');
  await page.waitForSelector('tr[data-id]');
  assert.equal(await page.locator('tr[data-id]').count(), 4);
  await page.click('tr:has-text("B0100000701")');
  await page.waitForSelector('[data-canvas] img');
  assert.match(await page.textContent('#ebody'), /no asume que "\$" sea USD ni DOP/);
  await shot('ui-03-auditoria');
  await page.selectOption('[data-k="moneda"]', 'DOP');
  assert.equal(await page.isEnabled('#save'), true);
  await page.click('#undo');
  assert.equal(await page.inputValue('[data-k="moneda"]'), '');
  await page.selectOption('[data-k="moneda"]', 'DOP');
  await page.click('#approve');
  await page.waitForFunction(() => /6 de|2 de|Comprobante aprobado/.test(document.body.textContent), null, { timeout: 15000 });
  await page.waitForTimeout(800);
  // The PDF invoice of page 2 opens on page 2 of the original.
  await page.goto(`${stack.base}/nala/index.html#/auditoria?period=202608&q=B0100000501`);
  await page.click('tr:has-text("B0100000501")');
  await page.waitForSelector('[data-canvas] canvas');
  assert.match(await page.textContent('[data-pg]'), /Pág\. 2\/2/);
  await page.fill('[data-k="tasa_cambio"]', '60.25'); await page.dispatchEvent('[data-k="tasa_cambio"]', 'change');
  await page.fill('[data-k="tasa_fecha"]', '2026-08-05'); await page.dispatchEvent('[data-k="tasa_fecha"]', 'change');
  await page.fill('[data-k="tasa_fuente"]', 'Banco Central RD'); await page.dispatchEvent('[data-k="tasa_fuente"]', 'change');
  await page.click('#save');
  await page.waitForFunction(() => /v2/.test(document.querySelector('#ebody')?.textContent || ''), null, { timeout: 10000 });
  assert.match(await page.textContent('#recon'), /7,109\.50/);
  await shot('ui-04-usd');
});

test('exportación 606 desde la interfaz con TXT descargable', async () => {
  await page.goto(`${stack.base}/nala/index.html#/exportar?nueva=1&format=606`);
  await page.click('#e-preview');
  await page.waitForSelector('text=Estructura del TXT');
  // Filas listas para pegar en B12 de la Herramienta DGII 606 (fecha AAAAMM + DD, texto de las listas).
  await page.waitForSelector('text=Copiar y pegar en la Herramienta DGII 606');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: stack.base });
  await page.click('[data-tool] [data-copy="rows"]');
  const pasted = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(pasted, /^131999999\t1\t02-GASTOS POR TRABAJOS, SUMINISTROS Y SERVICIOS \tB0100000701\t\t202608\t05\t\t\t10000\.00\t\t10000\.00\t1800\.00/);
  for (const c of await page.$$('.acc')) await c.check();
  if (await page.$('#acc-reason')) await page.fill('#acc-reason', 'Pendientes se reportan luego');
  await shot('ui-05-vista-previa');
  await page.click('#gen');
  await page.waitForURL(/#\/exportar\/[0-9a-f-]{36}/);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#d-txt')]);
  assert.equal(download.suggestedFilename(), 'DGII_F_606_101010632_202608.TXT');
  const txt = fs.readFileSync(await download.path(), 'latin1');
  assert.match(txt, /^606\|101010632\|202608\|1\r\n131999999\|1\|02\|B0100000701\|\|20260805\|\|10000\.00\|\|10000\.00\|1800\.00/);
  await page.click('#s-sub'); await page.fill('#sr', 'OFV-1'); await page.click('.modal [data-x="ok"]');
  await page.waitForSelector('text=Enviado a DGII');
  await shot('ui-06-exportacion');
});

test('plantillas DGII: subir la herramienta con macro y un TXT de ejemplo, y descargarla llena', async () => {
  const { fakeTool606 } = require('./support/dgii-tool');
  const { buffer, vba } = await fakeTool606();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nala-tpl-'));
  const xlsm = path.join(dir, 'Herramienta606.xlsm'); fs.writeFileSync(xlsm, buffer);
  const row = ['131999999', '1', '02', 'B0100000701', '', '20260805', '', '10000', '', '10000', '1800', '', '', '', '1800', '', '', '', '', '', '', '', '02'].join('|');
  const txt = path.join(dir, 'DGII_F_606_101010632_202607.TXT'); fs.writeFileSync(txt, `606|101010632|202607|1\r\n${row}`);
  await page.goto(`${stack.base}/nala/index.html#/config`);
  await page.waitForSelector('#dgii-tpl');
  await page.setInputFiles('#dgii-tpl input[data-up="excel"][data-format="606"]', xlsm);
  await page.waitForSelector('#dgii-tpl >> text=Lista para llenar');
  await page.setInputFiles('#dgii-tpl input[data-up="txt"][data-format="606"]', txt);
  await page.waitForSelector('#dgii-tpl >> text=Aprendido de 1 ejemplo');
  assert.match(await page.textContent('#dgii-tpl'), /como los escribe la herramienta/);
  await shot('ui-07-plantillas');
  await page.goto(`${stack.base}/nala/index.html#/exportar`);
  await page.click('tr[data-id]');
  await page.waitForSelector('#d-tool');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#d-tool')]);
  assert.match(download.suggestedFilename(), /^Herramienta_606_101010632_202608\.xlsm$/);
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(fs.readFileSync(await download.path()));
  assert.deepEqual(Buffer.from(await zip.file('xl/vbaProject.bin').async('nodebuffer')), vba, 'el macro queda intacto');
  const XLSX = require('xlsx');
  const ws = XLSX.read(fs.readFileSync(await download.path()), { type: 'buffer' }).Sheets['Herramienta Formato 606'];
  assert.equal(ws.C4.v, '101010632'); assert.equal(ws.C6.v, 1);
  assert.equal(ws.B12.v, '131999999'); assert.equal(ws.E12.v, 'B0100000701'); assert.equal(ws.G12.v, '202608'); assert.equal(ws.H12.v, 5);
});

test('empresas clientes: filtros por columna y orden', async () => {
  await page.goto(`${stack.base}/nala/index.html#/clientes`);
  await page.waitForSelector('tr.filters');
  const count = () => page.$$eval('#ctable tr:not(.filters)', rows => rows.filter(r => r.querySelector('td [data-use]')).length);
  const total = await count();
  assert.ok(total >= 2, `hay ${total} empresas de prueba`);
  await page.fill('input[data-cf="name"]', 'uno');
  await page.waitForFunction(() => /1 de/.test(document.querySelector('tr.filters')?.textContent || ''));
  assert.equal(await count(), 1);
  assert.match(await page.textContent('#ctable'), /Cliente Uno/);
  await shot('ui-08-empresas-filtro');
  await page.click('#cf-clear');
  assert.equal(await count(), total);
  await page.click('th[data-sort="name"]');
  const names = await page.$$eval('#ctable td b', b => b.map(x => x.textContent));
  assert.deepEqual(names, [...names].sort((a, b) => b.localeCompare(a, 'es')), 'orden descendente al tocar el título');
});

test('los demás módulos de NALA cargan sin errores de página', async () => {
  for (const view of ['panel', 'empresa', 'clientes', 'rnc', 'equipo', 'config', 'asistente']) {
    await page.goto(`${stack.base}/nala/index.html#/${view}`);
    await page.waitForFunction(() => !/Cargando/.test(document.querySelector('#content')?.textContent || 'Cargando'), null, { timeout: 15000 });
    assert.doesNotMatch(await page.textContent('#content'), /⚠️/, view);
  }
  assert.ok(await page.frameLocator('iframe.assistant').locator('text=Retención (IR-17)').count());
  assert.deepEqual(errors, []);
});
