(() => {
'use strict';

const K = {
  setup: 'cr3atix-vigilance-setup-v196',
  cal: 'cr3atix-vigilance-eye-calibration-v1',
  vol: 'cr3atix-vigilance-alarm-volume-v1',
  det: 'cr3atix-vigilance-detection-settings-v172'
};
const VERSION = 196;
const $ = s => document.querySelector(s);
let installPrompt = null;
let calibrationWatcher = null;

const uid = () => globalThis.crypto?.randomUUID?.() || `setup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const blankRun = reason => ({
  id: uid(), reason, startedAt: new Date().toISOString(),
  calibrationConfirmed: false,
  detectionConfirmed: false,
  volumeConfirmed: false,
  voiceConfirmed: false,
  finishedAt: null
});
const fresh = () => ({version: VERSION, completed: false, stage: 'install', completedAt: null, run: null});

function load(){
  try{
    const raw=JSON.parse(localStorage.getItem(K.setup)||'null');
    return raw && raw.version===VERSION ? {...fresh(),...raw} : fresh();
  }catch{return fresh()}
}
function save(patch){
  const next={...load(),...patch,version:VERSION,lastCheckedAt:new Date().toISOString()};
  localStorage.setItem(K.setup,JSON.stringify(next));
  return next;
}
function isInstalled(){
  try{return window.matchMedia?.('(display-mode: standalone)').matches===true || navigator.standalone===true}catch{return false}
}
function calOK(){
  try{
    const v=JSON.parse(localStorage.getItem(K.cal)||'null');
    return !!(v && Number.isFinite(+v.threshold) && Number.isFinite(+v.baseline));
  }catch{return false}
}
function detOK(){
  try{
    const v=JSON.parse(localStorage.getItem(K.det)||'null');
    return !!(v && Number.isFinite(+v.closureDelay) && +v.closureDelay>=.6 && +v.closureDelay<=3 && Number.isFinite(+v.yawnThreshold) && +v.yawnThreshold>=.35 && +v.yawnThreshold<=.85 && ['siren','voice','both'].includes(v.alarmMode));
  }catch{return false}
}
function volOK(){
  const raw=localStorage.getItem(K.vol),v=+raw;
  return raw!==null && Number.isFinite(v) && v>=0 && v<=1;
}
function activeRun(s=load()){return s.run && typeof s.run==='object' && !s.run.finishedAt ? s.run : null}
function startRun(reason='initial'){return save({completed:false,completedAt:null,stage:'settings',run:blankRun(reason)})}
function ensureRun(){const s=load();return activeRun(s)?s:startRun(s.completed?'reconfigure':'initial')}
function patchRun(patch){const s=load(),run=activeRun(s)||blankRun('recovered');return save({run:{...run,...patch}})}
function setupCalOK(s=load()){return calOK() && activeRun(s)?.calibrationConfirmed===true}
function setupDetOK(s=load()){return detOK() && activeRun(s)?.detectionConfirmed===true}
function setupVolOK(s=load()){return volOK() && activeRun(s)?.volumeConfirmed===true}
function setupConfigOK(s=load()){return setupCalOK(s)&&setupDetOK(s)&&setupVolOK(s)}
function ready(s=load()){return isInstalled() && s.completed===true && calOK() && detOK() && volOK()}
function alarmMode(){return $('input[name="alarmMode"]:checked')?.value||'siren'}
function voiceReady(){return !!($('#listenBtn')&&!$('#listenBtn').disabled)}

function showSettings(){
  const home=$('#homeView'),settings=$('#settingsView');
  if(home)home.hidden=true;
  if(settings)settings.hidden=false;
  try{window.scrollTo({top:0,behavior:'auto'})}catch{window.scrollTo(0,0)}
}
function showHome(){
  const home=$('#homeView'),settings=$('#settingsView');
  if(home)home.hidden=false;
  if(settings)settings.hidden=true;
  try{window.scrollTo({top:0,behavior:'auto'})}catch{window.scrollTo(0,0)}
}
function removeInstallOverlay(){
  $('#firstRunOverlay')?.remove();
  document.documentElement.classList.remove('setup-open');
}
function dots(n){return `<div class="setup-progress"><span class="${n>=1?'active':''}">1</span><i></i><span class="${n>=2?'active':''}">2</span><i></i><span class="${n>=3?'active':''}">3</span></div>`}

function installOverlay(){
  let el=$('#firstRunOverlay');
  if(!el){
    el=document.createElement('div');
    el.id='firstRunOverlay';
    el.className='first-run-overlay';
    el.innerHTML='<div class="first-run-card" id="firstRunCard"></div>';
    document.body.appendChild(el);
  }
  el.classList.add('show');
  document.documentElement.classList.add('setup-open');
  return el;
}
function renderInstall(message=''){
  if(isInstalled()){beginConfiguration();return}
  showHome();
  save({completed:false,completedAt:null,stage:'install',run:null});
  const card=installOverlay().querySelector('#firstRunCard');
  card.innerHTML=`${dots(1)}
    <div class="setup-kicker">ÉTAPE 1 · OBLIGATOIRE</div>
    <h2>Installe VIGILANCE</h2>
    <p class="setup-lead">La première étape est l’installation de l’application. Aucun réglage n’est accessible avant cette étape.</p>
    <div class="setup-focus"><span class="setup-focus-icon">↓</span><div><b>Installation requise</b><small>Installe VIGILANCE puis ouvre-la depuis son icône. Dans le navigateur, la configuration reste volontairement verrouillée.</small></div></div>
    ${message?`<div class="setup-message">${message}</div>`:''}
    <div class="setup-actions"><button type="button" id="setupInstallAction" class="setup-primary">${installPrompt?'INSTALLER VIGILANCE':'VÉRIFIER L’INSTALLATION'}</button></div>
    <p class="setup-help">Si aucune fenêtre automatique n’apparaît, utilise le menu ⋮ du navigateur puis « Installer l’application » ou « Ajouter à l’écran d’accueil ». Ouvre ensuite VIGILANCE depuis son icône.</p>`;
  const b=$('#setupInstallAction');
  if(b){b.disabled=false;b.onclick=handleInstallAction}
}
async function handleInstallAction(){
  if(isInstalled()){beginConfiguration();return}
  if(!installPrompt){renderInstall('VIGILANCE est toujours ouverte dans le navigateur. Installe-la avec le menu ⋮, puis lance son icône.');return}
  try{
    await installPrompt.prompt();
    const choice=await installPrompt.userChoice;
    installPrompt=null;
    renderInstall(choice?.outcome==='accepted'?'Installation demandée. Ouvre maintenant VIGILANCE depuis son icône.':'Installation annulée. Elle est obligatoire pour continuer.');
  }catch{renderInstall('La fenêtre automatique n’est pas disponible. Utilise le menu ⋮ du navigateur pour installer VIGILANCE.')}
}

function checklist(){
  const s=load(),c=setupCalOK(s),d=setupDetOK(s),v=setupVolOK(s),voice=voiceReady(),mode=alarmMode();
  return `<div class="setup-checklist">
    <div class="${c?'done':''}"><span>${c?'✓':'1'}</span><p><b>Caméra calibrée</b><small>${c?'Calibration effectuée pendant cette configuration.':'Lance une nouvelle calibration pendant 3 secondes.'}</small></p></div>
    <div class="${d?'done':''}"><span>${d?'✓':'2'}</span><p><b>Détection confirmée</b><small>${d?'Seuils yeux et bâillement confirmés.':'Règle ou confirme les seuils de détection.'}</small></p></div>
    <div class="${v?'done':''}"><span>${v?'✓':'3'}</span><p><b>Volume confirmé</b><small>${v?'Volume d’alarme confirmé.':'Règle ou confirme un volume audible.'}</small></p></div>
    <div class="optional ${voice?'done':''}"><span>${voice?'✓':'○'}</span><p><b>Voix personnelle · facultatif</b><small>${mode==='siren'?'La sirène est sélectionnée.':voice?'Message vocal prêt.':'Enregistre ta voix si tu utilises ce mode.'}</small></p></div>
  </div>`;
}
function persistDisplayedSettings(){
  const volume=$('#alarmVolume'),closure=$('#closureDelay'),yawn=$('#yawnThreshold');
  if(volume){
    const v=Math.max(0,Math.min(100,+volume.value||0))/100;
    localStorage.setItem(K.vol,String(v));
    volume.dispatchEvent(new Event('input',{bubbles:true}));
  }
  if(closure&&yawn){
    localStorage.setItem(K.det,JSON.stringify({closureDelay:+closure.value,yawnThreshold:+yawn.value,alarmMode:alarmMode()}));
  }
}
function guideHost(){
  const settings=$('#settingsView');
  if(!settings)return null;
  let guide=$('#setupGuide');
  if(!guide){
    guide=document.createElement('section');
    guide.id='setupGuide';
    guide.className='setup-guide glass';
    const header=settings.querySelector('.settings-header');
    header?.insertAdjacentElement('afterend',guide);
    if(!header)settings.prepend(guide);
  }
  return guide;
}
function renderGuide(message=''){
  if(!isInstalled()){removeGuide();renderInstall('Installation obligatoire avant les réglages.');return}
  const guide=guideHost();
  if(!guide)return;
  const ok=setupConfigOK();
  guide.innerHTML=`${dots(2)}
    <div class="setup-kicker">CONFIGURATION INITIALE</div>
    <h3>${ok?'Réglages essentiels prêts':'Termine les réglages essentiels'}</h3>
    <p class="setup-lead">Tous les réglages ci-dessous restent directement utilisables. Cette zone ne recouvre aucun bouton de l’application.</p>
    ${message?`<div class="setup-message ${ok?'ok':''}">${message}</div>`:''}
    ${checklist()}
    <div class="setup-actions">
      <button type="button" id="setupConfirmSettings" class="setup-secondary">CONFIRMER DÉTECTION ET VOLUME</button>
      <button type="button" id="setupFinishSettings" class="setup-primary" ${ok?'':'disabled'}>TERMINER LA CONFIGURATION</button>
    </div>`;
  const confirm=$('#setupConfirmSettings'),finish=$('#setupFinishSettings');
  if(confirm){confirm.disabled=false;confirm.onclick=confirmDetectionAndVolume}
  if(finish){finish.onclick=completeConfiguration}
}
function removeGuide(){$('#setupGuide')?.remove()}
function beginConfiguration(message=''){
  if(!isInstalled()){renderInstall('Ouvre VIGILANCE depuis son icône pour continuer.');return}
  removeInstallOverlay();
  ensureRun();
  save({stage:'settings'});
  showSettings();
  renderGuide(message||'Application installée : effectue maintenant les réglages obligatoires.');
  renderStatusPanel();
}
function confirmDetectionAndVolume(){
  if(!isInstalled()){renderInstall('Installation obligatoire avant les réglages.');return}
  persistDisplayedSettings();
  patchRun({detectionConfirmed:detOK(),volumeConfirmed:volOK()});
  renderGuide('Détection et volume confirmés.');
  renderStatusPanel();
}
function completeConfiguration(){
  if(!setupConfigOK()){renderGuide('Il reste au moins une étape obligatoire à terminer.');return}
  const s=load(),now=new Date().toISOString(),run=activeRun(s);
  save({completed:true,completedAt:now,stage:'done',run:run?{...run,finishedAt:now}:null});
  removeGuide();
  removeInstallOverlay();
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
  const installed=isInstalled(),ok=ready();
  section.innerHTML=`<div class="section-heading"><span class="section-icon">✓</span><div><span class="eyebrow">MISE EN ROUTE</span><h3>État de configuration</h3></div></div>
    <div class="setup-status-grid">
      <div><span>Application</span><b>${installed?'✓ Installée':'À installer'}</b></div>
      <div><span>Caméra</span><b>${calOK()?'✓ Calibration enregistrée':'À calibrer'}</b></div>
      <div><span>Détection</span><b>${detOK()?'✓ Réglages enregistrés':'À régler'}</b></div>
      <div><span>Volume</span><b>${volOK()?`✓ ${Math.round(+localStorage.getItem(K.vol)*100)} %`:'À confirmer'}</b></div>
    </div>
    <div class="setup-system-state ${ok?'ok':'warn'}">${ok?'✓ VIGILANCE EST PRÊTE À FONCTIONNER':'⚠ CONFIGURATION À TERMINER'}</div>
    <button type="button" id="restartSetupBtn" class="btn secondary">REFAIRE LA CONFIGURATION INITIALE</button>`;
  const b=$('#restartSetupBtn');if(b)b.onclick=restartSetup;
}
function restartSetup(){
  if(!isInstalled()){save({completed:false,completedAt:null,stage:'install',run:null});renderInstall('Installe VIGILANCE avant de recommencer.');return}
  startRun('manual');
  beginConfiguration('Nouvelle configuration démarrée : calibre de nouveau la caméra puis confirme les réglages.');
}

function startCalibrationWatch(){
  if(!isInstalled()||load().completed)return;
  clearInterval(calibrationWatcher);
  const before=localStorage.getItem(K.cal);
  calibrationWatcher=setInterval(()=>{
    const after=localStorage.getItem(K.cal);
    if(after!==before && calOK()){
      clearInterval(calibrationWatcher);calibrationWatcher=null;
      patchRun({calibrationConfirmed:true});
      renderGuide('Calibration caméra enregistrée.');
      renderStatusPanel();
    }
  },250);
  setTimeout(()=>{if(calibrationWatcher){clearInterval(calibrationWatcher);calibrationWatcher=null}},20000);
}

function boot(){
  renderStatusPanel();
  if(!isInstalled()){
    const s=load();
    if(s.completed||s.stage!=='install'||s.run)save({completed:false,completedAt:null,stage:'install',run:null});
    renderInstall();
    return;
  }
  removeInstallOverlay();
  if(ready()){
    removeGuide();
    showHome();
    return;
  }
  ensureRun();
  beginConfiguration();
}

window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();installPrompt=event;
  if(!isInstalled())renderInstall('VIGILANCE est prête à être installée.');
});
window.addEventListener('appinstalled',()=>{
  installPrompt=null;
  if(!isInstalled())renderInstall('Installation terminée. Ouvre maintenant VIGILANCE depuis son icône.');
});
window.addEventListener('pageshow',()=>{
  if(isInstalled()&&!ready()&&!load().completed)beginConfiguration();
  else if(!isInstalled()&&load().stage!=='done')renderInstall();
});

document.addEventListener('click',event=>{
  const t=event.target;
  if(t?.closest?.('#setupInstallAction')){event.preventDefault();handleInstallAction();return}
  if(t?.closest?.('#setupConfirmSettings')){event.preventDefault();confirmDetectionAndVolume();return}
  if(t?.closest?.('#setupFinishSettings')){event.preventDefault();completeConfiguration();return}
  if(t?.closest?.('#restartSetupBtn')){event.preventDefault();restartSetup();return}
  if(t?.closest?.('#calibrateBtn'))startCalibrationWatch();
  if(t?.closest?.('#backBtn') && isInstalled() && !load().completed){
    event.preventDefault();event.stopImmediatePropagation();
    showSettings();renderGuide('Termine la configuration initiale avant de revenir à l’accueil.');
  }
},true);

document.addEventListener('input',event=>{
  if(!isInstalled()||load().completed)return;
  const t=event.target;
  if(t?.matches?.('#alarmVolume,#closureDelay,#yawnThreshold,input[name="alarmMode"]')){
    setTimeout(()=>renderGuide(),0);
  }
});

document.addEventListener('change',event=>{
  if(!isInstalled()||load().completed)return;
  if(event.target?.matches?.('input[name="alarmMode"]'))setTimeout(()=>renderGuide(),0);
});

$('#recordBtn')?.addEventListener('click',()=>{
  if(!isInstalled()||load().completed)return;
  setTimeout(()=>{if(voiceReady())patchRun({voiceConfirmed:true});renderGuide()},5600);
});

if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>reg.update()).catch(()=>{});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
})();