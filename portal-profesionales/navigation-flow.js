const $ = (selector, root = document) => root.querySelector(selector);

function go(path) { location.hash = path; }

function configureNewTriage() {
  const button = $('#newBtn');
  if (!button) return;
  if (button.textContent !== '+ Nuevo triage') button.textContent = '+ Nuevo triage';
  button.onclick = () => go('#/triaje');
}

function addMedicineHistoryAction() {
  const hero = $('.area-medicina .hero');
  if (!hero || $('#medicineNewHistory', hero)) return;
  const action = document.createElement('button');
  action.id = 'medicineNewHistory';
  action.type = 'button';
  action.className = 'primary medicine-create-record';
  action.textContent = '+ Nueva historia clínica';
  action.onclick = () => go('#/categorias');
  hero.querySelector('div')?.append(action);
}

function updateNavigation() {
  configureNewTriage();
  addMedicineHistoryAction();
}

new MutationObserver(updateNavigation).observe(document.body, { childList: true, subtree: true });
addEventListener('hashchange', updateNavigation);
updateNavigation();
