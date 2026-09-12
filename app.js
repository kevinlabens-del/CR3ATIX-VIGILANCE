import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm";

const $ = (s) => document.querySelector(s);
const els = {
  camera: $("#camera"), cameraEmpty: $("#cameraEmpty"), cameraShell: $(".camera-shell"),
  startBtn: $("#startBtn"), stopBtn: $("#stopBtn"), calibrateBtn: $("#calibrateBtn"),
  engineBadge: $("#engineBadge"), faceState: $("#faceState"), fpsValue: $("#fpsValue"),
  eyePct: $("#eyePct"), eyeBar: $("#eyeBar"), watchTime: $("#watchTime"), maxClosure: $("#maxClosure"),
  yawnCount: $("#yawnCount"), perclos: $("#perclos"), vigilanceLevel: $("#vigilanceLevel"),
  vigilanceHint: $("#vigilanceHint"), riskOverlay: $("#riskOverlay"), liveChip: $("#liveChip"),
  historyCanvas: $("#historyCanvas"), chartThreshold: $("#chartThreshold"),
  closureDelay: $("#closureDelay"), closureDelayValue: $("#closureDelayValue"),
  yawnThreshold: $("#yawnThreshold"), yawnThresholdValue: $("#yawnThresholdValue"),
  eyeThresholdValue: $("#eyeThresholdValue"), calibrationState: $("#calibrationState"),
  recordBtn: $("#recordBtn"), listenBtn: $("#listenBtn"), deleteVoiceBtn: $("#deleteVoiceBtn"),
  alarmVolume: $("#alarmVolume"), alarmVolumeValue: $("#alarmVolumeValue"),
  recordState: $("#recordState"), alertLog: $("#alertLog"), alertCount: $("#alertCount"),
  ignoreAlertBtn: $("#ignoreAlertBtn"), exportBtn: $("#exportBtn"), resetTodayBtn: $("#resetTodayBtn"),
  todaySessions: $("#todaySessions"), todayTime: $("#todayTime"), todayAlerts: $("#todayAlerts"),
  todayYawns: $("#todayYawns"), installBtn: $("#installBtn")
};

const state = {
  landmarker: null, stream: null, running: false, raf: null, startedAt: 0, lastFrameAt: 0,
  fpsFrames: 0, fpsTick: performance.now(), fps: 0, faceDetected: false, eyeThreshold: 0.21, openBaseline: null,
  eyeEAR: 0, eyeOpenPct: 0, mouthRatio: 0, closureStartedAt: null, maxClosureMs: 0,
  eyeAlertLatched: false, ignoredUntilOpen: false, alarmActive: false, alertEvents: [],
  yawns: 0, lastYawnAt: 0, yawnLatch: false, history: [], perclosSamples: [],
  audioCtx: null, sirenTimer: null, oscillators: [], voiceBlob: null, voiceUrl: null,
  voiceAudio: null, mediaRecorder: null, recordingStream: null, deferredInstall: null,
  alarmVolume: 0.85,   calibrationSamples: [], calibrationTimer: null, calibrationActive: false, lastStatsPersist: 0
};

const STORAGE_KEY = "cr3atix-vigilance-today-v1";
const ALARM_VOLUME_KEY = "cr3atix-vigilance-alarm-volume-v1";

function loadAlarmVolume(){
  const stored=Number(localStorage.getItem(ALARM_VOLUME_KEY));
  state.alarmVolume=Number.isFinite(stored)?Math.max(0,Math.min(1,stored)):0.85;
  els.alarmVolume.value=String(Math.round(state.alarmVolume*100));
  els.alarmVolumeValue.textContent=`${Math.round(state.alarmVolume*100)} %`;
}
function setAlarmVolume(value){
  state.alarmVolume=Math.max(0,Math.min(1,Number(value)/100));
  localStorage.setItem(ALARM_VOLUME_KEY,String(state.alarmVolume));
  els.alarmVolumeValue.textContent=`${Math.round(state.alarmVolume*100)} %`;
  if(state.voiceAudio) state.voiceAudio.volume=state.alarmVolume;
}


