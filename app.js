/* ==========================================================
   SIVE — app.js
   Solo lógica dinámica: Blog admin + renderizado de posts
   Credenciales:  Usuario: sive_admin  |  Contraseña: Sive2025*
   Blog guardado en localStorage (funciona sin servidor)
   ========================================================== */

'use strict';

/* ── Credenciales admin ── */
const ADMIN_USER = 'sive_admin';
const ADMIN_PASS = 'Sive2025*';

/* ── Clave de almacenamiento ── */
const STORAGE_KEY = 'sive_blog_v2';

/* Pega aquí la URL /exec entregada al desplegar Google Apps Script. */
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwnQHKPv_qQgXDTO7WF5dk9iV-clKxPC-9wY8X3kksqQ-MIFD76PZ3MdnK2v5mINZwGcg/exec';

/* ── Estado del panel admin ── */
let adminLoggedIn = false;
let adminView     = 'list';   /* 'list' | 'create' */
let newPostImage  = '';       /* base64 de la imagen seleccionada */
let loginError    = '';
let selectedPost  = null;     /* post abierto en modal */

/* ── Publicaciones destacadas tomadas del Instagram oficial de SIVE ── */
const FEATURED_POSTS = [
  {
    id: -1,
    featured: true,
    title: 'Servir también transforma a quien ayuda',
    content: 'La vocación de servicio nos invita a detenernos, escuchar y reconocer a cada persona detrás de una historia. En SIVE creemos que los actos sencillos, cuando nacen de la empatía y el compromiso, pueden dejar una huella profunda en la comunidad.\n\nEl voluntariado no solo brinda acompañamiento y bienestar: también transforma a quienes ofrecen su tiempo y sus conocimientos. Cada sonrisa confirma que construir comunidad comienza con estar presentes.',
    image: 'alianza-mission-brain-udes.jpg',
    author: 'Equipo SIVE',
    date: '18 de julio de 2026',
    sourceUrl: 'https://www.instagram.com/corporacion_sive/p/Da8bu4fEbKl/'
  },
  {
    id: -2,
    featured: true,
    title: 'Jornada de salud en Fundación Vikingos',
    content: 'SIVE desarrolló una jornada de salud en la Fundación Vikingos centrada en la prevención, la atención cercana y el acompañamiento a la comunidad. Profesionales y estudiantes compartieron conocimientos y promovieron hábitos de cuidado desde una perspectiva humana y solidaria.\n\nLa actividad reafirmó la importancia de construir una salud más accesible mediante alianzas que acercan orientación y bienestar a quienes más lo necesitan.',
    image: 'blog-fundacion-vikingos.jpg',
    author: 'Equipo SIVE',
    date: '22 de junio de 2026',
    sourceUrl: 'https://www.instagram.com/corporacion_sive/reel/DZ5PU_qRWQG/'
  },
  {
    id: -3,
    featured: true,
    title: 'Sonrisas y esperanza con Fundación Niños de Paz',
    content: 'Junto a la Fundación Niños de Paz vivimos una jornada social marcada por la alegría, la empatía y el servicio. El equipo voluntario entregó tiempo, conocimientos y acompañamiento para crear una experiencia significativa con los niños y sus familias.\n\nEstos encuentros fortalecen nuestro propósito de contribuir a comunidades con más oportunidades, bienestar y esperanza.',
    image: 'alianza-escuela-misiones.jpg',
    author: 'Equipo SIVE',
    date: '18 de julio de 2026',
    sourceUrl: 'https://www.instagram.com/corporacion_sive/reel/Da8XNJwRN6C/'
  }
];

/* ── Posts del blog ── */
let posts = FEATURED_POSTS.slice();

/* ════════════════════════════════════════════
   UTILIDADES
════════════════════════════════════════════ */
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function goTo(id) {
  var el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

function showSuccessAlert(title, message) {
  var previous = document.getElementById('sive-success-alert');
  if (previous) previous.remove();

  var overlay = document.createElement('div');
  overlay.id = 'sive-success-alert';
  overlay.className = 'sive-alert-overlay';
  overlay.innerHTML =
    '<div class="sive-alert-card" role="alertdialog" aria-modal="true" aria-labelledby="sive-alert-title" aria-describedby="sive-alert-message">' +
      '<div class="sive-alert-icon"><i class="fa-solid fa-check"></i></div>' +
      '<p class="sive-alert-eyebrow">SIVE · Confirmación</p>' +
      '<h2 id="sive-alert-title">' + esc(title) + '</h2>' +
      '<p id="sive-alert-message">' + esc(message) + '</p>' +
      '<button type="button" class="btn-primary sive-alert-button"><i class="fa-solid fa-heart"></i> Entendido</button>' +
    '</div>';

  function closeAlert() {
    overlay.classList.add('is-closing');
    setTimeout(function() { overlay.remove(); }, 180);
  }

  overlay.querySelector('.sive-alert-button').addEventListener('click', closeAlert);
  overlay.addEventListener('click', function(event) {
    if (event.target === overlay) closeAlert();
  });
  overlay.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') closeAlert();
  });
  document.body.appendChild(overlay);
  overlay.querySelector('.sive-alert-button').focus();
}

