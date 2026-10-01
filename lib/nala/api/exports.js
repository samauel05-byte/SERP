// Exportación DGII 606/607: vista previa, generación con instantánea inmutable
// (la misma para pantalla, TXT y Excel), descargas por enlace temporal y
// seguimiento generado → enviado → aceptado/rechazado.
const crypto = require('crypto');
const supabase = require('../../supabase');
const storage = require('../storage');
const settingsStore = require('../settings');
const formats = require('../formats');
const excel = require('../excel');
const { logEvent, getClient, findDuplicates } = require('../store');
const { derive } = require('../validate');
const h = require('../http');

async function scopeInvoices(ctx, body) {
  const client = await getClient(ctx, h.uuid(body.client_id, 'Empresa'), { withSettings: false });
  const format = h.format(body.format);
  const period = h.period(body.period);
  const batchIds = Array.isArray(body.batch_ids) && body.batch_ids.length ? body.batch_ids.map(b => h.uuid(b, 'Lote')) : null;
  let query = supabase.from('nala_invoices').select('id, client_id, batch_id, document_id, format, period, status, fields, corrected_fields, ncf, counterpart_id, version')
    .eq('tenant_id', ctx.tenantId).eq('client_id', client.id).eq('format', format).eq('period', period).neq('status', 'excluded').limit(70000);
  if (batchIds) query = query.in('batch_id', batchIds);
  const { data, error } = await query;
  h.dbError(error);
  const invoices = data || [];
  for (const invoice of invoices.filter(i => i.status === 'approved')) {
    invoice.duplicates = (await findDuplicates(ctx.tenantId, invoice, derive(format, invoice.fields))).filter(d => d.status === 'approved');
  }
  const pendingCount = invoices.filter(i => i.status !== 'approved').length;
  const settings = await settingsStore.load(ctx.tenantId);
  const snapshot = formats.buildSnapshot({ format, period, client, invoices, pendingCount, settings: settings.rules, scope: batchIds ? 'batches' : 'period', batchIds });
  return { client, snapshot, invoices, settings };
}

const fingerprintOf = snapshot => crypto.createHash('sha256').update(JSON.stringify(snapshot.lines.map(l => [l.invoice_id, l.values]))).digest('hex');

async function preview(ctx, body) {
  ctx.require('view');
  const { snapshot } = await scopeInvoices(ctx, body);
  const txt = snapshot.errors.length ? null : formats.toTxt(snapshot);
  return { snapshot, fingerprint: fingerprintOf(snapshot), txt_preview: txt ? txt.split('\r\n').slice(0, 6).join('\n') : null, txt_check: txt ? formats.validateTxt(snapshot.format, txt) : null };
}

