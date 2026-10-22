/* RC39: defer participant vote subscriptions until PLAYING. RC38: nomination-scoped readiness, scheduled start, local clock rendering. */
let voteCurrent=null,voteBallots={},voteAcks={},voteHistory={},voteMyRight=false;
let voteReady={},voteScheduleAcks={},voteStartAcks={},voteSessionOff=null,voteSessionId='';
let voteTickHandle=null,voteTickBusy=false,voteRenderedId='',voteRenderedStage='',voteUiKey='';
let voteSubmitting=false,voteLocalYesId='',voteLocalYesPending=false;
let voteAckSubmitting=false,voteAckPendingKey='',voteReadySubmitting=false;
let voteSurfaceId='',voteSurfacePreparing='',voteScheduleAckKey='',voteScheduleAckBusy=false;
let voteGeneration=0,voteRefreshBusy=false;
let voteControlAfter=0;
let voteRoomStarted=false,voteLiveBound=false,voteLiveOffs=[],voteListenerRetryAt=0;
function voteNow(){return Date.now()+(window._serverOffset||0)}
function voteIsActive(){return !!(voteCurrent&&voteCurrent.stage&&voteCurrent.stage!=='CLOSED'&&currentMeta?.phase==='DAY')}
function votePath(v=voteCurrent){return `rooms/${room}/public/vote/sessions/${v.id}`}
function voteMissingReady(v=voteCurrent){return (v.order||[]).filter(p=>voteReady[p.uid]!==true)}
function voteMissingSchedule(v=voteCurrent){return (v.order||[]).filter(p=>voteScheduleAcks[p.uid]!==v.scheduleToken)}
function voteStartListeners(){
 voteSurfaceErrorId='';voteSurfaceLoadMs=0;voteCountPaintKey='';voteCountPaintMs=null;
 voteDropLiveListeners();voteListenerRetryAt=0;voteGeneration++;voteCurrent=null;voteBallots={};voteAcks={};voteReady={};voteScheduleAcks={};voteStartAcks={};voteHistory={};voteMyRight=false;
 voteTickBusy=false;voteSessionId='';voteRenderedId='';voteRenderedStage='';voteSurfaceId='';voteSurfacePreparing='';voteLocalYesId='';voteLocalYesPending=false;voteSubmitting=false;voteAckSubmitting=false;voteReadySubmitting=false;voteScheduleAckKey='';voteScheduleAckBusy=false;voteControlAfter=0;voteRefreshBusy=false;
 voteRoomStarted=true;voteEnsureListeners();
 voteTickHandle=setInterval(voteLoop,100);
}
function voteEnsureListeners(){
 if(!voteRoomStarted||voteLiveBound||!room||currentMeta?.status!=='PLAYING'||Date.now()<voteListenerRetryAt)return;
 voteLiveBound=true;const g=voteGeneration,watchRoom=room;
 function subscribe(ref,callback){
  const cb=s=>{if(g===voteGeneration&&room===watchRoom&&voteRoomStarted)callback(s)};
  voteLiveOffs.push(()=>ref.off('value',cb));
  ref.on('value',cb,error=>{
   if(g!==voteGeneration||room!==watchRoom||!voteRoomStarted)return;
   voteDropLiveListeners();voteListenerRetryAt=Date.now()+3000;
   if(currentMeta?.status==='PLAYING')console.warn('vote subscription will reconnect',error);
  });
 }
 subscribe(db.ref(`rooms/${room}/public/vote/current`),s=>{
  const before=voteIsActive();voteCurrent=s.val();
  voteListenSession();
  if(currentMeta?.phase==='DAY'){
   if(voteIsActive()){grimClearSurface();voteRender();}
   else if(before||document.getElementById('voteScreen'))renderByPhase(currentMeta);
   else voteRefreshDay();
  }
 });
 subscribe(db.ref(`rooms/${room}/public/vote/history`),s=>{voteHistory=s.val()||{};if(currentMeta?.phase==='DAY'&&!voteIsActive())voteRefreshDay()});
 if(!isST)subscribe(db.ref(`rooms/${room}/private/playerVoteRights/${uid}`),s=>{const r=s.val();voteMyRight=r?.eligible===true;window._voteRightsId=r?.voteId||'';voteUpdateLive()});
}
function voteDropLiveListeners(){voteLiveOffs.forEach(off=>off());voteLiveOffs=[];voteLiveBound=false;}
function voteListenSession(){
 const id=voteCurrent?.id||'';if(id===voteSessionId)return;
 if(voteSessionOff)voteSessionOff();voteSessionOff=null;voteSessionId=id;
 voteSurfaceErrorId='';voteSurfaceLoadMs=0;voteCountPaintKey='';voteCountPaintMs=null;voteBallots={};voteAcks={};voteReady={};voteScheduleAcks={};voteStartAcks={};voteSubmitting=false;voteAckSubmitting=false;voteSurfaceId='';voteReadySubmitting=false;voteScheduleAckKey='';voteLocalYesId='';voteLocalYesPending=false;
 if(!id)return;
 const watchRoom=room,g=voteGeneration,ref=db.ref(votePath());
 const cb=s=>{if(g!==voteGeneration||room!==watchRoom||voteCurrent?.id!==id)return;const x=s.val()||{};voteBallots=x.ballots||{};voteAcks=x.acks||{};voteReady=x.ready||{};voteScheduleAcks=x.scheduleAcks||{};voteStartAcks=x.startAcks||{};voteUpdateLive();};
 ref.on('value',cb,e=>{if(g===voteGeneration)voteNotice('투표 동기화 권한을 확인해 주세요. 38버전 Firebase 규칙 게시가 필요합니다.');console.warn('vote session',e)});
 voteSessionOff=()=>ref.off('value',cb);
}
function voteStopTimers(){voteRoomStarted=false;voteDropLiveListeners();voteGeneration++;if(voteTickHandle)clearInterval(voteTickHandle);voteTickHandle=null;if(voteSessionOff)voteSessionOff();voteSessionOff=null;voteTickBusy=false;voteSessionId='';voteRenderedId='';voteRenderedStage='';voteSurfaceId='';voteSurfacePreparing='';}
function voteLoop(){
 voteEnsureListeners();
 if(!voteIsActive())return;
 if(!document.hidden){if(!document.getElementById('voteScreen'))voteRender();else voteUpdateLive();}
 if(isST)voteSTTick();
}
function voteSyncScreen(){voteLoop()}
// The clock is not ready until its actual CSS images decode and a paint frame passes.
const voteAssetPromises=new Map();
let voteSurfaceErrorId='',voteSurfaceLoadMs=0,voteCountPaintKey='',voteCountPaintMs=null;
function voteLoadAsset(url){
 if(voteAssetPromises.has(url))return voteAssetPromises.get(url);
 const promise=new Promise((resolve,reject)=>{
  const img=new Image();img.decoding='async';img.fetchPriority='high';let finished=false;
  const finish=error=>{if(finished)return;finished=true;clearTimeout(timer);img.onload=img.onerror=null;error?reject(error):resolve();};
  const timer=setTimeout(()=>finish(Error('clock image timeout')),15000);
  img.onerror=()=>finish(Error('clock image unavailable'));
  img.onload=()=>{if(img.decode)img.decode().then(()=>finish(),()=>finish(img.naturalWidth?null:Error('clock image decode failed')));else finish();};
  img.src=url;
 });
 voteAssetPromises.set(url,promise);
 promise.catch(()=>{if(voteAssetPromises.get(url)===promise)voteAssetPromises.delete(url)});
 return promise;
}
function voteClockAssetUrls(){
 const urls=new Set();
 for(const selector of ['.voteClockFace','#voteClockHand']){
  const el=document.querySelector(selector);if(!el)continue;
  const css=getComputedStyle(el).backgroundImage;
  for(const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/g))urls.add(match[1]);
 }
 return [...urls];
}
function votePrepareSurface(){
 const id=voteCurrent?.id;if(!id||voteSurfaceId===id||voteSurfacePreparing===id||voteSurfaceErrorId===id||document.hidden)return;
 voteSurfacePreparing=id;const g=voteGeneration,watchRoom=room,began=performance.now();
 const same=()=>g===voteGeneration&&room===watchRoom&&voteCurrent?.id===id;
 requestAnimationFrame(async()=>{
  try{
   if(!same())return;
   await Promise.all(voteClockAssetUrls().map(voteLoadAsset));
   if(!same())return;
   requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(voteSurfacePreparing===id)voteSurfacePreparing='';
    if(!same()||document.hidden)return;
    if(document.getElementById('voteClock')?.getBoundingClientRect().width>0){
     voteSurfaceId=id;voteSurfaceLoadMs=Math.round(performance.now()-began);
     voteDiagnostic('surface',{loadMs:voteSurfaceLoadMs});voteUiKey='';voteUpdateLive();
    }
   }));
  }catch(error){
   if(voteSurfacePreparing===id)voteSurfacePreparing='';
   if(same()){voteSurfaceErrorId=id;voteDiagnostic('surface-error',{});voteNotice('시계판 이미지를 불러오지 못했습니다. 연결 상태를 확인한 뒤 다시 불러오기를 눌러 주세요.');voteUpdateLive();}
  }finally{if(!same()&&voteSurfacePreparing===id)voteSurfacePreparing='';}
 });
}
function voteRetrySurface(){if(!voteCurrent)return;voteSurfaceErrorId='';voteSurfacePreparing='';voteNotice('');votePrepareSurface();voteUpdateLive();}
function voteDiagnostic(event,extra={}){
 const log=window.BOTC_VOTE_DIAGNOSTICS||(window.BOTC_VOTE_DIAGNOSTICS=[]);
 log.push({event,role:isST?'ST':'player',stage:voteCurrent?.stage||'',serverEstimate:voteNow(),offsetMs:Math.round(window._serverOffset||0),...extra});
 if(log.length>30)log.shift();
}
function voteMarkCountPaint(){
 const v=voteCurrent;if(!v||v.stage!=='RUNNING'||voteNow()<v.startedAt)return;
 const key=v.id+':'+v.scheduleToken;if(voteCountPaintKey===key)return;voteCountPaintKey=key;
 voteCountPaintMs=Math.round(voteNow()-v.startedAt);voteDiagnostic('count-dom',{delayMs:voteCountPaintMs});
 const g=voteGeneration;requestAnimationFrame(()=>requestAnimationFrame(()=>{
  if(g!==voteGeneration||voteCurrent?.id!==v.id||voteCurrent.scheduleToken!==v.scheduleToken)return;
  voteCountPaintMs=Math.round(voteNow()-v.startedAt);voteDiagnostic('count-frame',{delayMs:voteCountPaintMs});voteUpdateDiagnostics();
 }));
}
function voteUpdateDiagnostics(){
 const el=document.getElementById('voteSyncDiagnostics');if(!el)return;
 const enabled=new URLSearchParams(location.search).get('diagnostics')==='1';el.hidden=!enabled;if(!enabled)return;
 voteSetText(el,`${isST?'사회자':'참가자'} · 시계 준비 ${voteSurfaceId===voteCurrent?.id?voteSurfaceLoadMs+'ms':'확인 중'} · 카운트 표시 ${voteCountPaintMs===null?'대기':voteCountPaintMs+'ms 지연'} · 시각 보정 ${Math.round(window._serverOffset||0)}ms`);
}
Object.assign(window,{voteRetrySurface});

