import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';
import fs from 'node:fs/promises';

const outputPath = 'C:/Users/ADMIN/Desktop/pagina sive/outputs/brigadas/plantilla_brigadas_sive.xlsx';
const renderDir = 'C:/Users/ADMIN/Desktop/pagina sive/spreadsheet-build/rendered';

const wb = await Workbook.create();
const brigadas = wb.worksheets.add('Brigadas');
brigadas.showGridLines = false;
brigadas.freezePanes.freezeRows(4);

brigadas.mergeCells('A1:G1');
brigadas.getRange('A1').values = [['PROGRAMACIÓN DE BRIGADAS SIVE']];
brigadas.getRange('A1:G1').format = {
  fill: '#1E3A6E', font: { bold: true, color: '#FFFFFF', size: 18 },
  horizontalAlignment: 'center', verticalAlignment: 'center', rowHeight: 34
};
brigadas.mergeCells('A2:G2');
brigadas.getRange('A2').values = [["Edite las filas y cambie el estado a 'Activa' para publicar una brigada en el formulario web."]];
brigadas.getRange('A2:G2').format = {
  fill: '#DDEFEA', font: { color: '#246457', italic: true },
  horizontalAlignment: 'center', verticalAlignment: 'center', rowHeight: 28
};

brigadas.getRange('A4:G7').values = [
  ['id', 'nombre', 'fecha', 'lugar', 'horario', 'estado', 'cupos'],
  ['BRG-001', 'Brigada de salud comunitaria', new Date(2026, 8, 15), 'Lugar por definir', '08:00 - 12:00', 'Borrador', 30],
  ['BRG-002', 'Jornada de promoción y prevención', new Date(2026, 9, 10), 'Lugar por definir', '08:00 - 16:00', 'Borrador', 40],
  ['BRG-003', 'Actividad de bienestar comunitario', new Date(2026, 10, 7), 'Lugar por definir', '09:00 - 13:00', 'Borrador', 25]
];
brigadas.getRange('A4:G4').format = {
  fill: '#4D8A7C', font: { bold: true, color: '#FFFFFF' },
  horizontalAlignment: 'center', verticalAlignment: 'center', rowHeight: 26
};
brigadas.getRange('A5:G100').format = {
  fill: '#FFF9DF', font: { color: '#263A59' }, verticalAlignment: 'center', rowHeight: 24
};
brigadas.getRange('A5:G7').format.borders = {
  top: { color: '#D4E1F0', style: 'continuous' },
  bottom: { color: '#D4E1F0', style: 'continuous' },
  left: { color: '#D4E1F0', style: 'continuous' },
  right: { color: '#D4E1F0', style: 'continuous' }
};
brigadas.getRange('C5:C100').format.numberFormat = 'yyyy-mm-dd';
brigadas.getRange('G5:G100').format.numberFormat = '0';
brigadas.getRange('F5:F100').dataValidation = {
  rule: { type: 'list', values: ['Activa', 'Borrador', 'Cerrada'] }
};
brigadas.getRange('G5:G100').dataValidation = {
  rule: { type: 'wholeNumber', operator: 'greaterThanOrEqualTo', formula1: 0 }
};
brigadas.getRange('F5:F100').conditionalFormats.add('containsText', {
  text: 'Activa', format: { fill: '#DDF4EA', font: { color: '#246457', bold: true } }
});
brigadas.getRange('F5:F100').conditionalFormats.add('containsText', {
  text: 'Borrador', format: { fill: '#FFF0BF', font: { color: '#805B00', bold: true } }
});
brigadas.getRange('F5:F100').conditionalFormats.add('containsText', {
  text: 'Cerrada', format: { fill: '#E7EAF0', font: { color: '#5A6070', bold: true } }
});
brigadas.getRange('A:A').format.columnWidth = 15;
brigadas.getRange('B:B').format.columnWidth = 38;
brigadas.getRange('C:C').format.columnWidth = 15;
brigadas.getRange('D:D').format.columnWidth = 34;
brigadas.getRange('E:E').format.columnWidth = 18;
brigadas.getRange('F:F').format.columnWidth = 15;
brigadas.getRange('G:G').format.columnWidth = 10;
brigadas.tables.add('A4:G7', true, 'BrigadasTable');

const instrucciones = wb.worksheets.add('Instrucciones');
instrucciones.showGridLines = false;
instrucciones.mergeCells('A1:B1');
instrucciones.getRange('A1').values = [['CÓMO ADMINISTRAR LAS BRIGADAS']];
instrucciones.getRange('A1:B1').format = {
  fill: '#1E3A6E', font: { bold: true, color: '#FFFFFF', size: 18 },
  horizontalAlignment: 'center', verticalAlignment: 'center', rowHeight: 34
};
instrucciones.getRange('A3:B9').values = [
  ['Paso', 'Acción'],
  ['1', 'Suba este archivo a Google Drive y ábralo como una Hoja de cálculo de Google.'],
  ['2', 'Conserve el nombre de la pestaña “Brigadas” y los encabezados de la fila 4.'],
  ['3', 'Cree una fila por brigada. Use un id único, por ejemplo BRG-004.'],
  ['4', 'Complete nombre, fecha, lugar, horario y cupos.'],
  ['5', 'Seleccione “Activa” para mostrarla en la web; “Borrador” la oculta y “Cerrada” impide nuevas inscripciones.'],
  ['6', 'Copie el ID de la Hoja de Google y configúrelo en SPREADSHEET_ID dentro de Code.gs.']
];
instrucciones.getRange('A3:B3').format = {
  fill: '#4D8A7C', font: { bold: true, color: '#FFFFFF' }, rowHeight: 26
};
instrucciones.getRange('A4:A9').format = {
  fill: '#DDEFEA', font: { bold: true, color: '#246457' },
  horizontalAlignment: 'center', verticalAlignment: 'center'
};
instrucciones.getRange('B4:B9').format = {
  fill: '#F6F9FD', font: { color: '#263A59' }, wrapText: true,
  verticalAlignment: 'center', rowHeight: 42
};
instrucciones.getRange('A:A').format.columnWidth = 10;
instrucciones.getRange('B:B').format.columnWidth = 86;

const brigadasPreview = await wb.render({ sheetName: 'Brigadas', range: 'A1:G12', scale: 1.5, format: 'png' });
await fs.writeFile(`${renderDir}/brigadas.png`, new Uint8Array(await brigadasPreview.arrayBuffer()));
const instruccionesPreview = await wb.render({ sheetName: 'Instrucciones', range: 'A1:B9', scale: 1.5, format: 'png' });
await fs.writeFile(`${renderDir}/instrucciones.png`, new Uint8Array(await instruccionesPreview.arrayBuffer()));

const check = await wb.inspect({
  kind: 'table', range: 'Brigadas!A1:G7', include: 'values,formulas', tableMaxRows: 10, tableMaxCols: 8
});
const errors = await wb.inspect({
  kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A', options: { useRegex: true, maxResults: 100 }, summary: 'error scan'
});
console.log(JSON.stringify({ outputPath, check, errors }, null, 2));
const output = await SpreadsheetFile.exportXlsx(wb);
await output.save(outputPath);
