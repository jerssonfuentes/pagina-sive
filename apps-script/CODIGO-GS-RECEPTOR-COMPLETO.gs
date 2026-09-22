/* SIVE - Recepción de voluntarios e inscripciones a brigadas.
 * Pega TODO este archivo en el Apps Script publicado como aplicación web.
 */
const DRIVE_FOLDER_ID = '1UrG5wYGoLIDVsbY1hZHmUEPbOK5BqQS_';
const BRIGADE_DRIVE_FOLDER_ID = '1_Gj5a4f8KvLTLtwaGJ5vcUarKUJlcuCc';
const TIME_ZONE = 'America/Bogota';
const SPREADSHEET_ID = '1OiIgXuyz4fSpJuzkx3-B5iy-2s69dza3';
const BRIGADES_SHEET_NAME = 'Brigadas';
const BRIGADE_REGISTRATIONS_SHEET = 'Inscripciones_Brigadas';

function authorizeSiveSetup() {
  const volunteers = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const brigades = DriveApp.getFolderById(BRIGADE_DRIVE_FOLDER_ID);
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(BRIGADES_SHEET_NAME);
  if (!sheet) throw new Error('No existe la pestaña "Brigadas".');
  console.log('Autorización correcta: ' + volunteers.getName() + ' / ' + brigades.getName());
}

function doGet(e) {
  const action = clean_(e && e.parameter && e.parameter.action, 40);
  const payload = action === 'brigades' ? getActiveBrigades_() : { ok: true, service: 'SIVE formularios' };
  const callback = clean_(e && e.parameter && e.parameter.callback, 100);
  if (action === 'brigades' && callback && /^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + JSON.stringify(payload) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return jsonResponse_(payload);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    lock.waitLock(20000); locked = true;
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (data.website) return jsonResponse_({ ok: true });
    const isBrigade = data.type === 'brigade';
    isBrigade ? validateBrigadeSubmission_(data) : validateVolunteerSubmission_(data);
    const now = new Date();
    const id = 'SIVE-' + Utilities.formatDate(now, TIME_ZONE, 'yyyyMMdd-HHmmss') + '-' + Utilities.getUuid().slice(0, 8).toUpperCase();
    const file = isBrigade ? createBrigadePdf_(data, id, now) : createVolunteerPdf_(data, id, now);
    return jsonResponse_({ ok: true, submissionId: id, fileId: file.getId() });
  } catch (error) {
    console.error(error);
    return jsonResponse_({ ok: false, error: String(error.message || error) });
  } finally {
    if (locked) lock.releaseLock();
  }
}

function validateVolunteerSubmission_(data) {
  ['nombre','tipo_documento','documento','fecha_nacimiento','telefono','direccion','correo','profesion','institucion','area','contacto_emergencia','parentesco','telefono_emergencia'].forEach(function (key) {
    if (!clean_(data[key], 500)) throw new Error('Falta el campo obligatorio: ' + key);
  });
  if (!validEmail_(data.correo)) throw new Error('El correo electrónico no es válido.');
  ['compromiso','bioseguridad','conducto_regular','comunicacion_responsable','datos'].forEach(function (key) {
    if (data[key] !== true) throw new Error('Debe aceptar el compromiso: ' + key);
  });
}

function validateBrigadeSubmission_(data) {
  ['nombre','profesion','tipo_documento','documento','telefono','correo','brigade_id'].forEach(function (key) {
    if (!clean_(data[key], 500)) throw new Error('Falta el campo obligatorio: ' + key);
  });
  if (!validEmail_(data.correo)) throw new Error('El correo electrónico no es válido.');
  ['participacion','protocolos','sin_relacion_laboral','datos_brigada'].forEach(function (key) {
    if (data[key] !== true) throw new Error('Debe aceptar la autorización: ' + key);
  });
  if (!brigadeFromSubmission_(data)) throw new Error('La brigada seleccionada ya no está disponible.');
}

function validEmail_(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean_(email, 180)); }

