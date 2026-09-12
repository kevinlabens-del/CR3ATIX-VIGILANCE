import fs from 'node:fs';
const fail=m=>{console.error('VERIFY FAIL:',m);process.exit(1)};
const read=p=>fs.readFileSync(p,'utf8');
const index=read('index.html');
const app=read('app.js');
const core=read('app-core-v16.js');
const rec=read('recommendations-v17.js');
const runtime=read('runtime-v18.js');
const runtimeCss=read('runtime-v18.css');
const sw=read('sw.js');

for(const typo of ['Tèsd','Bâuil','VISGCE','IGNORER LA RECOMMANDATION']) if(index.includes(typo)) fail(`texte incorrect: ${typo}`);
for(const id of ['camera','startBtn','stopBtn','ignoreAlertBtn','recommendationBanner','dismissRecommendationBtn','startBreakBtn','calibrateBtn','perclos','yawnCount']) if(!index.includes(`id="${id}"`)) fail(`id manquant: ${id}`);
for(const token of ['calculatePerclos','delegate:"CPU"','alarmSnoozeUntil','yawnStartedAt','DETECTION_SETTINGS_KEY']) if(!core.includes(token)) fail(`stabilisation V1.7.2 absente: ${token}`);
if(core.includes('ignoredUntilOpen')) fail('ancienne logique ignoredUntilOpen encore présente');
for(const token of ['TRIP_KEY','fatigueEpisodeActive','yawnEvents','alarmActive()){hideRecommendation']) if(!rec.includes(token)) fail(`recommandations incomplètes: ${token}`);
if(rec.includes("['ATTENTION','DANGER','FATIGUE ÉLEVÉE','VISAGE ABSENT']")) fail('VISAGE ABSENT ne doit pas compter comme fatigue');

for(const token of ['./runtime-v18.js','./runtime-v18.css']) if(!app.includes(token)) fail(`module V1.8 non chargé: ${token}`);
for(const token of ['navigator.wakeLock.request','visibilitychange','pagehide','pageshow','resumeAfterBackground','restartMonitoring','SURVEILLANCE SUSPENDUE']) if(!runtime.includes(token)) fail(`runtime V1.8 incomplet: ${token}`);
if(!runtime.includes("document.visibilityState !== 'visible'")) fail('Wake Lock non protégé par visibilityState');
if(!runtimeCss.includes('.status-pill.suspended') || !runtimeCss.includes('.runtime-v18-toast')) fail('styles runtime V1.8 incomplets');
if(!sw.includes('cr3atix-vigilance-v1.8')) fail('cache V1.8 absent');
for(const asset of ['runtime-v18.js','runtime-v18.css']) if(!sw.includes(asset)) fail(`asset V1.8 absent du cache: ${asset}`);
if(!sw.includes('e.request.mode==="navigate"')) fail('fallback service worker trop large');

console.log('V1.8 verification OK');