async function voteSetReady(){
 const v=voteCurrent;if(isST||!v||v.stage!=='READY'||voteReadySubmitting||voteReady[uid]||voteSurfaceId!==v.id||!window._serverClockReady)return;
 const watchRoom=room,g=voteGeneration;voteReadySubmitting=true;voteUiKey='';voteUpdateLive();
 try{await db.ref(`${votePath(v)}/ready/${uid}`).set(true);}
 catch(e){if(room===watchRoom&&voteCurrent?.id===v.id)voteNotice('준비 완료 전송 실패: '+String(e.message||e));}
 finally{if(g===voteGeneration&&room===watchRoom&&voteCurrent?.id===v.id){voteReadySubmitting=false;voteUiKey='';voteUpdateLive();}}
}
async function voteAckSchedule(){
 const v=voteCurrent;if(isST||!v||!['SCHEDULED','RUNNING'].includes(v.stage)||voteSurfaceId!==v.id||document.hidden||!window._serverClockReady||voteScheduleAckBusy)return;
 const kind=v.stage==='RUNNING'?'startAcks':'scheduleAcks',acks=v.stage==='RUNNING'?voteStartAcks:voteScheduleAcks;const key=v.id+':'+v.scheduleToken+':'+kind;if(voteScheduleAckKey===key||acks[uid]===v.scheduleToken)return;
 const g=voteGeneration,watchRoom=room;voteScheduleAckBusy=true;
 try{await db.ref(`${votePath(v)}/${kind}/${uid}`).set(v.scheduleToken);if(g===voteGeneration&&room===watchRoom&&voteCurrent?.id===v.id&&voteCurrent.scheduleToken===v.scheduleToken)voteScheduleAckKey=key;}
 catch(e){if(g===voteGeneration)console.warn('schedule acknowledgement',e)}
 finally{voteScheduleAckBusy=false;}
}
function voteReadyHtml(v){
 const missing=voteMissingReady(v),done=v.order.length-missing.length,mine=voteReady[uid]===true;
 const scheduled=v.stage==='SCHEDULED',waiting=scheduled?voteMissingSchedule(v):missing;
 const canReady=voteSurfaceId===v.id&&window._serverClockReady;
 return `<div class="voteReadyPanel"><p class="voteReadyCount">준비 ${done}/${v.order.length}명</p><p class="voteMissing">${missing.length?'미준비: '+missing.map(p=>esc(p.name)).join(' · '):'전원 준비 완료'}</p>${!isST&&(mine||scheduled)?'<p class="voteReadyMessage">곧 투표가 시작합니다.<br>화면에 집중하세요.</p>':''}${!isST&&!scheduled?`<button class="voteReadyButton" onclick="voteSetReady()" ${mine||voteReadySubmitting||!canReady?'disabled':''}>${mine?'✓ 준비 완료 · 다른 참가자 대기 중':voteReadySubmitting?'준비 전송 중':canReady?'준비 완료':'화면·시간 동기화 중…'}</button>`:''}${scheduled?`<p class="voteScheduleNote">시작 시각 동기화 중${waiting.length?' · 수신 대기 '+waiting.map(p=>esc(p.name)).join(' · '):' · 시작 준비 완료'}</p>`:''}${v.readyNotice?`<p class="voteScheduleNote">${esc(v.readyNotice)}</p>`:''}${voteSurfaceErrorId===v.id?'<button class="secondary voteReadyButton" onclick="voteRetrySurface()">시계판 다시 불러오기</button>':''}${isST&&voteSurfaceId!==v.id?'<p class="voteScheduleNote">사회자 시계판 준비 중…</p>':''}${isST?`<button class="danger voteForceButton" onclick="voteForceStart()" ${voteSurfaceId!==v.id?'disabled':''}>강제 시작</button>`:''}</div>`;
}
async function voteForceStart(){
 const v=voteCurrent;if(!isST||!v||!['READY','SCHEDULED'].includes(v.stage))return;
 const missing=voteMissingReady(v);
 if(!confirm(`${missing.length?'미준비: '+missing.map(p=>p.name).join(' · '):'전원 준비 완료'}\n미준비 기기의 동시 시작은 보장되지 않습니다.\n강제로 시작할까요?`))return;
 if(v.stage==='SCHEDULED'){try{await db.ref(`rooms/${room}/public/vote/current`).transaction(x=>x?.id===v.id&&x.stage==='SCHEDULED'?{...x,forced:true}:undefined);}catch(e){voteNotice('강제 시작 실패: '+String(e.message||e));}}else await voteScheduleStart(true);
}
async function voteScheduleStart(forced=false){
 const v=voteCurrent;if(!isST||!v||v.stage!=='READY'||voteTickBusy||voteSurfaceId!==v.id||!window._serverClockReady||window._roomConnected!==true)return;
 if(!forced&&voteMissingReady(v).length)return;
 voteTickBusy=true;const watchRoom=room,g=voteGeneration;
 try{const ref=db.ref(`rooms/${watchRoom}/public/vote/current`);await ref.transaction(x=>{
  if(!x||x.id!==v.id||x.stage!=='READY')return;
  return {...x,stage:'SCHEDULED',forced,startedAt:voteNow()+4000,scheduleSentAt:voteNow(),scheduleToken:voteNewId(),scheduleAttempt:1,readyNotice:null};
 });}catch(e){if(g===voteGeneration)voteNotice('시작 예약 실패: '+String(e.message||e));}
 finally{if(g===voteGeneration)voteTickBusy=false;}
}
function voteNewId(){return 'v'+Date.now().toString(36)+'_'+(crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2))}
async function voteSTTick(){
 if(!isST||voteTickBusy||!voteIsActive()||window._roomConnected!==true||voteNow()<voteControlAfter)return;
 const v=voteCurrent,watchRoom=room,g=voteGeneration;
 if(v.stage==='READY'){if(!voteMissingReady(v).length&&voteSurfaceId===v.id&&!document.hidden)await voteScheduleStart();return;}
 voteTickBusy=true;
 const ref=db.ref(`rooms/${watchRoom}/public/vote/current`);
 try{
  if(v.stage==='SCHEDULED'){
   const missing=voteMissingSchedule(v),margin=v.startedAt-voteNow();
   const ackDelay=Math.max(0,voteNow()-Number(v.scheduleSentAt||voteNow()));
   const requiredMargin=v.forced?1500:Math.max(1500,ackDelay+1000);
   if((!missing.length||v.forced)&&margin>=requiredMargin){
    await ref.transaction(x=>x?.id===v.id&&x.stage==='SCHEDULED'&&x.scheduleToken===v.scheduleToken?{...x,stage:'RUNNING'}:undefined);
   }else if(margin<1500||(!missing.length&&margin<requiredMargin)){
    if((v.scheduleAttempt||1)<3){
     await ref.transaction(x=>x?.id===v.id&&x.stage==='SCHEDULED'&&x.scheduleToken===v.scheduleToken?{...x,startedAt:voteNow()+Math.min(30000,Math.max(4000*(v.scheduleAttempt+1),2*ackDelay+2500)),scheduleSentAt:voteNow(),scheduleToken:voteNewId(),scheduleAttempt:(v.scheduleAttempt||1)+1}:undefined);
    }else{
     // Reconfirm readiness after a failed start handshake. Preserve the participant list.
     await voteReturnToReady(v);
    }
   }
  }else if(v.stage==='RUNNING'&&!v.forced&&voteNow()<v.startedAt+5000&&voteNow()>=v.startedAt-1000&&v.order.some(p=>voteStartAcks[p.uid]!==v.scheduleToken)){
   // Check the final start packet too, before any participant's voting window.
   if((v.scheduleAttempt||1)<3){await ref.transaction(x=>x?.id===v.id&&x.stage==='RUNNING'&&x.scheduleToken===v.scheduleToken?{...x,stage:'SCHEDULED',startedAt:voteNow()+Math.min(30000,8000*(v.scheduleAttempt||1)),scheduleSentAt:voteNow(),scheduleToken:voteNewId(),scheduleAttempt:(v.scheduleAttempt||1)+1}:undefined);}
   else await voteReturnToReady(v);
  }else if(v.stage==='RUNNING'&&voteNow()>=v.startedAt+5000+v.order.length*5000){
   // Server read only at the collection boundary. get() requests the current server state.
   const snap=await db.ref(`${votePath(v)}/ballots`).get();if(g!==voteGeneration||room!==watchRoom||voteCurrent?.id!==v.id||window._roomConnected!==true)return;const votes=snap.val()||{};
   const finalBallots=v.order.reduce((a,p)=>{if(votes[p.uid]===true)a[p.uid]=true;return a},{});
   await ref.transaction(x=>x?.id===v.id&&x.stage==='RUNNING'?{...x,stage:'RESULT',count:Object.keys(finalBallots).length,finalBallots,finishedAt:firebase.database.ServerValue.TIMESTAMP}:undefined);
  }else if(v.stage==='RESULT'&&voteAcks.ST&&v.order.every(p=>voteAcks[p.uid])){
   // A single transaction prevents concurrent tabs from closing a newer nomination.
   await db.ref(`rooms/${watchRoom}/public/vote`).transaction(x=>{
    if(x===null)return x; // Ask the server to fill an uncached parent before comparing.
    if(x?.current?.id!==v.id||x.current.stage!=='RESULT')return;
    x.history=x.history||{};x.history[v.id]={day:v.day,nomineeUid:v.nomineeUid,nomineeName:v.nomineeName,count:v.count,finishedAt:firebase.database.ServerValue.TIMESTAMP};
    x.current={...x.current,stage:'CLOSED'};return x;
   });
  }
 }catch(e){console.warn('vote control',e);if(g===voteGeneration){voteControlAfter=voteNow()+2000;voteNotice('투표 동기화 확인 중: '+String(e.message||e));}}
 finally{if(g===voteGeneration)voteTickBusy=false;}
}
async function voteReturnToReady(v){
 await db.ref(`rooms/${room}/public/vote`).transaction(x=>{
  if(x===null)return x;
  if(x.current?.id!==v.id||x.current.scheduleToken!==v.scheduleToken||!['SCHEDULED','RUNNING'].includes(x.current.stage))return;
  x.current={...x.current,stage:'READY',startedAt:null,scheduleToken:null,readyNotice:'시작 신호 수신이 지연되어 다시 준비합니다. 준비 완료를 눌러 주세요.'};
  if(x.sessions?.[v.id])delete x.sessions[v.id].ready;return x;
 });
}
function voteRender(){
 if(!voteIsActive())return;const v=voteCurrent;
 if(document.getElementById('voteScreen')&&voteRenderedId===v.id){voteRenderedStage=v.stage;voteUpdateLive();return;}
 voteRenderedId=v.id;voteRenderedStage=v.stage;voteUiKey='';
 h(`<div id="voteScreen" class="voteScreen">${isST?'<div class="voteEndTop"><button class="danger" onclick="endGame()">🔴 게임 종료</button></div>':''}<div class="voteHeading">🗳️ 처형 투표 <small class="voteBuild">RC5.8.7.40</small></div><div class="voteNominee">후보: <b>${esc(v.nomineeName)}</b></div>${voteClockHtml(v)}<div id="voteLive"></div><p id="voteSyncDiagnostics" class="small muted" hidden></p><p id="voteNotice" class="card small" role="status" aria-live="polite" hidden></p></div>`);
 votePrepareSurface();voteUpdateLive();
}
function voteSeatOrder(){const ps=grimPlayers();return ps.map((p,i)=>{const pos=grimPos(p.uid,i);return {uid:p.uid,name:p.name,x:pos.x,y:pos.y,angle:(Math.atan2(pos.x-.5,.5-pos.y)+Math.PI*2)%(Math.PI*2)}}).sort((a,b)=>a.angle-b.angle)}
function voteDayHtml(){const hist=Object.values(voteHistory||{}).filter(v=>v.day===currentMeta?.dayNumber).sort((a,b)=>(a.finishedAt||0)-(b.finishedAt||0));return `<div class="card voteDayCard">${isST?'<button class="voteStartButton" onclick="voteSelectNominee()">🗳️ 처형 투표 시작</button>':''}<h3>🗳️ 오늘의 투표 결과</h3>${hist.length?hist.map(v=>`<div class="voteHistoryRow"><b>${esc(v.nomineeName)}</b><strong>찬성 ${Number(v.count)||0}표</strong></div>`).join(''):'<p class="muted small">아직 진행한 투표가 없습니다.</p>'}</div>`}
function voteRefreshDay(){if(currentMeta?.phase!=='DAY'||voteIsActive())return;const box=document.querySelector('.voteDayCard');if(box){box.outerHTML=voteDayHtml()} }
function voteMixedPlayers(){return grimPlayers()}
function voteMixedSeats(){return voteSeatOrder()}
function voteAlreadyNominated(p,hist=voteHistory){return Object.values(hist||{}).some(v=>v&&Number(v.day)===Number(currentMeta?.dayNumber)&&(v.nomineeUid?v.nomineeUid===p.uid:v.nomineeName===p.name))}
function voteSelectNominee(){if(!isST||currentMeta?.phase!=='DAY'||voteIsActive())return;const ps=voteMixedPlayers().filter(p=>!voteAlreadyNominated(p));if(!ps.length)return toast('오늘 지명 가능한 참가자가 없습니다.');openPicker('처형 후보 선택',ps.map(p=>`<button class="pickerItem" onclick="voteSelectStarter('${esc(p.uid)}')">${esc(p.name)}</button>`).join(''))}