function todayKey(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function loadToday(){
  try{
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if(raw.date !== todayKey()) return {date:todayKey(),sessions:0,totalMs:0,alerts:0,yawns:0};
    return {date:todayKey(),sessions:+raw.sessions||0,totalMs:+raw.totalMs||0,alerts:+raw.alerts||0,yawns:+raw.yawns||0};
  }catch{return {date:todayKey(),sessions:0,totalMs:0,alerts:0,yawns:0}}
}
let today = loadToday();
function saveToday(){localStorage.setItem(STORAGE_KEY,JSON.stringify(today)); renderToday();}
function renderToday(){
  els.todaySessions.textContent=today.sessions;
  els.todayTime.textContent=formatTime(today.totalMs);
  els.todayAlerts.textContent=today.alerts;
  els.todayYawns.textContent=today.yawns;
}
function formatTime(ms){
  const total=Math.max(0,Math.floor(ms/1000)), m=Math.floor(total/60), s=total%60;
  return `${m}:${String(s).padStart(2,"0")}`;
}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function eyeAspect(lm, idx){
  const [p1,p2,p3,p4,p5,p6]=idx.map(i=>lm[i]);
  return (dist(p2,p6)+dist(p3,p5))/(2*Math.max(dist(p1,p4),1e-6));
}
function mouthAspect(lm){
  return dist(lm[13],lm[14]) / Math.max(dist(lm[61],lm[291]),1e-6);
}

async function initLandmarker(){
  if(state.landmarker) return;
  els.engineBadge.querySelector("span:last-child").textContent="CHARGEMENT IA";
  const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
  state.landmarker = await FaceLandmarker.createFromOptions(vision,{
    baseOptions:{
      modelAssetPath:"https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      delegate:"GPU"
    },
    runningMode:"VIDEO", numFaces:1, outputFaceBlendshapes:false, outputFacialTransformationMatrixes:false
  });
}

async function startCamera(){
  if(state.running) return;
  try{
    await initLandmarker();
    state.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:1280},height:{ideal:720}},audio:false});
    els.camera.srcObject=state.stream;
    await els.camera.play();
    state.running=true; state.startedAt=performance.now(); state.lastStatsPersist=state.startedAt;
    state.maxClosureMs=0; state.closureStartedAt=null; state.eyeAlertLatched=false; state.ignoredUntilOpen=false;
    state.yawns=0; state.lastYawnAt=0; state.yawnLatch=false; state.history=[];state.perclosSamples=[];
    today.sessions++;saveToday();
    setRunningUI(true);
    loop();
  }catch(err){
    console.error(err);
    setRunningUI(false);
    els.engineBadge.querySelector("span:last-child").textContent="CAMÉRA REFUSÉE";
    alert("Impossible d'activer la caméra. Vérifie l'autorisation caméra du navigateur et utilise une connexion HTTPS.");
  }
}
function stopCamera(){
  if(!state.running) return;
  state.running=false;
  if(state.raf) cancelAnimationFrame(state.raf);
  state.stream?.getTracks().forEach(t=>t.stop());
  state.stream=null; els.camera.srcObject=null;
  persistElapsed(performance.now(), true);
  stopAlarm();
  setRunningUI(false);
  state.faceDetected=false; els.faceState.textContent="OFF"; els.fpsValue.textContent="0";
}
function setRunningUI(on){
  els.startBtn.disabled=on; els.stopBtn.disabled=!on; els.calibrateBtn.disabled=!on;
  els.cameraEmpty.style.display=on?"none":"flex"; els.cameraShell.classList.toggle("active",on);
  els.liveChip.textContent=on?"LIVE":"PAUSE";els.liveChip.classList.toggle("live",on);
  els.engineBadge.className=`status-pill ${on?"live":"idle"}`;
  els.engineBadge.querySelector("span:last-child").textContent=on?"SURVEILLANCE ACTIVE":"EN VEILLE";
  if(!on){els.vigilanceLevel.textContent="EN VEILLE";els.vigilanceHint.textContent="caméra inactive";els.eyePct.textContent="—";els.eyeBar.style.width="0%"}
}

