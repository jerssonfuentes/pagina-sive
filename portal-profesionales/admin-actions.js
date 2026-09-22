import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { collection, deleteDoc, doc, getDoc, getDocs, updateDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const $ = (selector, root = document) => root.querySelector(selector);
let isAdministrator = false;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

async function getTriageRecords() {
  const snapshot = await getDocs(collection(db, 'triageRecords'));
  return snapshot.docs.map(item => item.data()).filter(record => record.organizationId === 'sive')
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

function showTriageEditor(record) {
  document.querySelector('.admin-modal')?.remove();
  const modal = document.createElement('div');
  modal.className = 'admin-modal';
  modal.innerHTML = `<div class="admin-modal-card" role="dialog" aria-modal="true" aria-labelledby="adminEditTitle"><header><div><p>ADMINISTRACIÓN SIVE</p><h2 id="adminEditTitle">Editar triage</h2></div><button class="admin-close" type="button" aria-label="Cerrar">×</button></header><form id="adminTriageForm" class="admin-triage-form"><label>Nombre completo<input name="patientName" required value="${escapeHtml(record.patientName)}"></label><label>Documento<input name="documentNumber" value="${escapeHtml(record.documentNumber)}"></label><label>Edad<input name="age" type="number" value="${escapeHtml(record.age)}"></label><label>Fecha de atención<input name="visitDate" type="date" value="${escapeHtml(record.visitDate)}"></label><label>Brigada<input name="brigadeName" value="${escapeHtml(record.brigadeName)}"></label><label>Prioridad<select name="priority"><option>${escapeHtml(record.priority || 'V · Consulta general')}</option><option>I · Reanimación</option><option>II · Emergencia</option><option>III · Urgencia</option><option>IV · Consulta prioritaria</option><option>V · Consulta general</option></select></label><label>Área de remisión<input name="referralArea" value="${escapeHtml(record.referralArea)}"></label><label>Frecuencia cardíaca<input name="heartRate" type="number" value="${escapeHtml(record.heartRate)}"></label><label>Presión arterial<input name="bloodPressure" value="${escapeHtml(record.bloodPressure)}"></label><label>Saturación O₂<input name="oxygenSaturation" type="number" value="${escapeHtml(record.oxygenSaturation)}"></label><label>Temperatura<input name="temperature" type="number" step="0.1" value="${escapeHtml(record.temperature)}"></label><label class="admin-wide">Motivo / hallazgos<textarea name="reason">${escapeHtml(record.reason)}</textarea></label><label class="admin-wide">Observaciones<textarea name="notes">${escapeHtml(record.notes)}</textarea></label><footer><button type="button" class="secondary admin-cancel">Cancelar</button><button class="primary" type="submit">Guardar cambios</button></footer></form></div>`;
  document.body.append(modal);
  const close = () => modal.remove();
  $('.admin-close', modal).onclick = $('.admin-cancel', modal).onclick = close;
  $('#adminTriageForm', modal).onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = $('button[type="submit"]', form);
    submit.disabled = true;
    submit.textContent = 'Guardando…';
    try {
      await updateDoc(doc(db, 'triageRecords', record.id), { ...Object.fromEntries(new FormData(form)), updatedAt: new Date().toISOString(), updatedBy: auth.currentUser.uid });
      location.reload();
    } catch (error) {
      console.error(error);
      submit.disabled = false;
      submit.textContent = 'Guardar cambios';
      alert('No fue posible guardar el triage. Verifica las reglas publicadas de Firebase.');
    }
  };
}

async function addTriageAdminActions() {
  if (!isAdministrator || !document.querySelector('.triage-page')) return;
  const cards = [...document.querySelectorAll('.triage-page .patient-list .patient-card')];
  if (!cards.length || cards.every(card => card.dataset.adminActions === 'true')) return;
  const records = await getTriageRecords();
  cards.forEach((card, index) => {
    if (card.dataset.adminActions === 'true' || !records[index]) return;
    card.dataset.adminActions = 'true';
    const actions = document.createElement('div');
    actions.className = 'card-actions admin-triage-actions';
    actions.innerHTML = '<button type="button" class="secondary">Editar</button><button type="button" class="danger">Eliminar</button>';
    const [edit, remove] = actions.querySelectorAll('button');
    edit.onclick = () => showTriageEditor(records[index]);
    remove.onclick = async () => {
      if (!confirm('¿Eliminar este triage? Esta acción no se puede deshacer.')) return;
      try { await deleteDoc(doc(db, 'triageRecords', records[index].id)); location.reload(); }
      catch (error) { console.error(error); alert('No fue posible eliminar el triage.'); }
    };
    card.append(actions);
  });
}

new MutationObserver(() => { addTriageAdminActions().catch(console.error); }).observe(document.body, { childList: true, subtree: true });
onAuthStateChanged(auth, async user => {
  if (!user) { isAdministrator = false; return; }
  const profile = await getDoc(doc(db, 'professionals', user.uid));
  isAdministrator = profile.exists() && profile.data().active === true && profile.data().role === 'admin';
  addTriageAdminActions().catch(console.error);
});
