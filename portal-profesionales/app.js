import { calculateWho, renderWhoResults } from './zscore.js';
import { auth, db, isFirebaseConfigured } from './firebase-config.js';
import { onAuthStateChanged, signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, setDoc, where } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const ORGANIZATION_ID='sive';
let currentUser=null, currentProfessional=null, recordsCache=[], pendingPersist=Promise.resolve();

const commonSections=[
 {title:'Identificación del menor',description:'Datos básicos y del acudiente.',fields:[
  ['name','Nombre completo del menor','text',true],['birthDate','Fecha de nacimiento','date',true],['visitDate','Fecha de valoración','date',true],['sex','Sexo','select',true,['Femenino','Masculino','Intersexual/otro','No especificado']],['civilRegistry','Número del registro civil','text',true],['guardianName','Nombre del familiar o acudiente','text',true],['guardianDocument','Tipo y número de documento del acudiente','text',true],['address','Dirección','text'],['phone','Teléfono','tel']
 ]},
 {title:'Consulta y vacunación',description:'Motivo de atención y estado del esquema.',fields:[
  ['consultationReason','Motivo de consulta','textarea',true],['vaccinationComplete','Carné de vacunación completo','select',true,['Sí','No','No se aporta carné']],['missingVaccines','Vacunas pendientes','textarea'],['lastVaccineDate','Fecha de la última vacuna','date'],['lastVaccineName','Última vacuna aplicada','text']
 ]},
 {title:'Antecedentes',description:'Registra “Niega” cuando no existan antecedentes.',fields:[
  ['pathological','Patológicos','textarea'],['family','Familiares','textarea'],['surgical','Quirúrgicos','textarea'],['trauma','Traumatológicos','textarea'],['pharmacological','Farmacológicos','textarea'],['allergies','Alergias','textarea'],['transfusions','Transfusiones','textarea'],['bloodType','Tipo de sangre','select',false,['Desconocido','O+','O−','A+','A−','B+','B−','AB+','AB−']]
 ]},
 {title:'Alimentación',description:'Descripción habitual por momento del día.',fields:[
  ['breakfast','Desayuno','textarea'],['morningSnack','Media mañana / media tarde','textarea'],['lunch','Almuerzo','textarea'],['dinner','Cena','textarea']
 ]},
 {title:'Examen físico',description:'Ingresa valores con las unidades indicadas.',fields:[
  ['heartRate','Frecuencia cardíaca (lpm)','number'],['respiratoryRate','Frecuencia respiratoria (rpm)','number'],['oxygenSaturation','Saturación de oxígeno (%)','number'],['temperature','Temperatura (°C)','number'],['weight','Peso (kg)','number'],['height','Longitud/talla (cm)','number'],['armCircumference','Perímetro braquial (cm)','number'],['oedema','¿Presenta edema bilateral?','select',false,['No','Sí']],['physicalFindings','Hallazgos positivos al examen físico','textarea']
 ]},
 {title:'Promoción y prevención',description:'Controles y medidas preventivas.',fields:[
  ['lastDeworming','Última dosis de desparasitante','text'],['lastGrowthControl','Último control de crecimiento y desarrollo','date']
 ]}
];

