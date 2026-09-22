/* SIVE - Tablero independiente de brigadas.
 * Pega TODO este archivo en Apps Script abierto desde una Hoja de Google NUEVA.
 * No requiere Drive API: usa las inscripciones guardadas por el receptor SIVE.
 */
const SOURCE_SPREADSHEET_ID = '1OiIgXuyz4fSpJuzkx3-B5iy-2s69dza3';
const SOURCE_BRIGADES_SHEET = 'Brigadas';
const SOURCE_REGISTRATIONS_SHEET = 'Inscripciones_Brigadas';
const TIME_ZONE = 'America/Bogota';
const SUMMARY_SHEET = 'Resumen_Brigadas';
const PEOPLE_SHEET = 'Participantes';
const ATTENDANCE_SHEET = 'Asistencia_Brigadas';
const ALL_BRIGADES_OPTION = 'Todas las brigadas';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('SIVE Brigadas')
    .addItem('Sincronizar ahora', 'syncDashboard')
    .addItem('Configurar tablero', 'setupIndependentDashboard').addToUi();
}

function setupIndependentDashboard() {
  const dashboard = SpreadsheetApp.getActiveSpreadsheet();
  if (!dashboard) throw new Error('Abra Apps Script desde una Hoja de cálculo de Google.');
  PropertiesService.getScriptProperties().setProperty('DASHBOARD_SPREADSHEET_ID', dashboard.getId());
  ensureSheets_(dashboard); installTriggers_(); syncDashboard();
}

function syncDashboard() {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const id = PropertiesService.getScriptProperties().getProperty('DASHBOARD_SPREADSHEET_ID');
    if (!id) throw new Error('Ejecute primero setupIndependentDashboard.');
    const dashboard = SpreadsheetApp.openById(id); ensureSheets_(dashboard);
    const catalog = readCatalog_();
    const participants = readRegistrations_();
    writeSummary_(dashboard.getSheetByName(SUMMARY_SHEET), catalog, participants);
    writePeople_(dashboard.getSheetByName(PEOPLE_SHEET), catalog, participants);
  } finally { lock.releaseLock(); }
}

function readCatalog_() {
  const sheet = SpreadsheetApp.openById(SOURCE_SPREADSHEET_ID).getSheetByName(SOURCE_BRIGADES_SHEET);
  if (!sheet || sheet.getLastRow() < 5) return [];
  return sheet.getRange(5,1,sheet.getLastRow()-4,7).getValues().filter(function (r) { return clean_(r[0]); }).map(function (r) {
    return { id:clean_(r[0]), name:clean_(r[1]), date:r[2] instanceof Date ? Utilities.formatDate(r[2],TIME_ZONE,'yyyy-MM-dd') : clean_(r[2]), place:clean_(r[3]), schedule:clean_(r[4]), status:clean_(r[5]), capacity:clean_(r[6]) };
  });
}

function readRegistrations_() {
  const sheet = SpreadsheetApp.openById(SOURCE_SPREADSHEET_ID).getSheetByName(SOURCE_REGISTRATIONS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2,1,sheet.getLastRow()-1,11).getValues().map(function (r) {
    return { registered:r[0], code:clean_(r[1]), brigadeId:clean_(r[2]), brigade:clean_(r[3]), participant:clean_(r[4]), profession:clean_(r[5]), phone:clean_(r[8]), email:clean_(r[9]), pdf:clean_(r[10]) };
  });
}

function writeSummary_(sheet, catalog, people) {
  clearBelow_(sheet, 5, 8);
  const rows = catalog.map(function (b) {
    const enrolled = people.filter(function (p) { return p.brigadeId === b.id; });
    return [b.id,b.name,b.date,b.place,b.status,enrolled.length,unique_(enrolled.map(function(p){return p.profession;})).join('\n'),unique_(enrolled.map(function(p){return p.participant;})).join('\n')];
  });
  if (rows.length) sheet.getRange(5,1,rows.length,8).setValues(rows).setVerticalAlignment('top').setWrap(true);
  sheet.getRange('A2').setValue('Última actualización: ' + Utilities.formatDate(new Date(),TIME_ZONE,'yyyy-MM-dd HH:mm:ss'));
}