let voteNomineeUid='';
function voteSelectStarter(nomineeUid){voteNomineeUid=nomineeUid;const ps=voteMixedPlayers(),nom=ps.find(p=>p.uid===nomineeUid);if(!nom)return;if(voteAlreadyNominated(nom))return toast('이미 오늘 지명된 참가자입니다.');openPicker(`${nom.name} 후보 · 시작 위치 선택`,voteMixedSeats().map(p=>`<button class="pickerItem" onclick="voteConfirmStart('${esc(p.uid)}')">${esc(p.name)}부터 시계방향</button>`).join(''))}
async function voteConfirmStart(startUid){if(!isST||voteIsActive())return;const seats=voteMixedSeats(),nom=seats.find(p=>p.uid===voteNomineeUid)||voteMixedPlayers().find(p=>p.uid===voteNomineeUid);if(!nom||!seats.length)return;if(voteAlreadyNominated(nom))return toast('이미 오늘 지명된 참가자입니다.');const ix=seats.findIndex(p=>p.uid===startUid);if(ix<0)return;const order=[...seats.slice(ix),...seats.slice(0,ix)];if(!confirm(`${nom.name} 후보에 대한 투표를 시작할까요?\n${order[0].name}부터 시계방향으로 진행합니다.\n전원 준비 완료 후 공통 카운트 5초 + 참가자별 5초`))return;
 closePicker();try{const [curSnap,histSnap]=await Promise.all([db.ref(`rooms/${room}/public/vote/current`).once('value'),db.ref(`rooms/${room}/public/vote/history`).once('value')]);
 const cur=curSnap.val();if(cur&&cur.stage!=='CLOSED')return toast('진행 중인 투표가 있습니다.');
 if(voteAlreadyNominated(nom,histSnap.val()||{}))return toast('이미 오늘 지명된 참가자입니다.');const rights={};seats.forEach(p=>{const state=(typeof grimState!=='undefined'?grimState[p.uid]:null)||{};rights[p.uid]=!state.dead||!state.ghostSpent});const id=voteNewId();const updates={'public/vote/ballots':null,'public/vote/acks':null};order.forEach((p,i)=>updates[`private/playerVoteRights/${p.uid}`]={eligible:rights[p.uid],index:i,voteId:id});updates['public/vote/current']={id,day:currentMeta.dayNumber,nomineeUid:nom.uid,nomineeName:nom.name,order,stage:'READY',protocol:38,createdAt:firebase.database.ServerValue.TIMESTAMP};await db.ref(`rooms/${room}`).update(updates)}catch(e){toast('투표 시작 실패: '+e.message)}}
