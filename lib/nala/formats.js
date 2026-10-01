// Independent export schemas for DGII formats 606 and 607, TXT serialization
// and a structural TXT validator. Field order, codes and date/amount layout
// follow the official DGII "Herramienta de Envío" macros (GenerarArchivo):
//   606: header "606|RNC|AAAAMM|N", 23 fields, codes of 2 digits, Tipo Id 1/2.
//   607: header "607|RNC|AAAAMM|N", 23 fields, Tipo de Ingreso of 1 digit.
// Lines are separated by CRLF and the last line has no trailing newline, as
// VBA's `Print #1, strDetalle;` produces.
const money = require('./money');
const ids = require('./ids');
const rules = require('./rules');
const { validate, derive, dopAmount, blank } = require('./validate');

const SCHEMA_VERSION = { '606': 'DGII-606-2025', '607': 'DGII-607-2023.1.1' };
const date8 = v => (blank(v) ? '' : String(v).replace(/-/g, ''));
const code2 = v => (blank(v) ? '' : String(v).trim().padStart(2, '0'));

function amountFor(format, invoice, key) {
  return dopAmount(format, invoice.fields || {}, key);
}

// Each column: key, label (official Excel header), txt (included in TXT),
// type: 'id'|'code'|'ncf'|'date'|'amount', required, value(ctx) -> string|null
const SCHEMAS = {
  '606': [
    { key: 'rnc_cedula', label: 'RNC o Cédula', type: 'id', required: true, value: c => c.d.counterpartId },
    { key: 'tipo_id', label: 'Tipo Id', type: 'code', required: true, value: c => c.d.tipoId },
    { key: 'tipo_bienes_servicios', label: 'Tipo Bienes y Servicios Comprados', type: 'code', required: true, value: c => code2(c.f.tipo_bienes_servicios) },
    { key: 'ncf', label: 'NCF', type: 'ncf', required: true, value: c => String(c.f.ncf || '').trim().toUpperCase() },
    { key: 'ncf_modificado', label: 'NCF ó Documento Modificado', type: 'ncf', value: c => String(c.f.ncf_modificado || '').trim().toUpperCase() },
    { key: 'fecha_comprobante', label: 'Fecha Comprobante', type: 'date', required: true, value: c => date8(c.f.fecha_comprobante) },
    { key: 'fecha_pago', label: 'Fecha Pago', type: 'date', value: c => date8(c.f.fecha_pago) },
    { key: 'monto_servicios', label: 'Monto Facturado en Servicios', type: 'amount', value: c => c.amt('monto_servicios') },
    { key: 'monto_bienes', label: 'Monto Facturado en Bienes', type: 'amount', value: c => c.amt('monto_bienes') },
    { key: 'total_monto_facturado', label: 'Total Monto Facturado', type: 'amount', required: true, value: c => money.sum([c.amt('monto_servicios'), c.amt('monto_bienes')]) },
    { key: 'itbis', label: 'ITBIS Facturado', type: 'amount', keepZero: true, value: c => c.amt('itbis') },
    { key: 'itbis_retenido', label: 'ITBIS Retenido', type: 'amount', value: c => c.amt('itbis_retenido') },
    { key: 'itbis_proporcionalidad', label: 'ITBIS sujeto a Proporcionalidad (Art. 349)', type: 'amount', value: c => c.amt('itbis_proporcionalidad') },
    { key: 'itbis_costo', label: 'ITBIS llevado al Costo', type: 'amount', value: c => c.amt('itbis_costo') },
    { key: 'itbis_adelantar', label: 'ITBIS por Adelantar', type: 'amount', keepZero: true, value: c => (c.amt('itbis') === null ? null : money.sub(c.amt('itbis'), c.amt('itbis_costo') ?? '0.00')) },
    { key: 'itbis_percibido', label: 'ITBIS percibido en compras', type: 'amount', value: c => c.amt('itbis_percibido') },
    { key: 'isr_tipo_retencion', label: 'Tipo de Retención en ISR', type: 'code', value: c => code2(c.f.isr_tipo_retencion) },
    { key: 'isr_retenido', label: 'Monto Retención Renta', type: 'amount', value: c => c.amt('isr_retenido') },
    { key: 'isr_percibido', label: 'ISR Percibido en compras', type: 'amount', value: c => c.amt('isr_percibido') },
    { key: 'isc', label: 'Impuesto Selectivo al Consumo', type: 'amount', value: c => c.amt('isc') },
    { key: 'otros_impuestos', label: 'Otros Impuesto/Tasas', type: 'amount', value: c => c.amt('otros_impuestos') },
    { key: 'propina', label: 'Monto Propina Legal', type: 'amount', value: c => c.amt('propina') },
    { key: 'forma_pago', label: 'Forma de Pago', type: 'code', required: true, value: c => code2(c.f.forma_pago) },
  ],
  '607': [
    { key: 'rnc_cedula', label: 'RNC/Cédula o Pasaporte', type: 'id', value: c => c.d.counterpartId },
    { key: 'tipo_id', label: 'Tipo Identificación', type: 'code', value: c => (c.d.counterpartId ? c.d.tipoId : '') },
    { key: 'ncf', label: 'Número Comprobante Fiscal', type: 'ncf', required: true, value: c => String(c.f.ncf || '').trim().toUpperCase() },
    { key: 'ncf_modificado', label: 'Número Comprobante Fiscal Modificado', type: 'ncf', value: c => String(c.f.ncf_modificado || '').trim().toUpperCase() },
    // The official macro writes Mid("01 - ...", 2, 1): a single digit.
    { key: 'tipo_ingreso', label: 'Tipo de Ingreso', type: 'code', required: true, value: c => (blank(c.f.tipo_ingreso) ? '' : String(Number(c.f.tipo_ingreso))) },
    { key: 'fecha_comprobante', label: 'Fecha Comprobante', type: 'date', required: true, value: c => date8(c.f.fecha_comprobante) },
    { key: 'fecha_retencion', label: 'Fecha de Retención', type: 'date', value: c => date8(c.f.fecha_retencion) },
    { key: 'monto_facturado', label: 'Monto Facturado', type: 'amount', required: true, value: c => c.amt('monto_facturado') },
    { key: 'itbis', label: 'ITBIS Facturado', type: 'amount', keepZero: true, value: c => c.amt('itbis') },
    { key: 'itbis_retenido', label: 'ITBIS Retenido por Terceros', type: 'amount', value: c => c.amt('itbis_retenido') },
    { key: 'itbis_percibido', label: 'ITBIS Percibido', type: 'amount', value: c => c.amt('itbis_percibido') },
    { key: 'isr_retenido', label: 'Retención Renta por Terceros', type: 'amount', value: c => c.amt('isr_retenido') },
    { key: 'isr_percibido', label: 'ISR Percibido', type: 'amount', value: c => c.amt('isr_percibido') },
    { key: 'isc', label: 'Impuesto Selectivo al Consumo', type: 'amount', value: c => c.amt('isc') },
    { key: 'otros_impuestos', label: 'Otros Impuestos/Tasas', type: 'amount', value: c => c.amt('otros_impuestos') },
    { key: 'propina', label: 'Monto Propina Legal', type: 'amount', value: c => c.amt('propina') },
    { key: 'pago_efectivo', label: 'Efectivo', type: 'amount', value: c => c.amt('pago_efectivo') },
    { key: 'pago_cheque', label: 'Cheque/ Transferencia/ Depósito', type: 'amount', value: c => c.amt('pago_cheque') },
    { key: 'pago_tarjeta', label: 'Tarjeta Débito/Crédito', type: 'amount', value: c => c.amt('pago_tarjeta') },
    { key: 'pago_credito', label: 'Venta a Crédito', type: 'amount', value: c => c.amt('pago_credito') },
    { key: 'pago_bonos', label: 'Bonos o Certificados de Regalo', type: 'amount', value: c => c.amt('pago_bonos') },
    { key: 'pago_permuta', label: 'Permuta', type: 'amount', value: c => c.amt('pago_permuta') },
    { key: 'pago_otros', label: 'Otras Formas de Ventas', type: 'amount', value: c => c.amt('pago_otros') },
  ],
};

