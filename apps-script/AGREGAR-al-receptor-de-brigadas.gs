/*
 * AGREGA SOLO ESTOS CAMBIOS AL CÓDIGO.GS RECEPTOR QUE YA TIENES.
 * No borres ni reemplaces el resto de tu archivo.
 */

// 1. Debajo de: const BRIGADES_SHEET_NAME = 'Brigadas'; agrega esta constante:
const BRIGADE_REGISTRATIONS_SHEET = 'Inscripciones_Brigadas';

// 2. Dentro de createBrigadePdf_, reemplaza SOLO esta línea:
// const folder = DriveApp.getFolderById(BRIGADE_DRIVE_FOLDER_ID);
// por esta:
// const folder = getOrCreateBrigadeFolder_(brigade);

// 3. Dentro de createBrigadePdf_, después de esta línea:
// const pdfFile = folder.createFile(tempFile.getAs(MimeType.PDF).setName(fileName));
// agrega esta línea:
// registerBrigadeParticipant_(data, brigade, submissionId, pdfFile, now);

// 4. Pega estas funciones AL FINAL del mismo Código.gs receptor:
function getOrCreateBrigadeFolder_(brigade) {
  const root = DriveApp.getFolderById(BRIGADE_DRIVE_FOLDER_ID);
  const safeName = clean_(brigade.nombre, 120).normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const folderName = clean_(brigade.id, 80) + '_' + (safeName || 'Brigada');
  const matches = root.getFoldersByName(folderName);
  return matches.hasNext() ? matches.next() : root.createFolder(folderName);
}

function registerBrigadeParticipant_(data, brigade, submissionId, pdfFile, now) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(BRIGADE_REGISTRATIONS_SHEET);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(BRIGADE_REGISTRATIONS_SHEET);
    sheet.appendRow([
      'Fecha de inscripción', 'Código', 'ID brigada', 'Brigada', 'Participante',
      'Profesión', 'Tipo documento', 'Documento', 'Teléfono', 'Correo', 'PDF'
    ]);
    sheet.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#1E3A6E').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  sheet.appendRow([
    now, submissionId, brigade.id, brigade.nombre, clean_(data.nombre, 150),
    clean_(data.profesion, 150), clean_(data.tipo_documento, 60), clean_(data.documento, 60),
    clean_(data.telefono, 60), clean_(data.correo, 180), pdfFile.getUrl()
  ]);
}