function getActiveBrigades_() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(BRIGADES_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 5) return { ok: true, brigades: [] };
  const rows = sheet.getRange(5, 1, sheet.getLastRow() - 4, 7).getValues();
  const brigades = rows.filter(function (row) {
    return clean_(row[0], 80) && clean_(row[5], 30).toLowerCase() === 'activa';
  }).map(function (row) {
    return {
      id: clean_(row[0],80), nombre: clean_(row[1],180),
      fecha: row[2] instanceof Date ? Utilities.formatDate(row[2], TIME_ZONE, 'yyyy-MM-dd') : clean_(row[2],40),
      lugar: clean_(row[3],250), horario: clean_(row[4],100), cupos: clean_(row[6],20)
    };
  });
  return { ok: true, brigades: brigades };
}

function findBrigadeById_(id) {
  return getActiveBrigades_().brigades.filter(function (brigade) { return brigade.id === clean_(id,80); })[0] || null;
}

function brigadeFromSubmission_(data) {
  const scheduled = findBrigadeById_(data.brigade_id);
  if (scheduled) return scheduled;
  const submitted = data.brigade;
  if (!submitted || typeof submitted !== 'object') return null;
  if (!clean_(submitted.nombre, 180)) return null;
  return { id: clean_(submitted.id || data.brigade_id, 80), nombre: clean_(submitted.nombre, 180), fecha: clean_(submitted.fecha, 40), lugar: clean_(submitted.lugar, 250), horario: clean_(submitted.horario, 100), cupos: clean_(submitted.cupos, 20) };
}

function createBrigadePdf_(data, submissionId, now) {
  const brigade = brigadeFromSubmission_(data);
  if (!brigade) throw new Error('La brigada seleccionada ya no está disponible.');
  const folder = getOrCreateBrigadeFolder_(brigade);
  const name = safePart_(data.nombre) || 'Sin_nombre';
  const brigadeName = safePart_(brigade.nombre) || 'Brigada';
  const stamp = Utilities.formatDate(now, TIME_ZONE, 'yyyy-MM-dd');
  const fileName = 'SIVE_Autorizacion_' + brigadeName + '_' + name + '_' + stamp + '.pdf';
  const file = buildPdf_(submissionId, fileName, [
    ['AUTORIZACIÓN DE PARTICIPACIÓN EN BRIGADA DE SALUD', ''],
    ['Código de inscripción', submissionId], ['Fecha y hora', Utilities.formatDate(now, TIME_ZONE, "d 'de' MMMM 'de' yyyy, HH:mm")],
    ['Nombre completo', clean_(data.nombre,150)], ['Profesión, carrera u oficio', clean_(data.profesion,150)],
    ['Documento', clean_(data.tipo_documento,60) + ' - ' + clean_(data.documento,60)], ['Teléfono', clean_(data.telefono,60)], ['Correo electrónico', clean_(data.correo,180)],
    ['Brigada', brigade.nombre], ['Fecha de brigada', brigade.fecha], ['Lugar', brigade.lugar], ['Horario', brigade.horario || 'Por confirmar'],
    ['Participación libre y voluntaria', mark_(data.participacion)], ['Funciones y protocolos', mark_(data.protocolos)],
    ['Sin relación laboral o remuneración', mark_(data.sin_relacion_laboral)], ['Tratamiento de datos personales', mark_(data.datos_brigada)]
  ], folder);
  registerBrigadeParticipant_(data, brigade, submissionId, file, now);
  return file;
}

function createVolunteerPdf_(data, submissionId, now) {
  const stamp = Utilities.formatDate(now, TIME_ZONE, 'yyyy-MM-dd');
  const fileName = 'SIVE_Voluntario_' + (safePart_(data.nombre) || 'Sin_nombre') + '_' + stamp + '.pdf';
  return buildPdf_(submissionId, fileName, [
    ['FORMATO DE INSCRIPCIÓN DE VOLUNTARIOS', ''], ['Código de inscripción', submissionId],
    ['Fecha y hora', Utilities.formatDate(now, TIME_ZONE, "d 'de' MMMM 'de' yyyy, HH:mm")], ['Nombre completo', clean_(data.nombre,150)],
    ['Documento', clean_(data.tipo_documento,60) + ' - ' + clean_(data.documento,60)], ['Fecha de nacimiento', clean_(data.fecha_nacimiento,30)],
    ['Dirección', clean_(data.direccion,250)], ['Teléfono', clean_(data.telefono,60)], ['Correo electrónico', clean_(data.correo,180)],
    ['Carrera o profesión', clean_(data.profesion,150)], ['Universidad o institución', clean_(data.institucion,180)], ['Área de interés', clean_(data.area,100)],
    ['Contacto de emergencia', clean_(data.contacto_emergencia,150)], ['Parentesco', clean_(data.parentesco,80)], ['Teléfono emergencia', clean_(data.telefono_emergencia,60)],
    ['Participación y normas internas', mark_(data.compromiso)], ['Bioseguridad', mark_(data.bioseguridad)], ['Conducto regular', mark_(data.conducto_regular)],
    ['Comunicación responsable', mark_(data.comunicacion_responsable)], ['Tratamiento de datos personales', mark_(data.datos)], ['Uso de imagen', data.imagen === true ? 'AUTORIZADO' : 'NO AUTORIZADO']
  ], DriveApp.getFolderById(DRIVE_FOLDER_ID));
}

