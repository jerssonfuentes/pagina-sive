/*
 * SIVE - Tablero independiente de brigadas
 * Este proyecto debe crearse desde una Hoja de Google NUEVA y separada.
 * Lee el catálogo original y los PDF de la carpeta sin modificar las fuentes.
 */

const SOURCE_SPREADSHEET_ID = '1OiIgXuyz4fSpJuzkx3-B5iy-2s69dza3';
const SOURCE_BRIGADES_SHEET = 'Brigadas';
const BRIGADE_FOLDER_ID = '1_Gj5a4f8KvLTLtwaGJ5vcUarKUJlcuCc';
const TIME_ZONE = 'America/Bogota';
const MAX_NEW_PDFS_PER_RUN = 10;

const SUMMARY_SHEET = 'Resumen_Brigadas';
const PEOPLE_SHEET = 'Participantes';
const FILES_SHEET = 'Archivos_Carpeta';
const CACHE_SHEET = 'Datos_Procesamiento';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('SIVE Brigadas')
    .addItem('Sincronizar ahora', 'syncDashboard')
    .addItem('Configurar actualización automática', 'setupIndependentDashboard')
    .addToUi();
}

function onEdit(e) {
  if (!e || !e.range || e.range.getRow() < 2) return;
  const sheet = e.range.getSheet();
  const name = sheet.getName();
  if (name !== PEOPLE_SHEET && name !== FILES_SHEET) return;

  const attendanceColumn = name === PEOPLE_SHEET ? 6 : 8;
  if (e.range.getColumn() !== attendanceColumn) return;
  const attendance = clean_(e.value) === 'Sí' ? 'Sí' : 'No';
  const fileName = name === PEOPLE_SHEET ? clean_(sheet.getRange(e.range.getRow(), 4).getValue())
    : clean_(sheet.getRange(e.range.getRow(), 3).getValue());
  const otherSheet = e.source.getSheetByName(name === PEOPLE_SHEET ? FILES_SHEET : PEOPLE_SHEET);
  const otherFileColumn = name === PEOPLE_SHEET ? 3 : 4;
  const otherAttendanceColumn = name === PEOPLE_SHEET ? 8 : 6;
  if (!fileName || otherSheet.getLastRow() < 2) return;
  const match = otherSheet.getRange(2, otherFileColumn, otherSheet.getLastRow() - 1, 1)
    .createTextFinder(fileName).matchEntireCell(true).findNext();
  if (match) otherSheet.getRange(match.getRow(), otherAttendanceColumn).setValue(attendance);
}

// Ejecutar una sola vez desde la Hoja de Google independiente.
function setupIndependentDashboard() {
  const dashboard = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('DASHBOARD_SPREADSHEET_ID', dashboard.getId());
  ensureSheets_(dashboard);
  installTriggers_();
  syncDashboard();
  console.log('Tablero independiente configurado: ' + dashboard.getUrl());
}

function syncDashboard() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const dashboardId = PropertiesService.getScriptProperties().getProperty('DASHBOARD_SPREADSHEET_ID');
    if (!dashboardId) throw new Error('Ejecute primero setupIndependentDashboard desde la nueva Hoja de Google.');

    const dashboard = SpreadsheetApp.openById(dashboardId);
    ensureSheets_(dashboard);
    const catalog = readBrigadeCatalog_();
    const attendance = readAttendance_(dashboard);
    const indexedFiles = readExistingFiles_(dashboard.getSheetByName(CACHE_SHEET));
    Object.keys(attendance).forEach(function (fileName) {
      Object.keys(indexedFiles).forEach(function (fileId) {
        if (indexedFiles[fileId].fileName === fileName) indexedFiles[fileId].attendance = attendance[fileName];
      });
    });
    const fileRecords = scanFolder_(catalog, indexedFiles);

    writeFiles_(dashboard.getSheetByName(FILES_SHEET), fileRecords);
    writePeople_(dashboard.getSheetByName(PEOPLE_SHEET), fileRecords);
    writeCache_(dashboard.getSheetByName(CACHE_SHEET), fileRecords);
    writeSummary_(dashboard.getSheetByName(SUMMARY_SHEET), catalog, fileRecords);
  } finally {
    lock.releaseLock();
  }
}