/* ── Formulario de voluntariado ── */
async function submitVolunteerForm(event) {
  event.preventDefault();

  var form = event.currentTarget;
  var status = document.getElementById('volunteer-status');
  var dateLabel = document.getElementById('acceptance-date');
  var submitButton = form.querySelector('[type="submit"]');

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  if (!GOOGLE_SCRIPT_URL) {
    status.className = 'vf-status error';
    status.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> La recepción en Google Drive todavía no está activada. Configura la URL de Google Apps Script antes de publicar el formulario.';
    status.focus();
    return;
  }

  var acceptanceDate = new Date().toLocaleDateString('es-CO', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  var formData = new FormData(form);
  var payload = {};
  formData.forEach(function(value, key) { payload[key] = String(value).trim(); });

  ['compromiso', 'bioseguridad', 'conducto_regular', 'comunicacion_responsable', 'datos', 'imagen']
    .forEach(function(name) {
      payload[name] = Boolean(form.elements[name] && form.elements[name].checked);
    });

  submitButton.disabled = true;
  submitButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando en Drive...';
  status.className = 'vf-status sending';
  status.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Estamos generando y guardando tu PDF. No cierres esta página.';

  try {
    await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    dateLabel.textContent = acceptanceDate;
    status.className = 'vf-status success';
    status.innerHTML = '<i class="fa-solid fa-circle-check"></i> Inscripción recibida. El PDF fue enviado para guardarse en el archivo institucional de SIVE el ' + esc(acceptanceDate) + '.';
    form.reset();
  } catch (error) {
    status.className = 'vf-status error';
    status.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> No fue posible enviar la inscripción. Revisa tu conexión e inténtalo nuevamente.';
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Completar inscripción';
    status.focus();
  }
}

/* ── Programación e inscripción a brigadas ── */
let availableBrigades = [];

function formatBrigadeDate(value) {
  if (!value) return 'Fecha por confirmar';
  var date = new Date(String(value).length === 10 ? value + 'T12:00:00' : value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

async function requestBrigades(attempt) {
  var controller = new AbortController();
  var timeoutId = setTimeout(function() { controller.abort(); }, 12000);
  try {
    var separator = GOOGLE_SCRIPT_URL.indexOf('?') === -1 ? '?' : '&';
    var response = await fetch(GOOGLE_SCRIPT_URL + separator + 'action=brigades&t=' + Date.now() + '&attempt=' + attempt, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      signal: controller.signal
    });
    if (!response.ok) throw new Error('Respuesta HTTP ' + response.status);
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function loadBrigades() {
  var container = document.getElementById('brigade-options');
  if (!container || !GOOGLE_SCRIPT_URL) return;

  var slowMessage = setTimeout(function() {
    container.innerHTML = '<div class="brigade-loading"><i class="fa-solid fa-spinner fa-spin"></i> Google Drive está tardando un poco. Seguimos consultando la programación...</div>';
  }, 4000);

  try {
    var response;
    try {
      response = await requestBrigades(1);
    } catch (firstError) {
      await new Promise(function(resolve) { setTimeout(resolve, 600); });
      response = await requestBrigades(2);
    }
    clearTimeout(slowMessage);
    if (response && response.ok && Array.isArray(response.brigades) && response.brigades.length) {
      try { localStorage.setItem('sive_brigades_cache', JSON.stringify(response)); } catch (cacheError) {}
    }
    window.receiveSiveBrigades(response);
  } catch (error) {
    clearTimeout(slowMessage);
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem('sive_brigades_cache') || 'null'); } catch (cacheError) {}
    if (cached && Array.isArray(cached.brigades) && cached.brigades.length) {
      window.receiveSiveBrigades(cached);
      container.insertAdjacentHTML('beforeend', '<div class="brigade-cache-note"><i class="fa-solid fa-clock-rotate-left"></i> Programación mostrada desde la última consulta disponible.</div>');
    } else {
      container.innerHTML = '<div class="brigade-empty"><i class="fa-solid fa-circle-exclamation"></i> No fue posible consultar la programación. Recarga la página o inténtalo nuevamente en unos minutos.</div>';
    }
  }
}

window.receiveSiveBrigades = function(response) {
  var container = document.getElementById('brigade-options');
  availableBrigades = response && response.ok && Array.isArray(response.brigades) ? response.brigades : [];

  if (!availableBrigades.length) {
    var message = response && response.message ? response.message : 'En este momento no hay brigadas abiertas para inscripción.';
    container.innerHTML = '<div class="brigade-empty"><i class="fa-solid fa-calendar-xmark"></i> ' + esc(message) + '</div>';
    return;
  }

  container.innerHTML = availableBrigades.map(function(brigade) {
    return '<label class="brigade-option">' +
      '<input type="radio" name="brigade_choice" value="' + esc(brigade.id) + '" onchange="selectBrigade(this.value)">' +
      '<span class="brigade-card"><span class="brigade-card-top"><h3>' + esc(brigade.nombre) + '</h3><span class="brigade-radio-mark"></span></span>' +
      '<span class="brigade-meta"><span><i class="fa-regular fa-calendar"></i>' + esc(formatBrigadeDate(brigade.fecha)) + '</span>' +
      '<span><i class="fa-solid fa-location-dot"></i>' + esc(brigade.lugar) + '</span>' +
      '<span><i class="fa-regular fa-clock"></i>' + esc(brigade.horario || 'Horario por confirmar') + '</span></span>' +
      (brigade.cupos ? '<span class="brigade-capacity">' + esc(brigade.cupos) + ' cupos</span>' : '') + '</span></label>';
  }).join('');
};

function selectBrigade(id) {
  var brigade = availableBrigades.find(function(item) { return String(item.id) === String(id); });
  var form = document.getElementById('brigade-form');
  if (!brigade || !form) return;

  document.getElementById('brigade-id').value = brigade.id;
  var summary = document.getElementById('selected-brigade');
  summary.hidden = false;
  summary.innerHTML = '<strong>Brigada seleccionada:</strong> ' + esc(brigade.nombre) + ' · ' +
    esc(formatBrigadeDate(brigade.fecha)) + ' · ' + esc(brigade.lugar);
  form.classList.add('is-ready');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function submitBrigadeForm(event) {
  event.preventDefault();
  var form = event.currentTarget;
  var status = document.getElementById('brigade-status');
  var submitButton = form.querySelector('[type="submit"]');

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  var formData = new FormData(form);
  var payload = {};
  formData.forEach(function(value, key) { payload[key] = String(value).trim(); });
  ['participacion', 'protocolos', 'sin_relacion_laboral', 'datos_brigada'].forEach(function(name) {
    payload[name] = Boolean(form.elements[name] && form.elements[name].checked);
  });

  submitButton.disabled = true;
  submitButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generando autorización...';
  status.className = 'vf-status sending';
  status.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Guardando la autorización en el archivo institucional de SIVE.';

  try {
    var response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST', mode: 'cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error('Respuesta HTTP ' + response.status);
    var result = await response.json();
    if (!result || result.ok !== true) {
      throw new Error(result && result.error ? result.error : 'Apps Script no confirmó la inscripción.');
    }
    status.className = 'vf-status success';
    status.innerHTML = '<i class="fa-solid fa-circle-check"></i> Inscripción exitosa. La autorización en PDF se guardó correctamente en Google Drive.';
    showSuccessAlert(
      '¡Inscripción exitosa!',
      'Tu autorización fue generada y guardada correctamente. Gracias por participar en esta brigada con SIVE.'
    );
    form.reset();
    document.getElementById('brigade-id').value = '';
    document.getElementById('selected-brigade').hidden = true;
    form.classList.remove('is-ready');
    document.querySelectorAll('input[name="brigade_choice"]').forEach(function(input) { input.checked = false; });
  } catch (error) {
    status.className = 'vf-status error';
    status.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> No fue posible completar la inscripción. Revisa los datos e inténtalo nuevamente.';
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = '<i class="fa-solid fa-file-circle-check"></i> Autorizar e inscribirme';
    status.focus();
  }
}

/* ════════════════════════════════════════════
   ALMACENAMIENTO (localStorage — funciona offline)
════════════════════════════════════════════ */
function loadPosts() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    var savedPosts = raw ? JSON.parse(raw) : [];
    posts = savedPosts.concat(FEATURED_POSTS);
  } catch (e) {
    posts = FEATURED_POSTS.slice();
  }
  renderBlogPosts();
}

function savePosts(arr) {
  try {
    var customPosts = arr.filter(function(post) { return !post.featured; });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customPosts));
    posts = customPosts.concat(FEATURED_POSTS);
    renderBlogPosts();
  } catch (e) {
    alert('Error al guardar. La imagen puede ser mayor a 1 MB. Por favor usa una imagen más pequeña.');
  }
}

