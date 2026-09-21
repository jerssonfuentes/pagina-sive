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

function openReports() {
  if (professional?.role !== 'admin') {
    $('#app').innerHTML = '<section class="page"><div class="empty"><div>🔒</div><h2>Acceso restringido</h2><p>El consolidado de informes está disponible para la coordinación autorizada de SIVE.</p></div></section>';
    return;
  }
  stopReports?.();
  const subscribe = (key, collectionName) => onSnapshot(collection(db, collectionName), snapshot => {
    reports[key] = snapshot.docs.map(item => item.data());
    drawReports();
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