function persistElapsed(now, force=false){
  if(!state.running && !force) return;
  if(!state.lastStatsPersist) state.lastStatsPersist=now;
  const delta=Math.max(0,now-state.lastStatsPersist);
  if(delta>=1000 || force){
    today.totalMs += delta;
    state.lastStatsPersist=now;
    saveToday();
  }
}

function loop(){
  if(!state.running) return;
  const now=performance.now();
  els.watchTime.textContent=formatTime(now-state.startedAt);
  persistElapsed(now);
  if(els.camera.readyState>=2 && now-state.lastFrameAt>55){
    state.lastFrameAt=now;
    try{
      const result=state.landmarker.detectForVideo(els.camera,now);
      processResult(result,now);
    }catch(err){console.warn(err)}
    state.fpsFrames++;
  }
  if(now-state.fpsTick>=1000){
    state.fps=state.fpsFrames;state.fpsFrames=0;state.fpsTick=now;els.fpsValue.textContent=state.fps;
  }
  drawHistory(now);
  state.raf=requestAnimationFrame(loop);
}

function processResult(result,now){
  const faces=result.faceLandmarks||[];
  if(!faces.length){
    state.faceDetected=false;
    els.faceState.textContent="SEARCH";
    setVigilance("VISAGE ABSENT","replace le visage face à la caméra","warn");
    return;
  }
  state.faceDetected=true;
  els.faceState.textContent="LOCK";
  const lm=faces[0];
  const left=eyeAspect(lm,[33,160,158,133,153,144]);
  const right=eyeAspect(lm,[362,385,387,263,373,380]);
  const ear=(left+right)/2;
  const mouth=mouthAspect(lm);
  state.eyeEAR=ear;state.mouthRatio=mouth;
  const baseline=state.openBaseline || Math.max(state.eyeThreshold/0.58,.28);
  const pct=Math.max(0,Math.min(100,((ear-state.eyeThreshold)/(Math.max(baseline-state.eyeThreshold,.04)))*100));
  state.eyeOpenPct=pct;
  els.eyePct.textContent=Math.round(pct);els.eyeBar.style.width=`${pct}%`;

  const isClosed=ear<state.eyeThreshold;
  state.perclosSamples.push({t:now,closed:isClosed});
  state.perclosSamples=state.perclosSamples.filter(s=>now-s.t<=60000);
  const perclos=state.perclosSamples.length?100*state.perclosSamples.filter(s=>s.closed).length/state.perclosSamples.length:0;
  els.perclos.textContent=Math.round(perclos);

  state.history.push({t:now,ear});
  state.history=state.history.filter(s=>now-s.t<=30000);

  if(isClosed){
    if(state.closureStartedAt===null) state.closureStartedAt=now;
    const closureMs=now-state.closureStartedAt;
    state.maxClosureMs=Math.max(state.maxClosureMs,closureMs);
    els.maxClosure.textContent=(state.maxClosureMs/1000).toFixed(1);
    const thresholdMs=Number(els.closureDelay.value)*1000;
    if(closureMs>=thresholdMs && !state.eyeAlertLatched && !state.ignoredUntilOpen){
      state.eyeAlertLatched=true;
      triggerAlert("eyes",`Yeux fermés ${(closureMs/1000).toFixed(1)} s`);
    }
    if(closureMs>thresholdMs*.65) setVigilance("DANGER","yeux fermés trop longtemps","danger");
    else setVigilance("ATTENTION","fermeture détectée","warn");
  }else{
    state.closureStartedAt=null;state.eyeAlertLatched=false;state.ignoredUntilOpen=false;
    if(state.alarmActive) stopAlarm();
    if(perclos>35) setVigilance("FATIGUE ÉLEVÉE","PERCLOS élevé sur 60 s","warn");
    else setVigilance("VIGILANT","analyse en temps réel","ok");
  }

  const yawnThreshold=Number(els.yawnThreshold.value);
  if(mouth>yawnThreshold){
    if(!state.yawnLatch && now-state.lastYawnAt>5000){
      state.yawnLatch=true;state.lastYawnAt=now;state.yawns++;els.yawnCount.textContent=state.yawns;
      today.yawns++;saveToday();addLog("yawn","Bâillement détecté",`Ratio bouche ${mouth.toFixed(2)}`);
    }
  }else if(mouth<yawnThreshold*.72){state.yawnLatch=false}
}
function setVigilance(label,hint,type){
  els.vigilanceLevel.textContent=label;els.vigilanceHint.textContent=hint;
  els.vigilanceLevel.style.color=type==="danger"?"var(--red)":type==="warn"?"var(--amber)":"var(--green)";
}
function triggerAlert(type,detail){
  today.alerts++;saveToday();
  addLog(type,"Alerte fermeture des yeux",detail);
  startAlarm();
}
function addLog(type,title,detail){
  const evt={time:new Date(),type,title,detail};state.alertEvents.unshift(evt);renderLog();
}
function renderLog(){
  els.alertCount.textContent=state.alertEvents.length;
  if(!state.alertEvents.length){els.alertLog.innerHTML='<div class="empty-log">Aucune alerte pour l’instant.</div>';return}
  els.alertLog.innerHTML=state.alertEvents.map(e=>`
    <div class="alert-item">
      <div class="alert-icon">${e.type==="yawn"?"◔":"!"}</div>
      <div><strong>${escapeHtml(e.title)}</strong><span>${escapeHtml(e.detail)}</span></div>
      <span class="alert-time">${e.time.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</span>
    </div>`).join("");
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}

