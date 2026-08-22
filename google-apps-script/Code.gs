/*
 * SIVE - Recepción de inscripciones de voluntariado
 * Desplegar como aplicación web que se ejecuta como el propietario.
 */

const DRIVE_FOLDER_ID = '1UrG5wYGoLIDVsbY1hZHmUEPbOK5BqQS_';
const TIME_ZONE = 'America/Bogota';
const SPREADSHEET_ID = '1OiIgXuyz4fSpJuzkx3-B5iy-2s69dza3';
const BRIGADES_SHEET_NAME = 'Brigadas';

// Ejecute esta función una sola vez desde el editor para autorizar Drive y Google Sheets.
function authorizeSiveSetup() {
  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(BRIGADES_SHEET_NAME);
  if (!sheet) throw new Error('No existe una pestaña llamada "' + BRIGADES_SHEET_NAME + '".');
  console.log('Autorización correcta. Carpeta: ' + folder.getName() + '; hoja: ' + sheet.getName());
}

function doGet(e) {
  const action = clean_(e && e.parameter && e.parameter.action, 40);
  if (action === 'brigades') {
    const payload = getActiveBrigades_();
    const callback = clean_(e && e.parameter && e.parameter.callback, 100);
    if (callback && /^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(callback)) {
      return ContentService.createTextOutput(callback + '(' + JSON.stringify(payload) + ');')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return jsonResponse_(payload);
  }
  return jsonResponse_({ ok: true, service: 'SIVE formularios' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(20000);

    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // Campo trampa para bloquear bots básicos.
    if (data.website) {
      return jsonResponse_({ ok: true });
    }

    const submissionType = data.type === 'brigade' ? 'brigade' : 'volunteer';
    if (submissionType === 'brigade') {
      validateBrigadeSubmission_(data);
    } else {
      validateSubmission_(data);
    }

    const now = new Date();
    const submissionId = 'SIVE-' +
      Utilities.formatDate(now, TIME_ZONE, 'yyyyMMdd-HHmmss') + '-' +
      Utilities.getUuid().slice(0, 8).toUpperCase();

    const pdfFile = submissionType === 'brigade'
      ? createBrigadePdf_(data, submissionId, now)
      : createVolunteerPdf_(data, submissionId, now);

    return jsonResponse_({
      ok: true,
      submissionId: submissionId,
      fileId: pdfFile.getId()
    });
  } catch (error) {
    console.error(error);
    return jsonResponse_({ ok: false, error: String(error.message || error) });
  } finally {
    lock.releaseLock();
  }
}

function validateSubmission_(data) {
  const requiredText = [
    'nombre', 'tipo_documento', 'documento', 'fecha_nacimiento',
    'telefono', 'direccion', 'correo', 'profesion', 'institucion',
    'area', 'contacto_emergencia', 'parentesco', 'telefono_emergencia'
  ];

  requiredText.forEach(function (field) {
    if (!clean_(data[field], 500)) {
      throw new Error('Falta el campo obligatorio: ' + field);
    }
  });

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean_(data.correo, 180))) {
    throw new Error('El correo electrónico no es válido.');
  }

  ['compromiso', 'bioseguridad', 'conducto_regular', 'comunicacion_responsable', 'datos']
    .forEach(function (field) {
      if (data[field] !== true) {
        throw new Error('Debe aceptar el compromiso: ' + field);
      }
    });
}

function validateBrigadeSubmission_(data) {
  ['nombre', 'profesion', 'tipo_documento', 'documento', 'telefono', 'correo', 'brigade_id']
    .forEach(function (field) {
      if (!clean_(data[field], 500)) throw new Error('Falta el campo obligatorio: ' + field);
    });

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean_(data.correo, 180))) {
    throw new Error('El correo electrónico no es válido.');
  }

  ['participacion', 'protocolos', 'sin_relacion_laboral', 'datos_brigada']
    .forEach(function (field) {
      if (data[field] !== true) throw new Error('Debe aceptar la autorización: ' + field);
    });

  if (!findBrigadeById_(data.brigade_id)) {
    throw new Error('La brigada seleccionada no está activa o ya no existe.');
  }
}

function getActiveBrigades_() {
  if (!SPREADSHEET_ID) {
    return { ok: false, brigades: [], message: 'La programación de brigadas está pendiente de configuración.' };
  }

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(BRIGADES_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 5) return { ok: true, brigades: [] };

  const rows = sheet.getRange(5, 1, sheet.getLastRow() - 4, 7).getValues();
  const brigades = rows.filter(function (row) {
    return clean_(row[0], 80) && clean_(row[5], 30).toLowerCase() === 'activa';
  }).map(function (row) {
    const dateValue = row[2] instanceof Date
      ? Utilities.formatDate(row[2], TIME_ZONE, 'yyyy-MM-dd')
      : clean_(row[2], 40);
    return {
      id: clean_(row[0], 80), nombre: clean_(row[1], 180), fecha: dateValue,
      lugar: clean_(row[3], 250), horario: clean_(row[4], 100), cupos: clean_(row[6], 20)
    };
  });
  return { ok: true, brigades: brigades };
}

