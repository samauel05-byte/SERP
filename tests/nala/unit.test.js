const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const money = require('../../lib/nala/money');
const ids = require('../../lib/nala/ids');
const { validate } = require('../../lib/nala/validate');
const formats = require('../../lib/nala/formats');
const excel = require('../../lib/nala/excel');

const client = { id: 'c1', legal_name: 'Cliente Demo SRL', rnc: '101010632' };
const base606 = {
  emisor_nombre: 'Proveedor SRL', emisor_id: '130000001', receptor_id: '101010632', ncf: 'B0100000123',
  fecha_comprobante: '2026-08-14', moneda: 'DOP', tipo_bienes_servicios: '02', forma_pago: '02',
  monto_servicios: '1000.00', itbis: '180.00', total: '1180.00',
};
const approved = (fields, extra = {}) => ({ id: extra.id || 'i-' + Math.random().toString(16).slice(2), status: 'approved', fields, corrected_fields: Object.keys(fields), batch_id: 'b1', ...extra });

test('money: exact decimals, no float drift, null stays null', () => {
  assert.equal(money.sum(['0.10', '0.20']), '0.30');
  assert.equal(money.normalize('1,234.5'), '1234.50');
  assert.equal(money.normalize('10.005'), '10.01');
  assert.equal(money.normalize(null), null);
  assert.equal(money.sum([null, undefined]), null);
  assert.throws(() => money.normalize('1.234,56'));
  assert.equal(money.multiply('100.00', '58.4321'), '5843.21');
  assert.equal(money.multiply('1000.00', '0.18'), '180.00');
  assert.equal(money.sub('1180.00', '1180.00'), '0.00');
});

test('ids: RNC and cédula check digits follow the DGII tool algorithm', () => {
  const rnc = ids.analyzeTaxId('101-01063-2');
  assert.equal(rnc.kind, 'rnc'); assert.equal(rnc.structureValid, true); assert.equal(rnc.checkDigitValid, true); assert.equal(rnc.tipoId, '1');
  assert.equal(ids.analyzeTaxId('101010633').checkDigitValid, false);
  const ced = ids.analyzeTaxId('001-0000001-8');
  assert.equal(ced.kind, 'cedula'); assert.equal(ced.checkDigitValid, ids.cedulaCheckDigit('0010000001') === 8);
  assert.equal(ids.analyzeTaxId('12345').structureValid, false);
  assert.equal(ids.analyzeTaxId('00000000000').structureValid, false);
});

test('ids: NCF and e-CF structure', () => {
  assert.equal(ids.analyzeNcf('B0100000001').valid, true);
  assert.equal(ids.analyzeNcf('E310000000001').electronic, true);
  assert.equal(ids.analyzeNcf('B010000001').valid, false);
  assert.equal(ids.analyzeNcf('B9900000001').valid, false);
  assert.equal(ids.analyzeNcf('A010010010100000001').legacy, true);
});

test('validate: a correct 606 invoice has no critical issues', () => {
  const r = validate({ format: '606', period: '202608', fields: base606, client, correctedFields: Object.keys(base606) });
  assert.deepEqual(r.issues.filter(i => i.severity === 'critical'), []);
  assert.equal(r.computed.calculatedTotal, '1180.00');
  assert.equal(r.computed.difference, '0.00');
});

test('validate: detects missing, invalid, mismatched and misplaced data', () => {
  const r = validate({ format: '606', period: '202607', client, fields: { ...base606, emisor_id: '12345', ncf: 'X1', total: '1500.00', receptor_id: '401506254', moneda: null, moneda_simbolo: '$', itbis_retenido: '50.00' } });
  const codes = r.issues.map(i => i.code);
  for (const code of ['ID_INVALIDO', 'NCF_INVALIDO', 'DIFERENCIA_TOTAL', 'EMPRESA_INCORRECTA', 'FECHA_POSTERIOR_PERIODO', 'MONEDA_NO_IDENTIFICADA', 'FECHA_PAGO_REQUERIDA']) {
    assert.ok(codes.includes(code), `falta ${code}: ${codes}`);
  }
  assert.match(r.issues.find(i => i.code === 'MONEDA_NO_IDENTIFICADA').message, /no asume/);
});

