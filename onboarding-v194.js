(() => {
'use strict';

const K = {
  setup: 'cr3atix-vigilance-setup-v194',
  cal: 'cr3atix-vigilance-eye-calibration-v1',
  vol: 'cr3atix-vigilance-alarm-volume-v1',
  det: 'cr3atix-vigilance-detection-settings-v172'
};
const VERSION = 194;
const $ = s => document.querySelector(s);
let installPrompt = null;
let dockTimer = null;

const uid = () => globalThis.crypto?.randomUUID?.() || `setup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const blankRun = reason => ({
  id: uid(), reason, startedAt: new Date().toISOString(),
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
  installPromptAccepted: false,
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
function configOK() { return calOK() && detOK() && volOK(); }
function ready(s = load()) { return isInstalled() && s.completed === true && configOK(); }
function activeRun(s = load()) { return s.run && !s.run.finishedAt ? s.run : null; }
function startRun(reason = 'initial') {
  return save({completed: false, completedAt: null, stage: 'settings', run: blankRun(reason)});
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
}
const dots = n => `<div class="setup-progress"><span class="${n >= 1 ? 'active' : ''}">1</span><i></i><span class="${n >= 2 ? 'active' : ''}">2</span><i></i><span class="${n >= 3 ? 'active' : ''}">3</span></div>`;

function installationGate(message = '') {
  if (isInstalled()) {
    configurationIntro('Installation détectée. Passons aux réglages obligatoires.');
    return;
  }
  hideDock();
  save({completed: false, completedAt: null, stage: 'install', run: null});
  showOverlay(true);
  const card = $('#firstRunCard');
  card.innerHTML = `${dots(1)}
    <div class="setup-kicker">ÉTAPE 1 · OBLIGATOIRE</div>
    <h2 id="firstRunTitle">Installe VIGILANCE</h2>
    <p class="setup-lead">La configuration est verrouillée tant que VIGILANCE n’est pas lancée comme application installée.</p>
    <div class="setup-focus">
      <span class="setup-focus-icon">↓</span>
      <div><b>Installation requise</b><small>Installe l’application puis ouvre-la depuis son icône. Tant que la barre du navigateur est visible, l’étape 2 reste inaccessible.</small></div>
    </div>
    ${message ? `<div class="setup-message">${message}</div>` : ''}
    <div class="setup-actions">
      <button id="setupInstallAction" class="setup-primary">${installPrompt ? 'INSTALLER VIGILANCE' : 'VÉRIFIER L’INSTALLATION'}</button>
    </div>
    <p class="setup-help">Si aucune fenêtre d’installation n’apparaît, ouvre le menu ⋮ du navigateur puis choisis « Installer l’application » ou « Ajouter à l’écran d’accueil ». Ensuite ferme cette page et lance VIGILANCE depuis son icône.</p>`;

  $('#setupInstallAction').onclick = async () => {
    if (isInstalled()) {
      configurationIntro('Installation détectée.');
      return;
    }
    if (!installPrompt) {
      installationGate('VIGILANCE est encore ouverte dans le navigateur. Installe-la avec le menu ⋮ puis ouvre-la depuis son icône.');
      return;
    }
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice?.outcome === 'accepted') {
        save({installPromptAccepted: true});
        installPrompt = null;
        installationGate('Installation terminée. Ferme maintenant cette page et ouvre VIGILANCE depuis son icône pour débloquer la configuration.');
      } else {
        installationGate('Installation annulée. Elle reste obligatoire pour continuer.');
      }
    } catch {
      installationGate('La fenêtre automatique n’est pas disponible. Utilise le menu ⋮ du navigateur pour installer VIGILANCE.');
    }
  };
}

function checklist() {
  const s = load();
  const c = setupCalOK(s), d = setupDetOK(s), v = setupVolOK(s);
  const voice = voiceReady(), mode = alarmMode();
  return `<div class="setup-checklist">
    <div class="${c ? 'done' : ''}"><span>${c ? '✓' : '1'}</span><p><b>Caméra calibrée</b><small>${c ? 'Calibration effectuée pendant cette configuration.' : 'Lance une nouvelle calibration des yeux pendant 3 secondes.'}</small></p></div>
    <div class="${d ? 'done' : ''}"><span>${d ? '✓' : '2'}</span><p><b>Détection confirmée</b><small>${d ? 'Seuils confirmés pendant cette configuration.' : 'Confirme les seuils yeux et bâillement.'}</small></p></div>
    <div class="${v ? 'done' : ''}"><span>${v ? '✓' : '3'}</span><p><b>Volume confirmé</b><small>${v ? 'Volume confirmé pendant cette configuration.' : 'Choisis ou confirme un volume audible.'}</small></p></div>
    <div class="optional ${voice ? 'done' : ''}"><span>${voice ? '✓' : '○'}</span><p><b>Voix personnelle · facultatif</b><small>${mode === 'siren' ? 'La sirène est sélectionnée.' : voice ? 'Message vocal prêt pour cette session.' : 'Enregistre un message si tu utilises le mode voix.'}</small></p></div>
  </div>`;
}

function ensureRun() {
  const s = load();
  if (!activeRun(s)) return startRun(s.completed ? 'reconfigure' : 'initial');
  return s;
}
function configurationIntro(message = '') {
  if (!isInstalled()) {
    installationGate('Installation non détectée : impossible d’ouvrir les réglages.');
    return;
  }
  ensureRun();
  save({stage: 'settings'});
  showOverlay(true);
  $('#firstRunCard').innerHTML = `${dots(2)}
    <div class="setup-kicker">ÉTAPE 2 · CONFIGURATION</div>
    <h2 id="firstRunTitle">Configure VIGILANCE</h2>
    <p class="setup-lead">L’application est bien installée. Effectue maintenant le calibrage puis confirme la détection et le volume.</p>
    ${message ? `<div class="setup-message ok">${message}</div>` : ''}
    ${checklist()}
    <div class="setup-actions">
      <button id="setupOpenSettings" class="setup-primary">OUVRIR LES PARAMÈTRES</button>
      <button id="setupCheckNow" class="setup-secondary">VÉRIFIER MAINTENANT</button>
    </div>`;
  $('#setupOpenSettings').onclick = openSettings;
  $('#setupCheckNow').onclick = () => setupConfigOK() ? finalCheck() : configurationIntro('Il reste au moins une étape obligatoire à effectuer ou confirmer.');
}

function persistDisplayedSettings() {
  const volume = $('#alarmVolume');
  const closure = $('#closureDelay');
  const yawn = $('#yawnThreshold');
  if (volume) {
    localStorage.setItem(K.vol, String(Math.max(0, Math.min(100, +volume.value || 0)) / 100));
    volume.dispatchEvent(new Event('input', {bubbles: true}));
  }
  if (closure && yawn) {
    localStorage.setItem(K.det, JSON.stringify({closureDelay: +closure.value, yawnThreshold: +yawn.value, alarmMode: alarmMode()}));
    closure.dispatchEvent(new Event('input', {bubbles: true}));
    yawn.dispatchEvent(new Event('input', {bubbles: true}));
  }
}

function dock() {
  if (!isInstalled()) {
    hideDock();
    installationGate('L’application n’est plus détectée en mode installé.');
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
    ${checklist()}
    <div class="setup-dock-actions">
      <button id="setupConfirmSettings" class="setup-secondary">CONFIRMER DÉTECTION ET VOLUME</button>
      <button id="setupFinishSettings" class="setup-primary" ${ok ? '' : 'disabled'}>TERMINER LA CONFIGURATION</button>
    </div>`;
  el.classList.add('show');
  $('#setupConfirmSettings').onclick = () => {
    persistDisplayedSettings();
    patchRun({detectionConfirmed: detOK(), volumeConfirmed: volOK()});
    dock();
    renderStatusPanel();
  };
  $('#setupFinishSettings').onclick = () => {
    if (setupConfigOK()) {
      hideDock();
      finalCheck();
    } else {
      dock();
    }
  };
}

function openSettings() {
  if (!isInstalled()) {
    installationGate('Installation obligatoire avant les paramètres.');
    return;
  }
  showOverlay(false);
  $('#settingsBtn')?.click();
  dock();
  clearInterval(dockTimer);
  dockTimer = setInterval(() => {
    if (!isInstalled()) {
      hideDock();
      installationGate('Installation non détectée.');
    } else if (!load().completed && !$('#settingsView')?.hidden) {
      dock();
    } else {
      clearInterval(dockTimer);
    }
  }, 1400);
}

function finalCheck() {
  if (!isInstalled()) {
    installationGate('Installation non détectée : validation impossible.');
    return;
  }
  if (!setupConfigOK()) {
    configurationIntro('La vérification a détecté une étape obligatoire manquante.');
    return;
  }
  const s = load();
  showOverlay(true);
  $('#firstRunCard').innerHTML = `${dots(3)}
    <div class="setup-kicker">ÉTAPE 3 · VÉRIFICATION</div>
    <h2 id="firstRunTitle">VIGILANCE est prête</h2>
    <p class="setup-lead">Installation et réglages essentiels ont été vérifiés sur cet appareil.</p>
    <div class="setup-summary">
      <div><span>Application</span><b>✓ Installée</b></div>
      <div><span>Caméra</span><b>✓ Calibrée</b></div>
      <div><span>Détection</span><b>✓ Confirmée</b></div>
      <div><span>Volume</span><b>✓ ${Math.round((+localStorage.getItem(K.vol) || 0) * 100)} %</b></div>
    </div>
    <div class="setup-actions"><button id="setupComplete" class="setup-primary">ACCÉDER À L’ACCUEIL</button></div>`;
  $('#setupComplete').onclick = () => {
    const now = new Date().toISOString();
    const run = activeRun(s);
    save({completed: true, completedAt: now, stage: 'done', run: run ? {...run, finishedAt: now} : null});
    hideDock();
    showOverlay(false);
    $('#backBtn')?.click();
    renderStatusPanel();
  };
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
  $('#restartSetupBtn').onclick = () => {
    save({completed: false, completedAt: null, stage: isInstalled() ? 'settings' : 'install', run: null});
    isInstalled() ? configurationIntro('Nouvelle configuration démarrée.') : installationGate('Réinstallation obligatoire avant de recommencer.');
  };
}

function boot() {
  renderStatusPanel();
  if (!isInstalled()) {
    const s = load();
    if (s.completed || s.stage !== 'install' || s.run) save({completed: false, completedAt: null, stage: 'install', run: null});
    installationGate();
    return;
  }
  if (ready()) {
    showOverlay(false);
    hideDock();
    renderStatusPanel();
    return;
  }
  ensureRun();
  configurationIntro();
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  if (!isInstalled()) installationGate();
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  save({installPromptAccepted: true, stage: 'install'});
  if (!isInstalled()) installationGate('Installation terminée. Ouvre maintenant VIGILANCE depuis son icône pour continuer.');
});
window.addEventListener('pageshow', () => {
  if (!isInstalled() && load().stage !== 'done') installationGate();
});

