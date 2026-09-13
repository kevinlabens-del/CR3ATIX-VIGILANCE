(() => {
'use strict';

const $ = (s) => document.querySelector(s);
const level = $('#vigilanceLevel');
const hint = $('#vigilanceHint');
const card = document.querySelector('.home-status-card');
const startBtn = $('#startBtn');
const stopBtn = $('#stopBtn');
const closureDelay = $('#closureDelay');
const perclos = $('#perclos');
if (!level || !hint || !card) return;

const CFG = Object.freeze({
  blinkIgnoreMs: 420,
  attentionMs: 450,
  openRecoveryWarnMs: 750,
  openRecoveryDangerMs: 2000,
  faceReturnMs: 750,
  perclosWarmupMs: 30000,
  perclosEnter: 35,
  perclosEnterHoldMs: 5000,
  perclosExit: 25,
  perclosExitHoldMs: 8000,
  perclosAfterFaceLossMs: 10000
});

const state = {
  rawLabel: (level.textContent || 'EN VEILLE').trim(),
  rawHint: (hint.textContent || '').trim(),
  stableLabel: 'EN VEILLE',
  stableHint: 'caméra inactive',
  stableType: 'idle',
  running: false,
  sessionStartedAt: 0,
  closureCandidateAt: null,
  openCandidateAt: null,
  faceMissingAt: null,
  faceReturnAt: null,
  lastFaceLossAt: -Infinity,
  fatigueCandidateAt: null,
  fatigueRecoveryAt: null,
  fatigueActive: false,
  writing: false,
  testMode: false
};

function nowMs(){ return performance.now(); }
function typeFor(label){
  if (label === 'DANGER') return 'danger';
  if (label === 'ATTENTION' || label === 'FATIGUE ÉLEVÉE') return 'warn';
  if (label === 'VIGILANT') return 'ok';
  return 'idle';
}
function runningNow(){
  if (state.testMode) return state.running;
  return Boolean(startBtn?.disabled && !stopBtn?.disabled);
}
function thresholdMs(){
  const seconds = Number(closureDelay?.value ?? 1.2);
  return Math.max(600, Math.min(3000, Number.isFinite(seconds) ? seconds * 1000 : 1200));
}
function perclosNow(){
  const value = Number(perclos?.textContent ?? 0);
  return Number.isFinite(value) ? value : 0;
}
function resetTransient(at){
  state.closureCandidateAt = null;
  state.openCandidateAt = null;
  state.faceMissingAt = null;
  state.faceReturnAt = null;
  state.lastFaceLossAt = -Infinity;
  state.fatigueCandidateAt = null;
  state.fatigueRecoveryAt = null;
  state.fatigueActive = false;
  state.sessionStartedAt = at;
}
function applyStable(labelValue, hintValue, typeValue = typeFor(labelValue)){
  const changed = labelValue !== state.stableLabel || hintValue !== state.stableHint || typeValue !== state.stableType;
  state.stableLabel = labelValue;
  state.stableHint = hintValue;
  state.stableType = typeValue;
  document.documentElement.dataset.stableVigilance = labelValue;
  document.documentElement.dataset.stableVigilanceType = typeValue;
  if (!changed && level.textContent === labelValue && hint.textContent === hintValue && card.dataset.vigilance === typeValue) return;

  state.writing = true;
  level.textContent = labelValue;
  hint.textContent = hintValue;
  level.style.color = typeValue === 'danger' ? 'var(--red)' : typeValue === 'warn' ? 'var(--amber)' : typeValue === 'ok' ? 'var(--green)' : '';
  card.dataset.vigilance = typeValue;
  queueMicrotask(() => { state.writing = false; });
}

function evaluate(at = nowMs()){
  const running = runningNow();
  if (running && !state.running){
    state.running = true;
    resetTransient(at);
    applyStable('ANALYSE', 'stabilisation de la détection…', 'idle');
  } else if (!running && state.running){
    state.running = false;
    resetTransient(at);
    applyStable('EN VEILLE', 'caméra inactive', 'idle');
    return;
  }
  if (!running){
    applyStable('EN VEILLE', 'caméra inactive', 'idle');
    return;
  }

  const raw = state.rawLabel;

  // La perte du visage est un état du capteur, pas une conclusion de fatigue.
  if (raw === 'VISAGE ABSENT'){
    if (state.faceMissingAt === null) state.faceMissingAt = at;
    state.lastFaceLossAt = at;
    state.faceReturnAt = null;
    state.closureCandidateAt = null;
    state.openCandidateAt = null;
    applyStable('ANALYSE EN PAUSE', 'visage hors cadre · replace-toi face à la caméra', 'idle');
    return;
  }
  if (state.faceMissingAt !== null){
    if (state.faceReturnAt === null) state.faceReturnAt = at;
    if (at - state.faceReturnAt < CFG.faceReturnMs){
      applyStable('ANALYSE', 'visage retrouvé · vérification en cours…', 'idle');
      return;
    }
    state.faceMissingAt = null;
    state.faceReturnAt = null;
    state.closureCandidateAt = null;
    state.openCandidateAt = null;
  }

  const rawClosed = raw === 'ATTENTION' || raw === 'DANGER';
  if (rawClosed){
    state.openCandidateAt = null;
    if (state.closureCandidateAt === null) state.closureCandidateAt = at;
    const closedFor = Math.max(0, at - state.closureCandidateAt);
    const dangerAt = thresholdMs();

    if (closedFor >= dangerAt){
      applyStable('DANGER', 'fermeture prolongée confirmée', 'danger');
      return;
    }
    if (closedFor >= CFG.attentionMs){
      applyStable('ATTENTION', 'fermeture des yeux confirmée', 'warn');
      return;
    }

    // Clignement court : on conserve l’état précédent au lieu de faire clignoter l’interface.
    if (state.stableLabel === 'DANGER' || state.stableLabel === 'ATTENTION') return;
    applyStable('VIGILANT', 'analyse en temps réel', 'ok');
    return;
  }

  // Une seule frame ouverte ne doit pas effacer instantanément une fermeture réelle.
  if (state.closureCandidateAt !== null){
    if (state.openCandidateAt === null) state.openCandidateAt = at;
    const recovery = state.stableLabel === 'DANGER' ? CFG.openRecoveryDangerMs : CFG.openRecoveryWarnMs;
    if (at - state.openCandidateAt < recovery) return;
    state.closureCandidateAt = null;
    state.openCandidateAt = null;
  }

  // PERCLOS : pas de diagnostic sur quelques secondes, entrée/sortie avec hystérésis.
  const elapsed = Math.max(0, at - state.sessionStartedAt);
  const p = perclosNow();
  const faceStableLongEnough = at - state.lastFaceLossAt >= CFG.perclosAfterFaceLossMs;
  if (state.fatigueActive){
    if (p <= CFG.perclosExit){
      if (state.fatigueRecoveryAt === null) state.fatigueRecoveryAt = at;
      if (at - state.fatigueRecoveryAt >= CFG.perclosExitHoldMs){
        state.fatigueActive = false;
        state.fatigueCandidateAt = null;
        state.fatigueRecoveryAt = null;
      }
    } else {
      state.fatigueRecoveryAt = null;
    }
    if (state.fatigueActive){
      applyStable('FATIGUE ÉLEVÉE', 'PERCLOS élevé et persistant', 'warn');
      return;
    }
  }

  if (elapsed >= CFG.perclosWarmupMs && faceStableLongEnough && p >= CFG.perclosEnter){
    if (state.fatigueCandidateAt === null) state.fatigueCandidateAt = at;
    if (at - state.fatigueCandidateAt >= CFG.perclosEnterHoldMs){
      state.fatigueActive = true;
      state.fatigueRecoveryAt = null;
      applyStable('FATIGUE ÉLEVÉE', 'PERCLOS élevé et persistant', 'warn');
      return;
    }
  } else if (p < CFG.perclosEnter - 3){
    state.fatigueCandidateAt = null;
  }

  applyStable('VIGILANT', 'analyse stable en temps réel', 'ok');
}

function captureRaw(){
  if (state.writing) return;
  const rawLabel = (level.textContent || '').trim();
  const rawHint = (hint.textContent || '').trim();
  if (rawLabel) state.rawLabel = rawLabel;
  state.rawHint = rawHint;
  evaluate();
}

const observer = new MutationObserver(captureRaw);
observer.observe(level, {subtree:true, childList:true, characterData:true});
observer.observe(hint, {subtree:true, childList:true, characterData:true});
observer.observe(card, {attributes:true, attributeFilter:['data-vigilance']});

setInterval(() => {
  if (!state.testMode) evaluate();
}, 120);

// Petit hook de test déterministe utilisé par la CI ; sans effet sur le fonctionnement normal.
window.__vigilanceStability = Object.freeze({
  startTest(at = 0){
    state.testMode = true;
    state.running = true;
    resetTransient(at);
    state.rawLabel = 'VIGILANT';
    applyStable('VIGILANT', 'analyse stable en temps réel', 'ok');
  },
  stopTest(){ state.testMode = false; },
  feedRaw(labelValue, hintValue = '', at = 0){
    state.rawLabel = labelValue;
    state.rawHint = hintValue;
    evaluate(at);
    return this.snapshot();
  },
  snapshot(){
    return {
      label: state.stableLabel,
      hint: state.stableHint,
      type: state.stableType,
      fatigueActive: state.fatigueActive,
      closureCandidateAt: state.closureCandidateAt
    };
  },
  config: CFG
});

captureRaw();
})();
