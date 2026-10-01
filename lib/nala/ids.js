// Structural validation of Dominican identifiers and fiscal receipt numbers.
// These checks only describe the *shape* of a value (length, digits, check
// digit, series). Whether an RNC exists or is active can only be answered by
// the official DGII lookup (see rnc-dgii.js); the two are never conflated.

const digitsOnly = value => String(value ?? '').replace(/\D/g, '');

// Check digit used by DGII's official Excel tools (GenDV_Para_Republica_Dominicana).
function rncCheckDigit(base8) {
  const weights = [7, 9, 8, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(base8[i]), 0);
  const rest = sum % 11;
  if (rest === 0) return 2;
  if (rest === 1) return 1;
  return 11 - rest;
}

function cedulaCheckDigit(base10) {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const product = Number(base10[i]) * (i % 2 === 0 ? 1 : 2);
    sum += product > 9 ? Math.floor(product / 10) + (product % 10) : product;
  }
  return (10 - (sum % 10)) % 10;
}

// Returns { kind: 'rnc'|'cedula'|null, digits, structureValid, checkDigitValid, tipoId }.
function analyzeTaxId(value) {
  const raw = String(value ?? '').trim();
  const digits = digitsOnly(raw);
  const result = { input: raw, digits, kind: null, tipoId: null, structureValid: false, checkDigitValid: null, message: '' };
  if (!raw) { result.message = 'Sin identificación.'; return result; }
  if (/[^\d\s-]/.test(raw)) { result.message = 'Contiene caracteres no numéricos.'; return result; }
  if (digits.length === 9) {
    result.kind = 'rnc'; result.tipoId = '1'; result.structureValid = true;
    result.checkDigitValid = rncCheckDigit(digits.slice(0, 8)) === Number(digits[8]);
  } else if (digits.length === 11) {
    result.kind = 'cedula'; result.tipoId = '2'; result.structureValid = digits !== '00000000000';
    result.checkDigitValid = result.structureValid && cedulaCheckDigit(digits.slice(0, 10)) === Number(digits[10]);
  } else {
    result.message = 'Debe tener 9 dígitos (RNC) u 11 dígitos (cédula).';
    return result;
  }
  result.message = result.checkDigitValid ? 'Estructura y dígito verificador correctos.' : 'Estructura correcta; el dígito verificador no coincide.';
  return result;
}

// NCF series accepted by DGII's current tools (Formato 606 regex + e-CF, Aviso 24-2019).
const NCF_TYPES = {
  B01: 'Factura de Crédito Fiscal', B02: 'Factura de Consumo', B03: 'Nota de Débito', B04: 'Nota de Crédito',
  B11: 'Comprobante de Compras', B12: 'Registro Único de Ingresos', B13: 'Comprobante para Gastos Menores',
  B14: 'Comprobante para Regímenes Especiales', B15: 'Comprobante Gubernamental', B16: 'Comprobante para Exportaciones',
  B17: 'Comprobante para Pagos al Exterior',
  E31: 'Factura de Crédito Fiscal Electrónica', E32: 'Factura de Consumo Electrónica', E33: 'Nota de Débito Electrónica',
  E34: 'Nota de Crédito Electrónica', E41: 'Compras Electrónico', E43: 'Gastos Menores Electrónico',
  E44: 'Regímenes Especiales Electrónico', E45: 'Gubernamental Electrónico', E46: 'Comprobante de Exportaciones Electrónico',
  E47: 'Comprobante para Pagos al Exterior Electrónico',
};

function analyzeNcf(value) {
  const ncf = String(value ?? '').trim().toUpperCase();
  const result = { input: String(value ?? ''), ncf, valid: false, electronic: false, legacy: false, type: null, series: null, typeName: null, message: '' };
  if (!ncf) { result.message = 'Sin NCF.'; return result; }
  if (/^[BE]/.test(ncf) === false && ncf.length !== 19) { result.message = 'Debe iniciar con B (NCF) o E (e-CF).'; return result; }
  let match;
  if ((match = /^B(\d{2})(\d{8})$/.exec(ncf))) {
    result.series = 'B'; result.type = `B${match[1]}`;
  } else if ((match = /^E(\d{2})(\d{10})$/.exec(ncf))) {
    result.series = 'E'; result.type = `E${match[1]}`; result.electronic = true;
  } else if ((match = /^[AQP]\d{8}(\d{2})\d{8}$/.exec(ncf))) {
    // 19-position receipts issued before May 2018; only valid for retention updates.
    result.series = ncf[0]; result.type = `B${match[1]}`; result.legacy = true;
  } else {
    result.message = ncf.startsWith('E') ? 'Un e-CF debe tener 13 posiciones (E + tipo + 10 dígitos).' : 'Un NCF debe tener 11 posiciones (B + tipo + 8 dígitos).';
    return result;
  }
  result.typeName = NCF_TYPES[result.type] || null;
  if (!result.typeName) { result.message = `Tipo de comprobante ${result.type} no reconocido.`; return result; }
  result.valid = true;
  result.message = result.typeName;
  return result;
}

const isCreditNote = type => type === 'B04' || type === 'E34';
const isDebitNote = type => type === 'B03' || type === 'E33';
const isConsumer = type => type === 'B02' || type === 'E32';

module.exports = { digitsOnly, rncCheckDigit, cedulaCheckDigit, analyzeTaxId, analyzeNcf, NCF_TYPES, isCreditNote, isDebitNote, isConsumer };