/* ════════════════════════════════════════════
   RENDER — SOLO LAS PARTES DINÁMICAS
════════════════════════════════════════════ */

/* 1. Grilla de artículos del blog */
function renderBlogPosts() {
  var grid = document.getElementById('blog-grid');
  if (!grid) return;

  if (posts.length === 0) {
    grid.innerHTML =
      '<div class="blg-empty">' +
        '<div class="blg-empty-ico">📰</div>' +
        '<p class="blg-empty-title">Próximamente</p>' +
        '<p>Aquí aparecerán los artículos del equipo SIVE.</p>' +
      '</div>';
    return;
  }

  grid.innerHTML = posts.map(function(p) {
    var imgHtml = p.image
      ? '<div class="blg-img-wrap"><img src="' + p.image + '" class="blg-img" alt="' + esc(p.title) + '" loading="lazy"></div>'
      : '<div class="blg-noimg">⚕️</div>';

    return (
      '<div class="blg-card" onclick="openPostModal(' + p.id + ')">' +
        imgHtml +
        '<div class="blg-body">' +
          '<span class="blg-cat"><i class="fa-solid fa-heart-pulse"></i> ' + (p.featured ? 'Historias SIVE' : 'Salud SIVE') + '</span>' +
          '<div class="blg-ttl">' + esc(p.title) + '</div>' +
          '<div class="blg-exc">' + esc(p.content) + '</div>' +
          '<div class="blg-meta">' +
            '<span class="blg-auth"><i class="fa-solid fa-user-pen"></i> ' + esc(p.author) + '</span>' +
            '<span class="blg-date">' + esc(p.date) + '</span>' +
          '</div>' +
          '<span class="blg-read">Leer artículo <i class="fa-solid fa-arrow-right"></i></span>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}

/* 2. Panel admin lateral */
function renderAdminPanel() {
  var container = document.getElementById('admin-container');
  if (!container) return;

  if (!adminLoggedIn) {
    /* ── Pantalla de login ── */
    container.innerHTML =
      '<div class="admin-overlay" onclick="handleOverlayClick(event)">' +
        '<div class="admin-panel">' +
          '<div class="adm-head">' +
            '<div class="adm-head-title">' +
              '<img src="logo_sive.jpeg" alt="SIVE"> SIVE — Blog' +
            '</div>' +
            '<div class="adm-actions">' +
              '<button class="btn-cls" onclick="closeAdmin()"><i class="fa-solid fa-xmark"></i></button>' +
            '</div>' +
          '</div>' +
          '<div class="p-login">' +
            '<img src="logo_sive.jpeg" class="p-login-logo" alt="SIVE" style="width:90px;height:90px;object-fit:contain;margin:0 auto 1.5rem">' +
            '<h2>Acceso al Blog</h2>' +
            '<p>Ingresa tus credenciales para gestionar<br>los artículos de SIVE.</p>' +
            (loginError ? '<div class="lg-err"><i class="fa-solid fa-triangle-exclamation"></i> ' + esc(loginError) + '</div>' : '') +
            '<div class="fg2"><label><i class="fa-solid fa-user"></i> Usuario</label>' +
              '<input class="lg-inp" type="text" id="adm-user" placeholder="Tu usuario" autocomplete="username">' +
            '</div>' +
            '<div class="fg2"><label><i class="fa-solid fa-lock"></i> Contraseña</label>' +
              '<input class="lg-inp" type="password" id="adm-pass" placeholder="Tu contraseña" autocomplete="current-password">' +
            '</div>' +
            '<button class="btn-lg" onclick="doLogin()"><i class="fa-solid fa-right-to-bracket"></i> Ingresar al Panel</button>' +
            '<button class="btn-bk" onclick="closeAdmin()">← Cancelar</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    /* Enter en campos */
    var u = document.getElementById('adm-user');
    var p = document.getElementById('adm-pass');
    if (u) u.addEventListener('keydown', function(e) { if (e.key === 'Enter' && p) p.focus(); });
    if (p) p.addEventListener('keydown', function(e) { if (e.key === 'Enter') doLogin(); });
    return;
  }

  /* ── Panel autenticado ── */
  var headBtns;
  if (adminView === 'list') {
    headBtns =
      '<button class="btn-ag" onclick="showCreateForm()"><i class="fa-solid fa-plus"></i> Nueva</button>' +
      '<button class="btn-ao" onclick="doLogout()"><i class="fa-solid fa-right-from-bracket"></i> Salir</button>';
  } else {
    headBtns =
      '<button class="btn-ao" onclick="showListView()"><i class="fa-solid fa-arrow-left"></i> Volver</button>';
  }

  var bodyHtml;
  if (adminView === 'list') {
    bodyHtml = buildListView();
  } else {
    bodyHtml = buildCreateForm();
  }

  container.innerHTML =
    '<div class="admin-overlay" onclick="handleOverlayClick(event)">' +
      '<div class="admin-panel">' +
        '<div class="adm-head">' +
          '<div class="adm-head-title">' +
            '<img src="logo_sive.jpeg" alt="SIVE"> SIVE — Blog' +
          '</div>' +
          '<div class="adm-actions">' +
            headBtns +
            '<button class="btn-cls" onclick="closeAdmin()"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>' +
        '</div>' +
        '<div class="adm-body">' + bodyHtml + '</div>' +
      '</div>' +
    '</div>';
}

function buildListView() {
  var items;
  if (posts.length === 0) {
    items = '<div class="ep"><div style="font-size:2.4rem;margin-bottom:.7rem">📝</div><p>Aún no hay publicaciones.<br>¡Crea la primera!</p></div>';
  } else {
    items = posts.map(function(p) {
      var thumb = p.image ? '<img src="' + p.image + '" alt="">' : '📄';
      return (
        '<div class="pi">' +
          '<div class="pi-th">' + thumb + '</div>' +
          '<div class="pi-info">' +
            '<div class="pi-ttl">' + esc(p.title) + '</div>' +
            '<div class="pi-dt">' + esc(p.date) + ' · ' + esc(p.author) + '</div>' +
          '</div>' +
          '<button class="btn-del" onclick="deletePost(' + p.id + ')"><i class="fa-solid fa-trash"></i> Eliminar</button>' +
        '</div>'
      );
    }).join('');
  }
  return '<div class="adm-crd"><p class="adm-crd-t"><i class="fa-solid fa-newspaper"></i> Publicaciones (' + posts.length + ')</p>' + items + '</div>';
}

function buildCreateForm() {
  var imgArea = newPostImage
    ? '<img src="' + newPostImage + '" class="img-prev" alt="preview">'
    : '<i class="fa-solid fa-camera" style="font-size:2rem;color:#94a3b8;margin-bottom:.4rem;display:block"></i>' +
      '<p>Haz clic para subir una imagen</p>' +
      '<small>JPG, PNG · Máximo recomendado: 1 MB</small>';

  return (
    '<div class="adm-crd">' +
      '<p class="adm-crd-t"><i class="fa-solid fa-pen-to-square"></i> Nueva Publicación</p>' +
      '<div class="fg"><label class="fl">Título *</label>' +
        '<input class="fi" id="np-title" placeholder="Escribe el título del artículo...">' +
      '</div>' +
      '<div class="fg"><label class="fl">Autor</label>' +
        '<input class="fi" id="np-author" placeholder="Equipo SIVE">' +
      '</div>' +
      '<div class="fg"><label class="fl">Imagen (opcional)</label>' +
        '<div class="img-drop" onclick="document.getElementById(\'np-img-file\').click()">' + imgArea + '</div>' +
        '<input type="file" id="np-img-file" accept="image/*" style="display:none" onchange="handleImageUpload(this)">' +
      '</div>' +
      '<div class="fg"><label class="fl">Contenido *</label>' +
        '<textarea class="fta" id="np-content" placeholder="Escribe el contenido del artículo aquí..."></textarea>' +
      '</div>' +
      '<button class="btn-pub" onclick="publishPost()"><i class="fa-solid fa-check"></i> Publicar en el Blog</button>' +
    '</div>'
  );
}

/* 3. Modal de artículo */
function renderModal() {
  var container = document.getElementById('modal-container');
  if (!container) return;

  if (!selectedPost) {
    container.innerHTML = '';
    return;
  }

  var imgHtml = selectedPost.image
    ? '<img class="mdl-img" src="' + selectedPost.image + '" alt="' + esc(selectedPost.title) + '">'
    : '';

  var sourceHtml = selectedPost.sourceUrl
    ? '<a class="mdl-source" href="' + selectedPost.sourceUrl + '" target="_blank" rel="noopener"><i class="fa-brands fa-instagram"></i> Ver publicación original en Instagram</a>'
    : '';

  container.innerHTML =
    '<div class="mdl-bg" onclick="closeModal()">' +
      '<div class="mdl-box" onclick="event.stopPropagation()">' +
        '<button class="mdl-cls" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button>' +
        imgHtml +
        '<div class="mdl-cnt">' +
          '<span class="mdl-cat"><i class="fa-solid fa-heart-pulse"></i> Salud SIVE</span>' +
          '<h2 class="mdl-ttl">' + esc(selectedPost.title) + '</h2>' +
          '<div class="mdl-txt">' + esc(selectedPost.content) + '</div>' +
          sourceHtml +
          '<div class="mdl-au"><i class="fa-solid fa-user-pen"></i> Por ' + esc(selectedPost.author) + ' · ' + esc(selectedPost.date) + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
}

/* ════════════════════════════════════════════
   ACCIONES DEL ADMIN
════════════════════════════════════════════ */
function openAdmin() {
  document.body.style.overflow = 'hidden';
  renderAdminPanel();
}

function closeAdmin() {
  document.body.style.overflow = '';
  var container = document.getElementById('admin-container');
  if (container) container.innerHTML = '';
}

function handleOverlayClick(e) {
  if (e.target.classList.contains('admin-overlay')) closeAdmin();
}

function doLogin() {
  var u = (document.getElementById('adm-user') || {}).value || '';
  var p = (document.getElementById('adm-pass') || {}).value || '';
  if (u === ADMIN_USER && p === ADMIN_PASS) {
    adminLoggedIn = true;
    adminView     = 'list';
    loginError    = '';
  } else {
    loginError = 'Usuario o contraseña incorrectos.';
  }
  renderAdminPanel();
}

function doLogout() {
  adminLoggedIn = false;
  loginError    = '';
  renderAdminPanel();
}

function showCreateForm() {
  adminView    = 'create';
  newPostImage = '';
  renderAdminPanel();
}

function showListView() {
  adminView    = 'list';
  newPostImage = '';
  renderAdminPanel();
}

function handleImageUpload(input) {
  var file = input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    newPostImage = ev.target.result;
    renderAdminPanel();
  };
  reader.readAsDataURL(file);
}

function publishPost() {
  var title   = (document.getElementById('np-title')   || {}).value || '';
  var content = (document.getElementById('np-content') || {}).value || '';
  var author  = (document.getElementById('np-author')  || {}).value || '';

  if (!title.trim() || !content.trim()) {
    alert('El título y el contenido son obligatorios.');
    return;
  }

  var post = {
    id:      Date.now(),
    title:   title.trim(),
    content: content.trim(),
    image:   newPostImage,
    author:  author.trim() || 'Equipo SIVE',
    date:    new Date().toLocaleDateString('es-ES', {
               year: 'numeric', month: 'long', day: 'numeric'
             }),
  };

  savePosts([post].concat(posts));
  newPostImage = '';
  adminView    = 'list';
  renderAdminPanel();
}

function deletePost(id) {
  if (confirm('¿Eliminar esta publicación? Esta acción no se puede deshacer.')) {
    savePosts(posts.filter(function(p) { return p.id !== id; }));
    renderAdminPanel();
  }
}

/* ════════════════════════════════════════════
   MODAL DE ARTÍCULO
════════════════════════════════════════════ */
function openPostModal(id) {
  selectedPost = posts.find(function(p) { return p.id === id; }) || null;
  if (selectedPost) {
    document.body.style.overflow = 'hidden';
    renderModal();
  }
}

function closeModal() {
  selectedPost = null;
  document.body.style.overflow = '';
  renderModal();
}

/* Cerrar modal con Escape */
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    if (selectedPost) closeModal();
  }
});

/* ════════════════════════════════════════════
   INICIO
════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function() {
  loadPosts();
  loadBrigades();
  setInterval(loadBrigades, 60000);
});