const specific={
 early:{label:'Primera infancia',range:'1 mes a 5 años',extraExam:[['measurementPosition','Posición de medición','select',true,['Recumbente','De pie']],['headCircumference','Perímetro cefálico (cm)','number'],['chestCircumference','Perímetro torácico (cm)','number'],['abdominalCircumference','Perímetro abdominal (cm)','number']],extraPrevention:[['vitaminAIron','¿Ha recibido vitamina A y hierro?','select',false,['Sí','No','No sabe']]]},
 childhood:{label:'Infancia',range:'6 a 11 años',extraExam:[['bmi','IMC (kg/m²)','number'],['tanner','Clasificación de Tanner','select',false,['No evaluado','I','II','III','IV','V']]]},
 adolescent:{label:'Adolescencia',range:'12 a 17 años',extraExam:[['bmi','IMC (kg/m²)','number'],['tanner','Clasificación de Tanner','select',false,['No evaluado','I','II','III','IV','V']]],extraSections:[{title:'Salud sexual y menstrual',description:'Información confidencial; aplicar el protocolo institucional.',fields:[['menarche','¿Ya tuvo la menarquia?','select',false,['No','Sí','No sabe']],['lastMenstrualPeriod','Fecha de última menstruación (FUM)','date'],['sexualActivity','¿Ya inició relaciones sexuales?','select',false,['No','Sí','Prefiere no responder']],['stiScreening','¿Le han realizado tamizaje para ITS/ETS?','select',false,['No','Sí','No sabe']],['stiNotes','Observaciones de salud sexual','textarea']]}]}
};