test('validate: foreign currency requires rate, date and source; converts exactly', () => {
  const usd = { ...base606, moneda: 'USD', monto_servicios: '100.00', itbis: '18.00', total: '118.00' };
  assert.ok(validate({ format: '606', period: '202608', fields: usd, client }).issues.some(i => i.code === 'TASA_REQUERIDA'));
  const ok = validate({ format: '606', period: '202608', client, fields: { ...usd, tasa_cambio: '60.25', tasa_fecha: '2026-08-14', tasa_fuente: 'Banco Central RD' } });
  assert.equal(ok.critical_count, 0);
  assert.equal(ok.computed.dop.monto_servicios, '6025.00');
  assert.equal(ok.computed.dop.itbis, '1084.50');
});

test('validate: unknown amounts are not converted to zero', () => {
  const r = validate({ format: '606', period: '202608', client, fields: { ...base606, monto_servicios: null, itbis: null, total: null } });
  assert.ok(r.issues.some(i => i.code === 'MONTO_FACTURADO_REQUERIDO'));
  assert.ok(r.issues.some(i => i.code === 'ITBIS_NO_IDENTIFICADO'));
  assert.equal(r.computed.subtotal, null);
});

test('validate: 607 payment breakdown and consumer summary', () => {
  const sale = { emisor_id: '101010632', receptor_id: '130000001', ncf: 'B0100000050', fecha_comprobante: '2026-08-02', moneda: 'DOP', tipo_ingreso: '01', monto_facturado: '500.00', itbis: '90.00', total: '590.00' };
  assert.ok(validate({ format: '607', period: '202608', client, fields: sale }).issues.some(i => i.code === 'FORMA_PAGO_607_FALTA'));
  assert.equal(validate({ format: '607', period: '202608', client, fields: { ...sale, pago_tarjeta: '590.00' } }).critical_count, 0);
  const consumo = validate({ format: '607', period: '202608', client, fields: { ...sale, receptor_id: null, ncf: 'B0200000009', pago_efectivo: '590.00' } });
  assert.equal(consumo.consumerSummary, true);
  assert.equal(consumo.critical_count, 0);
  assert.ok(validate({ format: '607', period: '202607', client, fields: { ...sale, pago_tarjeta: '590.00' } }).issues.some(i => i.code === 'FECHA_POSTERIOR_PERIODO'));
});

test('validate: a repeated invoice is blocked with a clear message; the original is not', () => {
  const copy = validate({ format: '606', period: '202608', client, fields: base606,
    duplicates: [{ id: 'other', status: 'approved', previous: true, where: 'el lote «Compras agosto» (08/2026)', state: 'aprobada el 05/08/2026', export: 'DGII_F_606_101010632_202608.TXT (enviado a la DGII)' }] });
  const dup = copy.issues.find(i => i.code === 'DUPLICADO');
  assert.equal(dup.severity, 'critical'); assert.equal(dup.ref, 'other');
  assert.match(dup.message, /^Esta factura ya fue procesada: el NCF B0100000123 de 130000001 está aprobada el 05\/08\/2026 en el lote «Compras agosto» \(08\/2026\) y exportada en DGII_F_606_101010632_202608\.TXT \(enviado a la DGII\)/);
  const original = validate({ format: '606', period: '202608', client, fields: base606, correctedFields: Object.keys(base606), duplicates: [{ id: 'later', status: 'pending_review', previous: false, where: 'el lote «Repetido»' }] });
  assert.equal(original.critical_count, 0);
  assert.equal(original.issues.find(i => i.code === 'COPIA_POSTERIOR').severity, 'info');
});

test('606 TXT matches the official macro layout', () => {
  const snap = formats.buildSnapshot({ format: '606', period: '202608', client, invoices: [
    approved({ ...base606, isr_tipo_retencion: '2', isr_retenido: '100.00', fecha_pago: '2026-08-20' }, { id: 'b' }),
    approved({ ...base606, emisor_id: '401506254', ncf: 'E310000000007', fecha_comprobante: '2026-08-01', monto_servicios: null, monto_bienes: '50.00', itbis: '0.00', total: '50.00' }, { id: 'a' }),
  ] });
  assert.deepEqual(snap.errors, []);
  const txt = formats.toTxt(snap);
  const lines = txt.split('\r\n');
  assert.equal(lines[0], '606|101010632|202608|2');
  assert.equal(lines[1], '401506254|1|02|E310000000007||20260801|||50.00|50.00|0.00||||0.00||||||||02');
  assert.equal(lines[2], '130000001|1|02|B0100000123||20260814|20260820|1000.00||1000.00|180.00||||180.00||02|100.00|||||02');
  assert.equal(txt.endsWith('\r\n'), false);
  const check = formats.validateTxt('606', txt);
  assert.deepEqual(check.problems, []);
  assert.equal(snap.file_name, 'DGII_F_606_101010632_202608.TXT');
});

