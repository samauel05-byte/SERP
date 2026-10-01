// Official lookup against DGII's public "Consulta RNC" page. This is the only
// source NALA uses to state that an RNC/cédula is registered and its status;
// structural checks (ids.js) are reported separately and never replace it.
const DGII_URL = process.env.NALA_DGII_RNC_URL || 'https://dgii.gov.do/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/rnc.aspx';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const decode = s => String(s || '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

function hidden(html, name) {
  const re = new RegExp(`<input[^>]*name="${name.replace(/\$/g, '\\$')}"[^>]*>`, 'i');
  const tag = (html.match(re) || [])[0] || '';
  return decode((tag.match(/value="([^"]*)"/i) || [])[1] || '');
}

const LABELS = {
  'cédula/rnc': 'rnc', 'nombre/razón social': 'nombre', 'nombre comercial': 'nombre_comercial', 'categoría': 'categoria',
  'régimen de pagos': 'regimen_pagos', 'estado': 'estado', 'actividad economica': 'actividad_economica', 'actividad económica': 'actividad_economica',
  'administracion local': 'administracion_local', 'administración local': 'administracion_local', 'facturador electrónico': 'facturador_electronico',
  'licencias de comercialización de vhm': 'licencias_vhm',
};

function parseResult(html) {
  const table = (html.match(/<table[^>]*dvDatosContribuyentes[\s\S]*?<\/table>/i) || [])[0] || '';
  const message = decode((html.match(/id="cphMain_lblInformacion"[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || '');
  const data = {};
  for (const row of table.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []).map(c => decode(c.replace(/<[^>]+>/g, ' ')));
    if (cells.length >= 2) {
      const key = LABELS[cells[0].toLowerCase()] || cells[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_');
      data[key] = cells[1];
    }
  }
  if (!data.rnc && !data.nombre) return { found: false, message: message || 'La DGII no devolvió datos para esta identificación.' };
  return { found: true, data, message };
}

async function lookup(id, { timeoutMs = 15000 } = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  const first = await fetch(DGII_URL, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal });
  if (!first.ok) throw new Error(`La Consulta RNC de la DGII respondió ${first.status}.`);
  const cookies = (first.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');
  const html = await first.text();
  const form = new URLSearchParams({
    __EVENTTARGET: '', __EVENTARGUMENT: '',
    __VIEWSTATE: hidden(html, '__VIEWSTATE'), __VIEWSTATEGENERATOR: hidden(html, '__VIEWSTATEGENERATOR'), __EVENTVALIDATION: hidden(html, '__EVENTVALIDATION'),
    'ctl00$cphMain$txtRNCCedula': id, 'ctl00$cphMain$btnBuscarPorRNC': 'BUSCAR', 'ctl00$cphMain$txtRazonSocial': '', 'ctl00$cphMain$hidActiveTab': '',
  });
  if (!form.get('__VIEWSTATE')) throw new Error('La página de Consulta RNC de la DGII cambió de estructura; no se pudo consultar.');
  const second = await fetch(DGII_URL, {
    method: 'POST', signal, body: form.toString(),
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookies, Referer: DGII_URL, Origin: new URL(DGII_URL).origin },
  });
  if (!second.ok) throw new Error(`La Consulta RNC de la DGII respondió ${second.status}.`);
  const result = parseResult(await second.text());
  return { ...result, source: 'DGII — Consulta RNC', source_url: DGII_URL, fetched_at: new Date().toISOString() };
}

module.exports = { lookup, parseResult, DGII_URL };
