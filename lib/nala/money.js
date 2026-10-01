// Exact decimal amounts for NALA. Values travel and are stored as strings with
// two decimals ("1234.50"); arithmetic uses BigInt cents so no float rounding
// ever reaches a fiscal amount. `null` means "unknown" and is never coerced to 0.

const AMOUNT_RE = /^-?\d+(\.\d+)?$/;

function parse(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value;
  let text = typeof value === 'number' ? (Number.isFinite(value) ? value.toFixed(6) : '') : String(value);
  text = text.trim().replace(/\s+/g, '');
  if (!text) return null;
  // Accept "1,234.56" (thousands commas) but reject ambiguous "1.234,56".
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) text = text.replace(/,/g, '');
  if (!AMOUNT_RE.test(text)) return undefined;
  const negative = text.startsWith('-');
  const [int, frac = ''] = text.replace('-', '').split('.');
  // Round half-up at the cent using the third decimal.
  const cents = BigInt(int) * 100n + BigInt((frac + '00').slice(0, 2));
  const roundUp = frac.length > 2 && Number(frac[2]) >= 5 ? 1n : 0n;
  const result = cents + roundUp;
  return negative ? -result : result;
}

// Returns the canonical string or null; throws on malformed input so callers
// can surface a validation error instead of silently dropping a value.
function normalize(value) {
  const cents = parse(value);
  if (cents === undefined) throw new Error(`Monto inválido: ${value}`);
  return cents === null ? null : format(cents);
}

function isValid(value) {
  return parse(value) !== undefined;
}

function format(cents) {
  if (cents === null || cents === undefined) return null;
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const int = abs / 100n;
  const frac = String(abs % 100n).padStart(2, '0');
  return `${negative ? '-' : ''}${int}.${frac}`;
}

function sum(values) {
  let total = 0n;
  let known = false;
  for (const value of values) {
    const cents = parse(value);
    if (cents === null || cents === undefined) continue;
    total += cents;
    known = true;
  }
  return known ? format(total) : null;
}

function add(a, b) { return sum([a, b]); }

function sub(a, b) {
  const x = parse(a); const y = parse(b);
  if (x === null || x === undefined || y === null || y === undefined) return null;
  return format(x - y);
}

function cmp(a, b) {
  const x = parse(a); const y = parse(b);
  if (x === null || x === undefined || y === null || y === undefined) return null;
  return x === y ? 0 : (x > y ? 1 : -1);
}

function abs(value) {
  const x = parse(value);
  if (x === null || x === undefined) return null;
  return format(x < 0n ? -x : x);
}

function isZero(value) {
  const x = parse(value);
  return x === 0n;
}

function isPositive(value) {
  const x = parse(value);
  return typeof x === 'bigint' && x > 0n;
}

// Multiplies an amount by a rate given as a decimal string (up to 6 decimals),
// rounding half-up to the cent. Used for currency conversion and tax checks.
function multiply(amount, rate) {
  const cents = parse(amount);
  if (cents === null || cents === undefined) return null;
  const text = String(rate ?? '').trim();
  if (!/^\d+(\.\d{1,6})?$/.test(text)) return null;
  const [int, frac = ''] = text.split('.');
  const scaled = BigInt(int) * 1000000n + BigInt((frac + '000000').slice(0, 6));
  const product = cents * scaled; // cents * 1e6
  const negative = product < 0n;
  const absProduct = negative ? -product : product;
  const rounded = (absProduct + 500000n) / 1000000n;
  return format(negative ? -rounded : rounded);
}

// Numeric value for Excel cells. Safe because amounts are limited to cents and
// realistic magnitudes (< 2^53 cents).
function toNumber(value) {
  const cents = parse(value);
  if (cents === null || cents === undefined) return null;
  return Number(cents) / 100;
}

module.exports = { parse, normalize, isValid, format, sum, add, sub, cmp, abs, isZero, isPositive, multiply, toNumber };