const $=(s,r=document)=>r.querySelector(s);let installPrompt=null;
const load=()=>recordsCache.slice();
const save=records=>{recordsCache=records.slice();pendingPersist=syncRecords(recordsCache);return pendingPersist};
const uid=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`;
async function loadRecords(){const recordsQuery=query(collection(db,'clinicalRecords'),where('organizationId','==',ORGANIZATION_ID),orderBy('updatedAt','desc'));const snapshot=await getDocs(recordsQuery);recordsCache=snapshot.docs.map(item=>item.data())}
async function syncRecords(records){await Promise.all(records.map(record=>setDoc(doc(db,'clinicalRecords',record.id),{...record,organizationId:ORGANIZATION_ID,createdBy:record.createdBy||currentUser.uid,updatedBy:currentUser.uid})));}
async function deleteRecord(id){await deleteDoc(doc(db,'clinicalRecords',id));recordsCache=recordsCache.filter(record=>record.id!==id)}
async function saveWordOnline(){await pendingPersist;return{ok:true}}
const escapeHtml=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function ageFrom(date,referenceDate){if(!date)return null;const d=new Date(`${date}T12:00:00`),n=referenceDate?new Date(`${referenceDate}T12:00:00`):new Date();if(Number.isNaN(d.getTime())||Number.isNaN(n.getTime())||n<d)return null;let y=n.getFullYear()-d.getFullYear(),m=n.getMonth()-d.getMonth();if(n.getDate()<d.getDate())m--;if(m<0){y--;m+=12}return {years:y,months:y*12+m};}
function cycleFor(date,referenceDate){const a=ageFrom(date,referenceDate);if(!a||a.months<1||a.months>=216)return null;if(a.months<72)return'early';if(a.months<144)return'childhood';return'adolescent'}
function stageFor(date,referenceDate){const a=ageFrom(date,referenceDate);if(!a)return null;if(a.months<12)return{key:'infant-younger',label:'Lactante menor',range:'1 a 11 meses'};if(a.months<24)return{key:'infant-older',label:'Lactante mayor',range:'12 a 23 meses'};if(a.months<72)return{key:'preschool',label:'Preescolar',range:'2 a 5 años'};if(a.months<144)return{key:'childhood',label:'Infancia escolar',range:'6 a 11 años'};if(a.months<216)return{key:'adolescent',label:'Adolescencia',range:'12 a 17 años'};return null}
function ageLabel(date){const a=ageFrom(date);if(!a)return'Edad no disponible';return a.years<2?`${a.months} meses`:`${a.years} años`}
function sectionsFor(cycle){const base=structuredClone(commonSections),cfg=specific[cycle];if(cycle==='childhood'||cycle==='adolescent'){const documentField=base[0].fields.find(field=>field[0]==='civilRegistry');documentField[1]='Número de tarjeta de identidad (T.I.)'}if(cfg?.extraExam)base.find(s=>s.title==='Examen físico').fields.push(...cfg.extraExam);if(cfg?.extraPrevention)base.find(s=>s.title==='Promoción y prevención').fields.push(...cfg.extraPrevention);if(cfg?.extraSections)base.push(...cfg.extraSections);return base}
function fieldHtml([name,label,type,required=false,options],value=''){const full=type==='textarea';const req=required?'required':'';let control;if(type==='select')control=`<select name="${name}" ${req}><option value="">Selecciona…</option>${options.map(o=>`<option ${value===o?'selected':''}>${escapeHtml(o)}</option>`).join('')}</select>`;else if(type==='textarea')control=`<textarea name="${name}" ${req}>${escapeHtml(value)}</textarea>`;else control=`<input name="${name}" type="${type}" value="${escapeHtml(value)}" ${req} ${type==='number'?'step="any" inputmode="decimal"':''}>`;return `<div class="field ${full?'full':''}"><label class="${required?'required':''}" for="${name}">${label}</label>${control}</div>`}
function showToast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}
function go(path){location.hash=path}
function renderList(){
  const node=$('#listView').content.cloneNode(true),records=load().sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));
  $('#app').replaceChildren(node);$('#patientCount').textContent=records.length;
  const list=$('#patientList'),empty=$('#emptyState'),canDelete=currentProfessional?.role==='admin';
  function draw(q=''){
    const filtered=records.filter(r=>`${r.name} ${r.civilRegistry}`.toLowerCase().includes(q.toLowerCase()));
    list.innerHTML=filtered.map(r=>`<article class="patient-card"><div><span class="badge">${escapeHtml(specific[r.cycle]?.label||'Sin categoría')}</span><h3>${escapeHtml(r.name||'Sin nombre')}</h3><div class="patient-meta"><span>${ageLabel(r.birthDate)}</span><span>Registro: ${escapeHtml(r.civilRegistry||'—')}</span><span>Actualizada: ${new Date(r.updatedAt).toLocaleDateString('es')}</span></div></div><div class="card-actions"><button class="secondary edit" data-id="${r.id}">Abrir</button>${canDelete?`<button class="danger remove" data-id="${r.id}">Eliminar</button>`:''}</div></article>`).join('');
    empty.classList.toggle('hidden',records.length>0||q);if(!filtered.length&&q)list.innerHTML='<div class="empty"><h2>Sin resultados</h2><p>Prueba otro nombre o número de registro.</p></div>'
  }
  draw();$('#searchInput').addEventListener('input',e=>draw(e.target.value));document.querySelectorAll('.edit').forEach(b=>b.onclick=()=>go(`#/historia/${b.dataset.id}`));
  document.querySelectorAll('.remove').forEach(b=>b.onclick=async()=>{if(confirm('¿Eliminar esta historia institucional? Esta acción no se puede deshacer.')){try{await deleteRecord(b.dataset.id);renderList();showToast('Historia eliminada')}catch(error){console.error(error);showToast('No tienes permiso para eliminar esta historia')}}});
  $('.create-first')?.addEventListener('click',()=>go('#/categorias'));$('#exportBtn').onclick=()=>exportBackup(records);$('#importInput').onchange=importBackup
}
function renderCategories(){const node=$('#categoryView').content.cloneNode(true);$('#app').replaceChildren(node);$('#categoryBackBtn').onclick=()=>go('#/pacientes');document.querySelectorAll('.category-card').forEach(card=>card.onclick=()=>go(`#/nueva/${card.dataset.cycle}`))}
function renderForm(id,requestedCycle){
  const existing=id?load().find(r=>r.id===id):null,node=$('#formView').content.cloneNode(true);$('#app').replaceChildren(node);$('#formTitle').textContent=existing?existing.name:'Nueva historia';
  const form=$('#clinicalForm');form.elements.id.value=existing?.id||'';const cycle=existing?.cycle||requestedCycle;if(!specific[cycle]){go('#/categorias');return}
  drawSections(cycle,existing||{});if(!existing&&form.elements.visitDate)form.elements.visitDate.value=new Date().toISOString().slice(0,10);setupWhoPanel(form);
  const birth=form.elements.birthDate,visit=form.elements.visitDate,refreshAssignment=()=>{if(!birth.value||!visit.value)return;const actual=cycleFor(birth.value,visit.value),stage=stageFor(birth.value,visit.value),age=ageFrom(birth.value,visit.value);if(stage&&actual===cycle){$('#cycleSubtitle').innerHTML=`<span class="cycle-banner">${stage.label} · ${stage.range} · Edad calculada: ${age.years} años, ${age.months%12} meses</span>`}else if(actual&&actual!==cycle)showToast(`La edad calculada corresponde a ${specific[actual].label}`);else if(!actual)showToast('La edad debe estar entre 1 mes y 17 años')};
  birth.addEventListener('change',refreshAssignment);visit.addEventListener('change',refreshAssignment);refreshAssignment();$('#backBtn').onclick=$('#cancelBtn').onclick=()=>go(existing?'#/pacientes':'#/categorias');
  form.onsubmit=async event=>{event.preventDefault();if(!form.reportValidity())return;const data=Object.fromEntries(new FormData(form));const actualCycle=cycleFor(data.birthDate,data.visitDate),age=ageFrom(data.birthDate,data.visitDate),stage=stageFor(data.birthDate,data.visitDate);if(!actualCycle||!age||!stage){showToast('Verifica las fechas de nacimiento y valoración');return}if(actualCycle!==cycle){showToast(`Esta edad pertenece a ${specific[actualCycle].label}`);return}
    const records=load(),now=new Date().toISOString(),record={...data,id:data.id||uid(),cycle,ageMonths:age.months,lifeStage:stage.key,lifeStageLabel:stage.label,createdAt:existing?.createdAt||now,updatedAt:now,createdBy:existing?.createdBy||currentUser.uid};
    const index=records.findIndex(item=>item.id===record.id);if(index>=0)records[index]=record;else records.push(record);save(records);const submit=$('button[type="submit"]',form);if(submit){submit.disabled=true;submit.textContent='Guardando expediente…'}
    try{await saveWordOnline();go('#/pacientes');showToast('Historia clínica guardada con éxito')}catch(error){console.error('No se pudo guardar la historia clínica',error);if(submit){submit.disabled=false;submit.textContent='Guardar historia'}showToast('No fue posible guardar el expediente. Verifica tu conexión e inténtalo nuevamente')}}
}
function setupWhoPanel(form){const panel=$('#zscorePanel'),update=()=>panel.innerHTML=renderWhoResults(Object.fromEntries(new FormData(form)));form.addEventListener('input',update);form.addEventListener('change',update);setupMenstrualFields(form);update()}
function setupMenstrualFields(form){const menarche=form.elements.menarche,fum=form.elements.lastMenstrualPeriod,sex=form.elements.sex;if(!menarche||!fum||!sex)return;const menarcheField=menarche.closest('.field'),fumField=fum.closest('.field');const update=()=>{const female=sex.value==='Femenino',hasMenarche=female&&menarche.value==='Sí';menarcheField.classList.toggle('hidden',!female);fumField.classList.toggle('hidden',!hasMenarche);fum.required=hasMenarche;if(!female){menarche.value='';fum.value=''}else if(!hasMenarche)fum.value=''};sex.addEventListener('change',update);menarche.addEventListener('change',update);update()}
function drawSections(cycle,data){const cfg=specific[cycle],container=$('#formSections');$('#cycleSubtitle').innerHTML=`<span class="cycle-banner">${cfg.label} · ${cfg.range}</span>`;container.innerHTML=sectionsFor(cycle).map(s=>`<section class="form-card"><div class="section-title"><h2>${s.title}</h2><p>${s.description}</p></div><div class="fields">${s.fields.map(f=>fieldHtml(f,data[f[0]])).join('')}</div></section>`).join('');const form=$('#clinicalForm');form.elements.id.value=data.id||'';if(form.elements.weight&&form.elements.height&&form.elements.bmi){const calc=()=>{const w=Number(form.elements.weight.value),h=Number(form.elements.height.value)/100;if(w>0&&h>0)form.elements.bmi.value=(w/(h*h)).toFixed(2)};form.elements.weight.addEventListener('input',calc);form.elements.height.addEventListener('input',calc)}}
function exportBackup(records){const blob=new Blob([JSON.stringify({app:'SIVE - Salud Integral Vocacional Estudiantil',version:1,exportedAt:new Date().toISOString(),records},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`sive-respaldo-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);showToast('Respaldo exportado')}
async function importBackup(e){const file=e.target.files[0];if(!file)return;try{const data=JSON.parse(await file.text());if(!Array.isArray(data.records))throw Error();if(confirm(`Se importarán ${data.records.length} historias y se reemplazarán las actuales. ¿Continuar?`)){save(data.records);renderList();showToast('Respaldo importado')}}catch{showToast('El archivo no es un respaldo válido')}e.target.value=''}
function router(){const [,route,id]=location.hash.split('/');if(route==='categorias')renderCategories();else if(route==='nueva'&&id)renderForm(null,id);else if(route==='historia'&&id)renderForm(id);else renderList();$('#app').focus()}
function setAuthStatus(message,kind=''){const status=$('#authStatus');status.textContent=message;status.className=`auth-status ${kind}`}
function showLogin(message=''){ $('#clinicalPortal').classList.add('hidden');$('#authScreen').classList.remove('hidden');if(message)setAuthStatus(message,'error') }
async function openClinicalPortal(user){
  const profileSnapshot=await getDoc(doc(db,'professionals',user.uid));
  if(!profileSnapshot.exists()){await signOut(auth);showLogin('Tu cuenta aún no ha sido habilitada por el administrador de SIVE.');return}
  const profile=profileSnapshot.data();
  if(profile.active!==true||profile.organizationId!==ORGANIZATION_ID){await signOut(auth);showLogin('Tu cuenta no tiene autorización activa para este portal.');return}
  currentUser=user;currentProfessional=profile;$('#professionalName').textContent=profile.name||user.email;setAuthStatus('');
  try{await loadRecords()}catch(error){console.error(error);await signOut(auth);showLogin('No fue posible validar el acceso a los expedientes. Contacta al administrador.');return}
  $('#authScreen').classList.add('hidden');$('#clinicalPortal').classList.remove('hidden');router();
}
function startAuthentication(){
  if(!isFirebaseConfigured){showLogin('Falta configurar Firebase. Consulta FIREBASE-SETUP.md antes de publicar el portal.');return}
  $('#loginForm').addEventListener('submit',async event=>{event.preventDefault();const button=$('#loginForm button[type="submit"]');button.disabled=true;setAuthStatus('Verificando acceso…');try{await signInWithEmailAndPassword(auth,$('#loginEmail').value.trim(),$('#loginPassword').value);setAuthStatus('')}catch(error){console.error(error);setAuthStatus('No fue posible ingresar. Verifica tus credenciales o solicita habilitación.','error')}finally{button.disabled=false}});
  $('#resetPassword').onclick=async()=>{const email=$('#loginEmail').value.trim();if(!email){setAuthStatus('Escribe tu correo institucional para restablecer la contraseña.','error');return}try{await sendPasswordResetEmail(auth,email);setAuthStatus('Enviamos las instrucciones de restablecimiento a tu correo.','success')}catch(error){console.error(error);setAuthStatus('No fue posible enviar el correo de restablecimiento.','error')}};
  $('#logoutBtn').onclick=()=>signOut(auth);onAuthStateChanged(auth,user=>{if(user)openClinicalPortal(user);else{currentUser=null;currentProfessional=null;recordsCache=[];showLogin()}});
}
$('#newBtn').onclick=()=>go('#/categorias');addEventListener('hashchange',()=>{if(currentUser)router()});$('#installBtn').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$('#installBtn').classList.add('hidden')}};startAuthentication();
