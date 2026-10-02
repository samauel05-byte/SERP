// Copia mínima de la Herramienta DGII 606 (mismo diseño: encabezado A4–A6,
// títulos en la fila 11, detalle desde B12) guardada como .xlsm con un macro.
async function fakeTool606() {
  const ExcelJS = require('exceljs');
  const JSZip = require('jszip');
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('UtilitarioP').getCell('A1').value = 202509;
  const ws = wb.addWorksheet('Herramienta Formato 606');
  ws.getCell('A4').value = 'RNC o Cédula'; ws.getCell('A5').value = 'Periodo'; ws.getCell('A6').value = 'Cantidad Registros'; ws.getCell('C6').value = 0;
  ws.getCell('A11').value = 'Líneas';
  require('../../../lib/nala/formats').TOOL_606_COLUMNS_FOR_TEST.forEach((label, i) => { ws.getRow(11).getCell(2 + i).value = label; });
  for (let r = 12; r <= 20; r++) { ws.getCell(`A${r}`).value = r - 11; ws.getCell(`B${r}`).numFmt = '@'; ws.getCell(`K${r}`).numFmt = '#,##0.00'; }
  const zip = await JSZip.loadAsync(await wb.xlsx.writeBuffer());
  const vba = Buffer.from('VBA-DGII-' + 'x'.repeat(500));
  zip.file('xl/vbaProject.bin', vba);
  let ct = await zip.file('[Content_Types].xml').async('string');
  ct = ct.replace('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml', 'application/vnd.ms-excel.sheet.macroEnabled.main+xml')
    .replace('</Types>', '<Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/></Types>');
  zip.file('[Content_Types].xml', ct);
  const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  zip.file('xl/_rels/workbook.xml.rels', rels.replace('</Relationships>', '<Relationship Id="rIdVba" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="vbaProject.bin"/></Relationships>'));
  return { buffer: await zip.generateAsync({ type: 'nodebuffer' }), vba };
}

module.exports = { fakeTool606 };
