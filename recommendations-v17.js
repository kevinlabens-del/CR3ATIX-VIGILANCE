(() => {
  const $ = s => document.querySelector(s);
  const els = {
    banner: $('#recommendationBanner'), icon: $('#recommendationIcon'), level: $('#recommendationLevel'),
    title: $('#recommendationTitle'), text: $('#recommendationText'), startBreak: $('#startBreakBtn'),
    dismiss: $('#dismissRecommendationBtn'), breakPanel: $('#breakPanel'), breakCountdown: $('#breakCountdown'),
    endBreak: $('#endBreakBtn'), voice: $('#recommendationVoice'), watchTime: $('#watchTime'),
    vigilance: $('#vigilanceLevel'), perclos: $('#perclos'), yawns: $('#yawnCount'),
    startBtn: $('#startBtn'), stopBtn: $('#stopBtn'), riskOverlay: $('#riskOverlay'), alarmVolume: $('#alarmVolume')
  };
  if (!els.banner || !els.dismiss || !els.vigilance) return;

  const VOICE_KEY='cr3atix-vigilance-recommendation-voice-v1';
  const RECS={
    plan90:{severity:'info',icon:'🕒',level:'PRÉVENTION',title:'PRÉVOYEZ UNE PAUSE',text:'La conduite dure depuis environ 1 h 30. Prévoyez un arrêt dans les 30 prochaines minutes, même si la vigilance reste bonne.',voice:'La conduite dure depuis environ une heure trente. Prévoyez une pause dans les trente prochaines minutes.',break:false,cooldown:Infinity},
    break120:{severity:'warn',icon:'☕',level:'PAUSE RECOMMANDÉE',title:'IL EST TEMPS DE FAIRE UNE PAUSE',text:'Environ 2 heures de conduite se sont écoulées. Arrêtez-vous dans un endroit sûr pendant 15 à 20 minutes avant de poursuivre.',voice:'Environ deux heures de conduite se sont écoulées. Une pause de quinze à vingt minutes est recommandée dans un endroit sûr.',break:true,cooldown:30*60*1000},
    yawns:{severity:'warn',icon:'🥱',level:'SIGNES DE FATIGUE',title:'DES BÂILLEMENTS SE RÉPÈTENT',text:'Des signes de fatigue apparaissent. Prévoyez un arrêt prochainement. Hydratez-vous, marchez un peu et reposez-vous. Un café peut aider temporairement mais ne remplace pas le repos.',voice:'Des bâillements répétés indiquent des signes de fatigue. Prévoyez un arrêt prochainement et reposez-vous. Le café ne remplace pas le repos.',break:true,cooldown:15*60*1000},
    repeated:{severity:'warn',icon:'⚠',level:'VIGILANCE EN BAISSE',title:'LES SIGNES DE FATIGUE SE RÉPÈTENT',text:'Plusieurs passages en état d’attention ont été détectés récemment. Arrêtez-vous au prochain endroit sécurisé et reposez-vous avant de continuer.',voice:'Les signes de fatigue se répètent. Arrêtez-vous au prochain endroit sécurisé et reposez-vous avant de continuer.',break:true,cooldown:10*60*1000},
    highFatigue:{severity:'danger',icon:'🛑',level:'FATIGUE ÉLEVÉE',title:'UNE PAUSE EST NÉCESSAIRE',text:'La vigilance est fortement dégradée. Arrêtez-vous dès que possible en sécurité. Une sieste de 15 à 20 minutes est recommandée si la somnolence persiste.',voice:'La vigilance est fortement dégradée. Arrêtez-vous dès que possible en sécurité et reposez-vous. Une sieste courte est recommandée si la somnolence persiste.',break:true,cooldown:8*60*1000},
    danger:{severity:'danger',icon:'🛑',level:'SOMNOLENCE DÉTECTÉE',title:'ARRÊTEZ-VOUS DÈS QUE POSSIBLE',text:'Ne poursuivez pas le trajet tant que la somnolence persiste. Rejoignez un endroit sûr, reposez-vous et envisagez une sieste de 15 à 20 minutes avant de reprendre.',voice:'Somnolence détectée. Arrêtez-vous dès que possible dans un endroit sûr. Ne poursuivez pas le trajet tant que la somnolence persiste.',break:true,cooldown:5*60*1000}
  };
  const rank={info:1,warn:2,danger:3};
  const state={running:false,lastLabel:'EN VEILLE',fatigueEvents:[],active:null,dismissed:new Map(),breakActive:false,breakEndsAt:0,breakTimer:null,voiceEnabled:true};

  function parseSessionMs(){
    const parts=(els.watchTime?.textContent||'0:00').trim().split(':').map(Number);
    if(parts.some(Number.isNaN)) return 0;
    if(parts.length===2) return (parts[0]*60+parts[1])*1000;
    if(parts.length===3) return (parts[0]*3600+parts[1]*60+parts[2])*1000;
    return 0;
  }
  function alarmActive(){return Boolean(els.riskOverlay?.classList.contains('show'));}
  function volume(){return Math.max(0,Math.min(1,Number(els.alarmVolume?.value??85)/100));}
  function speak(text){
    if(!state.voiceEnabled || alarmActive() || !text || !('speechSynthesis' in window)) return;
    try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='fr-FR';u.rate=.96;u.pitch=1;u.volume=volume();speechSynthesis.speak(u);}catch{}
  }
  function hideRecommendation(cancelSpeech=true){
    state.active=null;els.banner.hidden=true;
    if(cancelSpeech&&'speechSynthesis' in window) speechSynthesis.cancel();
  }
  function showRecommendation(id){
    const rec=RECS[id]; if(!rec||state.breakActive) return;
    const now=performance.now(),until=state.dismissed.get(id)||0;
    if(until>now) return;
    if(state.active){
      if(state.active.id===id) return;
      const cur=RECS[state.active.id];
      if(cur&&rank[cur.severity]>rank[rec.severity]) return;
    }
    state.active={id,shownAt:now};
    els.banner.className=`recommendation-banner ${rec.severity}`;
    els.icon.textContent=rec.icon;els.level.textContent=rec.level;els.title.textContent=rec.title;els.text.textContent=rec.text;
    els.startBreak.hidden=!rec.break;els.banner.hidden=false;speak(rec.voice);
  }
  function dismissRecommendation(){
    if(!state.active) return;
    const rec=RECS[state.active.id],now=performance.now(),cooldown=rec?.cooldown??10*60*1000;
    state.dismissed.set(state.active.id,cooldown===Infinity?Infinity:now+cooldown);
    hideRecommendation(true);
  }
  function checkRecommendations(){
    if(!state.running||state.breakActive) return;
    const now=performance.now();
    state.fatigueEvents=state.fatigueEvents.filter(t=>now-t<=10*60*1000);
    const label=(els.vigilance?.textContent||'').trim();
    const p=Number(els.perclos?.textContent)||0,y=Number(els.yawns?.textContent)||0,sessionMs=parseSessionMs();
    let candidate=null;
    if(label==='DANGER') candidate='danger';
    else if(label==='FATIGUE ÉLEVÉE'||p>=35) candidate='highFatigue';
    else if(state.fatigueEvents.length>=3) candidate='repeated';
    else if(y>=2) candidate='yawns';
    else if(sessionMs>=120*60*1000) candidate='break120';
    else if(sessionMs>=90*60*1000) candidate='plan90';
    if(candidate) showRecommendation(candidate);
  }
  function formatBreak(ms){const t=Math.max(0,Math.ceil(ms/1000)),m=Math.floor(t/60),s=t%60;return `${m}:${String(s).padStart(2,'0')}`;}
  function updateBreak(){
    if(!state.breakActive)return;
    const remaining=state.breakEndsAt-Date.now();els.breakCountdown.textContent=formatBreak(remaining);
    if(remaining<=0) endBreak(true);
  }
  function startBreak(){
    if(state.breakActive)return;
    if(state.running&&!els.stopBtn.disabled) els.stopBtn.click();
    hideRecommendation(true);state.breakActive=true;state.breakEndsAt=Date.now()+15*60*1000;els.breakPanel.hidden=false;
    updateBreak();state.breakTimer=setInterval(updateBreak,1000);
    speak('Pause de quinze minutes démarrée. Reposez-vous et ne reprenez la route que si vous vous sentez pleinement réveillé et vigilant.');
  }
  function endBreak(completed=false){
    if(!state.breakActive)return;
    state.breakActive=false;if(state.breakTimer)clearInterval(state.breakTimer);state.breakTimer=null;state.breakEndsAt=0;els.breakPanel.hidden=true;
    state.fatigueEvents=[];state.dismissed.clear();
    if(completed)speak("La pause de quinze minutes est terminée. Avant de reprendre la route, assurez-vous d'être pleinement réveillé et vigilant.");
  }
  function resetSession(){state.fatigueEvents=[];state.dismissed.clear();hideRecommendation(true);}
  function updateVoiceSetting(){state.voiceEnabled=els.voice?.checked!==false;localStorage.setItem(VOICE_KEY,state.voiceEnabled?'1':'0');if(!state.voiceEnabled&&'speechSynthesis'in window)speechSynthesis.cancel();}

  const stored=localStorage.getItem(VOICE_KEY);state.voiceEnabled=stored===null?true:stored==='1';if(els.voice)els.voice.checked=state.voiceEnabled;
  els.dismiss.addEventListener('click',dismissRecommendation);els.startBreak.addEventListener('click',startBreak);els.endBreak.addEventListener('click',()=>endBreak(false));els.voice?.addEventListener('change',updateVoiceSetting);
  els.startBtn?.addEventListener('click',()=>{if(state.breakActive)endBreak(false);});

  setInterval(()=>{
    const running=Boolean(els.startBtn?.disabled&&!els.stopBtn?.disabled);
    if(running&&!state.running){state.running=true;state.lastLabel='EN VEILLE';resetSession();}
    if(!running&&state.running){state.running=false;hideRecommendation(true);}
    if(!state.running||state.breakActive)return;
    const label=(els.vigilance?.textContent||'').trim();
    if(label!==state.lastLabel){
      if(['ATTENTION','DANGER','FATIGUE ÉLEVÉE','VISAGE ABSENT'].includes(label))state.fatigueEvents.push(performance.now());
      state.lastLabel=label;
    }
    checkRecommendations();
  },1000);
})();