function readBrigadeCatalog_() {
  const source = SpreadsheetApp.openById(SOURCE_SPREADSHEET_ID).getSheetByName(SOURCE_BRIGADES_SHEET);
  if (!source) throw new Error('No existe la pestaña "' + SOURCE_BRIGADES_SHEET + '" en el archivo de brigadas.');
  if (source.getLastRow() < 5) return [];

  return source.getRange(5, 1, source.getLastRow() - 4, 7).getValues()
    .filter(function (row) { return clean_(row[0]); })
    .map(function (row) {
      return {
        id: clean_(row[0]), name: clean_(row[1]),
        date: row[2] instanceof Date ? Utilities.formatDate(row[2], TIME_ZONE, 'yyyy-MM-dd') : clean_(row[2]),
        place: clean_(row[3]), schedule: clean_(row[4]), status: clean_(row[5]), capacity: clean_(row[6])
      };
    });
}

function scanFolder_(catalog, indexedFiles) {
  const records = [];
  const iterator = DriveApp.getFolderById(BRIGADE_FOLDER_ID).getFiles();
  let newPdfCount = 0;

  while (iterator.hasNext()) {
    const file = iterator.next();
    if (file.getMimeType() !== MimeType.PDF) continue;

    const previous = indexedFiles[file.getId()];
    const inferred = inferFromFileName_(file.getName(), catalog);
    let extracted = previous || null;

    if ((!previous || !previous.profession) && newPdfCount < MAX_NEW_PDFS_PER_RUN) {
      newPdfCount++;
      try {
        extracted = extractPdfData_(file);
      } catch (error) {
        extracted = {
          participant: previous ? previous.participant : inferred.participant,
          profession: previous ? previous.profession : '',
          document: previous ? previous.document : '',
          status: 'Pendiente de lectura: ' + clean_(error.message || error)
        };
      }
    }

    extracted = extracted || {};
    records.push({
      updated: file.getLastUpdated(), fileId: file.getId(), fileName: file.getName(),
      brigadeId: inferred.brigadeId, brigade: inferred.brigade,
      participant: clean_(extracted.participant || inferred.participant),
      profession: clean_(extracted.profession), document: clean_(extracted.document),
      url: 'https://drive.google.com/file/d/' + file.getId() + '/view',
      status: clean_(extracted.status || 'Leído correctamente'),
      attendance: clean_((previous && previous.attendance) || extracted.attendance) === 'Sí' ? 'Sí' : 'No'
    });
  }

  records.sort(function (a, b) { return b.updated.getTime() - a.updated.getTime(); });
  return records;
}

function extractPdfData_(file) {
  const converted = Drive.Files.create({
    name: 'TEMP_OCR_' + file.getId(),
    mimeType: 'application/vnd.google-apps.document'
  }, file.getBlob(), { ocrLanguage: 'es', fields: 'id' });

  try {
    Utilities.sleep(700);
    const text = DocumentApp.openById(converted.id).getBody().getText();
    return {
      participant: valueAfterLabel_(text, 'Nombre completo'),
      profession: valueAfterLabel_(text, 'Profesión, carrera u oficio'),
      document: valueAfterLabel_(text, 'Documento'),
      status: 'Leído correctamente'
    };
  } finally {
    DriveApp.getFileById(converted.id).setTrashed(true);
  }
}

function valueAfterLabel_(text, label) {
  const lines = String(text || '').split(/\r?\n/).map(function (line) { return line.trim(); }).filter(String);
  const target = label.toLowerCase();
  for (let index = 0; index < lines.length - 1; index++) {
    if (lines[index].toLowerCase() === target) return clean_(lines[index + 1]);
  }
  return '';
}

