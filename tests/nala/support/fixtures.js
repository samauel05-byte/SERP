// Synthetic, authorized test invoices rendered with the pre-installed
// Chromium: real JPG/PNG images, text PDFs (multi-page, several invoices on
// one page), an image-only "scanned" PDF and a ZIP. No real taxpayer data.
const fs = require('fs');
const os = require('os');
const path = require('path');
const JSZip = require('jszip');
const { PDFDocument } = require('pdf-lib');
const { chromium } = require('playwright-core');

const invoiceHtml = inv => `
<section style="border:2px solid #333;padding:18px;margin:12px;font-family:Arial;width:620px">
  <h2 style="margin:0">${inv.emisor}</h2><div>RNC: ${inv.emisorRnc}</div>
  <div style="float:right;text-align:right"><b>${inv.tipo || 'FACTURA DE CRÉDITO FISCAL'}</b><br>NCF: ${inv.ncf}<br>Fecha: ${inv.fecha}</div>
  <p>Cliente: ${inv.receptor} &nbsp; RNC: ${inv.receptorRnc || ''}</p>
  <table style="width:100%;border-collapse:collapse" border="1"><tr><th>Descripción</th><th>Monto</th></tr>
  <tr><td>${inv.descripcion || 'Servicios profesionales'}</td><td style="text-align:right">${inv.simbolo || 'RD$'} ${inv.subtotal}</td></tr></table>
  <p style="text-align:right">Subtotal: ${inv.simbolo || 'RD$'} ${inv.subtotal}<br>ITBIS 18%: ${inv.simbolo || 'RD$'} ${inv.itbis}<br><b>Total: ${inv.simbolo || 'RD$'} ${inv.total}</b></p>
  <p>Forma de pago: ${inv.pago || 'Transferencia'}</p>
</section>`;

async function render(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 700, height: 520 } });
  const shot = async (html, file, type) => { await page.setContent(`<html><body style="margin:0;background:#fff">${html}</body></html>`); await page.screenshot({ path: path.join(outDir, file), type, fullPage: true, ...(type === 'jpeg' ? { quality: 85 } : {}) }); };
  const pdf = async (html, file) => { await page.setContent(`<html><body>${html}</body></html>`); await page.pdf({ path: path.join(outDir, file), format: 'Letter' }); };
  const A = { emisor: 'Suministros Alfa SRL', emisorRnc: '131-99999-9', receptor: 'Cliente Uno SRL', receptorRnc: '101-01063-2', ncf: 'B0100000101', fecha: '05/08/2026', subtotal: '10,000.00', itbis: '1,800.00', total: '11,800.00' };
  await shot(invoiceHtml(A), 'factura-alfa.jpg', 'jpeg');
  await shot(invoiceHtml({ ...A, emisor: 'Servicios Beta EIRL', ncf: 'B0100000202', subtotal: '2,000.00', itbis: '360.00', total: '2,500.00' }), 'factura-beta.png', 'png');
  // Page 1: two invoices; page 2: one invoice (text PDF).
  await pdf(invoiceHtml({ ...A, ncf: 'B0100000301' }) + invoiceHtml({ ...A, emisor: 'Gamma Tech SRL', ncf: 'E310000000401', subtotal: '500.00', itbis: '90.00', total: '590.00' })
    + '<div style="page-break-before:always"></div>' + invoiceHtml({ ...A, emisor: 'Importadora Delta', ncf: 'B0100000501', simbolo: 'US$', subtotal: '100.00', itbis: '18.00', total: '118.00' }), 'lote-varias.pdf');
  // Image-only PDF (scanned).
  const scanDoc = await PDFDocument.create();
  const jpg = await scanDoc.embedJpg(fs.readFileSync(path.join(outDir, 'factura-alfa.jpg')));
  const p = scanDoc.addPage([jpg.width, jpg.height]); p.drawImage(jpg, { x: 0, y: 0, width: jpg.width, height: jpg.height });
  fs.writeFileSync(path.join(outDir, 'escaneada.pdf'), await scanDoc.save());
  const scan2 = await PDFDocument.create();
  const png = await scan2.embedPng(fs.readFileSync(path.join(outDir, 'factura-beta.png')));
  scan2.addPage([png.width, png.height]).drawImage(png, { x: 0, y: 0, width: png.width, height: png.height });
  fs.writeFileSync(path.join(outDir, 'escaneada-2.pdf'), await scan2.save());
  await shot(invoiceHtml({ ...A, emisor: 'Otra Empresa', receptor: 'Cliente Dos SA', receptorRnc: '130-00000-1', ncf: 'B0100000601' }), 'otra-empresa.jpg', 'jpeg');
  await shot(invoiceHtml({ ...A, emisor: 'Tienda Sin Moneda', ncf: 'B0100000701', simbolo: '$' }), 'simbolo-dolar.jpg', 'jpeg');
  // Sales (607) invoices issued by Cliente Uno.
  const S = { emisor: 'Cliente Uno SRL', emisorRnc: '101-01063-2', receptor: 'Comprador Uno', receptorRnc: '131-99999-9', ncf: 'B0100000900', fecha: '10/08/2026', subtotal: '5,000.00', itbis: '900.00', total: '5,900.00', pago: 'Tarjeta' };
  await shot(invoiceHtml(S), 'venta-credito.png', 'png');
  await shot(invoiceHtml({ ...S, tipo: 'FACTURA DE CONSUMO', receptor: 'Consumidor final', receptorRnc: '', ncf: 'B0200000901', subtotal: '1,000.00', itbis: '180.00', total: '1,180.00', pago: 'Efectivo' }), 'venta-consumo.png', 'png');
  await browser.close();
  const zip = new JSZip();
  zip.file('carpeta/factura-zeta.jpg', fs.readFileSync(path.join(outDir, 'factura-alfa.jpg')).subarray(0)); // same bytes as factura-alfa.jpg → duplicate file
  zip.file('carpeta/escaneada-2.pdf', fs.readFileSync(path.join(outDir, 'escaneada-2.pdf')));
  zip.file('leeme.txt', 'no es una factura');
  zip.file('comprimido.rar', Buffer.from('Rar!\x1a\x07\x00'));
  fs.writeFileSync(path.join(outDir, 'paquete.zip'), await zip.generateAsync({ type: 'nodebuffer' }));
  fs.writeFileSync(path.join(outDir, 'facturas.rar'), Buffer.from('Rar!\x1a\x07\x00 contenido'));
  return outDir;
}

// Full extraction object as the model returns it (strict schema: all keys).
function inv(o) {
  return {
    pagina_desde: 1, pagina_hasta: 1, continua_en_otra_pagina: false,
    emisor: { nombre: null, rnc_cedula: null }, receptor: { nombre: null, rnc_cedula: null },
    ncf: null, ncf_modificado: null, fecha_emision: null, fecha_pago: null, moneda_codigo: null, moneda_simbolo: null,
    monto_bienes: null, monto_servicios: null, subtotal: null, descuento: null, itbis: null, itbis_retenido: null, isr_retenido: null,
    isc: null, otros_impuestos: null, propina_legal: null, total: null, forma_pago_texto: null, forma_pago_codigo: null,
    tipo_bienes_servicios_sugerido: null, tipo_ingreso_sugerido: null, descripcion: null, campos_baja_confianza: [], ...o,
  };
}

module.exports = { render, inv, defaultDir: () => path.join(os.tmpdir(), 'nala-fixtures') };
