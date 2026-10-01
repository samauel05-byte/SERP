// DGII's official taxpayer registry file (DGII_RNC.zip, published at
// dgii.gov.do). It adds what the Consulta RNC page does not show: the date of
// constitution (legal entities) or start of operations (individuals). The file
// (~22 MB zipped) is cached per server instance and refreshed when DGII
// publishes a new one.
const fs = require('fs');
const os = require('os');
const path = require('path');
const JSZip = require('jszip');

const URL_ZIP = process.env.NALA_DGII_RNC_ZIP_URL || 'https://dgii.gov.do/app/WebApps/Consultas/RNC/DGII_RNC.zip';
const CACHE = path.join(os.tmpdir(), `nala-dgii-rnc-${require('crypto').createHash('sha1').update(URL_ZIP).digest('hex').slice(0, 10)}.txt`);
const META = `${CACHE}.json`;
const MAX_AGE_MS = 12 * 3600 * 1000;
let memory = null; // { text, lastModified, loadedAt }
let loading = null;

async function download() {
  const res = await fetch(URL_ZIP, { headers: { 'User-Agent': 'Mozilla/5.0 NALA' }, signal: AbortSignal.timeout(40000) });
  if (!res.ok) throw new Error(`El archivo de RNC de la DGII respondió ${res.status}.`);
  const zip = await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));
  const entry = Object.values(zip.files).find(f => /DGII_RNC\.TXT$/i.test(f.name));
  if (!entry) throw new Error('El archivo de RNC de la DGII cambió de estructura.');
  const text = (await entry.async('nodebuffer')).toString('latin1');
  const lastModified = res.headers.get('last-modified') || null;
  try { fs.writeFileSync(CACHE, text, 'latin1'); fs.writeFileSync(META, JSON.stringify({ lastModified, loadedAt: Date.now() })); } catch { /* sin disco: sólo memoria */ }
  return { text, lastModified, loadedAt: Date.now() };
}

async function registry() {
  if (memory && Date.now() - memory.loadedAt < MAX_AGE_MS) return memory;
  if (!memory) {
    try {
      const meta = JSON.parse(fs.readFileSync(META, 'utf8'));
      if (Date.now() - meta.loadedAt < MAX_AGE_MS) memory = { text: fs.readFileSync(CACHE, 'latin1'), ...meta };
      if (memory) return memory;
    } catch { /* sin caché local */ }
  }
  loading ||= download().then(r => { memory = r; return r; }).finally(() => { loading = null; });
  return loading;
}

const toIso = d => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(d || '').trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

function parseLine(line) {
  const c = line.replace(/\r$/, '').split('|').map(x => x.trim());
  return { rnc: c[0], nombre: c[1] || null, nombre_comercial: c[2] || null, actividad: c[3] || null,
    fecha_constitucion: toIso(c[8]), estado: c[9] || null, regimen: c[10] || null };
}

async function find(rnc) {
  const reg = await registry();
  const needle = `\n${rnc}|`;
  let i = reg.text.startsWith(`${rnc}|`) ? 0 : reg.text.indexOf(needle);
  if (i < 0) return { found: false, file_date: reg.lastModified };
  if (i > 0) i += 1;
  const end = reg.text.indexOf('\n', i);
  return { found: true, ...parseLine(reg.text.slice(i, end < 0 ? undefined : end)), file_date: reg.lastModified, source_url: URL_ZIP };
}

module.exports = { find, parseLine, URL_ZIP };