function inferFromFileName_(fileName, catalog) {
  const base = clean_(fileName).replace(/\.pdf$/i, '');
  for (let index = 0; index < catalog.length; index++) {
    const prefix = 'SIVE_Autorizacion_' + safePart_(catalog[index].name) + '_';
    if (base.indexOf(prefix) !== 0) continue;
    const participant = base.slice(prefix.length).replace(/_\d{4}-\d{2}-\d{2}$/, '').replace(/_/g, ' ');
    return { brigadeId: catalog[index].id, brigade: catalog[index].name, participant: participant };
  }
  return { brigadeId: '', brigade: 'No identificada', participant: '' };
}

function readExistingFiles_(sheet) {
  if (sheet.getLastRow() < 2) return {};
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
  const index = {};
  rows.forEach(function (row) {
    const fileId = clean_(row[0]);
    if (fileId) index[fileId] = {
      participant: clean_(row[1]), profession: clean_(row[2]), document: clean_(row[3]),
      status: clean_(row[4]), attendance: clean_(row[5]), fileName: clean_(row[6])
    };
  });
  return index;
}

function readAttendance_(dashboard) {
  const attendance = {};
  [
    { sheet: dashboard.getSheetByName(PEOPLE_SHEET), fileColumn: 4, attendanceColumn: 6 },
    { sheet: dashboard.getSheetByName(FILES_SHEET), fileColumn: 3, attendanceColumn: 8 }
  ].forEach(function (config) {
    if (!config.sheet || config.sheet.getLastRow() < 2) return;
    const rows = config.sheet.getRange(2, 1, config.sheet.getLastRow() - 1,
      Math.max(config.fileColumn, config.attendanceColumn)).getValues();
    rows.forEach(function (row) {
      const fileName = clean_(row[config.fileColumn - 1]);
      const value = clean_(row[config.attendanceColumn - 1]);
      if (fileName && (value === 'Sí' || value === 'No')) attendance[fileName] = value;
    });
  });
  return attendance;
}