function buildPdf_(submissionId, fileName, rows, folder) {
  const doc = DocumentApp.create('TEMP_' + submissionId);
  const body = doc.getBody(); body.clear();
  const logo = body.appendParagraph('SIVE'); logo.setAlignment(DocumentApp.HorizontalAlignment.CENTER); logo.setHeading(DocumentApp.ParagraphHeading.TITLE); logo.editAsText().setForegroundColor('#1E3A6E').setBold(true);
  const subtitle = body.appendParagraph('SALUD INTEGRAL VOCACIONAL ESTUDIANTIL'); subtitle.setAlignment(DocumentApp.HorizontalAlignment.CENTER); subtitle.editAsText().setForegroundColor('#4D8A7C').setBold(true).setFontSize(10);
  const title = body.appendParagraph(rows.shift()[0]); title.setAlignment(DocumentApp.HorizontalAlignment.CENTER); title.setHeading(DocumentApp.ParagraphHeading.HEADING1); title.editAsText().setForegroundColor('#1E3A6E').setBold(true);
  const table = body.appendTable(rows);
  for (let i = 0; i < table.getNumRows(); i++) { table.getRow(i).getCell(0).setBackgroundColor('#EDF2FB'); table.getRow(i).getCell(0).editAsText().setBold(true).setForegroundColor('#1E3A6E'); }
  body.appendParagraph('Constancia de aceptación: la persona aceptó electrónicamente las condiciones obligatorias del formulario SIVE.').setSpacingBefore(14);
  body.appendParagraph('Documento generado automáticamente por SIVE.').editAsText().setFontSize(8).setForegroundColor('#5A7090');
  doc.saveAndClose(); Utilities.sleep(500);
  const temporary = DriveApp.getFileById(doc.getId());
  const pdf = folder.createFile(temporary.getAs(MimeType.PDF).setName(fileName));
  temporary.setTrashed(true); return pdf;
}

function getOrCreateBrigadeFolder_(brigade) {
  const root = DriveApp.getFolderById(BRIGADE_DRIVE_FOLDER_ID);
  const folderName = clean_(brigade.id,80) + '_' + (safePart_(brigade.nombre) || 'Brigada');
  const matches = root.getFoldersByName(folderName);
  return matches.hasNext() ? matches.next() : root.createFolder(folderName);
}

function registerBrigadeParticipant_(data, brigade, submissionId, pdf, now) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(BRIGADE_REGISTRATIONS_SHEET);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(BRIGADE_REGISTRATIONS_SHEET);
    sheet.appendRow(['Fecha de inscripción','Código','ID brigada','Brigada','Participante','Profesión','Tipo documento','Documento','Teléfono','Correo','PDF']);
    sheet.getRange(1,1,1,11).setFontWeight('bold').setBackground('#1E3A6E').setFontColor('#FFFFFF'); sheet.setFrozenRows(1);
  }
  sheet.appendRow([now, submissionId, brigade.id, brigade.nombre, clean_(data.nombre,150), clean_(data.profesion,150), clean_(data.tipo_documento,60), clean_(data.documento,60), clean_(data.telefono,60), clean_(data.correo,180), pdf.getUrl()]);
}

function mark_(value) { return value === true ? 'ACEPTADO' : 'NO ACEPTADO'; }
function safePart_(value) { return clean_(value,120).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'_').replace(/^_+|_+$/g,''); }
function clean_(value, max) { return String(value == null ? '' : value).trim().slice(0, max || 500); }
function jsonResponse_(payload) { return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON); }
