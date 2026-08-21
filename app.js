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

/* ── Posts del blog ── */
let posts = [];

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

/* ════════════════════════════════════════════
   ALMACENAMIENTO (localStorage — funciona offline)
════════════════════════════════════════════ */
function loadPosts() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) posts = JSON.parse(raw);
  } catch (e) {
    posts = [];
  }
  renderBlogPosts();
}

function savePosts(arr) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    posts = arr;
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
          '<span class="blg-cat"><i class="fa-solid fa-heart-pulse"></i> Salud SIVE</span>' +
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

  container.innerHTML =
    '<div class="mdl-bg" onclick="closeModal()">' +
      '<div class="mdl-box" onclick="event.stopPropagation()">' +
        '<button class="mdl-cls" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button>' +
        imgHtml +
        '<div class="mdl-cnt">' +
          '<span class="mdl-cat"><i class="fa-solid fa-heart-pulse"></i> Salud SIVE</span>' +
          '<h2 class="mdl-ttl">' + esc(selectedPost.title) + '</h2>' +
          '<div class="mdl-txt">' + esc(selectedPost.content) + '</div>' +
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
});