document.addEventListener('click', event => {
  if (isInstalled()) return;
  const blocked = event.target?.closest?.('#settingsBtn,#startBtn,#calibrateBtn');
  if (!blocked) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  installationGate('Installe d’abord VIGILANCE puis ouvre-la depuis son icône.');
}, true);

document.addEventListener('input', event => {
  if (!isInstalled() || load().completed) return;
  const t = event.target;
  if (t?.matches?.('#alarmVolume')) patchRun({volumeConfirmed: volOK()});
  if (t?.matches?.('#closureDelay,#yawnThreshold,input[name="alarmMode"]')) patchRun({detectionConfirmed: detOK()});
  if (t?.matches?.('#alarmVolume,#closureDelay,#yawnThreshold,input[name="alarmMode"]')) {
    setTimeout(() => {
      $('#setupDock')?.classList.contains('show') && dock();
      renderStatusPanel();
    }, 30);
  }
});

$('#calibrateBtn')?.addEventListener('click', () => {
  if (!isInstalled() || load().completed) return;
  const before = localStorage.getItem(K.cal);
  const watcher = setInterval(() => {
    const after = localStorage.getItem(K.cal);
    if (after !== before && calOK()) {
      clearInterval(watcher);
      patchRun({calibrationConfirmed: true});
      $('#setupDock')?.classList.contains('show') && dock();
      renderStatusPanel();
    }
  }, 400);
  setTimeout(() => clearInterval(watcher), 18000);
});
$('#recordBtn')?.addEventListener('click', () => {
  setTimeout(() => {
    if (isInstalled() && !load().completed && voiceReady()) patchRun({voiceConfirmed: true});
    $('#setupDock')?.classList.contains('show') && dock();
  }, 5600);
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once: true});
else boot();
})();