function findBrigadeById_(id) {
  const result = getActiveBrigades_();
  return (result.brigades || []).filter(function (brigade) {
    return brigade.id === clean_(id, 80);
  })[0] || null;
}

function createBrigadePdf_(data, submissionId, now) {
  const brigade = findBrigadeById_(data.brigade_id);
  if (!brigade) throw new Error('La brigada seleccionada ya no está disponible.');

  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const safeName = clean_(data.nombre, 100).normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const dateStamp = Utilities.formatDate(now, TIME_ZONE, 'yyyy-MM-dd');
  const fileName = 'SIVE_Autorizacion_Brigada_' + (safeName || 'Sin_nombre') + '_' + dateStamp + '.pdf';

  const doc = DocumentApp.create('TEMP_' + submissionId);
  const body = doc.getBody();
  body.clear();

  const title = body.appendParagraph('SIVE');
  title.setHeading(DocumentApp.ParagraphHeading.TITLE).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  title.editAsText().setForegroundColor('#1E3A6E').setBold(true);
  const subtitle = body.appendParagraph('SALUD INTEGRAL VOCACIONAL ESTUDIANTIL');
  subtitle.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  subtitle.editAsText().setForegroundColor('#4D8A7C').setBold(true).setFontSize(10);
  const heading = body.appendParagraph('AUTORIZACIÓN DE PARTICIPACIÓN EN BRIGADA DE SALUD');
  heading.setHeading(DocumentApp.ParagraphHeading.HEADING1).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  heading.editAsText().setForegroundColor('#1E3A6E').setBold(true);

  body.appendParagraph('Código de inscripción: ' + submissionId).editAsText().setBold(true).setForegroundColor('#1E3A6E');
  body.appendParagraph('Fecha y hora de aceptación: ' + Utilities.formatDate(now, TIME_ZONE, "d 'de' MMMM 'de' yyyy, HH:mm"));

  appendSection_(body, '1. Información del participante', [
    ['Nombre completo', clean_(data.nombre, 150)],
    ['Profesión, carrera u oficio', clean_(data.profesion, 150)],
    ['Documento', clean_(data.tipo_documento, 60) + ' - ' + clean_(data.documento, 60)],
    ['Teléfono', clean_(data.telefono, 60)], ['Correo electrónico', clean_(data.correo, 180)]
  ]);
  appendSection_(body, '2. Información de la brigada', [
    ['Nombre', brigade.nombre], ['Fecha', brigade.fecha], ['Lugar', brigade.lugar],
    ['Horario', brigade.horario || 'Por confirmar'], ['Cupos informados', brigade.cupos || 'No especificados']
  ]);
  appendSection_(body, '3. Declaraciones y autorizaciones', [
    ['Participación libre y voluntaria', mark_(data.participacion)],
    ['Conocimiento de funciones, responsabilidades, normas y protocolos', mark_(data.protocolos)],
    ['Ausencia de relación laboral, contractual o remuneración', mark_(data.sin_relacion_laboral)],
    ['Tratamiento de datos personales - Ley 1581 de 2012', mark_(data.datos_brigada)]
  ]);

  const declaration = body.appendParagraph('CONSTANCIA DE ACEPTACIÓN\nLa persona identificada en este documento manifestó su aceptación mediante las casillas electrónicas obligatorias del formulario de SIVE. Este registro reemplaza el espacio de firma manuscrita para esta inscripción digital, sin perjuicio de verificaciones posteriores por parte de la Corporación.');
  declaration.setSpacingBefore(14);
  declaration.editAsText().setForegroundColor('#1E3A6E');
  body.appendParagraph('Documento generado automáticamente por el sistema de inscripciones de la Corporación Salud Integral Vocacional Estudiantil SIVE.')
    .editAsText().setFontSize(8).setForegroundColor('#5A7090');

  doc.saveAndClose();
  Utilities.sleep(500);
  const tempFile = DriveApp.getFileById(doc.getId());
  const pdfFile = folder.createFile(tempFile.getAs(MimeType.PDF).setName(fileName));
  tempFile.setTrashed(true);
  return pdfFile;
}

