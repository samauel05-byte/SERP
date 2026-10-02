// User-supplied DGII templates for the 606:
//  - the empty "Herramienta de Envío Formato 606" saved with macros (.xlsm):
//    NALA finds its header and detail area and returns it filled, keeping the
//    workbook (macros, validations, protection, styles) byte for byte except
//    for the cells it writes;
//  - TXT files the user already sent to the DGII: NALA reads how amounts and
//    empty fields were written and generates its TXT the same way.
// The legacy .xls of the DGII (binary BIFF) cannot be rewritten without
// losing its macros; it is accepted but must be saved as .xlsm to be filled.
const JSZip = require('jszip');
const formats = require('./formats');

const OLE_MAGIC = 'd0cf11e0a1b11ae1';

function fileKind(buffer, name = '') {
  const head = buffer.subarray(0, 8).toString('hex');
  if (head === OLE_MAGIC) return 'xls';
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return /\.xlsx$/i.test(name) ? 'xlsx' : 'xlsm';
  return 'other';
}

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const xmlText = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function colToNum(col) { let n = 0; for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
function numToCol(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
const splitRef = ref => { const m = /^([A-Z]+)(\d+)$/.exec(ref); return { col: m[1], row: Number(m[2]) }; };

async function loadBook(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const wb = await zip.file('xl/workbook.xml')?.async('string');
  if (!wb) throw new Error('El archivo no es un libro de Excel válido.');
  const rels = (await zip.file('xl/_rels/workbook.xml.rels')?.async('string')) || '';
  const relTarget = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[0])?.[1]; const target = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
    if (id && target) relTarget[id] = target.replace(/^\/?xl\//, '').replace(/^\//, '');
  }
  const sheets = [...wb.matchAll(/<sheet\b[^>]*>/g)].map(m => ({
    name: xmlText(/\bname="([^"]*)"/.exec(m[0])?.[1] || ''),
    path: `xl/${relTarget[/\br:id="([^"]+)"/.exec(m[0])?.[1]] || ''}`,
  })).filter(s => zip.file(s.path));
  const sstXml = (await zip.file('xl/sharedStrings.xml')?.async('string')) || '';
  const shared = [...sstXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(t => xmlText(t[1])).join(''));
  return { zip, sheets, shared, hasMacros: !!zip.file('xl/vbaProject.bin') };
}

// Text of every cell with a string value, by reference ("B11" → "RNC o Cédula").
function cellTexts(xml, shared) {
  const out = {};
  for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = m[1]; const body = m[2] || '';
    const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1]; if (!ref) continue;
    const t = /\bt="([^"]+)"/.exec(attrs)?.[1];
    if (t === 's') { const v = /<v>(\d+)<\/v>/.exec(body)?.[1]; if (v !== undefined) out[ref] = shared[Number(v)] ?? ''; }
    else if (t === 'inlineStr' || t === 'str') { const s = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(x => xmlText(x[1])).join(''); if (s) out[ref] = s; }
  }
  return out;
}

// Finds the detail header row ("RNC o Cédula" … "Forma de Pago") and the
// header value cells (RNC, Período, Cantidad Registros), as in the DGII tool.
function detectLayout(texts) {
  const byRow = {};
  for (const [ref, text] of Object.entries(texts)) { const { col, row } = splitRef(ref); (byRow[row] = byRow[row] || []).push({ col, text: norm(text) }); }
  for (const row of Object.keys(byRow).map(Number).sort((a, b) => a - b)) {
    const cells = byRow[row];
    const rnc = cells.find(c => c.text === 'rnc o cedula');
    const pago = cells.find(c => c.text.startsWith('forma de pago'));
    if (!rnc || !pago || colToNum(pago.col) - colToNum(rnc.col) !== 24) continue;
    const header = {};
    for (const r of Object.keys(byRow).map(Number).filter(r => r < row)) {
      for (const c of byRow[r]) {
        const key = c.text === 'rnc o cedula' ? 'rnc' : c.text === 'periodo' ? 'period' : c.text === 'cantidad registros' ? 'count' : null;
        if (key && !header[key]) header[key] = `${numToCol(colToNum(c.col) + 2)}${r}`;
      }
    }
    return { header_row: row, start_row: row + 1, start_col: rnc.col, end_col: pago.col, header_cells: header };
  }
  return null;
}