function startAlarm(){
  if(state.alarmActive) return;
  state.alarmActive=true;els.riskOverlay.classList.add("show");els.ignoreAlertBtn.disabled=false;
  els.engineBadge.className="status-pill alert";els.engineBadge.querySelector("span:last-child").textContent="ALERTE FATIGUE";
  const mode=document.querySelector('input[name="alarmMode"]:checked')?.value||"siren";
  if(mode==="siren"||mode==="both") startSiren();
  if((mode==="voice"||mode==="both")&&state.voiceUrl) startVoiceLoop();
}
function stopAlarm(){
  state.alarmActive=false;els.riskOverlay.classList.remove("show");els.ignoreAlertBtn.disabled=true;
  if(state.running){els.engineBadge.className="status-pill live";els.engineBadge.querySelector("span:last-child").textContent="SURVEILLANCE ACTIVE"}
  stopSiren(); stopVoice();
}
function startSiren(){
  stopSiren();
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  state.audioCtx=state.audioCtx||new AC(); if(state.audioCtx.state==="suspended")state.audioCtx.resume();
  const chirp=()=>{
    if(!state.alarmActive)return;
    const o=state.audioCtx.createOscillator(),g=state.audioCtx.createGain();
    o.type="sawtooth";o.frequency.setValueAtTime(650,state.audioCtx.currentTime);o.frequency.exponentialRampToValueAtTime(1100,state.audioCtx.currentTime+.32);
    const peak=Math.max(.0001,.22*state.alarmVolume);
    g.gain.setValueAtTime(.0001,state.audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(peak,state.audioCtx.currentTime+.03);g.gain.exponentialRampToValueAtTime(.0001,state.audioCtx.currentTime+.38);
    o.connect(g).connect(state.audioCtx.destination);o.start();o.stop(state.audioCtx.currentTime+.4);
    state.oscillators.push(o);
  };
  chirp();state.sirenTimer=setInterval(chirp,520);
}
function stopSiren(){
  if(state.sirenTimer)clearInterval(state.sirenTimer);state.sirenTimer=null;
  state.oscillators.forEach(o=>{try{o.stop()}catch{}});state.oscillators=[];
}
function startVoiceLoop(){
  stopVoice(); if(!state.voiceUrl)return;
  const a=new Audio(state.voiceUrl);a.loop=true;a.volume=state.alarmVolume;a.play().catch(()=>{});state.voiceAudio=a;
}
function stopVoice(){if(state.voiceAudio){state.voiceAudio.pause();state.voiceAudio.currentTime=0;state.voiceAudio=null}}

async function recordVoice(){
  if(state.mediaRecorder)return;
  try{
    const s=await navigator.mediaDevices.getUserMedia({audio:true});
    state.recordingStream=s;const chunks=[];
    const rec=new MediaRecorder(s);state.mediaRecorder=rec;
    rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
    rec.onstop=()=>{
      state.voiceBlob=new Blob(chunks,{type:rec.mimeType||"audio/webm"});
      if(state.voiceUrl)URL.revokeObjectURL(state.voiceUrl);state.voiceUrl=URL.createObjectURL(state.voiceBlob);
      state.mediaRecorder=null;state.recordingStream?.getTracks().forEach(t=>t.stop());state.recordingStream=null;
      els.listenBtn.disabled=false;els.deleteVoiceBtn.disabled=false;els.recordBtn.disabled=false;els.recordBtn.textContent="● ENREGISTRER 5 S";els.recordState.textContent="Message vocal prêt.";
    };
    rec.start();els.recordBtn.disabled=true;els.recordBtn.textContent="● ENREGISTREMENT…";els.recordState.textContent="Parle maintenant — 5 secondes.";
    setTimeout(()=>{if(rec.state!=="inactive")rec.stop()},5000);
  }catch{els.recordState.textContent="Microphone refusé ou indisponible."}
}
function listenVoice(){if(state.voiceUrl){const a=new Audio(state.voiceUrl);a.volume=state.alarmVolume;a.play().catch(()=>{})}}
function deleteVoice(){
  stopVoice();if(state.voiceUrl)URL.revokeObjectURL(state.voiceUrl);state.voiceUrl=null;state.voiceBlob=null;
  els.listenBtn.disabled=true;els.deleteVoiceBtn.disabled=true;els.recordState.textContent="Aucun message enregistré.";
}

async function calibrate(){
  if(!state.running || state.calibrationActive) return;
  state.calibrationActive=true;
  state.calibrationSamples=[];
  els.calibrateBtn.disabled=true;
  els.calibrationState.textContent="(préparation…)";

  const originalLabel="CALIBRER — 3 S";
  const started=performance.now();
  let lastSecond=null;

  const finish=(ok,message)=>{
    state.calibrationActive=false;
    state.calibrationTimer=null;
    els.calibrateBtn.textContent=originalLabel;
    els.calibrateBtn.disabled=!state.running;
    els.calibrationState.textContent=message;
    if(ok){
      els.calibrateBtn.classList.add("calibration-ok");
      setTimeout(()=>els.calibrateBtn.classList.remove("calibration-ok"),1200);
    }
  };

  const grab=()=>{
    if(!state.running){finish(false,"(annulée : caméra arrêtée)");return;}

    const elapsed=performance.now()-started;
    const remaining=Math.max(0,3-Math.floor(elapsed/1000));
    if(remaining!==lastSecond){
      lastSecond=remaining;
      els.calibrateBtn.textContent=remaining>0?`REGARDE LA CAMÉRA — ${remaining}`:"CALCUL…";
    }

    // On ne conserve que des valeurs plausibles avec un visage effectivement verrouillé.
    if(state.faceDetected && Number.isFinite(state.eyeEAR) && state.eyeEAR>0.08 && state.eyeEAR<0.6){
      state.calibrationSamples.push(state.eyeEAR);
      els.calibrationState.textContent=`(mesure… ${state.calibrationSamples.length} échantillons)`;
    }else{
      els.calibrationState.textContent="(cherche ton visage… garde les yeux ouverts)";
    }

    if(elapsed<3000){
      state.calibrationTimer=requestAnimationFrame(grab);
      return;
    }

    if(state.calibrationSamples.length<12){
      finish(false,"(échec : visage insuffisamment détecté — réessaie face à la caméra)");
      return;
    }

    const sorted=[...state.calibrationSamples].sort((a,b)=>a-b);
    const lo=Math.floor(sorted.length*.15), hi=Math.max(lo+1,Math.ceil(sorted.length*.85));
    const trimmed=sorted.slice(lo,hi);
    const avg=trimmed.reduce((a,b)=>a+b,0)/trimmed.length;

    if(!Number.isFinite(avg) || avg<=0){
      finish(false,"(échec : mesure invalide)");
      return;
    }

    state.openBaseline=avg;
    state.eyeThreshold=Math.max(.12,Math.min(.34,avg*.58));
    els.eyeThresholdValue.textContent=state.eyeThreshold.toFixed(2);
    els.chartThreshold.textContent=state.eyeThreshold.toFixed(2);
    finish(true,`(calibré ✓ ouverture ${avg.toFixed(2)})`);
  };

  grab();
}

function drawHistory(now){
  const c=els.historyCanvas,rect=c.getBoundingClientRect(),dpr=Math.max(1,Math.min(2,devicePixelRatio||1));
  const w=Math.max(300,rect.width),h=180;
  if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr)}
  const ctx=c.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  ctx.strokeStyle="rgba(120,148,210,.08)";ctx.lineWidth=1;
  for(let i=1;i<5;i++){const y=(h/5)*i;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
  const maxY=.42,minY=.08;
  const ty=v=>h-((Math.max(minY,Math.min(maxY,v))-minY)/(maxY-minY))*h;
  const thresholdY=ty(state.eyeThreshold);ctx.strokeStyle="rgba(255,203,92,.28)";ctx.setLineDash([5,6]);ctx.beginPath();ctx.moveTo(0,thresholdY);ctx.lineTo(w,thresholdY);ctx.stroke();ctx.setLineDash([]);
  if(state.history.length<2)return;
  ctx.strokeStyle="#2be7ff";ctx.lineWidth=2;ctx.shadowColor="rgba(43,231,255,.35)";ctx.shadowBlur=10;ctx.beginPath();
  state.history.forEach((s,i)=>{const x=w-(Math.min(30000,now-s.t)/30000)*w,y=ty(s.ear);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();ctx.shadowBlur=0;
}

function exportCSV(){
  const rows=[["time","type","title","detail"],...state.alertEvents.slice().reverse().map(e=>[e.time.toISOString(),e.type,e.title,e.detail])];
  const csv=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=`cr3atix-vigilance-${todayKey()}.csv`;a.click();URL.revokeObjectURL(url);
}
function resetToday(){
  if(!confirm("Réinitialiser les statistiques d'aujourd'hui ?"))return;
  today={date:todayKey(),sessions:0,totalMs:0,alerts:0,yawns:0};saveToday();
}

els.startBtn.addEventListener("click",startCamera);els.stopBtn.addEventListener("click",stopCamera);
els.calibrateBtn.addEventListener("click",calibrate);
els.closureDelay.addEventListener("input",()=>els.closureDelayValue.textContent=`${Number(els.closureDelay.value).toFixed(1)} s`);
els.yawnThreshold.addEventListener("input",()=>els.yawnThresholdValue.textContent=Number(els.yawnThreshold.value).toFixed(2));
els.ignoreAlertBtn.addEventListener("click",()=>{state.ignoredUntilOpen=true;stopAlarm()});
els.recordBtn.addEventListener("click",recordVoice);els.listenBtn.addEventListener("click",listenVoice);els.deleteVoiceBtn.addEventListener("click",deleteVoice);
els.alarmVolume.addEventListener("input",()=>setAlarmVolume(els.alarmVolume.value));
els.exportBtn.addEventListener("click",exportCSV);els.resetTodayBtn.addEventListener("click",resetToday);
window.addEventListener("beforeunload",()=>{if(state.running)persistElapsed(performance.now(),true)});
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();state.deferredInstall=e;els.installBtn.hidden=false});
els.installBtn.addEventListener("click",async()=>{if(!state.deferredInstall)return;state.deferredInstall.prompt();await state.deferredInstall.userChoice;state.deferredInstall=null;els.installBtn.hidden=true});
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
loadAlarmVolume();renderToday();renderLog();drawHistory(performance.now());
