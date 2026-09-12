(() => {
'use strict';

const K = {
  setup: 'cr3atix-vigilance-setup-v195',
  cal: 'cr3atix-vigilance-eye-calibration-v1',
  vol: 'cr3atix-vigilance-alarm-volume-v1',
  det: 'cr3atix-vigilance-detection-settings-v172'
};
const VERSION = 195;
const $ = s => document.querySelector(s);
let installPrompt = null;
let dockTimer = null;
let calibrationWatcher = null;

const uid = () => globalThis.crypto?.randomUUID?.() || `setup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const blankRun = reason => ({
  id: uid(),
  reason,
  startedAt: new Date().toISOString(),
  calibrationConfirmed: false,
  detectionConfirmed: false,
  volumeConfirmed: false,
  voiceConfirmed: false,
  finishedAt: null
});
const fresh = () => ({
  version: VERSION,
  completed: false,
  stage: 'install',
  completedAt: null,
  run: null
});

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(K.setup) || 'null');
    return raw && raw.version === VERSION ? {...fresh(), ...raw} : fresh();
  } catch {
    return fresh();
  }
}
function save(patch) {
  const next = {...load(), ...patch, version: VERSION, lastCheckedAt: new Date().toISOString()};
  localStorage.setItem(K.setup, JSON.stringify(next));
  return next;
}
function isInstalled() {
  try {
    return window.matchMedia?.('(display-mode: standalone)').matches === true || navigator.standalone === true;
  } catch {
    return false;
  }
}
function calOK() {
  try {
    const v = JSON.parse(localStorage.getItem(K.cal) || 'null');
    return !!(v && Number.isFinite(+v.threshold) && Number.isFinite(+v.baseline));
  } catch {
    return false;
  }
}
function volOK() {
  const raw = localStorage.getItem(K.vol);
  const v = +raw;
  return raw !== null && Number.isFinite(v) && v >= 0 && v <= 1;
}
function detOK() {
  try {
    const v = JSON.parse(localStorage.getItem(K.det) || 'null');
    return !!(v &&
      Number.isFinite(+v.closureDelay) && +v.closureDelay >= .6 && +v.closureDelay <= 3 &&
      Number.isFinite(+v.yawnThreshold) && +v.yawnThreshold >= .35 && +v.yawnThreshold <= .85 &&
      ['siren', 'voice', 'both'].includes(v.alarmMode));
  } catch {
    return false;
  }
}
function activeRun(s = load()) {
  return s.run && typeof s.run === 'object' && !s.run.finishedAt ? s.run : null;
}
function ready(s = load()) {
  return isInstalled() && s.completed === true && calOK() && detOK() && volOK();
}
function startRun(reason = 'initial') {
  return save({completed: false, completedAt: null, stage: 'settings', run: blankRun(reason)});
}
function ensureRun() {
  const s = load();
  return activeRun(s) ? s : startRun(s.completed ? 'reconfigure' : 'initial');
}
function patchRun(patch) {
  const s = load();
  const run = activeRun(s) || blankRun('recovered');
  return save({run: {...run, ...patch}});
}
function setupCalOK(s = load()) { return calOK() && activeRun(s)?.calibrationConfirmed === true; }
function setupDetOK(s = load()) { return detOK() && activeRun(s)?.detectionConfirmed === true; }
function setupVolOK(s = load()) { return volOK() && activeRun(s)?.volumeConfirmed === true; }
function setupConfigOK(s = load()) { return setupCalOK(s) && setupDetOK(s) && setupVolOK(s); }
function alarmMode() { return $('input[name="alarmMode"]:checked')?.value || 'siren'; }
function voiceReady() { return !!($('#listenBtn') && !$('#listenBtn').disabled); }

function overlay() {
  let el = $('#firstRunOverlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'firstRunOverlay';
    el.className = 'first-run-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = '<div class="first-run-card" id="firstRunCard"></div>';
    document.body.appendChild(el);
  }
  return el;
}
function showOverlay(on = true) {
  overlay().classList.toggle('show', on);
  document.documentElement.classList.toggle('setup-open', on);
}
function hideDock() {
  $('#setupDock')?.classList.remove('show');
  clearInterval(dockTimer);
  dockTimer = null;
}
function showSettingsView() {
  const home = $('#homeView');
  const settings = $('#settingsView');
  if (home) home.hidden = true;
  if (settings) settings.hidden = false;
  window.scrollTo({top: 0, behavior: 'auto'});
}
function showHomeView() {
  const home = $('#homeView');
  const settings = $('#settingsView');
  if (home) home.hidden = false;
  if (settings) settings.hidden = true;
  window.scrollTo({top: 0, behavior: 'auto'});
}
const dots = n => `<div class="setup-progress"><span class="${n >= 1 ? 'active' : ''}">1</span><i></i><span class="${n >= 2 ? 'active' : ''}">2</span><i></i><span class="${n >= 3 ? 'active' : ''}">3</span></div>`;

function renderInstall(message = '') {
  if (isInstalled()) {
    beginConfiguration();
    return;
  }
  hideDock();
  showHomeView();
  save({completed: false, completedAt: null, stage: 'install', run: null});
  showOverlay(true);
  const card = $('#firstRunCard');
  if (!card) return;
  card.innerHTML = `${dots(1)}
    <div class="setup-kicker">ÉTAPE 1 · OBLIGATOIRE</div>
    <h2>Installe VIGILANCE</h2>
    <p class="setup-lead">Avant tout réglage, VIGILANCE doit être installée sur le téléphone.</p>
    <div class="setup-focus">
      <span class="setup-focus-icon">↓</span>
      <div><b>Installation requise</b><small>Installe l’application puis lance-la depuis son icône. Les paramètres de première mise en route resteront verrouillés dans le navigateur.</small></div>
    </div>
    ${message ? `<div class="setup-message">${message}</div>` : ''}
    <div class="setup-actions"><button id="setupInstallAction" class="setup-primary">${installPrompt ? 'INSTALLER VIGILANCE' : 'VÉRIFIER L’INSTALLATION'}</button></div>
    <p class="setup-help">Si la fenêtre d’installation n’apparaît pas, ouvre le menu ⋮ du navigateur puis choisis « Installer l’application » ou « Ajouter à l’écran d’accueil ». Ensuite ferme le navigateur et ouvre VIGILANCE depuis son icône.</p>`;
}

function checklist() {
  const s = load();
  const c = setupCalOK(s), d = setupDetOK(s), v = setupVolOK(s);
  const voice = voiceReady(), mode = alarmMode();
  return `<div class="setup-checklist">
    <div class="${c ? 'done' : ''}"><span>${c ? '✓' : '1'}</span><p><b>Caméra calibrée</b><small>${c ? 'Calibration effectuée pendant cette configuration.' : 'Lance une nouvelle calibration des yeux pendant 3 secondes.'}</small></p></div>
    <div class="${d ? 'done' : ''}"><span>${d ? '✓' : '2'}</span><p><b>Détection confirmée</b><small>${d ? 'Seuils confirmés.' : 'Règle ou confirme les seuils yeux et bâillement.'}</small></p></div>
    <div class="${v ? 'done' : ''}"><span>${v ? '✓' : '3'}</span><p><b>Volume confirmé</b><small>${v ? 'Volume confirmé.' : 'Règle ou confirme un volume audible.'}</small></p></div>
    <div class="optional ${voice ? 'done' : ''}"><span>${voice ? '✓' : '○'}</span><p><b>Voix personnelle · facultatif</b><small>${mode === 'siren' ? 'La sirène est sélectionnée.' : voice ? 'Message vocal prêt.' : 'Enregistre un message si tu utilises le mode voix.'}</small></p></div>
  </div>`;
}

function persistDisplayedSettings() {
  const volume = $('#alarmVolume');
  const closure = $('#closureDelay');
  const yawn = $('#yawnThreshold');
  if (volume) localStorage.setItem(K.vol, String(Math.max(0, Math.min(100, +volume.value || 0)) / 100));
  if (closure && yawn) {
    localStorage.setItem(K.det, JSON.stringify({
      closureDelay: +closure.value,
      yawnThreshold: +yawn.value,
      alarmMode: alarmMode()
    }));
  }
}

function renderDock(message = '') {
  if (!isInstalled()) {
    hideDock();
    renderInstall('Installation non détectée.');
    return;
  }
  let el = $('#setupDock');
  if (!el) {
    el = document.createElement('aside');
    el.id = 'setupDock';
    el.className = 'setup-dock';
    document.body.appendChild(el);
  }
  const ok = setupConfigOK();
  el.innerHTML = `<div class="setup-dock-head"><div><small>PREMIÈRE CONFIGURATION</small><b>${ok ? 'Réglages essentiels prêts' : 'Termine les réglages essentiels'}</b></div><span>${ok ? '✓' : '…'}</span></div>
    ${message ? `<div class="setup-message ok">${message}</div>` : ''}
    ${checklist()}
    <div class="setup-dock-actions">
      <button id="setupConfirmSettings" class="setup-secondary">CONFIRMER DÉTECTION ET VOLUME</button>
      <button id="setupFinishSettings" class="setup-primary" ${ok ? '' : 'disabled'}>TERMINER LA CONFIGURATION</button>
    </div>`;
  el.classList.add('show');
}

function beginConfiguration(message = '') {
  if (!isInstalled()) {
    renderInstall('L’application doit être ouverte depuis son icône pour continuer.');
    return;
  }
  showOverlay(false);
  ensureRun();
  save({stage: 'settings'});
  showSettingsView();
  renderDock(message || 'Application installée : effectue maintenant les réglages obligatoires.');
  clearInterval(dockTimer);
  dockTimer = setInterval(() => {
    if (!isInstalled()) {
      hideDock();
      renderInstall('VIGILANCE n’est plus détectée en mode application.');
      return;
    }
    if (!load().completed && !$('#settingsView')?.hidden) renderDock();
  }, 2000);
}

function completeConfiguration() {
  if (!isInstalled()) {
    renderInstall('Installation non détectée : validation impossible.');
    return;
  }
  if (!setupConfigOK()) {
    renderDock('Il reste au moins une étape obligatoire à terminer.');
    return;
  }
  const s = load();
  const now = new Date().toISOString();
  const run = activeRun(s);
  save({completed: true, completedAt: now, stage: 'done', run: run ? {...run, finishedAt: now} : null});
  hideDock();
  showOverlay(false);
  showHomeView();
  renderStatusPanel();
}

function injectStatusPanel() {
  if ($('#setupSystemPanel')) return;
  const host = $('.settings-sections');
  if (!host) return;
  const section = document.createElement('section');
  section.id = 'setupSystemPanel';
  section.className = 'settings-section glass wide-section setup-system-panel';
  host.appendChild(section);
}
function renderStatusPanel() {
  injectStatusPanel();
  const section = $('#setupSystemPanel');
  if (!section) return;
  const installed = isInstalled();
  const ok = ready();
  section.innerHTML = `<div class="section-heading"><span class="section-icon">✓</span><div><span class="eyebrow">MISE EN ROUTE</span><h3>État de configuration</h3></div></div>
    <div class="setup-status-grid">
      <div><span>Application</span><b>${installed ? '✓ Installée' : 'À installer'}</b></div>
      <div><span>Caméra</span><b>${calOK() ? '✓ Calibration enregistrée' : 'À calibrer'}</b></div>
      <div><span>Détection</span><b>${detOK() ? '✓ Réglages enregistrés' : 'À régler'}</b></div>
      <div><span>Volume</span><b>${volOK() ? `✓ ${Math.round(+localStorage.getItem(K.vol) * 100)} %` : 'À confirmer'}</b></div>
    </div>
    <div class="setup-system-state ${ok ? 'ok' : 'warn'}">${ok ? '✓ VIGILANCE EST PRÊTE À FONCTIONNER' : '⚠ CONFIGURATION À TERMINER'}</div>
    <button id="restartSetupBtn" class="btn secondary">REFAIRE LA CONFIGURATION INITIALE</button>`;
}

async function handleInstallAction() {
  if (isInstalled()) {
    beginConfiguration();
    return;
  }
  if (!installPrompt) {
    renderInstall('VIGILANCE est encore ouverte dans le navigateur. Installe-la avec le menu ⋮ puis lance-la depuis son icône.');
    return;
  }
  try {
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    installPrompt = null;
    if (choice?.outcome === 'accepted') {
      renderInstall('Installation terminée. Ferme maintenant cette page et ouvre VIGILANCE depuis son icône.');
    } else {
      renderInstall('Installation annulée. Elle reste obligatoire pour continuer.');
    }
  } catch {
    renderInstall('La fenêtre automatique n’est pas disponible. Utilise le menu ⋮ du navigateur pour installer VIGILANCE.');
  }
}

function confirmDetectionAndVolume() {
  if (!isInstalled()) return renderInstall('Installation obligatoire avant les réglages.');
  persistDisplayedSettings();
  patchRun({detectionConfirmed: detOK(), volumeConfirmed: volOK()});
  renderDock('Détection et volume confirmés.');
  renderStatusPanel();
}

function restartSetup() {
  if (!isInstalled()) {
    save({completed: false, completedAt: null, stage: 'install', run: null});
    renderInstall('Installe VIGILANCE avant de recommencer la configuration.');
    return;
  }
  startRun('manual');
  beginConfiguration('Nouvelle configuration démarrée : calibre de nouveau la caméra puis confirme les réglages.');
}

function startCalibrationWatch() {
  if (!isInstalled() || load().completed) return;
  clearInterval(calibrationWatcher);
  const before = localStorage.getItem(K.cal);
  calibrationWatcher = setInterval(() => {
    const after = localStorage.getItem(K.cal);
    if (after !== before && calOK()) {
      clearInterval(calibrationWatcher);
      calibrationWatcher = null;
      patchRun({calibrationConfirmed: true});
      renderDock('Calibration caméra enregistrée.');
      renderStatusPanel();
    }
  }, 300);
  setTimeout(() => {
    if (calibrationWatcher) clearInterval(calibrationWatcher);
    calibrationWatcher = null;
  }, 20000);
}

function boot() {
  renderStatusPanel();
  if (!isInstalled()) {
    save({completed: false, completedAt: null, stage: 'install', run: null});
    renderInstall();
    return;
  }
  if (ready()) {
    showOverlay(false);
    hideDock();
    showHomeView();
    return;
  }
  beginConfiguration();
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  if (!isInstalled()) renderInstall();
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  if (!isInstalled()) renderInstall('Installation terminée. Lance maintenant VIGILANCE depuis son icône.');
});
window.addEventListener('pageshow', () => {
  if (isInstalled() && !ready()) beginConfiguration();
});

document.addEventListener('click', event => {
  const installAction = event.target?.closest?.('#setupInstallAction');
  if (installAction) {
    event.preventDefault();
    handleInstallAction();
    return;
  }
  const confirm = event.target?.closest?.('#setupConfirmSettings');
  if (confirm) {
    event.preventDefault();
    confirmDetectionAndVolume();
    return;
  }
  const finish = event.target?.closest?.('#setupFinishSettings');
  if (finish) {
    event.preventDefault();
    if (!finish.disabled) completeConfiguration();
    return;
  }
  const restart = event.target?.closest?.('#restartSetupBtn');
  if (restart) {
    event.preventDefault();
    restartSetup();
    return;
  }
  const calibrate = event.target?.closest?.('#calibrateBtn');
  if (calibrate) {
    if (!isInstalled()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      renderInstall('Installation obligatoire avant le calibrage.');
      return;
    }
    startCalibrationWatch();
    return;
  }
  if (!isInstalled()) {
    const blocked = event.target?.closest?.('#settingsBtn,#startBtn');
    if (blocked) {
      event.preventDefault();
      event.stopImmediatePropagation();
      renderInstall('Installe d’abord VIGILANCE puis ouvre-la depuis son icône.');
    }
  }
}, true);

document.addEventListener('input', event => {
  if (!isInstalled() || load().completed) return;
  const t = event.target;
  if (t?.matches?.('#alarmVolume')) {
    localStorage.setItem(K.vol, String(Math.max(0, Math.min(100, +t.value || 0)) / 100));
    patchRun({volumeConfirmed: volOK()});
  }
  if (t?.matches?.('#closureDelay,#yawnThreshold,input[name="alarmMode"]')) {
    persistDisplayedSettings();
    patchRun({detectionConfirmed: detOK()});
  }
  if (t?.matches?.('#alarmVolume,#closureDelay,#yawnThreshold,input[name="alarmMode"]')) {
    setTimeout(() => {
      if ($('#setupDock')?.classList.contains('show')) renderDock();
      renderStatusPanel();
    }, 40);
  }
});

$('#recordBtn')?.addEventListener('click', () => {
  setTimeout(() => {
    if (isInstalled() && !load().completed && voiceReady()) patchRun({voiceConfirmed: true});
    if ($('#setupDock')?.classList.contains('show')) renderDock();
  }, 5600);
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once: true});
else boot();
})();
