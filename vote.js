/* RC35: avoid unchanged DOM writes; keep server-enforced 5-second voting. */
/* RC5.8.7.6 synchronized day nomination voting. Never publishes roles or ghost status. */
let voteCurrent=null,voteBallots={},voteAcks={},voteHistory={},voteMyRight=false;
let voteLocalYesId='',voteLocalYesPending=false,voteResultPollBusy=false,voteResultPollAt=0;
let voteBallotSyncBusy=false,voteBallotSyncAt=0,voteBallotSyncId='';
let voteAckSubmitting=false,voteAckPendingKey='';
let voteAckReconcileBusy=false,voteAckReconcileAt=0;
let voteSyncHandle=null;let voteFirstWatchHandle=null;let voteFirstSeen=false;let voteFirstWatchBusy=false;let voteRepeatPollAt=0;let voteTickHandle=null,voteTickBusy=false,voteRenderedId='',voteRenderedStage='',voteSubmitting=false,voteUiKey='';
function voteNow(){return Date.now()+(window._serverOffset||0)}
function voteIsActive(){return !!(voteCurrent&&voteCurrent.stage&&voteCurrent.stage!=='CLOSED'&&currentMeta?.phase==='DAY')}
function voteStartListeners(){
 voteCurrent=null;voteBallots={};voteAcks={};voteHistory={};voteMyRight=false;voteRenderedId='';voteRenderedStage='';voteFirstSeen=false;voteFirstWatchBusy=false;voteRepeatPollAt=0;voteLocalYesId='';voteLocalYesPending=false;voteResultPollAt=0;voteBallotSyncAt=0;voteBallotSyncId='';voteAckSubmitting=false;voteAckPendingKey='';voteAckReconcileBusy=false;voteAckReconcileAt=0;
 listen(db.ref(`rooms/${room}/public/vote/current`),'value',s=>{const before=voteIsActive();voteCurrent=s.val();if(voteCurrent?.stage==='RUNNING'||voteCurrent?.stage==='RESULT')voteFirstSeen=true;if(currentMeta?.phase==='DAY'){if(voteIsActive()){grimClearSurface();voteRender();}else if(before||document.getElementById('voteScreen'))renderByPhase(currentMeta);else voteRefreshDay();} });
 listen(db.ref(`rooms/${room}/public/vote/ballots`),'value',s=>{voteBallots=s.val()||{};if(voteIsActive())voteUpdateLive()});
 listen(db.ref(`rooms/${room}/public/vote/acks`),'value',s=>{voteAcks=s.val()||{};if(voteAckPendingKey&&voteAcks[voteAckPendingKey]===true){voteAckSubmitting=false;voteAckPendingKey='';}if(voteIsActive())voteUpdateLive()});
 listen(db.ref(`rooms/${room}/public/vote/history`),'value',s=>{voteHistory=s.val()||{};if(currentMeta?.phase==='DAY'&&!voteIsActive())voteRefreshDay()});
 if(!isST)listen(db.ref(`rooms/${room}/private/playerVoteRights/${uid}`),'value',s=>{voteMyRight=s.val()?.eligible===true;voteUpdateLive()});
 if(isST)voteTickHandle=setInterval(voteSTTick,300);
 // Reconcile UI even when another Firebase listener redraws the day/script screen.
 voteSyncHandle=setInterval(voteSyncScreen,400);
 // Reconcile every nomination, not only the first vote of the session.
 if(!isST)voteFirstWatchHandle=setInterval(voteRecoverFirstTransition,1200);
}
function voteStopTimers(){if(voteFirstWatchHandle)clearInterval(voteFirstWatchHandle);voteFirstWatchHandle=null;voteFirstWatchBusy=false;if(voteSyncHandle)clearInterval(voteSyncHandle);voteSyncHandle=null;if(voteTickHandle)clearInterval(voteTickHandle);voteTickHandle=null;voteRenderedId='';voteRenderedStage=''}
async function voteRecoverFirstTransition(){
 // Firebase listeners can miss a later nomination after a previous vote is closed.
 // A fresh read is authoritative; do not stop watching after the first vote.
 if(voteFirstWatchBusy||!room||!currentMeta||currentMeta.status==='ENDED'||currentMeta.phase!=='DAY')return;
 if(Date.now()-voteRepeatPollAt<1100)return;
 voteRepeatPollAt=Date.now();
 const watchRoom=room;
 voteFirstWatchBusy=true;
 try{
  const snap=await db.ref(`rooms/${watchRoom}/public/vote/current`).once('value');
  if(room!==watchRoom||!currentMeta||currentMeta.phase!=='DAY')return;
  const fresh=snap.val();
  if(fresh&&(fresh.stage==='RUNNING'||fresh.stage==='RESULT')){
   if(!voteCurrent||voteCurrent.id!==fresh.id||voteCurrent.stage!==fresh.stage||!document.getElementById('voteScreen')){
    voteCurrent=fresh;grimClearSurface();voteRender();
   }
  }else if(voteCurrent){
   voteCurrent=null;voteRenderedId='';voteRenderedStage='';
   if(document.getElementById('voteScreen'))renderByPhase(currentMeta);
  }
 }catch(e){console.warn('repeat vote recovery',e)}finally{voteFirstWatchBusy=false}
}
function voteSyncScreen(){
 if(!room||!currentMeta||currentMeta.status==='ENDED'||currentMeta.phase!=='DAY')return;
 if(voteIsActive()){
  const screen=document.getElementById('voteScreen');
  if(!screen||voteRenderedId!==voteCurrent.id||voteRenderedStage!==voteCurrent.stage){grimClearSurface();voteRender();}
  else {voteUpdateLive();voteReconcileResult();voteReconcileBallots();voteReconcileAcks();}
 }else if(document.getElementById('voteScreen'))renderByPhase(currentMeta);
}
async function voteReconcileResult(){
 // A delayed/missed RESULT event must not strand a participant on the 0-second screen.
 if(isST||voteResultPollBusy||!voteIsActive()||voteCurrent.stage!=='RUNNING')return;
 const v=voteCurrent,deadline=Number(v.startedAt||0)+5000+(v.order?.length||0)*5000;
 if(voteNow()<deadline+1200||Date.now()-voteResultPollAt<2000)return;
 voteResultPollAt=Date.now();voteResultPollBusy=true;
 try{
  const snap=await db.ref(`rooms/${room}/public/vote/current`).once('value');
  const fresh=snap.val();
  if(fresh&&fresh.id===v.id&&fresh.stage==='RESULT'&&voteCurrent?.id===v.id){voteCurrent=fresh;voteRender();}
 }catch(e){console.warn('vote result reconcile',e)}finally{voteResultPollBusy=false}
}
async function voteReconcileAcks(){
 // Player clients can miss remote ack events while their own ack is delivered.
 // Re-read the complete server ack map and current vote state until the ST closes it.
 if(isST||voteAckReconcileBusy||!voteIsActive()||voteCurrent.stage!=='RESULT')return;
 if(Date.now()-voteAckReconcileAt<1100)return;
 voteAckReconcileAt=Date.now();voteAckReconcileBusy=true;
 const watchRoom=room,watchId=voteCurrent.id;
 try{
  const [acksSnap,currentSnap]=await Promise.all([
   db.ref(`rooms/${watchRoom}/public/vote/acks`).once('value'),
   db.ref(`rooms/${watchRoom}/public/vote/current`).once('value')
  ]);
  if(room!==watchRoom||voteCurrent?.id!==watchId)return;
  const fresh=currentSnap.val();
  if(!fresh||fresh.id!==watchId||fresh.stage==='CLOSED'){
   voteCurrent=null;voteAcks={};voteRenderedId='';voteRenderedStage='';
   if(currentMeta?.phase==='DAY')renderByPhase(currentMeta);
   return;
  }
  voteAcks=acksSnap.val()||{};
  voteUiKey='';voteUpdateLive();
 }catch(e){console.warn('ack reconciliation',e)}
 finally{voteAckReconcileBusy=false}
}
async function voteReconcileBallots(){
 // Independent authoritative snapshot: a missed Firebase value event must not leave
 // one device showing X while the storyteller has a stored YES.
 if(voteBallotSyncBusy||!voteIsActive())return;
 const v=voteCurrent,now=Date.now();
 if(now-voteBallotSyncAt<(v.stage==='RESULT'?900:1500))return;
 voteBallotSyncAt=now;voteBallotSyncBusy=true;
 const watchRoom=room,watchId=v.id;
 try{
  const snap=await db.ref(`rooms/${watchRoom}/public/vote/ballots`).once('value');
  if(room!==watchRoom||voteCurrent?.id!==watchId)return;
  voteBallots=(v.stage==='RESULT'&&v.finalBallots)?v.finalBallots:(snap.val()||{});
  // Pending clears only when the write promise resolves (server acknowledgement).
  voteUiKey='';voteUpdateLive();
 }catch(e){console.warn('ballot sync',e)}finally{voteBallotSyncBusy=false}
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
async function voteConfirmStart(startUid){if(!isST||voteIsActive())return;const seats=voteMixedSeats(),nom=seats.find(p=>p.uid===voteNomineeUid)||voteMixedPlayers().find(p=>p.uid===voteNomineeUid);if(!nom||!seats.length)return;if(voteAlreadyNominated(nom))return toast('이미 오늘 지명된 참가자입니다.');const ix=seats.findIndex(p=>p.uid===startUid);if(ix<0)return;const order=[...seats.slice(ix),...seats.slice(0,ix)];if(!confirm(`${nom.name} 후보에 대한 투표를 시작할까요?\n${order[0].name}부터 시계방향으로 진행합니다.\n준비 5초 + 참가자별 5초`))return;
 closePicker();try{const [curSnap,histSnap]=await Promise.all([db.ref(`rooms/${room}/public/vote/current`).once('value'),db.ref(`rooms/${room}/public/vote/history`).once('value')]);
 const cur=curSnap.val();if(cur&&cur.stage!=='CLOSED')return toast('진행 중인 투표가 있습니다.');
 if(voteAlreadyNominated(nom,histSnap.val()||{}))return toast('이미 오늘 지명된 참가자입니다.');const rights={};seats.forEach(p=>{const state=(typeof grimState!=='undefined'?grimState[p.uid]:null)||{};rights[p.uid]=!state.dead||!state.ghostSpent});const id='v'+Date.now();const updates={'public/vote/ballots':null,'public/vote/acks':null};order.forEach((p,i)=>updates[`private/playerVoteRights/${p.uid}`]={eligible:rights[p.uid],index:i});updates['public/vote/current']={id,day:currentMeta.dayNumber,nomineeUid:nom.uid,nomineeName:nom.name,order,stage:'RUNNING',startedAt:firebase.database.ServerValue.TIMESTAMP};await db.ref(`rooms/${room}`).update(updates)}catch(e){toast('투표 시작 실패: '+e.message)}}
function votePhaseInfo(v){const elapsed=voteNow()-(v.startedAt||voteNow());const n=v.order?.length||0;if(elapsed<5000)return {preparing:true,index:-1,left:Math.ceil((5000-elapsed)/1000)};const idx=Math.min(n-1,Math.floor((elapsed-5000)/5000));return {preparing:false,index:idx,left:Math.max(0,Math.ceil((5000-(elapsed-5000-idx*5000))/1000))}}
function voteClockHtml(v){const order=v.order||[],info=votePhaseInfo(v),current=info.index>=0?order[info.index]:null;return `<div class="voteClock" id="voteClock"><div class="voteClockFace"><div class="voteClockHand" id="voteClockHand"></div><div class="voteClockCenter" id="voteClockCenter">5<small>초</small></div>${order.map((p,i)=>{const angle=2*Math.PI*(i+1)/(order.length+1)-Math.PI/2;const x=50+42*Math.cos(angle),y=50+42*Math.sin(angle);return `<div class="voteClockName" id="voteSeat${i}" style="left:${x}%;top:${y}%">${esc(p.name)}</div>`}).join('')}</div><div class="voteCurrentName" id="voteCurrentName">준비 중</div></div>`}
function voteRender(){if(!voteIsActive())return;const v=voteCurrent;const same=document.getElementById('voteScreen')&&voteRenderedId===v.id&&voteRenderedStage===v.stage;if(same){voteUpdateLive();return}voteRenderedId=v.id;voteRenderedStage=v.stage;voteUiKey='';
 h(`<div id="voteScreen" class="voteScreen">${isST?'<div class="voteEndTop"><button class="danger" onclick="endGame()">🔴 게임 종료</button></div>':''}<div class="voteHeading">🗳️ 처형 투표 <small class="voteBuild">RC5.8.7.36</small></div><div class="voteNominee">후보: <b>${esc(v.nomineeName)}</b></div>${voteClockHtml(v)}<div id="voteLive"></div><p id="voteNotice" class="card small" role="status" aria-live="polite" hidden></p></div>`);voteUpdateLive()}
function voteUpdateLive(){if(!voteIsActive())return;const v=voteCurrent,el=document.getElementById('voteLive');if(!el)return;if(v.stage==='RESULT'&&v.finalBallots)voteBallots=v.finalBallots;const localYes=!isST&&voteLocalYesId===v.id;const votes=Object.keys(voteBallots||{}).filter(k=>voteBallots[k]===true);const names=(v.order||[]).filter(p=>votes.includes(p.uid)).map(p=>p.name);const count=names.length;
 if(v.stage==='RESULT'){votePaintSeats(v);}if(v.stage==='RESULT'){voteReconcileBallots();const all=(v.order||[]).length+1,done=['ST',...(v.order||[]).map(p=>p.uid)].filter(k=>voteAcks[k]===true).length;const ackKey=isST?'ST':uid;const waiting=voteAckSubmitting&&voteAckPendingKey===ackKey;const key=`result:${done}:${all}:${voteAcks[ackKey]?'yes':'no'}:${waiting}`;if(key===voteUiKey)return;voteUiKey=key;el.innerHTML=`<p class="voteSummary">투표 종료 · 찬성 ${Number(v.count)||0}표 · 시계판에서 ✓ / ✕ 확인</p><button class="voteAgree" onclick="voteAcknowledge()" ${voteAcks[ackKey]||waiting?'disabled':''}>${voteAcks[ackKey]?'✓ 확인 완료 · 대기 중':waiting?'✓ 확인 전송 중':'✓ 확인 완료'}</button><p class="voteAckCount">확인 ${done} / ${all}명</p>`;return}
 const info=votePhaseInfo(v),p=v.order?.[info.index],canVote=!isST&&p?.uid===uid&&voteMyRight&&!voteBallots[uid]&&!localYes&&info.left>0;
 const key=`run:${info.index}:${info.left}:${count}:${names.join('|')}:${canVote}:${!!voteBallots[uid]}:${voteSubmitting}:${localYes}:${voteLocalYesPending}`;if(key!==voteUiKey){voteUiKey=key;el.innerHTML=`<div class="voteLiveVotes"><b>👍 찬성 ${count}표</b><div>${names.length?names.map(esc).join(' · '):'아직 찬성한 사람이 없습니다.'}</div></div>${!isST?`<button class="voteAgree" id="voteYes" onclick="voteYes()" ${canVote&&!voteSubmitting?'':'disabled'}>${voteBallots[uid]||localYes?(voteLocalYesPending?'✓ 찬성 전송 중':'✓ 찬성 완료'):canVote?'👍 찬성':'👍 찬성 (내 차례 대기)'}</button>`:''}`;}
 const label=document.getElementById('voteCurrentName'),counter=document.getElementById('voteClockCenter'),hand=document.getElementById('voteClockHand');if(label)voteSetText(label,info.preparing?`${info.left}초 후 시작`:(voteNow()>=Number(v.startedAt||0)+5000+(v.order?.length||0)*5000?'투표 집계 중 · 잠시 기다려 주세요':`현재 차례: ${p?.name||''}`));if(counter)voteSetHtml(counter,`${info.left}<small>초</small>`);if(hand){const n=v.order?.length||1;const elapsed=Math.max(0,voteNow()-Number(v.startedAt||voteNow()));const total=(n+1)*5000;const angle=2*Math.PI*Math.min(1,elapsed/total);hand.style.opacity='1';hand.style.transform=`translateX(-50%) rotate(${angle}rad)`;}document.querySelectorAll('.voteClockName').forEach((node,i)=>node.classList.toggle('voteClockActive',i===info.index));votePaintSeats(v);
}
function votePaintSeats(v){const info=votePhaseInfo(v),ended=v.stage==='RESULT';(v.order||[]).forEach((p,i)=>{const node=document.getElementById('voteSeat'+i);if(!node)return;const voted=voteBallots[p.uid]===true||(!ended&&!isST&&p.uid===uid&&voteLocalYesId===v.id);const past=ended||(!info.preparing&&i<info.index);const pending=!ended&&!isST&&p.uid===uid&&voteLocalYesId===v.id&&voteLocalYesPending;voteSetHtml(node,'<span>'+esc(p.name)+'</span>'+(pending?'<strong class="voteSeatPending" title="전송 중">…</strong>':voted?'<strong class="voteSeatYes">✓</strong>':past?'<strong class="voteSeatNo">✕</strong>':''));});if(ended){const hand=document.getElementById('voteClockHand');if(hand&&v.order?.length)hand.style.transform=`translateX(-50%) rotate(${2*Math.PI}rad)`;const counter=document.getElementById('voteClockCenter');if(counter)voteSetHtml(counter,'종료');const label=document.getElementById('voteCurrentName');if(label)voteSetText(label,'투표 완료 · 결과를 확인해 주세요');}}
// Cache the last requested value on each DOM node. New screens get new nodes.
function voteSetHtml(node,value){if(node._voteHtml===value)return;node._voteHtml=value;node.innerHTML=value}
function voteSetText(node,value){if(node.textContent!==value)node.textContent=value}
function voteNotice(message){const node=document.getElementById('voteNotice');if(node){node.hidden=!message;voteSetText(node,message||'')}}
function voteRecordDelivery(entry){
 const log=window.BOTC_VOTE_DIAGNOSTICS||(window.BOTC_VOTE_DIAGNOSTICS=[]);
 log.push(entry);if(log.length>20)log.shift();
}
async function voteYes(){
 if(isST||voteSubmitting||!voteIsActive()||voteCurrent.stage!=='RUNNING')return;
 const v=voteCurrent,info=votePhaseInfo(v),watchRoom=room,watchUid=uid;
 if(v.order?.[info.index]?.uid!==uid||!voteMyRight||voteBallots[uid]||voteLocalYesId===v.id)return;
 const start=Number(v.startedAt||0)+5000+info.index*5000;
 const elapsed=voteNow()-start;
 if(elapsed<0||elapsed>=4600){voteNotice('투표 시간이 종료되었습니다.');return;}
 const sentAt=Date.now();
 const stillCurrent=()=>room===watchRoom&&uid===watchUid&&voteCurrent?.id===v.id;
 voteSubmitting=true;voteLocalYesId=v.id;voteLocalYesPending=true;voteNotice('');voteUiKey='';voteUpdateLive();
 const ballotRef=db.ref(`rooms/${watchRoom}/public/vote/ballots/${watchUid}`);
 try{
  await ballotRef.set(true);
  voteRecordDelivery({outcome:'accepted',slotElapsedMs:elapsed,roundTripMs:Date.now()-sentAt});
  if(stillCurrent()){voteLocalYesPending=false;voteBallots[watchUid]=true;}
 }catch(e){
  // Only reconcile this nomination. A later nomination may reuse the ballot path.
  let saved=false;
  if(stillCurrent())try{saved=(await ballotRef.once('value')).val()===true}catch(readError){console.warn('vote ballot verification',readError)}
  const entry={outcome:saved?'already-saved':'rejected',code:String(e.code||e.message||e),slotElapsedMs:elapsed,roundTripMs:Date.now()-sentAt};
  voteRecordDelivery(entry);console.warn('vote delivery',entry);
  if(stillCurrent()){
   if(saved){voteLocalYesPending=false;voteBallots[watchUid]=true;}
   else{delete voteBallots[watchUid];voteLocalYesId='';voteLocalYesPending=false;const denied=/permission.denied/i.test(String(e.code||e.message||e));voteNotice(denied?'찬성표가 저장되지 않았습니다. 서버가 투표 시간 또는 권한 조건을 허용하지 않았습니다.':'찬성표 전송을 확인하지 못했습니다. 연결 상태를 확인해 주세요.');}
  }
 }finally{voteSubmitting=false;if(stillCurrent()){voteUiKey='';voteUpdateLive()}}
}
async function voteAcknowledge(){
 if(!voteIsActive()||voteCurrent.stage!=='RESULT'||voteAckSubmitting)return;
 const key=isST?'ST':uid,watchRoom=room,watchId=voteCurrent.id;
 if(voteAcks[key]===true)return;
 const ref=db.ref(`rooms/${watchRoom}/public/vote/acks/${key}`);
 voteAckSubmitting=true;voteAckPendingKey=key;voteUiKey='';voteUpdateLive();
 try{
  // The security rules allow only the first write. Do not write again if already saved.
  if((await ref.once('value')).val()!==true)await ref.set(true);
  if(room===watchRoom&&voteCurrent?.id===watchId)voteAcks[key]=true;
 }catch(e){
  let saved=false;
  try{saved=(await ref.once('value')).val()===true}catch(readError){console.warn('ack verification',readError)}
  if(saved){if(room===watchRoom&&voteCurrent?.id===watchId)voteAcks[key]=true;}
  else toast('확인 전송 실패: '+e.message);
 }finally{voteAckSubmitting=false;voteAckPendingKey='';voteUiKey='';voteUpdateLive()}
}
async function voteSTTick(){if(!isST||voteTickBusy||!voteIsActive())return;voteTickBusy=true;try{const v=voteCurrent;if(v.stage==='RUNNING'){if(voteNow()>=v.startedAt+5000+v.order.length*5000){const snap=await db.ref(`rooms/${room}/public/vote/ballots`).once('value');const votes=snap.val()||{};const count=v.order.filter(p=>votes[p.uid]===true).length;await db.ref(`rooms/${room}/public/vote/current`).update({stage:'RESULT',count,finalBallots:v.order.reduce((out,p)=>{if(votes[p.uid]===true)out[p.uid]=true;return out},{}),finishedAt:firebase.database.ServerValue.TIMESTAMP})}else voteUpdateLive()}else if(v.stage==='RESULT'){const ack=voteAcks||{};if(ack.ST&&v.order.every(p=>ack[p.uid])){const root=db.ref(`rooms/${room}`);await root.update({[`public/vote/history/${v.id}`]:{day:v.day,nomineeUid:v.nomineeUid,nomineeName:v.nomineeName,count:v.count,finishedAt:firebase.database.ServerValue.TIMESTAMP},'public/vote/current':null,'public/vote/ballots':null,'public/vote/acks':null})}}}catch(e){console.error('vote tick',e);const el=document.getElementById('voteLive');if(el&&voteCurrent?.stage==='RUNNING'&&voteNow()>=Number(voteCurrent.startedAt||0)+5000+(voteCurrent.order?.length||0)*5000)(el.querySelector('.voteError')||el.appendChild(document.createElement('p'))).textContent='투표 종료 처리 실패: '+String(e.message||e)}finally{voteTickBusy=false}}
setInterval(()=>{if(voteIsActive()&&voteCurrent.stage==='RUNNING')voteUpdateLive()},180);
Object.assign(window,{voteSelectNominee,voteSelectStarter,voteConfirmStart,voteYes,voteAcknowledge});

document.addEventListener('visibilitychange',()=>{if(!document.hidden&&isST&&voteIsActive())voteSTTick()});