async function analyzeExcel(buffer, name) {
  const kind = fileKind(buffer, name);
  if (kind === 'xls') {
    return { kind, fillable: false, message: 'Es el formato .xls original de la DGII. NALA lo guarda, pero para llenarlo sin dañar los macros ábralo en Excel y use Archivo → Guardar como → "Libro de Excel habilitado para macros (.xlsm)"; luego súbalo de nuevo.' };
  }
  if (kind === 'other') return { kind, fillable: false, message: 'No es un archivo de Excel. Suba la herramienta de la DGII guardada como .xlsm.' };
  const book = await loadBook(buffer);
  for (const sheet of book.sheets) {
    const xml = await book.zip.file(sheet.path).async('string');
    const layout = detectLayout(cellTexts(xml, book.shared));
    if (layout) {
      const missing = ['rnc', 'period', 'count'].filter(k => !layout.header_cells[k]);
      return { kind, fillable: true, has_macros: book.hasMacros, sheet: sheet.name, ...layout,
        message: `Hoja "${sheet.name}": encabezado en ${layout.header_cells.rnc || '—'} / ${layout.header_cells.period || '—'} / ${layout.header_cells.count || '—'}, detalle desde ${layout.start_col}${layout.start_row}.${book.hasMacros ? ' Con macros.' : ' Sin macros (se llenará igual).'}${missing.length ? ' No se encontró en el encabezado: ' + missing.join(', ') + '.' : ''}` };
    }
  }
  return { kind, fillable: false, has_macros: book.hasMacros, message: 'No se encontró la fila de títulos de la herramienta 606 ("RNC o Cédula" … "Forma de Pago"). Suba la herramienta oficial de la DGII sin modificar sus columnas.' };
}

// Column types of the tool (B…Z): text cells are written as text so RNC/cédula
// keep their leading zeros and AAAAMM stays a code; amounts as numbers.
const TOOL_TYPES = ['s', 'n', 's', 's', 's', 's', 'n', 's', 'n', 'n', 'n', 'n', 'n', 'n', 'n', 'n', 'n', 'n', 's', 'n', 'n', 'n', 'n', 'n', 's'];

function cellXml(ref, style, value, type) {
  const s = style ? ` s="${style}"` : '';
  if (value === '' || value === null || value === undefined) return `<c r="${ref}"${s}/>`;
  if (type === 'n' && /^-?\d+(\.\d+)?$/.test(String(value))) return `<c r="${ref}"${s}><v>${Number(value)}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(value)}</t></is></c>`;
}

