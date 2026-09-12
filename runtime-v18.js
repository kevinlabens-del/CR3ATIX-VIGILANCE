(() => {
  const $ = s => document.querySelector(s);
  const els = {
    startBtn: $('#startBtn'), stopBtn: $('#stopBtn'), camera: $('#camera'),
    engineBadge: $('#engineBadge'), vigilanceLevel: $('#vigilanceLevel'), vigilanceHint: $('#vigilanceHint'),
    riskOverlay: $('#riskOverlay'), roadNote: $('.road-note'), statusCard: $('.home-status-card')
  };
  if (!els.startBtn || !els.stopBtn || !els.camera || !els.engineBadge) return;

  const state = {
    wakeLock: null,
    wasMonitoring: false,
    suspendedAt: 0,
    resumeInProgress: false,
    reacquireTimer: null,
    toastTimer: null,
    originalRoadNote: els.roadNote?.textContent || 'Réglez l’appli avant de prendre la route.'
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const monitoringActive = () => Boolean(els.startBtn.disabled && !els.stopBtn.disabled);
  const alarmActive = () => Boolean(els.riskOverlay?.classList.contains('show'));

  function setRoadNote(text, kind = '') {
    if (!els.roadNote) return;
    els.roadNote.textContent = text;
    els.roadNote.dataset.runtime = kind;
  }

  function ensureToast() {
    let toast = document.getElementById('runtimeV18Toast');
    if (toast) return toast;
    toast = document.createElement('div');
    toast.id = 'runtimeV18Toast';
    toast.className = 'runtime-v18-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
    return toast;
  }

  function showToast(message, kind = 'info', duration = 5000) {
    const toast = ensureToast();
    clearTimeout(state.toastTimer);
    toast.className = `runtime-v18-toast ${kind} show`;
    toast.textContent = message;
    state.toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
  }

  async function releaseWakeLock() {
    clearTimeout(state.reacquireTimer);
    state.reacquireTimer = null;
    const lock = state.wakeLock;
    state.wakeLock = null;
    if (lock && !lock.released) {
      try { await lock.release(); } catch {}
    }
  }

  async function requestWakeLock(force = false) {
    if ((!force && !monitoringActive()) || document.visibilityState !== 'visible') return false;
    if (!('wakeLock' in navigator) || typeof navigator.wakeLock?.request !== 'function') {
      setRoadNote('Maintien écran non pris en charge · gardez l’écran allumé', 'warn');
      return false;
    }
    if (state.wakeLock && !state.wakeLock.released) {
      setRoadNote('Écran maintenu actif · surveillance au premier plan', 'ok');
      return true;
    }
    try {
      const lock = await navigator.wakeLock.request('screen');
      state.wakeLock = lock;
      lock.addEventListener('release', () => {
        if (state.wakeLock === lock) state.wakeLock = null;
        if (monitoringActive() && document.visibilityState === 'visible') {
          setRoadNote('Maintien écran interrompu · nouvelle tentative…', 'warn');
          state.reacquireTimer = setTimeout(() => requestWakeLock(false), 1200);
        }
      }, { once: true });
      setRoadNote('Écran maintenu actif · surveillance au premier plan', 'ok');
      return true;
    } catch (err) {
      console.warn('Wake Lock indisponible', err);
      setRoadNote('Maintien écran refusé · gardez l’écran allumé', 'warn');
      return false;
    }
  }

  function setSuspendedUI() {
    setRoadNote('Surveillance suspendue en arrière-plan', 'warn');
    if (alarmActive()) return;
    els.engineBadge.className = 'status-pill suspended';
    const label = els.engineBadge.querySelector('span:last-child');
    if (label) label.textContent = 'SURVEILLANCE SUSPENDUE';
    if (els.vigilanceLevel) {
      els.vigilanceLevel.textContent = 'SUSPENDUE';
      els.vigilanceLevel.style.color = 'var(--amber)';
    }
    if (els.vigilanceHint) els.vigilanceHint.textContent = 'application en arrière-plan · analyse non garantie';
    if (els.statusCard) els.statusCard.dataset.vigilance = 'warn';
  }

  function markBackgroundSuspended() {
    if (!monitoringActive()) return;
    state.wasMonitoring = true;
    if (!state.suspendedAt) state.suspendedAt = Date.now();
    setSuspendedUI();
    releaseWakeLock();
  }

  function cameraHealthy() {
    const stream = els.camera.srcObject;
    const tracks = stream?.getVideoTracks?.() || [];
    return tracks.some(track => track.readyState === 'live' && track.enabled);
  }

  async function waitForMonitoring(timeout = 6500) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (monitoringActive()) return true;
      await sleep(120);
    }
    return false;
  }

  async function restartMonitoring() {
    if (!monitoringActive()) return false;
    try { els.stopBtn.click(); } catch {}
    await sleep(280);
    try { els.startBtn.click(); } catch {}
    return waitForMonitoring();
  }

  async function resumeAfterBackground() {
    if (!state.wasMonitoring || state.resumeInProgress || document.visibilityState !== 'visible') return;
    state.resumeInProgress = true;
    const elapsed = state.suspendedAt ? Math.max(0, Date.now() - state.suspendedAt) : 0;
    setRoadNote('Reprise automatique de la surveillance…', 'warn');
    if (!alarmActive()) {
      els.engineBadge.className = 'status-pill suspended';
      const label = els.engineBadge.querySelector('span:last-child');
      if (label) label.textContent = 'REPRISE…';
      if (els.vigilanceHint) els.vigilanceHint.textContent = 'vérification de la caméra…';
    }

    await sleep(180);
    let healthy = cameraHealthy();
    if (healthy) {
      try { await els.camera.play(); } catch { healthy = false; }
    }

    let restarted = false;
    if (!healthy && monitoringActive()) {
      showToast('Le flux caméra a été interrompu en arrière-plan. Relance automatique en cours…', 'warn', 6000);
      restarted = await restartMonitoring();
      healthy = restarted || cameraHealthy();
    }

    if (healthy && monitoringActive()) {
      await requestWakeLock(false);
      if (!alarmActive()) {
        els.engineBadge.className = 'status-pill live';
        const label = els.engineBadge.querySelector('span:last-child');
        if (label) label.textContent = 'SURVEILLANCE ACTIVE';
        if (els.vigilanceHint) els.vigilanceHint.textContent = 'analyse reprise automatiquement';
      }
      const seconds = Math.max(1, Math.round(elapsed / 1000));
      showToast(`Surveillance reprise automatiquement après ${seconds} s en arrière-plan${restarted ? ' · caméra relancée' : ''}.`, 'ok', 5500);
    } else if (state.wasMonitoring) {
      setRoadNote('Reprise impossible · redémarrez la surveillance', 'danger');
      showToast('La surveillance n’a pas pu reprendre automatiquement. Appuyez sur Démarrer avant de reprendre la route.', 'danger', 8000);
    }

    state.wasMonitoring = false;
    state.suspendedAt = 0;
    state.resumeInProgress = false;
  }

  async function syncMonitoringState() {
    if (monitoringActive()) {
      if (document.visibilityState === 'visible') await requestWakeLock(false);
      else markBackgroundSuspended();
    } else {
      state.wasMonitoring = false;
      state.suspendedAt = 0;
      await releaseWakeLock();
      setRoadNote(state.originalRoadNote, '');
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') markBackgroundSuspended();
    else if (state.wasMonitoring) resumeAfterBackground();
    else syncMonitoringState();
  });

  window.addEventListener('pagehide', () => markBackgroundSuspended());
  window.addEventListener('pageshow', () => {
    if (document.visibilityState === 'visible' && state.wasMonitoring) resumeAfterBackground();
  });

  els.startBtn.addEventListener('click', () => {
    requestWakeLock(true);
    setTimeout(syncMonitoringState, 1800);
  });
  els.stopBtn.addEventListener('click', () => setTimeout(syncMonitoringState, 50));

  const observer = new MutationObserver(syncMonitoringState);
  observer.observe(els.startBtn, { attributes: true, attributeFilter: ['disabled'] });
  observer.observe(els.stopBtn, { attributes: true, attributeFilter: ['disabled'] });

  window.addEventListener('beforeunload', () => releaseWakeLock());
  syncMonitoringState();
})();