function cellText(column, value) {
  if (value === null || value === undefined) return '';
  if (column.type === 'amount') {
    if (!column.required && !column.keepZero && money.isZero(value)) return '';
    return money.normalize(value);
  }
  return String(value);
}

function lineFor(format, invoice) {
  const f = invoice.fields || {};
  const ctx = { f, d: derive(format, f), amt: key => amountFor(format, invoice, key) };
  return SCHEMAS[format].map(column => cellText(column, column.value(ctx)));
}

const sortKey = inv => `${(inv.fields || {}).fecha_comprobante || '9999-99-99'}|${String((inv.fields || {}).ncf || '').toUpperCase()}|${inv.id}`;

// Builds the single immutable snapshot used for the preview, the TXT and the
// Excel so the three always show the same lines in the same order.
function buildSnapshot({ format, period, client, invoices, pendingCount = 0, settings = {}, scope = 'period', batchIds = null }) {
  if (!SCHEMAS[format]) throw new Error('Formato no soportado');
  const ruleset = rules.forPeriod(period);
  const errors = []; const warnings = []; const excluded = []; const lines = []; const consumerSummary = [];
  const informant = ids.digitsOnly(client?.rnc) || ids.digitsOnly(client?.cedula);
  const informantInfo = ids.analyzeTaxId(informant);
  if (!informant || !informantInfo.structureValid) errors.push({ code: 'EMPRESA_SIN_RNC', message: 'La empresa cliente no tiene un RNC o cédula válido para el encabezado del TXT.' });
  if (!/^20\d{2}(0[1-9]|1[0-2])$/.test(String(period || ''))) errors.push({ code: 'PERIODO_INVALIDO', message: 'Período inválido (AAAAMM).' });
  const ordered = [...invoices].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const warningCodes = new Map();
  for (const invoice of ordered) {
    if (invoice.status !== 'approved') { excluded.push({ invoice_id: invoice.id, reason: 'No aprobada' }); continue; }
    const result = validate({ format, period, fields: invoice.fields, client, settings, duplicates: invoice.duplicates || [], extraction: {}, correctedFields: invoice.corrected_fields || [] });
    const ncfInfo = ids.analyzeNcf(invoice.fields?.ncf);
    if (format === '607' && ncfInfo.electronic) { excluded.push({ invoice_id: invoice.id, reason: 'e-CF emitido (reportado por facturación electrónica)' }); continue; }
    if (result.consumerSummary) {
      consumerSummary.push({ invoice_id: invoice.id, ncf: invoice.fields.ncf, monto_facturado: amountFor(format, invoice, 'monto_facturado'), itbis: amountFor(format, invoice, 'itbis') });
      excluded.push({ invoice_id: invoice.id, reason: 'Factura de consumo < RD$250,000: va al Resumen de Facturas de Consumo' });
      continue;
    }
    const lineErrors = result.issues.filter(i => i.severity === 'critical');
    const values = lineFor(format, invoice);
    const line = { line_no: lines.length + 1, invoice_id: invoice.id, batch_id: invoice.batch_id, document_id: invoice.document_id || null,
      counterpart_name: result.computed.counterpartName, currency: result.computed.currency, values, issues: result.issues.filter(i => i.severity !== 'info') };
    SCHEMAS[format].forEach((column, index) => {
      if (column.required && values[index] === '') lineErrors.push({ code: 'CAMPO_REQUERIDO', field: column.key, message: `${column.label} vacío.` });
      if (/[|\r\n]/.test(values[index]) || /[^\x20-\x7E]/.test(values[index])) lineErrors.push({ code: 'CARACTER_NO_PERMITIDO', field: column.key, message: `${column.label} contiene caracteres no permitidos en el TXT.` });
    });
    for (const e of lineErrors) errors.push({ code: e.code, line_no: line.line_no, invoice_id: invoice.id, field: e.field || null, message: `Línea ${line.line_no}: ${e.message}` });
    for (const w of result.issues.filter(i => i.severity === 'warning')) {
      const entry = warningCodes.get(w.code) || { code: w.code, message: w.message, lines: [] };
      entry.lines.push(line.line_no); warningCodes.set(w.code, entry);
    }
    lines.push(line);
  }
  for (const entry of warningCodes.values()) warnings.push({ code: entry.code, message: entry.lines.length > 1 ? `${entry.message} (${entry.lines.length} líneas)` : entry.message, lines: entry.lines });
  if (pendingCount > 0) warnings.push({ code: 'PENDIENTES_SIN_APROBAR', message: `${pendingCount} comprobante(s) del alcance no están aprobados y no se incluyen.`, lines: [] });
  if (!lines.length) errors.push({ code: 'SIN_LINEAS', message: 'No hay comprobantes aprobados y elegibles para exportar.' });
  if (lines.length > ruleset.maxRecords[format]) errors.push({ code: 'EXCEDE_MAXIMO', message: `El formato ${format} admite hasta ${ruleset.maxRecords[format]} registros por archivo.` });

  const totals = {};
  SCHEMAS[format].forEach((column, index) => {
    if (column.type === 'amount') totals[column.key] = money.sum(lines.map(l => l.values[index])) || '0.00';
  });
  const consumer = consumerSummary.length ? {
    count: consumerSummary.length,
    monto_facturado: money.sum(consumerSummary.map(c => c.monto_facturado)) || '0.00',
    itbis: money.sum(consumerSummary.map(c => c.itbis)) || '0.00',
    invoices: consumerSummary,
  } : null;
  return {
    format, period, scope, batch_ids: batchIds, schema_version: SCHEMA_VERSION[format], rules_version: ruleset.version,
    header: { format, rnc: informant || '', period, count: lines.length },
    client: { id: client?.id || null, legal_name: client?.legal_name || '', rnc: informant || '' },
    columns: SCHEMAS[format].map(c => ({ key: c.key, label: c.label, type: c.type })),
    lines, excluded, errors, warnings, totals, consumer_summary: consumer,
    file_name: `DGII_F_${format}_${informant || 'SINRNC'}_${period}.${format === '606' ? 'TXT' : 'txt'}`,
  };
}

