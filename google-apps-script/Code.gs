/*
 * SIVE - Recepción de inscripciones de voluntariado
 * Desplegar como aplicación web que se ejecuta como el propietario.
 */

const DRIVE_FOLDER_ID = '1UrG5wYGoLIDVsbY1hZHmUEPbOK5BqQS_';
const TIME_ZONE = 'America/Bogota';

function doGet() {
  return jsonResponse_({ ok: true, service: 'SIVE voluntariado' });
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

    validateSubmission_(data);

    const now = new Date();
    const submissionId = 'SIVE-' +
      Utilities.formatDate(now, TIME_ZONE, 'yyyyMMdd-HHmmss') + '-' +
      Utilities.getUuid().slice(0, 8).toUpperCase();

    const pdfFile = createVolunteerPdf_(data, submissionId, now);

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