function createVolunteerPdf_(data, submissionId, now) {
  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const safeName = clean_(data.nombre, 100)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const dateStamp = Utilities.formatDate(now, TIME_ZONE, 'yyyy-MM-dd');
  const fileName = 'SIVE_Voluntario_' + (safeName || 'Sin_nombre') + '_' + dateStamp + '.pdf';

  const doc = DocumentApp.create('TEMP_' + submissionId);
  const body = doc.getBody();
  body.clear();

  const title = body.appendParagraph('SIVE');
  title.setHeading(DocumentApp.ParagraphHeading.TITLE);
  title.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  title.editAsText().setForegroundColor('#1E3A6E').setBold(true);

  const subtitle = body.appendParagraph('SALUD INTEGRAL VOCACIONAL ESTUDIANTIL');
  subtitle.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  subtitle.editAsText().setForegroundColor('#4D8A7C').setBold(true).setFontSize(10);

  const heading = body.appendParagraph('FORMATO DE INSCRIPCIÓN DE VOLUNTARIOS');
  heading.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  heading.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  heading.editAsText().setForegroundColor('#1E3A6E').setBold(true);

  body.appendParagraph('Código de inscripción: ' + submissionId)
    .editAsText().setBold(true).setForegroundColor('#1E3A6E');
  body.appendParagraph('Fecha y hora de aceptación: ' +
    Utilities.formatDate(now, TIME_ZONE, "d 'de' MMMM 'de' yyyy, HH:mm"));

  appendSection_(body, '1. Información personal', [
    ['Nombres y apellidos', clean_(data.nombre, 150)],
    ['Documento', clean_(data.tipo_documento, 60) + ' - ' + clean_(data.documento, 60)],
    ['Fecha de nacimiento', clean_(data.fecha_nacimiento, 30)],
    ['Dirección', clean_(data.direccion, 250)],
    ['Teléfono', clean_(data.telefono, 60)],
    ['Correo electrónico', clean_(data.correo, 180)]
  ]);

  appendSection_(body, '2. Perfil y programa', [
    ['Carrera o profesión', clean_(data.profesion, 150)],
    ['Universidad o institución', clean_(data.institucion, 180)],
    ['Área de interés', clean_(data.area, 100)]
  ]);

  appendSection_(body, '3. Contacto de emergencia', [
    ['Nombre completo', clean_(data.contacto_emergencia, 150)],
    ['Parentesco o relación', clean_(data.parentesco, 80)],
    ['Teléfono', clean_(data.telefono_emergencia, 60)]
  ]);

  appendSection_(body, '4. Compromisos y autorizaciones', [
    ['Participación voluntaria, normas internas y ausencia de relación laboral', mark_(data.compromiso)],
    ['Protocolos de bioseguridad', mark_(data.bioseguridad)],
    ['Cadena de mando y conducto regular', mark_(data.conducto_regular)],
    ['Comunicación responsable y uso de redes sociales', mark_(data.comunicacion_responsable)],
    ['Tratamiento de datos personales - Ley 1581 de 2012', mark_(data.datos)],
    ['Uso institucional de imagen', data.imagen === true ? 'AUTORIZADO' : 'NO AUTORIZADO (opcional)']
  ]);

  const declaration = body.appendParagraph(
    'CONSTANCIA DE ACEPTACIÓN\n' +
    'La persona identificada en este documento manifestó su aceptación mediante las casillas ' +
    'electrónicas obligatorias del formulario de SIVE. Este registro sustituye el espacio de firma ' +
    'manuscrita para efectos de la inscripción digital, sin perjuicio de las verificaciones adicionales ' +
    'que pueda solicitar la Corporación.'
  );
  declaration.setSpacingBefore(14);
  declaration.editAsText().setForegroundColor('#1E3A6E');

  body.appendParagraph(
    'Documento generado automáticamente por el sistema de inscripciones de la Corporación Salud ' +
    'Integral Vocacional Estudiantil SIVE.'
  ).editAsText().setFontSize(8).setForegroundColor('#5A7090');

  doc.saveAndClose();
  Utilities.sleep(500);

  const tempFile = DriveApp.getFileById(doc.getId());
  const pdfBlob = tempFile.getAs(MimeType.PDF).setName(fileName);
  const pdfFile = folder.createFile(pdfBlob);
  tempFile.setTrashed(true);

  return pdfFile;
}

function appendSection_(body, title, rows) {
  const heading = body.appendParagraph(title);
  heading.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  heading.setSpacingBefore(12);
  heading.editAsText().setForegroundColor('#1E3A6E').setBold(true);

  const table = body.appendTable(rows);
  table.setBorderColor('#D4E1F0');

  for (let rowIndex = 0; rowIndex < table.getNumRows(); rowIndex++) {
    const row = table.getRow(rowIndex);
    row.getCell(0).setBackgroundColor('#EDF2FB');
    row.getCell(0).editAsText().setBold(true).setForegroundColor('#1E3A6E');
    row.getCell(1).editAsText().setForegroundColor('#263A59');
  }
}

function mark_(value) {
  return value === true ? 'ACEPTADO' : 'NO ACEPTADO';
}

function clean_(value, maxLength) {
  return String(value == null ? '' : value).trim().slice(0, maxLength || 500);
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