function writePeople_(sheet, catalog, people) {
  const options = [ALL_BRIGADES_OPTION].concat(catalog.map(function(b){return b.name;}));
  const selected = options.indexOf(clean_(sheet.getRange('B1').getValue())) >= 0 ? clean_(sheet.getRange('B1').getValue()) : ALL_BRIGADES_OPTION;
  sheet.getRange('A1').setValue('Selecciona una brigada:').setFontWeight('bold').setFontColor('#1E3A6E');
  sheet.getRange('B1').setValue(selected).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(options,true).setAllowInvalid(false).build()).setBackground('#EDF6F3');
  sheet.getRange(3,1,1,7).setValues([['ID brigada','Brigada','Participante','Profesión','Teléfono','PDF','Asistencia']]); styleHeader_(sheet.getRange(3,1,1,7),'#4D8A7C');
  const filter = selected === ALL_BRIGADES_OPTION ? people : people.filter(function(p){return p.brigade === selected;});
  const attendance = readAttendance_(sheet.getParent());
  clearBelow_(sheet,4,7);
  if (!filter.length) { sheet.getRange('A4').setValue('No hay participantes registrados para esta selección.'); return; }
  sheet.getRange(4,1,filter.length,7).setValues(filter.map(function(p){ return [p.brigadeId,p.brigade,p.participant,p.profession,p.phone,p.pdf,attendance[p.brigadeId + '|' + p.participant] || 'No']; }));
  sheet.getRange(4,7,filter.length,1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Sí','No'],true).setAllowInvalid(false).build());
}

function onEdit(e) {
  if (!e || !e.range || e.range.getSheet().getName() !== PEOPLE_SHEET) return;
  if (e.range.getA1Notation() === 'B1') { syncDashboard(); return; }
  if (e.range.getRow() < 4 || e.range.getColumn() !== 7) return;
  const sheet = e.range.getSheet(); const code = clean_(sheet.getRange(e.range.getRow(),1).getValue()) + '|' + clean_(sheet.getRange(e.range.getRow(),3).getValue());
  let attendance = e.source.getSheetByName(ATTENDANCE_SHEET); if (!attendance) attendance = e.source.insertSheet(ATTENDANCE_SHEET);
  if (attendance.getLastRow() === 0) attendance.appendRow(['Clave','Asistencia']);
  const found = attendance.getRange('A:A').createTextFinder(code).matchEntireCell(true).findNext();
  if (found) attendance.getRange(found.getRow(),2).setValue(clean_(e.value) === 'Sí' ? 'Sí' : 'No'); else attendance.appendRow([code,clean_(e.value) === 'Sí' ? 'Sí' : 'No']);
}

function readAttendance_(spreadsheet) {
  const sheet=spreadsheet.getSheetByName(ATTENDANCE_SHEET), out={}; if(!sheet || sheet.getLastRow()<2) return out;
  sheet.getRange(2,1,sheet.getLastRow()-1,2).getValues().forEach(function(r){out[clean_(r[0])] = clean_(r[1]);}); return out;
}

function ensureSheets_(ss) {
  let summary=ss.getSheetByName(SUMMARY_SHEET); if(!summary) { summary=ss.insertSheet(SUMMARY_SHEET,0); summary.getRange('A1:H1').merge().setValue('TABLERO DE BRIGADAS SIVE').setBackground('#1E3A6E').setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(16).setHorizontalAlignment('center'); summary.getRange(4,1,1,8).setValues([['ID','Brigada','Fecha','Lugar','Estado','Total personas','Profesiones','Participantes']]); styleHeader_(summary.getRange(4,1,1,8),'#4D8A7C'); summary.setFrozenRows(4); [110,260,120,230,100,110,300,300].forEach(function(w,i){summary.setColumnWidth(i+1,w);}); }
  let people=ss.getSheetByName(PEOPLE_SHEET); if(!people) people=ss.insertSheet(PEOPLE_SHEET); people.setFrozenRows(3); [110,250,230,180,130,280,110].forEach(function(w,i){people.setColumnWidth(i+1,w);});
}

function installTriggers_() { ScriptApp.getProjectTriggers().forEach(function(t){if(t.getHandlerFunction()==='syncDashboard') ScriptApp.deleteTrigger(t);}); ScriptApp.newTrigger('syncDashboard').timeBased().everyMinutes(1).create(); }
function clearBelow_(sheet,row,columns) { const n=Math.max(sheet.getLastRow()-row+1,0); if(n) sheet.getRange(row,1,n,columns).clearContent().clearDataValidations(); }
function styleHeader_(range,color) { range.setBackground(color).setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center'); }
function unique_(items) { return items.filter(function(v,i,a){return v && a.indexOf(v)===i;}); }
function clean_(value) { return String(value == null ? '' : value).trim().slice(0,500); }
