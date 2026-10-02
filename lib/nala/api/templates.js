// Plantillas DGII del usuario (606): la herramienta oficial guardada con
// macros (.xlsm), que NALA devuelve llena, y TXT ya enviados a la DGII, de
// los que NALA aprende cómo escribir el suyo. Cualquier tipo de archivo se
// acepta y se guarda; NALA explica cuál puede usar y por qué.
const crypto = require('crypto');
const storage = require('../storage');
const settingsStore = require('../settings');
const tpl = require('../dgii-template');
const { logEvent } = require('../store');
const h = require('../http');

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_EXAMPLES = 12;
const FORMATS = ['606'];
const KINDS = ['excel', 'txt'];

function check(body) {
  const format = String(body.format || '606');
  const kind = String(body.kind || '');
  if (!FORMATS.includes(format)) h.fail(400, 'Por ahora las plantillas DGII son para el formato 606.');
  if (!KINDS.includes(kind)) h.fail(400, 'Tipo de plantilla no válido.');
  return { format, kind };
}

const prefix = (ctx, format, kind) => `templates/${ctx.tenantId}/${format}/${kind}/`;

async function list(ctx) {
  ctx.require('view');
  const settings = await settingsStore.load(ctx.tenantId);
  return { templates: settings.dgii_templates };
}

async function uploadUrl(ctx, body) {
  ctx.require('settings_manage');
  const { format, kind } = check(body);
  const size = Number(body.size || 0);
  if (!size || size > MAX_BYTES) h.fail(400, 'El archivo debe pesar menos de 15 MB.');
  const name = h.text(body.name, { max: 160, min: 1, label: 'El nombre del archivo' });
  const safe = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-100);
  const path = `${prefix(ctx, format, kind)}${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safe}`;
  return { path, upload_url: await storage.signedUpload(path) };
}

async function register(ctx, body) {
  ctx.require('settings_manage');
  const { format, kind } = check(body);
  const path = String(body.path || '');
  if (!path.startsWith(prefix(ctx, format, kind)) || path.includes('..')) h.fail(400, 'Ruta de archivo no válida.');
  const name = h.text(body.name, { max: 160, min: 1, label: 'El nombre del archivo' });
  const buffer = await storage.download(path);
  if (buffer.length > MAX_BYTES) h.fail(400, 'El archivo debe pesar menos de 15 MB.');
  const settings = await settingsStore.load(ctx.tenantId);
  const all = { ...settings.dgii_templates };
  const entry = { ...(all[format] || {}) };
  const meta = { name, path, size: buffer.length, sha256: crypto.createHash('sha256').update(buffer).digest('hex'), uploaded_at: new Date().toISOString(), uploaded_by: ctx.userId };
  const removed = [];
  if (kind === 'excel') {
    let analysis;
    try { analysis = await tpl.analyzeExcel(buffer, name); } catch (e) { analysis = { kind: 'other', fillable: false, message: `No se pudo leer el archivo: ${e.message}` }; }
    if (entry.excel?.path && entry.excel.path !== path) removed.push(entry.excel.path);
    entry.excel = { ...meta, ...analysis };
  } else {
    const analysis = tpl.analyzeTxt(buffer.toString('latin1'));
    entry.examples = [{ ...meta, ...analysis }, ...(entry.examples || [])];
    while (entry.examples.length > MAX_EXAMPLES) removed.push(entry.examples.pop().path);
    entry.txt_style = tpl.learnedStyle(entry.examples);
  }
  all[format] = entry;
  await settingsStore.saveTemplates(ctx.tenantId, ctx.userId, all);
  if (removed.length) await storage.remove(removed).catch(() => {});
  await logEvent(ctx, { entity: 'settings', entity_id: ctx.tenantId, action: 'dgii_template_uploaded', details: { format, kind, name, sha256: meta.sha256 } });
  return { templates: all };
}

async function remove(ctx, format, kind, index) {
  ctx.require('settings_manage');
  check({ format, kind });
  const settings = await settingsStore.load(ctx.tenantId);
  const all = { ...settings.dgii_templates };
  const entry = { ...(all[format] || {}) };
  const paths = [];
  if (kind === 'excel') { if (entry.excel?.path) paths.push(entry.excel.path); delete entry.excel; }
  else {
    const i = Number(index);
    const examples = [...(entry.examples || [])];
    if (!Number.isInteger(i) || !examples[i]) h.fail(404, 'Ejemplo no encontrado.');
    paths.push(examples[i].path); examples.splice(i, 1);
    entry.examples = examples; entry.txt_style = tpl.learnedStyle(examples);
  }
  all[format] = entry;
  await settingsStore.saveTemplates(ctx.tenantId, ctx.userId, all);
  await storage.remove(paths).catch(() => {});
  await logEvent(ctx, { entity: 'settings', entity_id: ctx.tenantId, action: 'dgii_template_removed', details: { format, kind } });
  return { templates: all };
}

// The user's macro workbook filled with an export's lines.
async function filledWorkbook(ctx, exp, tool) {
  const settings = await settingsStore.load(ctx.tenantId);
  const excel = settings.dgii_templates?.[exp.format]?.excel;
  if (!excel) h.fail(404, 'Primero suba la herramienta de la DGII (Excel con macro) en Configuración → Plantillas DGII.');
  if (!excel.fillable) h.fail(422, excel.message || 'La plantilla guardada no se puede llenar.');
  if (!tool) h.fail(422, 'Esta exportación no tiene líneas para la herramienta.');
  const buffer = await tpl.fillExcel(await storage.download(excel.path), excel, tool);
  const ext = excel.kind === 'xlsx' ? 'xlsx' : 'xlsm';
  return { base64: buffer.toString('base64'), file_name: `Herramienta_${exp.format}_${tool.header.rnc}_${tool.header.period}.${ext}`, mime: ext === 'xlsm' ? 'application/vnd.ms-excel.sheet.macroEnabled.12' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}

module.exports = { list, uploadUrl, register, remove, filledWorkbook };
