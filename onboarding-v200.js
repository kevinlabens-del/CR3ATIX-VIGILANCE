(() => {
'use strict';

const VERSION = 200;
const K = {
  setup: 'cr3atix-vigilance-setup-v200',
  previousSetup: 'cr3atix-vigilance-setup-v198',
  install: 'cr3atix-vigilance-install-confirmed-v1',
  cal: 'cr3atix-vigilance-eye-calibration-v1',
  vol: 'cr3atix-vigilance-alarm-volume-v1',
  det: 'cr3atix-vigilance-detection-settings-v172'
};
const $ = (s) => document.querySelector(s);
let installPrompt = null;
let installSessionConfirmed = false;
let installPoll = null;
let calibrationPoll = null;
let mountedSection = null;
const anchors = new Map();

const uid = () => globalThis.crypto?.randomUUID?.() || `setup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const blankRun = reason => ({
  id: uid(),
  reason,
  startedAt: new Date().toISOString(),
  calibrationConfirmed: false,
  detectionConfirmed: false,
  alarmConfirmed: false,
  volumeConfirmed: false,
  finishedAt: null
});
const fresh = () => ({version: VERSION, completed: false, step: 1, completedAt: null, run: null});

function load(){
  try{
    const raw = JSON.parse(localStorage.getItem(K.setup) || 'null');
    if(raw && raw.version === VERSION) return {...fresh(), ...raw};
    const prev = JSON.parse(localStorage.getItem(K.previousSetup) || 'null');
    if(prev && prev.version === 198 && prev.completed && calOK() && detOK() && volOK()){
      const migrated = {...fresh(), completed: true, step: 5, completedAt: prev.completedAt || new Date().toISOString(), migratedFrom: 198};
      localStorage.setItem(K.setup, JSON.stringify(migrated));
      return migrated;
    }
  }catch{}
  return fresh();
}
function save(patch){
  const next = {...load(), ...patch, version: VERSION, lastCheckedAt: new Date().toISOString()};
  localStorage.setItem(K.setup, JSON.stringify(next));
  return next;
}
function activeRun(s = load()){
  return s.run && typeof s.run === 'object' && !s.run.finishedAt ? s.run : null;
}
function startRun(reason = 'initial'){
  return save({completed:false, completedAt:null, step:2, run:blankRun(reason)});
}
function patchRun(patch){
  const s = load();
  const run = activeRun(s) || blankRun('recovered');
  return save({run:{...run, ...patch}});
}

function isStandalone(){
  try{return window.matchMedia?.('(display-mode: standalone)').matches === true || navigator.standalone === true}catch{return false}
}
function rememberInstallation(source='detected'){
  installSessionConfirmed = true;
  try{localStorage.setItem(K.install, JSON.stringify({confirmedAt:new Date().toISOString(), source}))}catch{}
}
function recentInstallMarker(maxAgeMs = 10 * 60 * 1000){
  try{
    const marker = JSON.parse(localStorage.getItem(K.install) || 'null');
    const t = Date.parse(marker?.confirmedAt || '');
    return Number.isFinite(t) && Date.now() - t <= maxAgeMs;
  }catch{return false}
}
async function detectInstalledApp(){
  if(isStandalone()){
    rememberInstallation('standalone');
    return true;
  }
  if(installSessionConfirmed) return true;
  if(typeof navigator.getInstalledRelatedApps === 'function'){
    try{
      const apps = await navigator.getInstalledRelatedApps();
      const found = Array.isArray(apps) && apps.some(app => app?.platform === 'webapp');
      if(found) rememberInstallation('getInstalledRelatedApps');
      return found;
    }catch{}
  }
  return recentInstallMarker();
}

function calOK(){
  try{
    const v = JSON.parse(localStorage.getItem(K.cal) || 'null');
    return !!(v && Number.isFinite(+v.threshold) && Number.isFinite(+v.baseline));
  }catch{return false}
}
function detOK(){
  try{
    const v = JSON.parse(localStorage.getItem(K.det) || 'null');
    return !!(v && Number.isFinite(+v.closureDelay) && +v.closureDelay >= .6 && +v.closureDelay <= 3 && Number.isFinite(+v.yawnThreshold) && +v.yawnThreshold >= .35 && +v.yawnThreshold <= .85 && ['siren','voice','both'].includes(v.alarmMode));
  }catch{return false}
}
function volOK(){
  const raw = localStorage.getItem(K.vol), v = +raw;
  return raw !== null && Number.isFinite(v) && v >= 0 && v <= 1;
}
function alarmMode(){return $('input[name="alarmMode"]:checked')?.value || 'siren'}
function voiceReady(){return !!($('#listenBtn') && !$('#listenBtn').disabled)}
function currentVolume(){return Math.max(0, Math.min(100, +($('#alarmVolume')?.value || 0)))}
function currentDetection(){
  return {
    closureDelay:+($('#closureDelay')?.value || 1.2),
    yawnThreshold:+($('#yawnThreshold')?.value || .55),
    alarmMode:alarmMode()
  };
}
function persistDetection(){
  const v = currentDetection();
  localStorage.setItem(K.det, JSON.stringify(v));
  return v;
}
function persistVolume(){
  const v = currentVolume()/100;
  localStorage.setItem(K.vol, String(v));
  $('#alarmVolume')?.dispatchEvent(new Event('input',{bubbles:true}));
  return v;
}

function showHome(){
  const home=$('#homeView'), settings=$('#settingsView');
  if(home) home.hidden=false;
  if(settings) settings.hidden=true;
}
function hideAppViews(){
  const home=$('#homeView'), settings=$('#settingsView');
  if(home) home.hidden=false;
  if(settings) settings.hidden=true;
}
function progress(step){
  const labels=['Installer','Caméra','Détection','Alarme','Prêt'];
  return `<div class="wizard-progress" aria-label="Étape ${step} sur 5">${labels.map((label,i)=>{
    const n=i+1, cls=n<step?'done':n===step?'active':'';
    return `<div class="wizard-progress-step ${cls}"><span>${n<step?'✓':n}</span><small>${label}</small></div>${n<5?'<i></i>':''}`;
  }).join('')}</div>`;
}
function shell(){
  let el=$('#setupWizard');
  if(!el){
    el=document.createElement('div');
    el.id='setupWizard';
    el.className='setup-wizard';
    el.innerHTML=`<div class="setup-wizard-card" role="dialog" aria-modal="true" aria-labelledby="setupWizardTitle">
      <div id="setupWizardProgress"></div>
      <main id="setupWizardBody"></main>
      <footer id="setupWizardFooter"></footer>
    </div>`;
    document.body.appendChild(el);
  }
  document.documentElement.classList.add('setup-wizard-open');
  return el;
}
function closeWizard(){
  stopInstallPolling();
  stopCalibrationPolling();
  restoreMounted();
  $('#setupWizard')?.remove();
  document.documentElement.classList.remove('setup-wizard-open');
}
function setWizard(step, body, footer=''){
  const el=shell();
  $('#setupWizardProgress').innerHTML=progress(step);
  $('#setupWizardBody').innerHTML=body;
  $('#setupWizardFooter').innerHTML=footer;
  const card=el.querySelector('.setup-wizard-card');
  if(card) card.scrollTop=0;
}
function message(text, ok=false){
  const el=$('#wizardMessage');
  if(!el)return;
  el.textContent=text;
  el.classList.toggle('ok',ok);
  el.hidden=!text;
}

function sectionFor(kind){
  if(kind==='calibration') return $('#calibrateBtn')?.closest('.settings-section') || null;
  if(kind==='detection') return $('#closureDelay')?.closest('.settings-section') || null;
  if(kind==='alarm') return $('#alarmVolume')?.closest('.settings-section') || null;
  return null;
}
function ensureAnchor(section){
  if(!section || anchors.has(section))return;
  const marker=document.createComment(`setup-${anchors.size}`);
  section.parentNode?.insertBefore(marker, section);
  anchors.set(section, marker);
}
function restoreSection(section){
  if(!section)return;
  const marker=anchors.get(section);
  if(marker?.parentNode){
    marker.parentNode.insertBefore(section, marker.nextSibling);
    section.classList.remove('setup-wizard-embedded');
  }
}
function restoreMounted(){
  if(mountedSection){restoreSection(mountedSection);mountedSection=null}
}
function restoreAll(){
  restoreMounted();
  for(const section of anchors.keys()) restoreSection(section);
}
function mountSection(kind){
  restoreMounted();
  const section=sectionFor(kind), slot=$('#setupWizardSlot');
  if(!section || !slot)return null;
  ensureAnchor(section);
  section.classList.add('setup-wizard-embedded');
  slot.appendChild(section);
  mountedSection=section;
  return section;
}

function stopInstallPolling(){if(installPoll){clearInterval(installPoll);installPoll=null}}
function startInstallPolling(){
  stopInstallPolling();
  let tries=0;
  installPoll=setInterval(async()=>{
    tries++;
    if(await detectInstalledApp()){
      stopInstallPolling();
      beginSetupAfterInstall('✓ Installation détectée automatiquement.');
    }else if(tries>=30){
      stopInstallPolling();
      message('Installation non détectée pour le moment. Tu peux relancer la détection.',false);
    }
  },1000);
}
function stopCalibrationPolling(){if(calibrationPoll){clearInterval(calibrationPoll);calibrationPoll=null}}
function startCalibrationPolling(){
  stopCalibrationPolling();
  const before=localStorage.getItem(K.cal);
  calibrationPoll=setInterval(()=>{
    const after=localStorage.getItem(K.cal);
    if(after!==before && calOK()){
      stopCalibrationPolling();
      patchRun({calibrationConfirmed:true});
      const next=$('#wizardCalibrationNext');
      if(next)next.disabled=false;
      message('✓ Calibration enregistrée. Tu peux continuer.',true);
      renderStatusPanel();
    }
  },250);
}

function renderInstallStep(note=''){
  restoreMounted();
  save({completed:false, completedAt:null, step:1, run:null});
  setWizard(1,`
    <div class="wizard-kicker">PREMIÈRE MISE EN ROUTE</div>
    <h2 id="setupWizardTitle">Installe VIGILANCE</h2>
    <p class="wizard-lead">Une seule chose à faire ici : installer l’application. Dès qu’Android confirme l’installation, VIGILANCE passe automatiquement à la calibration.</p>
    <div class="wizard-hero-icon">↓</div>
    <div id="wizardMessage" class="wizard-message" ${note?'':'hidden'}>${note}</div>
    <div class="wizard-tip"><b>Si le bouton d’installation n’apparaît pas</b><span>Utilise le menu ⋮ de Chrome puis « Installer l’application ». Tu n’auras pas à revenir chercher un autre réglage.</span></div>`,
    `<button type="button" id="wizardInstallBtn" class="wizard-primary">${installPrompt?'INSTALLER VIGILANCE':'DÉTECTER L’INSTALLATION'}</button>`
  );
  $('#wizardInstallBtn')?.addEventListener('click',handleInstallAction,{once:true});
  startInstallPolling();
}
async function handleInstallAction(){
  if(await detectInstalledApp()){
    beginSetupAfterInstall('✓ Installation détectée.');
    return;
  }
  if(!installPrompt){
    message('Installe VIGILANCE depuis le menu ⋮ de Chrome. La détection automatique reste active.',false);
    $('#wizardInstallBtn')?.addEventListener('click',handleInstallAction,{once:true});
    startInstallPolling();
    return;
  }
  try{
    await installPrompt.prompt();
    const choice=await installPrompt.userChoice;
    installPrompt=null;
    if(choice?.outcome==='accepted'){
      message('Installation en cours… VIGILANCE passera automatiquement à l’étape suivante.',true);
      startInstallPolling();
    }else{
      message('Installation annulée. Elle est nécessaire pour continuer.',false);
      $('#wizardInstallBtn')?.addEventListener('click',handleInstallAction,{once:true});
    }
  }catch{
    message('La fenêtre automatique n’est pas disponible. Utilise le menu ⋮ de Chrome pour installer VIGILANCE.',false);
    $('#wizardInstallBtn')?.addEventListener('click',handleInstallAction,{once:true});
  }
}

function beginSetupAfterInstall(note=''){
  rememberInstallation('setup');
  stopInstallPolling();
  let s=load();
  if(!activeRun(s))s=startRun('initial');
  save({step:2});
  renderCalibrationStep(note);
}
function renderCalibrationStep(note=''){
  save({step:2});
  setWizard(2,`
    <div class="wizard-kicker">ÉTAPE 2 SUR 5</div>
    <h2 id="setupWizardTitle">Calibre tes yeux</h2>
    <p class="wizard-lead">Regarde naturellement la caméra pendant 3 secondes. Cette calibration est obligatoire pour adapter la détection à ton visage.</p>
    <div id="wizardMessage" class="wizard-message ${note?'ok':''}" ${note?'':'hidden'}>${note}</div>
    <div id="setupWizardSlot" class="setup-wizard-slot"></div>`,
    `<button type="button" id="wizardCalibrationNext" class="wizard-primary" disabled>CONTINUER</button>`
  );
  mountSection('calibration');
  const s=load();
  if(activeRun(s)?.calibrationConfirmed && calOK()) $('#wizardCalibrationNext').disabled=false;
  startCalibrationPolling();
  $('#wizardCalibrationNext')?.addEventListener('click',()=>{stopCalibrationPolling();renderDetectionStep()},{once:true});
}
function renderDetectionStep(){
  save({step:3});
  setWizard(3,`
    <div class="wizard-kicker">ÉTAPE 3 SUR 5</div>
    <h2 id="setupWizardTitle">Règle la détection</h2>
    <p class="wizard-lead">Choisis le délai de fermeture des yeux et la sensibilité au bâillement. Les valeurs restent modifiables plus tard dans Paramètres.</p>
    <div id="wizardMessage" class="wizard-message" hidden></div>
    <div id="setupWizardSlot" class="setup-wizard-slot"></div>`,
    `<button type="button" id="wizardDetectionNext" class="wizard-primary">VALIDER ET CONTINUER</button>`
  );
  mountSection('detection');
  $('#wizardDetectionNext')?.addEventListener('click',()=>{
    persistDetection();
    patchRun({detectionConfirmed:detOK()});
    if(!detOK()){message('Vérifie les valeurs de détection avant de continuer.');return}
    renderAlarmStep();
  },{once:true});
}
function alarmNeedsVoice(){return ['voice','both'].includes(alarmMode())}
function updateAlarmStepState(){
  const needs=alarmNeedsVoice(), ready=voiceReady();
  const hint=$('#wizardVoiceHint');
  if(hint){
    hint.hidden=!needs;
    hint.textContent=needs?(ready?'✓ Message vocal prêt.':'Enregistre un message vocal de 5 secondes pour utiliser ce mode.'):'La sirène ne nécessite aucun enregistrement vocal.';
    hint.classList.toggle('ok',needs&&ready);
  }
}
function testVolume(){
  const vol=currentVolume()/100;
  if(vol<=0){message('Le volume est à 0 %. Augmente-le pour entendre le test.');return}
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC){message('Test audio indisponible sur ce navigateur.');return}
  try{
    const ctx=new AC();
    const osc=ctx.createOscillator(), gain=ctx.createGain();
    const now=ctx.currentTime;
    osc.type='sawtooth';osc.frequency.setValueAtTime(650,now);osc.frequency.exponentialRampToValueAtTime(1050,now+.28);
    gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(Math.max(.0001,.18*vol),now+.025);gain.gain.exponentialRampToValueAtTime(.0001,now+.35);
    osc.connect(gain).connect(ctx.destination);osc.start(now);osc.stop(now+.38);
    message(`Test joué à ${currentVolume()} %.`,true);
  }catch{message('Impossible de lancer le test audio.')}
}
function renderAlarmStep(){
  save({step:4});
  setWizard(4,`
    <div class="wizard-kicker">ÉTAPE 4 SUR 5</div>
    <h2 id="setupWizardTitle">Choisis ton alarme</h2>
    <p class="wizard-lead">Sélectionne sirène, voix ou les deux, puis règle un volume clairement audible.</p>
    <div id="wizardMessage" class="wizard-message" hidden></div>
    <div id="setupWizardSlot" class="setup-wizard-slot"></div>
    <div id="wizardVoiceHint" class="wizard-inline-hint"></div>`,
    `<button type="button" id="wizardTestVolume" class="wizard-secondary">TESTER LE VOLUME</button><button type="button" id="wizardAlarmNext" class="wizard-primary">VALIDER L’ALARME</button>`
  );
  mountSection('alarm');
  updateAlarmStepState();
  $('#wizardTestVolume')?.addEventListener('click',testVolume);
  $('#setupWizardSlot')?.addEventListener('change',updateAlarmStepState);
  $('#setupWizardSlot')?.addEventListener('click',()=>setTimeout(updateAlarmStepState,80));
  $('#wizardAlarmNext')?.addEventListener('click',()=>{
    persistDetection();
    persistVolume();
    if(alarmNeedsVoice()&&!voiceReady()){
      message('Le mode choisi utilise ta voix : enregistre d’abord ton message de 5 secondes.');
      updateAlarmStepState();
      return;
    }
    patchRun({alarmConfirmed:true,volumeConfirmed:volOK(),voiceConfirmed:!alarmNeedsVoice()||voiceReady()});
    renderFinalStep();
  });
}
function summaryRows(){
  const d=currentDetection(), mode=alarmMode(), v=currentVolume();
  const modeLabel=mode==='voice'?'Ma voix':mode==='both'?'Sirène + voix':'Sirène';
  return `<div class="wizard-summary">
    <div><span>Application</span><b>✓ Installée</b></div>
    <div><span>Caméra</span><b>${calOK()?'✓ Calibrée':'À calibrer'}</b></div>
    <div><span>Yeux</span><b>${d.closureDelay.toFixed(1)} s</b></div>
    <div><span>Bâillement</span><b>${d.yawnThreshold.toFixed(2)}</b></div>
    <div><span>Alarme</span><b>${modeLabel}</b></div>
    <div><span>Volume</span><b>${Math.round(v)} %</b></div>
    <div><span>Voix</span><b>${alarmNeedsVoice()?(voiceReady()?'✓ Prête':'Manquante'):'Non requise'}</b></div>
  </div>`;
}
function renderFinalStep(){
  restoreMounted();
  save({step:5});
  setWizard(5,`
    <div class="wizard-kicker">ÉTAPE 5 SUR 5</div>
    <h2 id="setupWizardTitle">VIGILANCE est prête</h2>
    <p class="wizard-lead">Tout ce qui est indispensable est configuré. Tu pourras modifier ces réglages plus tard depuis ⚙ Paramètres.</p>
    <div class="wizard-ready-mark">✓</div>
    ${summaryRows()}`,
    `<button type="button" id="wizardFinish" class="wizard-primary">COMMENCER</button>`
  );
  $('#wizardFinish')?.addEventListener('click',completeSetup,{once:true});
}
function completeSetup(){
  const s=load(),run=activeRun(s),now=new Date().toISOString();
  if(!run?.calibrationConfirmed || !run?.detectionConfirmed || !run?.alarmConfirmed || !run?.volumeConfirmed || !calOK() || !detOK() || !volOK()){
    renderCalibrationStep('Un réglage obligatoire manque encore. Reprends la configuration à partir de la calibration.');
    return;
  }
  save({completed:true, step:5, completedAt:now, run:{...run,finishedAt:now}});
  restoreAll();
  closeWizard();
  showHome();
  renderStatusPanel();
}

function injectStatusPanel(){
  if($('#setupSystemPanel'))return;
  const host=$('.settings-sections');
  if(!host)return;
  const section=document.createElement('section');
  section.id='setupSystemPanel';
  section.className='settings-section glass wide-section setup-system-panel';
  host.appendChild(section);
}
function renderStatusPanel(){
  injectStatusPanel();
  const section=$('#setupSystemPanel');
  if(!section)return;
  const s=load();
  section.innerHTML=`<div class="section-heading"><span class="section-icon">✓</span><div><span class="eyebrow">MISE EN ROUTE</span><h3>État de configuration</h3></div></div>
    <div class="setup-status-grid">
      <div><span>Assistant</span><b>${s.completed?'✓ Terminé':'À terminer'}</b></div>
      <div><span>Caméra</span><b>${calOK()?'✓ Calibrée':'À calibrer'}</b></div>
      <div><span>Détection</span><b>${detOK()?'✓ Réglée':'À régler'}</b></div>
      <div><span>Volume</span><b>${volOK()?`✓ ${Math.round(+localStorage.getItem(K.vol)*100)} %`:'À régler'}</b></div>
    </div>
    <button type="button" id="restartSetupBtn" class="btn secondary">REFAIRE L’ASSISTANT DE CONFIGURATION</button>`;
  $('#restartSetupBtn')?.addEventListener('click',restartSetup,{once:true});
}
async function restartSetup(){
  restoreAll();
  const installed=await detectInstalledApp();
  if(installed){
    startRun('manual');
    renderCalibrationStep('Nouvelle configuration démarrée.');
  }else{
    save(fresh());
    renderInstallStep();
  }
}

async function boot(){
  hideAppViews();
  renderStatusPanel();
  const installed=await detectInstalledApp();
  const s=load();
  if(!installed){
    if(s.completed || s.step!==1 || s.run) save({completed:false,completedAt:null,step:1,run:null});
    renderInstallStep();
    return;
  }
  rememberInstallation(isStandalone()?'standalone':'detected');
  if(s.completed && calOK() && detOK() && volOK()){
    closeWizard();
    showHome();
    return;
  }
  if(!activeRun(s)) startRun('initial');
  const current=load();
  const step=Math.max(2,Math.min(5,+current.step||2));
  if(step===2)renderCalibrationStep();
  else if(step===3)renderDetectionStep();
  else if(step===4)renderAlarmStep();
  else renderFinalStep();
}

window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();
  installPrompt=event;
  if(load().step===1&&!load().completed)renderInstallStep('VIGILANCE est prête à être installée.');
});
window.addEventListener('appinstalled',()=>{
  installPrompt=null;
  rememberInstallation('appinstalled');
  beginSetupAfterInstall('✓ Installation terminée.');
});
window.addEventListener('pageshow',()=>{
  if(load().completed)return;
  detectInstalledApp().then(installed=>{
    if(installed && load().step===1)beginSetupAfterInstall('✓ Installation détectée.');
  });
});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible'||load().completed||load().step!==1)return;
  detectInstalledApp().then(installed=>{if(installed)beginSetupAfterInstall('✓ Installation détectée.')});
});

if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>reg.update()).catch(()=>{});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
})();