// Writes cells into a worksheet XML, keeping each existing cell's style and
// creating rows/cells in order when missing.
function writeCells(xml, writes) {
  const byRow = new Map();
  for (const w of writes) { const { col, row } = splitRef(w.ref); if (!byRow.has(row)) byRow.set(row, []); byRow.get(row).push({ ...w, col }); }
  const sheetData = /<sheetData\b[^>]*\/>|<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/.exec(xml);
  if (!sheetData) throw new Error('La hoja no tiene datos.');
  const rows = [];
  for (const m of (sheetData[1] || '').matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) rows.push({ attrs: m[1], body: m[2] || '', r: Number(/\br="(\d+)"/.exec(m[1])?.[1]) });
  for (const [rowNo, cells] of byRow) {
    let row = rows.find(r => r.r === rowNo);
    if (!row) { row = { attrs: ` r="${rowNo}"`, body: '', r: rowNo }; rows.push(row); }
    const existing = [...row.body.matchAll(/<c\b([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g)].map(m => ({ xml: m[0], ref: /\br="([A-Z]+\d+)"/.exec(m[1])?.[1], style: /\bs="(\d+)"/.exec(m[1])?.[1] }));
    for (const w of cells) {
      const found = existing.find(c => c.ref === w.ref);
      const next = cellXml(w.ref, found?.style, w.value, w.type);
      if (found) found.xml = next; else existing.push({ xml: next, ref: w.ref });
    }
    existing.sort((a, b) => colToNum(splitRef(a.ref).col) - colToNum(splitRef(b.ref).col));
    row.body = existing.map(c => c.xml).join('');
    row.attrs = row.attrs.replace(/\s*spans="[^"]*"/, '');
  }
  rows.sort((a, b) => a.r - b.r);
  const body = rows.map(r => (r.body ? `<row${r.attrs}>${r.body}</row>` : `<row${r.attrs}/>`)).join('');
  return xml.slice(0, sheetData.index) + `<sheetData>${body}</sheetData>` + xml.slice(sheetData.index + sheetData[0].length);
}

async function fillExcel(buffer, layout, tool) {
  if (!layout?.fillable) throw new Error('La plantilla guardada no se puede llenar. Súbala como .xlsm.');
  const book = await loadBook(buffer);
  const sheet = book.sheets.find(s => s.name === layout.sheet);
  if (!sheet) throw new Error(`La plantilla no tiene la hoja "${layout.sheet}".`);
  let xml = await book.zip.file(sheet.path).async('string');
  const writes = [];
  const h = layout.header_cells || {};
  if (h.rnc) writes.push({ ref: h.rnc, value: tool.header.rnc, type: 's' });
  if (h.period) writes.push({ ref: h.period, value: tool.header.period, type: 'n' });
  if (h.count) writes.push({ ref: h.count, value: String(tool.header.count), type: 'n' });
  const startCol = colToNum(layout.start_col);
  tool.rows.forEach((values, i) => {
    values.forEach((value, j) => writes.push({ ref: `${numToCol(startCol + j)}${layout.start_row + i}`, value: String(value).trim() === '' ? '' : value, type: TOOL_TYPES[j] }));
  });
  xml = writeCells(xml, writes);
  book.zip.file(sheet.path, xml);
  // Excel recalculates on open; drop the calculation chain that may point to rewritten cells.
  if (book.zip.file('xl/calcChain.xml')) {
    book.zip.remove('xl/calcChain.xml');
    const ct = await book.zip.file('[Content_Types].xml').async('string');
    book.zip.file('[Content_Types].xml', ct.replace(/<Override[^>]*calcChain[^>]*\/>/, ''));
    const rels = await book.zip.file('xl/_rels/workbook.xml.rels').async('string');
    book.zip.file('xl/_rels/workbook.xml.rels', rels.replace(/<Relationship[^>]*calcChain[^>]*\/>/, ''));
  }
  return book.zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ─── TXT de ejemplo ───────────────────────────────────────────────────────
// Reads a 606 TXT the user sent to the DGII and learns how it is written:
// amounts with two decimals ("1000.00") or as Excel prints them ("1000"),
// and which amount columns are left empty when they are zero.
function analyzeTxt(text) {
  const clean = String(text).replace(/^﻿/, '');
  const rows = clean.split(/\r?\n/).filter(r => r.trim() !== '');
  const header = (rows.shift() || '').split('|');
  const schema = formats.SCHEMAS['606'];
  const problems = [];
  if (header[0] !== '606') problems.push('La primera línea no es el encabezado "606|RNC|AAAAMM|N".');
  const amountIdx = schema.map((c, i) => (c.type === 'amount' ? i : -1)).filter(i => i >= 0);
  let fixed2 = 0; let plain = 0; const zeroWritten = {}; const zeroBlankCandidates = {};
  rows.forEach((row, n) => {
    const v = row.split('|');
    if (v.length !== schema.length) { problems.push(`Línea ${n + 1}: ${v.length} campos, se esperan ${schema.length}.`); return; }
    for (const i of amountIdx) {
      const x = v[i];
      if (x === '') { zeroBlankCandidates[schema[i].key] = (zeroBlankCandidates[schema[i].key] || 0) + 1; continue; }
      if (/^\d+\.\d{2}$/.test(x)) fixed2++; else if (/^\d+(\.\d{1})?$/.test(x)) plain++;
      if (Number(x) === 0) zeroWritten[schema[i].key] = (zeroWritten[schema[i].key] || 0) + 1;
    }
  });
  const style = {
    amount_format: plain > fixed2 ? 'excel' : 'fixed2',
    // Zero ITBIS lines written as "" (instead of 0.00) in the example.
    blank_zero: ['itbis', 'itbis_adelantar'].filter(k => zeroBlankCandidates[k] && !zeroWritten[k]),
  };
  return { lines: rows.length, rnc: header[1] || '', period: header[2] || '', problems: problems.slice(0, 20), style };
}

// The examples that pass the structure check decide the style; the most
// common amount format wins and a column is left empty only if no valid
// example writes it as 0.
function learnedStyle(examples) {
  const valid = examples.filter(e => e.lines && !e.problems?.length);
  if (!valid.length) return null;
  const excel = valid.filter(e => e.style?.amount_format === 'excel').length;
  const blank = ['itbis', 'itbis_adelantar'].filter(k => valid.every(e => (e.style?.blank_zero || []).includes(k)));
  return { amount_format: excel > valid.length / 2 ? 'excel' : 'fixed2', blank_zero: blank, from_examples: valid.length };
}

module.exports = { fileKind, analyzeExcel, fillExcel, analyzeTxt, learnedStyle, detectLayout, writeCells };
