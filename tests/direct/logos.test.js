const test = require('node:test');
const assert = require('node:assert');
const { findLogo, imageType, SITES } = require('../../lib/logos');

const page = 'https://www.ejemplo.gob.do/inicio/';

test('prefiere el ícono cuadrado grande publicado por el sitio', () => {
  const html = `<link rel="icon" href="/fav-32.png" sizes="32x32">
    <link rel="apple-touch-icon" sizes="180x180" href="/Style Library/apple-touch-icon-180x180.png">
    <img src="/img/logo-header.png" class="site-logo">`;
  assert.strictEqual(findLogo(html, page), 'https://www.ejemplo.gob.do/Style%20Library/apple-touch-icon-180x180.png');
});

test('sin ícono grande usa el logo del encabezado, no el del gobierno ni socios', () => {
  const html = `<link rel="apple-touch-icon" href="https://x.gob.do/favicon.ico">
    <meta name="msapplication-TileImage" content="https://x.gob.do/favicon.ico">
    <img src="/uploads/Logo-gobierno-de-la-republica.webp" class="site-logo" alt="Ir a gob.do">
    <img src="/uploads/tss_pi2.png" class="bricks-site-logo" alt="Ir a tss.gob.do">`;
  assert.strictEqual(findLogo(html, page), 'https://www.ejemplo.gob.do/uploads/tss_pi2.png');
});

test('último recurso: el ícono declarado o /favicon.ico', () => {
  assert.strictEqual(findLogo('<link rel="shortcut icon" href="/f.ico?rev=3">', page), 'https://www.ejemplo.gob.do/f.ico?rev=3');
  assert.strictEqual(findLogo('<p>sin nada</p>', page), 'https://www.ejemplo.gob.do/favicon.ico');
});

test('sólo acepta imágenes reales (por contenido, no por la cabecera)', () => {
  assert.strictEqual(imageType(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'text/html', 'u'), 'image/png');
  assert.strictEqual(imageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), '', 'u'), 'image/svg+xml');
  assert.throws(() => imageType(Buffer.from('<!doctype html><html>'), 'text/html', 'u'), /no es una imagen/);
});

test('cada portal gubernamental y bancario tiene su sitio oficial en https', () => {
  for (const k of ['dgii', 'tss', 'trabajo', 'sirla', 'carnet', 'azul']) assert.match(SITES[k], /^https:\/\//);
});