function voteClockHtml(v){const order=v.order||[],info=votePhaseInfo(v),current=info.index>=0?order[info.index]:null;return `<div class="voteClock" id="voteClock"><div class="voteClockFace"><div class="voteClockHand" id="voteClockHand"></div><div class="voteClockCenter" id="voteClockCenter">5<small>초</small></div>${order.map((p,i)=>{const angle=2*Math.PI*(i+1)/(order.length+1)-Math.PI/2;const x=50+42*Math.cos(angle),y=50+42*Math.sin(angle);return `<div class="voteClockName" id="voteSeat${i}" style="left:${x}%;top:${y}%">${esc(p.name)}</div>`}).join('')}</div><div class="voteCurrentName" id="voteCurrentName">준비 중</div></div>`}

function votePhaseInfo(v){
 if(v.stage==='READY'||v.stage==='SCHEDULED')return {waiting:true,preparing:true,index:-1,left:5};
 const elapsed=voteNow()-Number(v.startedAt||voteNow()),n=v.order?.length||0;
 if(elapsed<0)return {scheduled:true,preparing:true,index:-1,left:5};
 if(elapsed<5000)return {preparing:true,index:-1,left:Math.ceil((5000-elapsed)/1000)};
 if(elapsed>=5000+n*5000)return {ended:true,preparing:false,index:-1,left:0};
 const index=Math.floor((elapsed-5000)/5000);return {preparing:false,index,left:Math.max(0,Math.ceil((5000-(elapsed-5000-index*5000))/1000))};
}
function voteUpdateLive(){
 if(!voteIsActive())return;const v=voteCurrent,el=document.getElementById('voteLive');if(!el)return;
 if(voteSurfaceId!==v.id)votePrepareSurface();
 voteUpdateDiagnostics();const info=votePhaseInfo(v),counter=document.getElementById('voteClockCenter'),label=document.getElementById('voteCurrentName'),hand=document.getElementById('voteClockHand');
 if(v.stage==='READY'||v.stage==='SCHEDULED'){
  voteSetHtml(el,voteReadyHtml(v));voteSetText(label,v.stage==='READY'?'참가자 준비 중':'시작 시각 맞추는 중');voteSetHtml(counter,'준비');if(hand)hand.style.transform='translateX(-50%) rotate(0rad)';
  voteAckSchedule();return;
 }
 if(v.stage==='RESULT'){
  voteBallots=v.finalBallots||voteBallots;votePaintSeats(v);
  const done=['ST',...v.order.map(p=>p.uid)].filter(k=>voteAcks[k]===true).length,key=isST?'ST':uid,waiting=voteAckSubmitting&&voteAckPendingKey===key;
  voteSetHtml(el,`<p class="voteSummary">투표 종료 · 찬성 ${Number(v.count)||0}표 · 시계판에서 ✓ / ✕ 확인</p><button class="voteAgree" onclick="voteAcknowledge()" ${voteAcks[key]||waiting?'disabled':''}>${voteAcks[key]?'✓ 확인 완료 · 대기 중':waiting?'✓ 확인 전송 중':'✓ 확인 완료'}</button><p class="voteAckCount">확인 ${done} / ${v.order.length+1}명</p>`);return;
 }
 voteAckSchedule();voteMarkCountPaint();
 const names=v.order.filter(p=>voteBallots[p.uid]===true).map(p=>p.name),localYes=voteLocalYesId===v.id;
 const canVote=!isST&&info.index>=0&&v.order[info.index]?.uid===uid&&voteMyRight&&window._voteRightsId===v.id&&!voteBallots[uid]&&!localYes&&!info.ended;
 voteSetHtml(el,`<div class="voteLiveVotes"><b>👍 찬성 ${names.length}표</b><div>${names.length?names.map(esc).join(' · '):'아직 찬성한 사람이 없습니다.'}</div></div>${!isST?`<button class="voteAgree" id="voteYes" onclick="voteYes()" ${canVote&&!voteSubmitting?'':'disabled'}>${localYes&&voteLocalYesPending?'✓ 찬성 전송 중':voteBallots[uid]||localYes?'✓ 찬성 완료':canVote?'👍 찬성':'👍 찬성 (내 차례 대기)'}</button>`:''}`);
 voteSetText(label,info.scheduled?'곧 카운트가 시작됩니다':info.preparing?`${info.left}초 후 시작`:info.ended?'투표 집계 중 · 잠시 기다려 주세요':`현재 차례: ${v.order[info.index]?.name||''}`);
 voteSetHtml(counter,`${info.left}<small>초</small>`);
 if(hand){const elapsed=Math.max(0,voteNow()-v.startedAt),angle=2*Math.PI*Math.min(1,elapsed/((v.order.length+1)*5000));hand.style.transform=`translateX(-50%) rotate(${angle}rad)`;}
 v.order.forEach((p,i)=>document.getElementById('voteSeat'+i)?.classList.toggle('voteClockActive',i===info.index));votePaintSeats(v);
}
function votePaintSeats(v){const info=votePhaseInfo(v),ended=v.stage==='RESULT';v.order.forEach((p,i)=>{const node=document.getElementById('voteSeat'+i);if(!node)return;const pending=!ended&&p.uid===uid&&voteLocalYesId===v.id&&voteLocalYesPending,voted=voteBallots[p.uid]===true||(!ended&&p.uid===uid&&voteLocalYesId===v.id),past=ended||info.ended||(!info.preparing&&i<info.index);voteSetHtml(node,'<span>'+esc(p.name)+'</span>'+(pending?'<strong class="voteSeatPending">…</strong>':voted?'<strong class="voteSeatYes">✓</strong>':past?'<strong class="voteSeatNo">✕</strong>':''));});if(ended){voteSetHtml(document.getElementById('voteClockCenter'),'종료');voteSetText(document.getElementById('voteCurrentName'),'투표 완료 · 결과를 확인해 주세요');const hand=document.getElementById('voteClockHand');if(hand)hand.style.transform='translateX(-50%) rotate(6.283185307179586rad)';}}
function voteSetHtml(node,value){if(!node||node._voteHtml===value)return;node._voteHtml=value;node.innerHTML=value}
function voteSetText(node,value){if(node&&node.textContent!==value)node.textContent=value}
function voteNotice(message){const el=document.getElementById('voteNotice');if(el){el.hidden=!message;voteSetText(el,message)}}
async function voteYes(){
 const v=voteCurrent;if(isST||voteSubmitting||!voteIsActive()||v.stage!=='RUNNING')return;
 const info=votePhaseInfo(v);if(info.index<0||v.order[info.index]?.uid!==uid||!voteMyRight||window._voteRightsId!==v.id||voteBallots[uid]||voteLocalYesId===v.id||info.ended)return;
 const watchRoom=room,watchUid=uid,g=voteGeneration;const same=()=>g===voteGeneration&&room===watchRoom&&uid===watchUid&&voteCurrent?.id===v.id;
 voteSubmitting=true;voteLocalYesId=v.id;voteLocalYesPending=true;voteNotice('');voteUpdateLive();
 try{await db.ref(`${votePath(v)}/ballots/${watchUid}`).set(true);if(same()){voteLocalYesPending=false;voteBallots[watchUid]=true;}}
 catch(e){if(same()){voteLocalYesId='';voteLocalYesPending=false;voteNotice('찬성표가 저장되지 않았습니다. 연결 상태와 투표 시간을 확인해 주세요.');console.warn('vote write',e);}}
 finally{if(same()){voteSubmitting=false;voteUpdateLive();}}
}
async function voteAcknowledge(){
 const v=voteCurrent;if(!voteIsActive()||v.stage!=='RESULT'||voteAckSubmitting)return;
 const key=isST?'ST':uid,watchRoom=room,g=voteGeneration;if(voteAcks[key])return;
 voteAckSubmitting=true;voteAckPendingKey=key;voteUpdateLive();
 try{await db.ref(`${votePath(v)}/acks/${key}`).set(true);}
 catch(e){if(g===voteGeneration&&room===watchRoom&&voteCurrent?.id===v.id)voteNotice('확인 전송 실패: '+String(e.message||e));}
 finally{if(g===voteGeneration&&room===watchRoom&&voteCurrent?.id===v.id){voteAckSubmitting=false;voteAckPendingKey='';voteUpdateLive();}}
}
async function voteReconnect(){
 if(!room||!voteIsActive()||voteRefreshBusy)return;const g=voteGeneration,watchRoom=room,id=voteCurrent.id;voteRefreshBusy=true;
 try{const snap=await db.ref(`rooms/${watchRoom}/public/vote/current`).get();if(g!==voteGeneration||room!==watchRoom||voteCurrent?.id!==id)return;voteCurrent=snap.val();voteListenSession();if(voteIsActive())voteRender();else renderByPhase(currentMeta);}
 catch(e){console.warn('vote reconnect',e)}finally{voteRefreshBusy=false;}
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden){voteReconnect();voteLoop();}});
Object.assign(window,{voteSetReady,voteForceStart,voteYes,voteAcknowledge});