function writeFiles_(sheet, records) {
  clearData_(sheet, Math.max(sheet.getLastColumn(), 8));
  if (!records.length) return;
  sheet.getRange(2, 1, records.length, 8).setValues(records.map(function (item) {
    return [item.updated, item.fileId, item.fileName, item.brigadeId, item.brigade, item.participant,
      item.url, item.attendance];
  }));
  sheet.getRange(2, 1, records.length, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  applyAttendanceValidation_(sheet.getRange(2, 8, records.length, 1));
}

function writePeople_(sheet, records) {
  clearData_(sheet, Math.max(sheet.getLastColumn(), 6));
  if (!records.length) return;
  sheet.getRange(2, 1, records.length, 6).setValues(records.map(function (item) {
    return [item.brigadeId, item.brigade, item.participant, item.fileName, item.url, item.attendance];
  }));
  applyAttendanceValidation_(sheet.getRange(2, 6, records.length, 1));
}

function writeCache_(sheet, records) {
  clearData_(sheet, 7);
  if (!records.length) return;
  sheet.getRange(2, 1, records.length, 7).setValues(records.map(function (item) {
    return [item.fileId, item.participant, item.profession, item.document, item.status, item.attendance, item.fileName];
  }));
}

function applyAttendanceValidation_(range) {
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(['Sí', 'No'], true)
    .setAllowInvalid(false).build();
  range.setDataValidation(rule);
}

function writeSummary_(sheet, catalog, records) {
  const rows = catalog.map(function (brigade) {
    const participants = records.filter(function (item) { return item.brigadeId === brigade.id; });
    return [
      brigade.id, brigade.name, brigade.date, brigade.place, brigade.status, participants.length,
      unique_(participants.map(function (item) { return item.profession; })).join('\n'),
      unique_(participants.map(function (item) { return item.participant; })).join('\n')
    ];
  });
  clearData_(sheet, 8, 5);
  if (rows.length) {
    sheet.getRange(5, 1, rows.length, 8).setValues(rows).setVerticalAlignment('top');
    sheet.getRange(5, 7, rows.length, 2).setWrap(true);
  }
  sheet.getRange('A2').setValue('Última actualización: ' + Utilities.formatDate(new Date(), TIME_ZONE, 'yyyy-MM-dd HH:mm:ss'));
}

function ensureSheets_(spreadsheet) {
  ensureTableSheet_(spreadsheet, FILES_SHEET, [
    'Última modificación', 'ID archivo', 'Nombre del archivo', 'ID brigada', 'Brigada',
    'Participante', 'Enlace al PDF', 'Asistencia'
  ], '#5A7090');
  ensureTableSheet_(spreadsheet, PEOPLE_SHEET, [
    'ID brigada', 'Brigada', 'Participante', 'Archivo PDF', 'Enlace', 'Asistencia'
  ], '#4D8A7C');
  const cache = ensureTableSheet_(spreadsheet, CACHE_SHEET, [
    'ID archivo', 'Participante', 'Profesión', 'Documento', 'Estado', 'Asistencia', 'Nombre archivo'
  ], '#1E3A6E');
  if (!cache.isSheetHidden()) cache.hideSheet();

  let summary = spreadsheet.getSheetByName(SUMMARY_SHEET);
  if (!summary) {
    summary = spreadsheet.insertSheet(SUMMARY_SHEET, 0);
    summary.getRange('A1:H1').merge().setValue('TABLERO INDEPENDIENTE DE BRIGADAS SIVE');
    summary.getRange('A1:H1').setBackground('#1E3A6E').setFontColor('#FFFFFF')
      .setFontWeight('bold').setFontSize(16).setHorizontalAlignment('center');
    summary.getRange('A2:H2').merge().setValue('Pendiente de primera sincronización');
    summary.getRange('A2:H2').setBackground('#EDF6F3').setFontColor('#246457').setHorizontalAlignment('center');
    summary.getRange(4, 1, 1, 8).setValues([[
      'ID', 'Brigada', 'Fecha', 'Lugar', 'Estado', 'Total personas', 'Profesiones', 'Participantes'
    ]]);
    styleHeader_(summary.getRange(4, 1, 1, 8), '#4D8A7C');
    summary.setFrozenRows(4);
    [110, 290, 120, 240, 110, 120, 320, 380].forEach(function (width, index) { summary.setColumnWidth(index + 1, width); });
  }
}

function ensureTableSheet_(spreadsheet, name, headers, color) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  const headerWidth = Math.max(sheet.getLastColumn(), headers.length);
  sheet.getRange(1, 1, 1, headerWidth).clearContent();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  styleHeader_(sheet.getRange(1, 1, 1, headers.length), color);
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, headers.length, 160);
  return sheet;
}

function styleHeader_(range, color) {
  range.setBackground(color).setFontColor('#FFFFFF').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
}

function clearData_(sheet, columns, startRow) {
  const firstRow = startRow || 2;
  const count = Math.max(sheet.getLastRow() - firstRow + 1, 0);
  if (count) sheet.getRange(firstRow, 1, count, columns).clearContent();
}

function installTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'syncDashboard') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('syncDashboard').forSpreadsheet(SOURCE_SPREADSHEET_ID).onEdit().create();
  ScriptApp.newTrigger('syncDashboard').timeBased().everyMinutes(5).create();
}

function unique_(values) {
  return values.filter(function (value, index, array) { return value && array.indexOf(value) === index; });
}

function safePart_(value) {
  return clean_(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function clean_(value) {
  return String(value == null ? '' : value).trim().slice(0, 500);
}