function toTxt(snapshot) {
  const header = `${snapshot.format}|${snapshot.header.rnc}|${snapshot.header.period}|${snapshot.lines.length}`;
  return [header, ...snapshot.lines.map(l => l.values.join('|'))].join('\r\n');
}

// Structural validation of a generated TXT (defense in depth and tests).
function validateTxt(format, text) {
  const problems = [];
  const schema = SCHEMAS[format];
  if (/[^\x00-\x7F]/.test(text)) problems.push('El archivo contiene caracteres fuera de ASCII.');
  if (/\r\n$/.test(text)) problems.push('La última línea no debe terminar en salto de línea.');
  if (/(^|[^\r])\n/.test(text)) problems.push('Los saltos de línea deben ser CRLF.');
  const rows = text.split('\r\n');
  const header = rows.shift().split('|');
  if (header.length !== 4 || header[0] !== format) problems.push(`Encabezado inválido: se espera "${format}|RNC|AAAAMM|N".`);
  if (!/^(\d{9}|\d{11})$/.test(header[1] || '')) problems.push('RNC/Cédula del encabezado inválido.');
  if (!/^20\d{2}(0[1-9]|1[0-2])$/.test(header[2] || '')) problems.push('Período del encabezado inválido.');
  if (String(rows.length) !== header[3]) problems.push(`La cantidad del encabezado (${header[3]}) no coincide con las líneas (${rows.length}).`);
  rows.forEach((row, index) => {
    const values = row.split('|');
    if (values.length !== schema.length) { problems.push(`Línea ${index + 1}: ${values.length} campos, se esperan ${schema.length}.`); return; }
    schema.forEach((column, i) => {
      const v = values[i];
      if (v !== v.trim()) problems.push(`Línea ${index + 1}, ${column.label}: espacios no permitidos.`);
      if (column.required && v === '' && !(format === '607' && ['rnc_cedula', 'tipo_id'].includes(column.key))) problems.push(`Línea ${index + 1}, ${column.label}: requerido.`);
      if (v === '') return;
      if (column.type === 'amount' && !/^\d+\.\d{2}$/.test(v)) problems.push(`Línea ${index + 1}, ${column.label}: monto "${v}" debe tener punto y 2 decimales.`);
      if (column.type === 'date' && !/^\d{8}$/.test(v)) problems.push(`Línea ${index + 1}, ${column.label}: fecha "${v}" debe ser AAAAMMDD.`);
      if (column.type === 'ncf' && !ids.analyzeNcf(v).valid) problems.push(`Línea ${index + 1}, ${column.label}: "${v}" no es un NCF/e-CF válido.`);
      if (column.key === 'tipo_id' && !/^[123]$/.test(v)) problems.push(`Línea ${index + 1}, Tipo Id "${v}" debe ser 1, 2 o 3.`);
      if (format === '606' && column.type === 'code' && column.key !== 'tipo_id' && !/^\d{2}$/.test(v)) problems.push(`Línea ${index + 1}, ${column.label}: código "${v}" debe tener 2 dígitos.`);
      if (format === '607' && column.key === 'tipo_ingreso' && !/^[1-6]$/.test(v)) problems.push(`Línea ${index + 1}, Tipo de Ingreso "${v}" debe ser 1 a 6.`);
    });
  });
  return { valid: problems.length === 0, problems, lineCount: rows.length };
}

module.exports = { SCHEMAS, SCHEMA_VERSION, buildSnapshot, toTxt, validateTxt, lineFor };
