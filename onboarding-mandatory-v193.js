(() => {
  'use strict';

  const SETUP_KEY = 'cr3atix-vigilance-setup-v19';
  const RELOAD_GUARD = 'cr3atix-vigilance-mandatory-install-reload-v193';

  function isInstalled() {
    try {
      return window.matchMedia?.('(display-mode: standalone)').matches === true ||
        window.matchMedia?.('(display-mode: fullscreen)').matches === true ||
        navigator.standalone === true;
    } catch {
      return false;
    }
  }

  function readSetup() {
    try {
      return JSON.parse(localStorage.getItem(SETUP_KEY) || 'null') || {};
    } catch {
      return {};
    }
  }

  function writeSetup(patch) {
    const next = {
      ...readSetup(),
      ...patch,
      lastCheckedAt: new Date().toISOString()
    };
    localStorage.setItem(SETUP_KEY, JSON.stringify(next));
    return next;
  }

  function forceInstallationStageIfNeeded() {
    if (isInstalled()) {
      sessionStorage.removeItem(RELOAD_GUARD);
      return false;
    }

    const setup = readSetup();
    const wasAllowedToSkip = setup.installSkipped === true;
    const completedWithoutCurrentInstall = setup.completed === true;

    if (!wasAllowedToSkip && !completedWithoutCurrentInstall) return false;

    writeSetup({
      completed: false,
      completedAt: null,
      stage: 'install',
      installSkipped: false
    });

    if (!sessionStorage.getItem(RELOAD_GUARD)) {
      sessionStorage.setItem(RELOAD_GUARD, '1');
      location.reload();
      return true;
    }

    return false;
  }

  function enforceMandatoryInstallUI() {
    document.querySelectorAll('#setupInstallSkip').forEach(button => button.remove());

    const card = document.querySelector('#firstRunCard');
    const installAction = document.querySelector('#setupInstallAction');
    if (!card || !installAction || isInstalled()) return;

    const focusText = card.querySelector('.setup-focus small');
    if (focusText) {
      focusText.textContent = 'Installation obligatoire avant le calibrage et les réglages de VIGILANCE.';
    }

    const lead = card.querySelector('.setup-lead');
    if (lead) {
      lead.textContent = 'Étape 1 obligatoire : installe VIGILANCE. Les réglages ne seront accessibles qu’après validation de l’installation.';
    }

    const help = card.querySelector('.setup-help');
    if (help) {
      help.textContent = 'Installation obligatoire. Si la fenêtre automatique n’apparaît pas, utilise le menu ⋮ du navigateur puis « Installer l’application ». Lance ensuite VIGILANCE depuis son icône pour continuer.';
    }
  }

  if (forceInstallationStageIfNeeded()) return;

  document.addEventListener('click', event => {
    if (event.target?.closest?.('#setupInstallSkip')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  const observer = new MutationObserver(enforceMandatoryInstallUI);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  enforceMandatoryInstallUI();

  window.addEventListener('appinstalled', () => {
    sessionStorage.removeItem(RELOAD_GUARD);
    writeSetup({ installSkipped: false, installDone: true });
  });
})();