async function create(ctx, body) {
  ctx.require('export');
  const { client, snapshot, invoices } = await scopeInvoices(ctx, body);
  if (snapshot.errors.length) h.fail(422, 'La exportación tiene errores críticos que deben corregirse.', { errors: snapshot.errors });
  // Every warning must be explicitly accepted, and the acceptance is recorded.
  const accepted = new Set(Array.isArray(body.accepted_warnings) ? body.accepted_warnings.map(String) : []);
  const missing = snapshot.warnings.filter(w => !accepted.has(w.code));
  const reason = h.text(body.reason, { max: 500 });
  if (missing.length) h.fail(422, 'Debe aceptar cada advertencia antes de exportar.', { warnings: missing });
  if (snapshot.warnings.length && reason.length < 5) h.fail(422, 'Indique el motivo para exportar con advertencias.');
  // The client can compare the snapshot it previewed; if data changed since,
  // it must preview again so screen, TXT and Excel stay identical.
  const fingerprint = fingerprintOf(snapshot);
  if (body.preview_fingerprint && body.preview_fingerprint !== fingerprint) h.fail(409, 'Los datos cambiaron desde la vista previa. Vuelva a previsualizar.');
  const txt = formats.toTxt(snapshot);
  const check = formats.validateTxt(snapshot.format, txt);
  if (!check.valid) h.fail(500, 'El TXT generado no superó la validación estructural.', { problems: check.problems });
  const txtBuffer = Buffer.from(txt, 'ascii');
  const txtSha = crypto.createHash('sha256').update(txtBuffer).digest('hex');
  const exportId = crypto.randomUUID();
  const generatedAt = new Date().toISOString();
  const base = `${ctx.tenantId}/exports/${exportId}`;
  const xlsx = await excel.buildOfficial(snapshot, { exportId, txtSha256: txtSha, generatedAt });
  await storage.upload(`${base}/${snapshot.file_name}`, txtBuffer, 'text/plain');
  await storage.upload(`${base}/${snapshot.file_name.replace(/\.txt$/i, '')}.xlsx`, xlsx, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const row = {
    id: exportId, tenant_id: ctx.tenantId, client_id: client.id, format: snapshot.format, period: snapshot.period, scope: snapshot.scope, batch_ids: snapshot.batch_ids,
    status: 'generated', schema_version: snapshot.schema_version, rules_version: snapshot.rules_version, line_count: snapshot.lines.length, totals: snapshot.totals,
    snapshot: { ...snapshot, fingerprint, generated_at: generatedAt }, warnings: snapshot.warnings, accepted_warnings: [...accepted], acceptance_reason: snapshot.warnings.length ? reason : null,
    file_name: snapshot.file_name, txt_path: `${base}/${snapshot.file_name}`, txt_sha256: txtSha, xlsx_path: `${base}/${snapshot.file_name.replace(/\.txt$/i, '')}.xlsx`, created_by: ctx.userId,
  };
  const { error } = await supabase.from('nala_exports').insert(row);
  h.dbError(error);
  for (let i = 0; i < snapshot.lines.length; i += 500) {
    const { error: le } = await supabase.from('nala_export_lines').insert(snapshot.lines.slice(i, i + 500).map(l => ({ export_id: exportId, line_no: l.line_no, invoice_id: l.invoice_id })));
    h.dbError(le);
  }
  await logEvent(ctx, { entity: 'export', entity_id: exportId, client_id: client.id, action: 'export_generated', reason: row.acceptance_reason,
    details: { format: snapshot.format, period: snapshot.period, lines: snapshot.lines.length, txt_sha256: txtSha, accepted_warnings: [...accepted], scope: snapshot.scope, batch_ids: snapshot.batch_ids } });
  for (const line of snapshot.lines) {
    const inv = invoices.find(i => i.id === line.invoice_id);
    await logEvent(ctx, { entity: 'invoice', entity_id: line.invoice_id, invoice_id: line.invoice_id, batch_id: inv?.batch_id, client_id: client.id, action: 'exported', details: { export_id: exportId, line_no: line.line_no } });
  }
  return { export: { ...row, snapshot: undefined }, fingerprint };
}

async function list(ctx, q) {
  ctx.require('view');
  let query = supabase.from('nala_exports').select('id, client_id, format, period, scope, batch_ids, status, line_count, totals, file_name, txt_sha256, created_by, created_at, submitted_at, submission_reference, result_at, result_notes, superseded_reason, accepted_warnings, acceptance_reason')
    .eq('tenant_id', ctx.tenantId).order('created_at', { ascending: false }).limit(200);
  if (q.client_id) { ctx.requireClient(h.uuid(q.client_id)); query = query.eq('client_id', q.client_id); }
  else if (ctx.scopeArray()) query = query.in('client_id', ctx.scopeArray().length ? ctx.scopeArray() : ['00000000-0000-0000-0000-000000000000']);
  if (q.period) query = query.eq('period', h.period(q.period));
  if (q.format) query = query.eq('format', h.format(q.format));
  const { data, error } = await query;
  h.dbError(error);
  return { exports: data || [] };
}

async function getExport(ctx, id) {
  const { data, error } = await supabase.from('nala_exports').select('*').eq('tenant_id', ctx.tenantId).eq('id', h.uuid(id)).maybeSingle();
  h.dbError(error);
  if (!data) h.fail(404, 'Exportación no encontrada.');
  ctx.requireClient(data.client_id);
  return data;
}

async function detail(ctx, id) {
  ctx.require('view');
  return { export: await getExport(ctx, id) };
}

async function download(ctx, id, q) {
  ctx.require('view');
  const exp = await getExport(ctx, id);
  const type = String(q.type || 'txt');
  if (type === 'txt') return { url: await storage.signedDownload(exp.txt_path, 120, exp.file_name), file_name: exp.file_name, sha256: exp.txt_sha256 };
  if (type === 'xlsx') return { url: await storage.signedDownload(exp.xlsx_path, 120, exp.xlsx_path.split('/').pop()), file_name: exp.xlsx_path.split('/').pop() };
  if (type === 'custom') {
    const columns = String(q.columns || '').split(',').filter(Boolean);
    const buffer = await excel.buildCustom(exp.snapshot, columns, { exportId: exp.id, txtSha256: exp.txt_sha256, generatedAt: exp.snapshot.generated_at });
    return { base64: buffer.toString('base64'), file_name: `NALA_${exp.format}_${exp.period}_personalizado.xlsx` };
  }
  h.fail(400, 'Tipo de descarga no válido.');
}

const TRANSITIONS = { generated: ['submitted', 'superseded'], submitted: ['accepted', 'rejected'], rejected: ['superseded'], accepted: [], superseded: [] };

async function setStatus(ctx, id, body) {
  ctx.require('submit');
  const exp = await getExport(ctx, id);
  const next = String(body.status || '');
  if (!(TRANSITIONS[exp.status] || []).includes(next)) h.fail(409, `No se puede pasar de "${exp.status}" a "${next}".`);
  const patch = { status: next };
  if (next === 'submitted') {
    patch.submitted_by = ctx.userId; patch.submitted_at = body.submitted_at && /^\d{4}-\d{2}-\d{2}/.test(body.submitted_at) ? new Date(body.submitted_at).toISOString() : new Date().toISOString();
    patch.submission_reference = h.text(body.reference, { max: 120 }) || null;
  } else if (next === 'accepted' || next === 'rejected') {
    patch.result_by = ctx.userId; patch.result_at = new Date().toISOString();
    patch.result_notes = h.text(body.notes, { max: 1000, min: next === 'rejected' ? 5 : 0, label: 'El detalle del rechazo' }) || null;
  } else if (next === 'superseded') {
    patch.superseded_reason = h.text(body.notes, { max: 500, min: 5, label: 'El motivo' });
  }
  const { data, error } = await supabase.from('nala_exports').update(patch).eq('id', exp.id).eq('tenant_id', ctx.tenantId).eq('status', exp.status).select('id, status, submitted_at, submission_reference, result_at, result_notes').maybeSingle();
  h.dbError(error);
  if (!data) h.fail(409, 'La exportación cambió. Recargue.');
  await logEvent(ctx, { entity: 'export', entity_id: exp.id, client_id: exp.client_id, action: `export_${next}`, reason: patch.result_notes || patch.superseded_reason || null, details: { reference: patch.submission_reference || null } });
  return { export: data };
}

module.exports = { preview, create, list, detail, download, setStatus };