test('607 TXT: single-digit tipo de ingreso, consumer invoices summarized, e-CF excluded', () => {
  const sale = { emisor_id: '101010632', receptor_id: '130000001', ncf: 'B0100000050', fecha_comprobante: '2026-08-02', moneda: 'DOP', tipo_ingreso: '01', monto_facturado: '500.00', itbis: '90.00', total: '590.00', pago_tarjeta: '590.00' };
  const snap = formats.buildSnapshot({ format: '607', period: '202608', client, invoices: [
    approved(sale, { id: 'x1' }),
    approved({ ...sale, receptor_id: null, ncf: 'B0200000001', pago_tarjeta: null, pago_efectivo: '590.00' }, { id: 'x2' }),
    approved({ ...sale, ncf: 'E320000000001' }, { id: 'x3' }),
    { id: 'x4', status: 'pending_review', fields: sale },
  ] });
  assert.deepEqual(snap.errors, []);
  const txt = formats.toTxt(snap);
  assert.equal(txt, '607|101010632|202608|1\r\n130000001|1|B0100000050||1|20260802||500.00|90.00||||||||||590.00||||');
  assert.equal(snap.consumer_summary.count, 1);
  assert.equal(snap.excluded.length, 3);
  assert.deepEqual(formats.validateTxt('607', txt).problems, []);
});

test('snapshot blocks export when an approved invoice now has critical issues', () => {
  const snap = formats.buildSnapshot({ format: '606', period: '202608', client, invoices: [approved({ ...base606, total: '999.00' })] });
  assert.ok(snap.errors.some(e => e.code === 'DIFERENCIA_TOTAL'));
});

test('Excel: identifiers as text, amounts as numbers, same order as TXT', async () => {
  const snap = formats.buildSnapshot({ format: '606', period: '202608', client, invoices: [approved({ ...base606, emisor_id: '001000000' + '18'.slice(0, 2) }), approved({ ...base606, ncf: 'B0100000124' })] });
  const buf = await excel.buildOfficial(snap, { exportId: 'test' });
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
  const ws = wb.getWorksheet('Formato 606');
  assert.equal(ws.getCell('B2').value, '101010632');
  assert.equal(ws.getCell('B7').value, snap.lines[0].values[0]);
  assert.equal(typeof ws.getCell('B7').value, 'string');
  assert.equal(ws.getCell('E7').value, snap.lines[0].values[3]);
  const montoCol = 2 + snap.columns.findIndex(c => c.key === 'total_monto_facturado');
  assert.equal(ws.getRow(7).getCell(montoCol).value, 1000);
  assert.equal(ws.getRow(8).getCell(5).value, snap.lines[1].values[3]);
  assert.ok(ws.sheetProtection && ws.sheetProtection.sheet);
  const custom = await excel.buildCustom(snap, ['x_counterpart', 'rnc_cedula', 'itbis']);
  const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(custom);
  const ws2 = wb2.worksheets[0];
  assert.equal(ws2.getCell('A1').value, 'Proveedor');
  assert.equal(ws2.getCell('C2').value, 180);
});

test('606: filas en el formato exacto de la Herramienta DGII (pegar en B12)', () => {
  const snap = { format: '606', header: { rnc: '131944401', period: '202509', count: 1 }, lines: [{ values: ['00112345678', '2', '09', 'B0100000001', '', '20250905', '', '', '1000.00', '1000.00', '180.00', '', '', '', '180.00', '', '', '', '', '', '', '', '01'] }] };
  const tool = formats.toolRows606(snap);
  assert.equal(tool.start_cell, 'B12');
  assert.equal(tool.columns.length, 25);
  const r = tool.rows[0];
  assert.equal(r.length, 25);
  assert.equal(r[0], '00112345678', 'la cédula conserva los ceros (columna B es texto)');
  assert.equal(r[2], '09 -COMPRAS Y GASTOS QUE FORMARAN PARTE DEL COSTO DE VENTA ', 'texto exacto de la lista oficial');
  assert.deepEqual(r.slice(5, 9), ['202509', '05', '', ''], 'fecha en AAAAMM + DD; sin fecha de pago');
  assert.equal(r[24], '01 - EFECTIVO');
  assert.equal(r[18], '', 'sin tipo de retención');
  assert.equal(tool.tsv.split('\t').length, 25);
  assert.equal(formats.toolRows606({ ...snap, format: '607' }), null);
});
