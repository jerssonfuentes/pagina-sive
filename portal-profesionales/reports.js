import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { collection, doc, getDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const ORGANIZATION_ID = 'sive';
const $ = (selector, root = document) => root.querySelector(selector);
let professional = null;
let stopReports = null;
let reports = { clinical: [], triage: [], psychology: [] };

function safe(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function reportArea(record, source) {
  if (source === 'triage') return 'Triage general';
  if (source === 'psychology') return 'Psicología';
  return ({ medicina: 'Medicina', fonoaudiologia: 'Fonoaudiología', fisioterapia: 'Fisioterapia', odontologia: 'Odontología', optometria: 'Optometría' })[record.area] || 'Medicina';
}

function allReports() {
  return [
    ...reports.clinical.map(record => ({ ...record, source: 'clinical' })),
    ...reports.triage.map(record => ({ ...record, source: 'triage' })),
    ...reports.psychology.map(record => ({ ...record, source: 'psychology' }))
  ].filter(record => record.organizationId === ORGANIZATION_ID)
    .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
}

function formatDate(value) {
  if (!value) return 'Sin fecha';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function metadataForm(form) {
  if (!form || form.dataset.reportMetadata === 'true') return;
  form.dataset.reportMetadata = 'true';
  if (!form.elements.brigadeName) {
    const field = document.createElement('label');
    field.className = 'report-brigade-field';
    field.innerHTML = 'Nombre de la brigada<input name="brigadeName" placeholder="Ej. Brigada de salud comunitaria" autocomplete="organization">';
    const destination = form.id === 'psychologyForm' ? form.querySelector('.psych-identity-grid') : form.querySelector('.fields');
    if (destination) destination.append(field);
  }
}

function enhanceForms() {
  ['triageForm', 'psychologyForm', 'fonoForm', 'physioForm'].forEach(id => metadataForm(document.getElementById(id)));
  const medical = document.getElementById('clinicalForm');
  if (medical && medical.dataset.reportMetadata !== 'true') {
    medical.dataset.reportMetadata = 'true';
    const section = document.createElement('section');
    section.className = 'form-card report-brigade-card';
    section.innerHTML = '<div class="section-title"><h2>Datos del informe</h2><p>Estos datos permiten organizar el registro en la plataforma de informes.</p></div><div class="fields"><div class="field full"><label>Nombre de la brigada<input name="brigadeName" placeholder="Ej. Brigada de salud comunitaria" autocomplete="organization"></label></div></div>';
    medical.querySelector('#formSections')?.prepend(section);
  }
}

function addProfessionalMetadata(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !['clinicalForm', 'triageForm', 'psychologyForm', 'fonoForm', 'physioForm'].includes(form.id)) return;
  if (!form.elements.professionalName) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'professionalName';
    input.value = professional?.name || auth.currentUser?.email || 'Profesional no identificado';
    form.append(input);
  }
}

function drawReports() {
  const app = $('#app');
  const list = allReports();
  const areaFilter = $('#reportArea', app)?.value || '';
  const brigadeFilter = $('#reportBrigade', app)?.value || '';
  const professionalFilter = $('#reportProfessional', app)?.value || '';
  const filtered = list.filter(record => {
    const area = reportArea(record, record.source);
    return (!areaFilter || area === areaFilter)
      && (!brigadeFilter || (record.brigadeName || 'Sin brigada') === brigadeFilter)
      && (!professionalFilter || (record.professionalName || 'No registrado') === professionalFilter);
  });
  const areas = [...new Set(list.map(record => reportArea(record, record.source)))].sort();
  const brigades = [...new Set(list.map(record => record.brigadeName || 'Sin brigada'))].sort();
  const professionals = [...new Set(list.map(record => record.professionalName || 'No registrado'))].sort();
  const selected = { area: areaFilter, brigade: brigadeFilter, professional: professionalFilter };
  const selectOptions = (items, selectedValue, title) => `<option value="">${title}</option>${items.map(value => `<option ${value === selectedValue ? 'selected' : ''}>${safe(value)}</option>`).join('')}`;
  app.innerHTML = `<section class="page reports-page"><div class="reports-hero"><div><p class="eyebrow">COORDINACIÓN SIVE</p><h1>Informes clínicos</h1><p>Consolidado automático de los registros guardados por cada especialidad.</p></div><div class="reports-total"><strong>${list.length}</strong><span>informes disponibles</span></div></div><section class="reports-filters"><label>Área<select id="reportArea">${selectOptions(areas, selected.area, 'Todas las áreas')}</select></label><label>Brigada<select id="reportBrigade">${selectOptions(brigades, selected.brigade, 'Todas las brigadas')}</select></label><label>Profesional<select id="reportProfessional">${selectOptions(professionals, selected.professional, 'Todos los profesionales')}</select></label></section><p class="reports-count">${filtered.length} resultado${filtered.length === 1 ? '' : 's'}</p><section class="reports-list">${filtered.map(record => `<article class="report-card"><div class="report-card-head"><span class="report-area">${safe(reportArea(record, record.source))}</span><time>${safe(formatDate(record.visitDate || record.createdAt?.slice?.(0, 10)))}</time></div><h2>${safe(record.patientName || record.name || 'Paciente sin nombre')}</h2><dl><div><dt>Brigada</dt><dd>${safe(record.brigadeName || 'Sin brigada')}</dd></div><div><dt>Profesional que atendió</dt><dd>${safe(record.professionalName || 'No registrado')}</dd></div><div><dt>Tipo de registro</dt><dd>${safe(record.formType || (record.source === 'triage' ? 'Triage' : 'Valoración clínica'))}</dd></div></dl></article>`).join('') || '<div class="empty"><div>▤</div><h2>No hay informes con estos filtros</h2><p>Los registros aparecerán aquí automáticamente al guardarse.</p></div>'}</section></section>`;
  app.querySelectorAll('select').forEach(select => select.addEventListener('change', drawReports));
}

function downloadCsv(records) {
  const headers = ['Paciente', 'Área', 'Brigada', 'Profesional que atendió', 'Fecha', 'Tipo de registro'];
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const lines = records.map(record => [record.patientName || record.name || 'Paciente sin nombre', reportArea(record, record.source), record.brigadeName || 'Sin brigada', record.professionalName || 'No registrado', record.visitDate || '', record.formType || (record.source === 'triage' ? 'Triage' : 'Valoración clínica')].map(quote).join(','));
  const file = new Blob([[headers.map(quote).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  link.download = `informes-sive-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function drawReportsV2() {
  const app = $('#app');
  const all = allReports();
  const previous = {
    area: $('#reportArea', app)?.value || '', brigade: $('#reportBrigade', app)?.value || '', professional: $('#reportProfessional', app)?.value || '',
    start: $('#reportStart', app)?.value || '', end: $('#reportEnd', app)?.value || '', search: $('#reportSearch', app)?.value || ''
  };
  const areas = [...new Set(all.map(record => reportArea(record, record.source)))].sort();
  const brigades = [...new Set(all.map(record => record.brigadeName || 'Sin brigada'))].sort();
  const professionals = [...new Set(all.map(record => record.professionalName || 'No registrado'))].sort();
  const selectOptions = (items, selected, first) => `<option value="">${first}</option>${items.map(item => `<option value="${safe(item)}" ${item === selected ? 'selected' : ''}>${safe(item)}</option>`).join('')}`;
  const current = all.filter(record => {
    const date = record.visitDate || record.createdAt?.slice?.(0, 10) || '';
    const text = `${record.patientName || record.name || ''} ${record.brigadeName || ''} ${record.professionalName || ''}`.toLowerCase();
    return (!previous.area || reportArea(record, record.source) === previous.area)
      && (!previous.brigade || (record.brigadeName || 'Sin brigada') === previous.brigade)
      && (!previous.professional || (record.professionalName || 'No registrado') === previous.professional)
      && (!previous.start || date >= previous.start) && (!previous.end || date <= previous.end)
      && (!previous.search || text.includes(previous.search.toLowerCase()));
  });
  const totalAreas = new Set(all.map(record => reportArea(record, record.source))).size;
  const summary = [
    ['👥', 'Informe de atenciones', `${all.length} atenciones registradas`, 'blue'],
    ['▥', 'Informe de servicios', `${totalAreas} áreas con registros`, 'green'],
    ['⌁', 'Informe de brigadas', `${brigades.filter(item => item !== 'Sin brigada').length} brigadas registradas`, 'purple'],
    ['♙', 'Informe de profesionales', `${professionals.filter(item => item !== 'No registrado').length} profesionales`, 'orange']
  ];
  app.innerHTML = `<section class="page reports-page reports-v2"><header class="report-titlebar"><div class="report-title-icon">▥</div><div><h1>Informes</h1><p>Consulta y genera informes de la gestión en salud de la Corporación SIVE.</p></div><button id="generateReport" class="report-generate" type="button">⇩ Generar informe</button></header><section class="report-filter-panel"><label>Tipo de informe<select id="reportArea">${selectOptions(areas, previous.area, 'Todos')}</select></label><label>Fecha inicio<input id="reportStart" type="date" value="${safe(previous.start)}"></label><label>Fecha fin<input id="reportEnd" type="date" value="${safe(previous.end)}"></label><label>Brigada<select id="reportBrigade">${selectOptions(brigades, previous.brigade, 'Todas')}</select></label><label>Profesional<select id="reportProfessional">${selectOptions(professionals, previous.professional, 'Todos')}</select></label><button id="filterReports" class="report-filter-button" type="button">⌕ Filtrar</button></section><section class="report-summary-cards">${summary.map(([icon, title, text, tone]) => `<article class="report-summary ${tone}"><span>${icon}</span><div><h2>${title}</h2><p>${text}</p></div><b>→</b></article>`).join('')}</section><section class="recent-reports"><div class="recent-heading"><div><h2>Informes recientes</h2><p>Registros generados automáticamente por el portal profesional.</p></div><label class="report-search">⌕<input id="reportSearch" type="search" placeholder="Buscar paciente, brigada o profesional" value="${safe(previous.search)}"></label></div><div class="report-table-wrap"><table><thead><tr><th>Paciente</th><th>Área</th><th>Brigada</th><th>Fecha de atención</th><th>Profesional que atendió</th><th>Acción</th></tr></thead><tbody>${current.map(record => `<tr><td><strong>${safe(record.patientName || record.name || 'Paciente sin nombre')}</strong><small>${safe(record.formType || (record.source === 'triage' ? 'Triage' : 'Valoración clínica'))}</small></td><td><span class="report-area">${safe(reportArea(record, record.source))}</span></td><td>${safe(record.brigadeName || 'Sin brigada')}</td><td>${safe(formatDate(record.visitDate || record.createdAt?.slice?.(0, 10)))}</td><td>${safe(record.professionalName || 'No registrado')}</td><td><button class="report-row-export" type="button" data-id="${safe(record.id)}" aria-label="Descargar fila">⇩</button></td></tr>`).join('') || '<tr><td class="report-no-data" colspan="6">No hay informes con los filtros seleccionados.</td></tr>'}</tbody></table></div><footer class="report-footer">Mostrando ${current.length} de ${all.length} informes</footer></section></section>`;
  $('#generateReport', app).onclick = () => downloadCsv(current);
  $('#filterReports', app).onclick = drawReportsV2;
  ['reportArea', 'reportBrigade', 'reportProfessional', 'reportStart', 'reportEnd'].forEach(id => $(`#${id}`, app).addEventListener('change', drawReportsV2));
  $('#reportSearch', app).addEventListener('input', drawReportsV2);
  app.querySelectorAll('.report-row-export').forEach(button => button.onclick = () => downloadCsv(current.filter(record => record.id === button.dataset.id)));
}

function openReports() {
  if (professional?.role !== 'admin') {
    $('#app').innerHTML = '<section class="page"><div class="empty"><div>🔒</div><h2>Acceso restringido</h2><p>El consolidado de informes está disponible para la coordinación autorizada de SIVE.</p></div></section>';
    return;
  }
  stopReports?.();
  const subscribe = (key, collectionName) => onSnapshot(collection(db, collectionName), snapshot => {
    reports[key] = snapshot.docs.map(item => item.data());
    drawReportsV2();
  });
  const stops = [subscribe('clinical', 'clinicalRecords'), subscribe('triage', 'triageRecords'), subscribe('psychology', 'psychologyRecords')];
  stopReports = () => stops.forEach(stop => stop());
}

function routeReports() {
  if (location.hash === '#/informes') openReports();
  else { stopReports?.(); stopReports = null; }
}

document.addEventListener('submit', addProfessionalMetadata, true);
new MutationObserver(enhanceForms).observe(document.body, { childList: true, subtree: true });
onAuthStateChanged(auth, async user => {
  if (!user) { professional = null; return; }
  const snapshot = await getDoc(doc(db, 'professionals', user.uid));
  professional = snapshot.exists() ? snapshot.data() : null;
  const navigation = $('#reportsNav');
  if (navigation) navigation.hidden = professional?.role !== 'admin';
  enhanceForms();
  routeReports();
});
addEventListener('hashchange', routeReports);
