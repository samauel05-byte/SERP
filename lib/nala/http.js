class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

const fail = (status, message, extra) => { throw new HttpError(status, message, extra); };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuid(value, label = 'identificador') {
  if (!UUID_RE.test(String(value || ''))) fail(400, `${label} inválido.`);
  return String(value).toLowerCase();
}
const optUuid = (value, label) => (value === undefined || value === null || value === '' ? null : uuid(value, label));

function period(value, label = 'período') {
  const v = String(value || '');
  if (!/^20\d{2}(0[1-9]|1[0-2])$/.test(v)) fail(400, `El ${label} debe tener formato AAAAMM.`);
  return v;
}
const optPeriod = (value, label) => (value ? period(value, label) : null);

function format(value) {
  const v = String(value || '');
  if (!['606', '607'].includes(v)) fail(400, 'El formato debe ser 606 o 607.');
  return v;
}
const optFormat = value => (value ? format(value) : null);

function text(value, { max = 500, min = 0, label = 'texto' } = {}) {
  const v = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (v.length < min) fail(400, `${label} es obligatorio.`);
  return v.slice(0, max);
}

function dbError(error) {
  if (!error) return;
  if (error.code === '23505') fail(409, 'El registro ya existe o entra en conflicto con otro.', { code: error.code });
  if (error.code === '23503') fail(409, 'El registro está relacionado con otros datos y no puede modificarse así.', { code: error.code });
  if (error.code === '42P01' || /relation .* does not exist|schema cache/i.test(error.message || '')) fail(503, 'La migración de NALA todavía no está aplicada en la base de datos.');
  throw error;
}

module.exports = { HttpError, fail, uuid, optUuid, period, optPeriod, format, optFormat, text, dbError, UUID_RE };
