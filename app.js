firebase.initializeApp(firebaseConfig);
const auth=firebase.auth(), db=firebase.database();
const $=s=>document.querySelector(s), app=$('#app');
let uid=null, room=null, listeners=[], meName='', isST=false, currentMeta=null;
window._scriptData=[];window._tokens={};window._roles={};
const SCRIPTS={
  trouble_brewing:'trouble_brewing.json',
  sects_and_violets:'sects_and_violets.json',
  bad_moon_rising:'bad_moon_rising.json'
};
const DUMMIES=['오늘 밤은 조용합니다','달빛이 창가를 비춥니다','시계 소리가 들립니다','잠시 화면을 봐주세요','오늘도 밤이 깊었습니다','별빛이 희미하게 보입니다','조용히 문장을 읽어주세요','잠시 그대로 기다려주세요'];
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function h(s){app.innerHTML=s}
function toast(msg){alert(msg)}
let presenceRef=null, presenceGeneration=0;
function stopPresence(){
  ++presenceGeneration;
  const old=presenceRef;presenceRef=null;
  if(old)old.onDisconnect().cancel().catch(e=>console.warn('presence cancellation',e));
}
function cleanup(){stopPresence();listeners.forEach(u=>u&&u());listeners=[]}
async function setPresenceOnline(targetRoom,targetUid){
  if(!targetRoom||!targetUid||isST||room!==targetRoom||uid!==targetUid)return;
  const generation=++presenceGeneration;
  const r=db.ref(`rooms/${targetRoom}/public/players/${targetUid}/online`);
  if(presenceRef&&presenceRef.toString()!==r.toString())await presenceRef.onDisconnect().cancel().catch(()=>{});
  presenceRef=r;
  try{
    // Firebase recommends registering the disconnect operation BEFORE marking online.
    await r.onDisconnect().set(false);
    if(generation!==presenceGeneration||room!==targetRoom||uid!==targetUid||isST){await r.onDisconnect().cancel();return;}
    const exists=(await db.ref(`rooms/${targetRoom}/public/players/${targetUid}`).once('value')).exists();
    if(!exists){await r.onDisconnect().cancel();return;}
    if(generation!==presenceGeneration||room!==targetRoom||uid!==targetUid||isST){await r.onDisconnect().cancel();return;}
    await r.set(true);
  }catch(e){console.warn('online presence failed',e);}
}
function listen(ref,event,cb,cancelCb){const f=ref.on(event,cb,cancelCb);listeners.push(()=>ref.off(event,cb));return f}
function code(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let x='';for(let i=0;i<8;i++)x+=chars[Math.floor(Math.random()*chars.length)];return x}
function randomDummy(){return DUMMIES[Math.floor(Math.random()*DUMMIES.length)]}
function phaseTitle(m){return m.phase==='NIGHT'?`🌙 ${m.nightNumber}번째 밤`:m.phase==='DAY'?`☀️ ${m.dayNumber}번째 낮`:''}
async function loadScript(key){const r=await fetch(SCRIPTS[key]);if(!r.ok)throw Error('스크립트 파일을 불러오지 못했습니다.');return await r.json()}
function scriptName(data){return data?.[0]?.name||'사용자 스크립트'}
function renderHome(){cleanup();h(`<section class="homeScene"><div class="homeSky"><span class="homeMoon"></span><div class="homeTower"><div class="homeSpire"></div><div class="homeClock"><span class="homeHand hour"></span><span class="homeHand minute"></span></div><div class="homeWindows">✦</div></div></div><div class="homeTitle"><div class="homeEyebrow">BLOOD ON THE CLOCKTOWER</div><h1>시계탑에 흐른 피</h1><p>밤의 비밀을 위한 사회자 도우미</p></div><div class="homeActions"><button onclick="showCreate()">🌙 사회자 방 만들기</button><button class="secondary" onclick="showJoin()">🚪 참가자로 입장</button></div><div class="homeFoot">NIGHT HELPER · 비공식 개인용 보조 도구</div></section>`)}
function showCreate(){h(`<div class="top"><div class="brand">대기실 만들기</div><button class="secondary" onclick="renderHome()">뒤로</button></div><div class="card"><label>기본 시나리오</label><div class="grid"><button onclick="createRoom('trouble_brewing')">불길한 조짐 (Trouble Brewing)</button><button onclick="createRoom('sects_and_violets')">환란의 화원 (Sects and Violets)</button><button onclick="createRoom('bad_moon_rising')">어둠을 부르는 달 (Bad Moon Rising)</button></div><hr style="border-color:#2a2d35;border-width:1px 0 0;margin:16px 0"><label>사용자 JSON</label><input id="jsonFile" type="file" accept="application/json,.json"><button class="secondary" onclick="createCustomRoom()">JSON으로 대기실 만들기</button></div>`)}
function showJoin(){h(`<div class="top"><div class="brand">참가자로 입장</div><button class="secondary" onclick="renderHome()">뒤로</button></div><div class="card"><label>입장 코드</label><input id="joinCode" maxlength="8" autocapitalize="characters" placeholder="8자리 코드"><label style="margin-top:10px">이름</label><input id="joinName" maxlength="20" placeholder="게임에서 사용할 이름"><button style="margin-top:12px;width:100%" onclick="joinRoom()">입장</button></div>`)}
async function createRoom(key){try{const data=await loadScript(key);await makeRoom(data,false)}catch(e){toast(e.message)}}
async function createCustomRoom(){const f=$('#jsonFile')?.files?.[0];if(!f)return toast('JSON 파일을 선택해 주세요.');try{const data=JSON.parse(await f.text());if(!Array.isArray(data)||!data.length)throw Error('JSON 형식이 올바르지 않습니다.');await makeRoom(data,true)}catch(e){toast('JSON을 읽지 못했습니다: '+e.message)}}
async function makeRoom(script,custom){const ref=db.ref('rooms/'+code());const roomId=ref.key;await ref.child('public/meta').set({ownerUid:uid,status:'WAITING',phase:'WAITING',nightNumber:0,dayNumber:0,currentRound:0,scriptName:scriptName(script),custom:!!custom,createdAt:firebase.database.ServerValue.TIMESTAMP});await ref.child('public/script').set(script);await ref.child('private/st').set({ownerUid:uid});room=roomId;isST=true;meName='ST';localStorage.setItem('botc_last_room',roomId);localStorage.setItem('botc_mode_'+roomId,'ST');location.hash=roomId;startRoom();}
function saveJoinedRoom(c,n){room=c;isST=false;meName=n;localStorage.setItem('botc_name_'+c,n);localStorage.setItem('botc_last_room',c);localStorage.setItem('botc_mode_'+c,'PLAYER');location.hash=c;}
async function joinRoom(){
  const c=($('#joinCode')?.value||'').trim().toUpperCase(), n=($('#joinName')?.value||'').trim();
  if(!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(c))return toast('8자리 입장 코드를 확인해 주세요.');
  if(!n)return toast('이름을 입력해 주세요.');
  try{
    const snap=await db.ref(`rooms/${c}/public/meta`).once('value'),m=snap.val();
    if(!m)return toast('입장 코드를 찾을 수 없습니다.');
    if(m.status==='WAITING'){
      await db.ref(`rooms/${c}/public/players/${uid}`).set({uid,name:n,online:true,joinedAt:firebase.database.ServerValue.TIMESTAMP});
      saveJoinedRoom(c,n);startRoom();return;
    }
    if(m.status==='PLAYING'){
      if((await db.ref(`rooms/${c}/public/players/${uid}`).once('value')).exists()){
        saveJoinedRoom(c,n);startRoom();return;
      }
      if(m.reconnectAllowedUid&&String(m.reconnectAllowedName||'')===n){
        if(m.reconnectAllowedUid===uid)return toast('이미 등록된 기기입니다. 사회자에게 확인해 주세요.');
        await db.ref(`rooms/${c}/public/reconnectRequests/${uid}`).set({uid,name:n,oldUid:m.reconnectAllowedUid,requestedAt:firebase.database.ServerValue.TIMESTAMP});
        h(`<div class="card center" style="margin-top:20vh"><div class="phase">재접속 요청 중</div><p class="muted">사회자가 허용한 기존 참가자 자리로 연결하고 있습니다.</p><button class="secondary" onclick="cancelReconnectWait()">처음 화면으로</button></div>`);
        const ref=db.ref(`rooms/${c}/public/meta`);
        const cb=ref.on('value',async ss=>{
          const mm=ss.val()||{};
          if(mm.reconnectCompletedUid!==uid)return;
          ref.off('value',cb);reconnectWaitRef=null;
          try{
            if(!(await db.ref(`rooms/${c}/public/players/${uid}`).once('value')).exists())throw Error('재접속 자리 확인 실패');
            saveJoinedRoom(c,n);startRoom();
          }catch(e){toast('재접속 확인 실패: '+(e.message||e));showJoin();$('#joinCode').value=c;$('#joinName').value=n;}
        },err=>{ref.off('value',cb);reconnectWaitRef=null;toast('재접속 대기 오류: '+(err.message||err));showJoin();$('#joinCode').value=c;$('#joinName').value=n;});
        reconnectWaitRef=()=>ref.off('value',cb);
        return;
      }
    }
    toast('게임이 이미 시작되었거나 입장할 수 없습니다.');
  }catch(e){toast('입장 실패: '+(e.message||e));}
}
let reconnectWaitRef=null;
function cancelReconnectWait(){if(reconnectWaitRef){reconnectWaitRef();reconnectWaitRef=null;}renderHome();}

function startRoom(){cleanup();window._responses={};listen(db.ref(`rooms/${room}/public/script`),'value',snap=>{window._scriptData=snap.val()||[];if(currentMeta&&isST&&currentMeta.phase==='NIGHT')renderByPhase(currentMeta);});listen(db.ref(`rooms/${room}/public/meta`),'value',snap=>{const m=snap.val();if(!m)return renderHome();currentMeta=m;if(m.status==='ENDED'){cleanup();renderEnded();return}renderByPhase(m);});listen(db.ref(`rooms/${room}/public/players`),'value',snap=>{window._players=snap.val()||{};if(currentMeta&&!document.querySelector('.loading'))renderByPhase(currentMeta);});if(isST){listen(db.ref(`rooms/${room}/private/st/tokens`),'value',snap=>{window._tokens=snap.val()||{};if(currentMeta)renderByPhase(currentMeta);});listen(db.ref(`rooms/${room}/private/st/roles`),'value',snap=>{window._roles=snap.val()||{};if(currentMeta)renderByPhase(currentMeta);});listen(db.ref(`rooms/${room}/private/st/roundHistory`),'value',snap=>{window._roundHistory=snap.val()||{};if(currentMeta)renderByPhase(currentMeta);},err=>{console.error('history listener error',err);});listen(db.ref(`rooms/${room}/private/responses`),'value',snap=>{window._responses=snap.val()||{};if(currentMeta&&currentMeta.phase==='NIGHT')updateSTProgress(currentMeta);},err=>{console.error('responses listener error',err);});listen(db.ref(`rooms/${room}/public/reconnectRequests`),'child_added',snap=>{handleReconnectRequest(snap.key,snap.val()).catch(e=>console.error('reconnect error',e));});}if(!isST)listen(db.ref(`rooms/${room}/private/playerPrompts/${uid}`),'value',snap=>{window._myPrompt=snap.val();updatePlayerPrompt(window._myPrompt,currentMeta||{});});listen(db.ref('.info/connected'),'value',snap=>{if(isST||!uid||!room)return;if(snap.val())setPresenceOnline(room,uid);});}
function renderByPhase(m){if(m.status==='WAITING')return renderLobby(m);if(m.phase==='NIGHT')return renderNight(m);if(m.phase==='DAY')return renderDay(m)}
function charId(x){return String(x?.id||'').replace(/^ko_KR_/i,'')}
function charByRole(name){const n=String(name||'').trim();return (window._scriptData||[]).find(x=>x&&x.id!=='_meta'&&(String(x.name||'').trim()===n||charId(x)===n))||null}
function charIcon(x){if(!x)return '';let im=x.image;if(Array.isArray(im))im=im[0];if(im)return String(im);const id=charId(x),ed=String(x.edition||'').toLowerCase();if(!id||!ed)return '';const team=String(x.team||'').toLowerCase();const a=(team==='minion'||team==='demon')?'e':(team==='townsfolk'||team==='outsider')?'g':'';return `https://release.botc.app/resources/characters/${encodeURIComponent(ed)}/${encodeURIComponent(id)}${a?'_'+a:''}.webp`}
function roleIconHtml(role,cls='roleIcon'){const x=charByRole(role),src=charIcon(x);return src?`<img class="${cls}" src="${esc(src)}" alt="" onerror="this.style.display='none'">`:''}
function roleTeamClass(role){const x=charByRole(role);return x?' team-'+String(x.team||'other').toLowerCase():' team-other'}
function teamLabel(t){return ({townsfolk:'마을주민',outsider:'이방인',minion:'하수인',demon:'악마',traveller:'여행자',traveler:'여행자',fabled:'전설'}[String(t||'').toLowerCase()]||'기타')}
function playerList(players,owner){return Object.values(players||{}).map(p=>`<div class="person"><div class="personline"><span>${esc(p.name)}</span><span class="${p.online?'online':'offline'}">● ${p.online?'온라인':'오프라인'}</span></div>${owner?`<button class="roleSelectWide${roleTeamClass(window._roles?.[p.uid])}" onclick="openRoleMenu('${esc(p.uid)}')">${roleIconHtml(window._roles?.[p.uid])}<span>${esc(window._roles?.[p.uid]||'역할 선택')}</span><b>⌄</b></button>${currentMeta?.status==='PLAYING'?`<button class="secondary reconnectBtn" onclick="allowReconnect('${esc(p.uid)}','${esc(p.name)}')">🔄 재접속 허용</button>`:''}`:''}</div>`).join('')||'<div class="muted">아직 참가자가 없습니다.</div>'}
function leaveRoomToHome(){cleanup();const old=room;if(old){localStorage.removeItem('botc_last_room');localStorage.removeItem('botc_mode_'+old)}try{history.replaceState(null,'',location.pathname+location.search)}catch(e){location.hash=''}room=null;isST=false;meName='';currentMeta=null;window._myPrompt=null;window._activePrompt=null;window._players={};renderHome()}
function renderLobby(m){const ps=window._players||{};h(`<div class="top"><div class="brand">대기실</div><div class="row"><span class="pill">${esc(m.scriptName)}</span><button class="secondary" onclick="leaveRoomToHome()">처음 화면</button></div></div><div class="card center"><div class="muted">입장 코드</div><div class="code">${esc(room)}</div><div class="small muted">참가자에게 이 코드를 알려주세요.</div></div><div class="card"><div class="row"><b>참가자 ${Object.keys(ps).length}명</b><span class="pill">${Object.values(ps).filter(p=>p.online).length}명 온라인</span></div><div class="list" style="margin-top:10px">${playerList(ps,isST)}</div></div><div class="card">${isST?`<button style="width:100%" onclick="startGame()">게임 시작</button>`:`<div class="notice">사회자가 게임을 시작하면 자동으로 이동합니다.</div>`}</div>`);}
function reconnectList(players){return Object.values(players||{}).map(p=>`<div class="person personline"><span>${esc(p.name)} <small class="${p.online?'online':'offline'}">● ${p.online?'온라인':'오프라인'}</small></span><button class="secondary reconnectBtn" onclick="allowReconnect('${esc(p.uid)}','${esc(p.name)}')">재접속 허용</button></div>`).join('')||'<div class="muted">참가자가 없습니다.</div>'}
async function setRole(uid2,role){window._roles=window._roles||{};window._roles[uid2]=role;await db.ref(`rooms/${room}/private/st/roles/${uid2}`).set(role);closePicker()}
function openRoleMenu(uid2){const data=(window._scriptData||[]).filter(x=>x&&x.id!=='_meta');const teams=['townsfolk','outsider','minion','demon','traveller','traveler','fabled'];let body='';for(const team of teams){const items=data.filter(x=>String(x.team||'').toLowerCase()===team);if(!items.length)continue;body+=`<div class="pickerGroup"><div class="pickerTitle">${teamLabel(team)}</div>${items.map(x=>`<button class="pickerItem" onclick="setRole('${esc(uid2)}','${esc(x.name||charId(x))}')">${roleIconHtml(x.name||charId(x),'pickerIcon')}<span>${esc(x.name||charId(x))}</span></button>`).join('')}</div>`}body+=`<button class="pickerItem customPick" onclick="customRole('${esc(uid2)}')">＋ 커스텀 역할</button>`;openPicker('역할 변경',body)}
async function customRole(uid2){const v=prompt('커스텀 역할명을 입력하세요.',window._roles?.[uid2]||'');if(v===null||!v.trim())return;await setRole(uid2,v.trim())}
async function startGame(){
  const ps=window._players||{};if(!Object.keys(ps).length)return toast('참가자가 한 명 이상 필요합니다.');
  await db.ref(`rooms/${room}/public/meta`).update({status:'PLAYING',phase:'NIGHT',nightNumber:1,dayNumber:0,currentRound:0,nightRound:0,roundClosed:false,startedAt:firebase.database.ServerValue.TIMESTAMP});
}
async function allowReconnect(oldUid,name){if(!confirm(`${name} 참가자의 재접속을 허용할까요?\n참가자는 방 코드와 같은 이름으로 다시 입장하면 됩니다.`))return;await db.ref(`rooms/${room}/public/meta`).update({reconnectAllowedUid:oldUid,reconnectAllowedName:name,reconnectCompletedUid:null});toast(`${name} 재접속 허용됨`);}
const reconnectInFlight=new Set();
async function handleReconnectRequest(newUid,req){if(!isST||!req||!currentMeta||reconnectInFlight.has(newUid))return;reconnectInFlight.add(newUid);try{const m=(await db.ref(`rooms/${room}/public/meta`).once('value')).val()||{};if(newUid===req.oldUid||m.reconnectAllowedUid!==req.oldUid||String(m.reconnectAllowedName||'')!==String(req.name||''))return;const oldUid=req.oldUid;const old=(await db.ref(`rooms/${room}/public/players/${oldUid}`).once('value')).val();if(!old)return;const role=window._roles?.[oldUid]||null,tokens=window._tokens?.[oldUid]||null;const updates={};updates[`public/players/${newUid}`]={uid:newUid,name:old.name,online:true,joinedAt:old.joinedAt||firebase.database.ServerValue.TIMESTAMP,reconnectedAt:firebase.database.ServerValue.TIMESTAMP};updates[`public/players/${oldUid}`]=null;if(role!==null){updates[`private/st/roles/${newUid}`]=role;updates[`private/st/roles/${oldUid}`]=null}if(tokens!==null){updates[`private/st/tokens/${newUid}`]=tokens;updates[`private/st/tokens/${oldUid}`]=null}const prompt=(await db.ref(`rooms/${room}/private/playerPrompts/${oldUid}`).once('value')).val();if(prompt){updates[`private/playerPrompts/${newUid}`]=prompt;updates[`private/playerPrompts/${oldUid}`]=null}const rid=m.currentRound||0;if(rid){const resp=(await db.ref(`rooms/${room}/private/responses/${rid}/${oldUid}`).once('value')).val();if(resp){updates[`private/responses/${rid}/${newUid}`]={...resp,uid:newUid};updates[`private/responses/${rid}/${oldUid}`]=null}const hp=(await db.ref(`rooms/${room}/private/st/roundHistory/${rid}/prompts/${oldUid}`).once('value')).val();if(hp){updates[`private/st/roundHistory/${rid}/prompts/${newUid}`]={...hp,uid:newUid};updates[`private/st/roundHistory/${rid}/prompts/${oldUid}`]=null}}updates[`public/reconnectRequests/${newUid}`]=null;updates['public/meta/reconnectAllowedUid']=null;updates['public/meta/reconnectAllowedName']=null;updates['public/meta/reconnectCompletedUid']=newUid;await db.ref(`rooms/${room}`).update(updates);
}finally{reconnectInFlight.delete(newUid);}}
function stRoleList(){const ps=Object.values(window._players||{}),roles=window._roles||{};return ps.map(p=>`<div class="person"><div class="row"><b>${esc(p.name)}</b><span class="pill">${esc(roles[p.uid]||'역할 미입력')}</span></div></div>`).join('')||'<div class="muted">참가자가 없습니다.</div>'}
function renderNight(m){if(isST)return renderSTNight(m);return renderPlayerNight(m)}
function stHistoryHtml(){
  const hist=window._roundHistory||{}, responses=window._responses||{};
  const ids=Object.keys(hist).sort((a,b)=>Number(b)-Number(a));
  if(!ids.length)return '<div class="muted small">아직 질문·답변 이력이 없습니다.</div>';
  const byNight={};
  ids.forEach(id=>{const x=hist[id]||{}, n=Number(x.nightNumber||0)||'?';(byNight[n]||(byNight[n]=[])).push([id,x]);});
  return Object.keys(byNight).sort((a,b)=>Number(b)-Number(a)).map(n=>{
    const rounds=byNight[n].map(([id,x])=>{
      const rr=responses[id]||responses[String(id)]||{}, prompts=x.prompts||{};
      const actual=Object.values(prompts).filter(q=>q.real);
      const dummy=Object.values(prompts).filter(q=>!q.real);
      const actualRows=actual.map(q=>{const r=rr[q.uid];return `<div class="historyQa"><div><b>${esc(q.name||'참가자')}</b> <span class="pill">실제</span></div><div class="small muted">Q. ${esc(q.text||'')}</div><div class="small"><b>A.</b> ${r?esc(r.answer||''):'미응답'}</div></div>`}).join('');
      const dummyDone=dummy.filter(q=>!!rr[q.uid]).length;
      const dummyLine=dummy.length?`<div class="dummySummary">더미 ${dummyDone}/${dummy.length} 완료${dummyDone===dummy.length?' ✓':''}</div>`:'';
      return `<details class="historyTurn"><summary>${esc(x.nightRound||'?')}턴 · 전체 ${Object.keys(prompts).length}명 · 실제 ${actual.length}명</summary><div class="historyBody">${actualRows||'<div class="muted small">실제 질문 대상 없음</div>'}${dummyLine}</div></details>`;
    }).join('');
    return `<details class="historyNight"><summary>🌙 ${esc(n)}번째 밤 Q&A · ${byNight[n].length}턴</summary><div class="historyBody">${rounds}</div></details>`;
  }).join('');
}

let nightOrderMode='all', nightDrawerOpened=false;
function nightOrderHtml(m){
  const data=Array.isArray(window._scriptData)?window._scriptData:[];
  const key=(m.nightNumber||1)===1?'firstNight':'otherNight';
  const title=(m.nightNumber||1)===1?'첫 번째 밤 순서':'밤 순서';
  const assigned=new Set(Object.values(window._roles||{}).map(r=>{const c=charByRole(r);return c?String(c.id||c.name).toLowerCase():String(r||'').trim().toLowerCase()}).filter(Boolean));
  const all=data.filter(x=>x&&x.id!=='_meta'&&Number(x[key])>0).sort((a,b)=>Number(a[key])-Number(b[key]));
  const items=nightOrderMode==='selected'?all.filter(x=>assigned.has(String(x.id||x.name).toLowerCase())):all;
  const count=all.filter(x=>assigned.has(String(x.id||x.name).toLowerCase())).length;
  return `<button class="nightTab" onclick="toggleNightDrawer(true)">🌙<span>순서</span></button><div id="nightShade" class="nightShade${nightDrawerOpened?' open':''}" onclick="toggleNightDrawer(false)"></div><aside id="nightDrawer" class="nightDrawer${nightDrawerOpened?' open':''}"><div class="drawerHead"><b>🌙 ${title}</b><button class="secondary" onclick="toggleNightDrawer(false)">✕</button></div><div class="nightMode"><button class="${nightOrderMode==='all'?'active':''}" onclick="setNightOrderMode('all')">전체 역할</button><button class="${nightOrderMode==='selected'?'active':''}" onclick="setNightOrderMode('selected')">선택된 역할만</button></div><div class="nightSummary">현재 배정된 역할 ${count}종 · 역할 변경 시 자동 반영</div><div class="nightList">${items.map(x=>{const selected=assigned.has(String(x.id||x.name).toLowerCase());const pos=all.indexOf(x)+1;return `<div class="nightItem ${selected?'nightSelected':'nightInactive'}"><span class="nightNum">${pos}</span>${roleIconHtml(x.name||charId(x),'nightIcon')}<div><b>${esc(x.name||x.id)}</b>${selected?'<span class="nightPicked">● 배정됨</span>':''}<div class="small muted">${esc(x[key+'Reminder']||'')}</div></div></div>`}).join('')||'<div class="muted">해당 밤에 표시할 역할이 없습니다.</div>'}</div></aside>`;
}
function toggleNightDrawer(open){nightDrawerOpened=!!open;document.querySelector('#nightDrawer')?.classList.toggle('open',nightDrawerOpened);document.querySelector('#nightShade')?.classList.toggle('open',nightDrawerOpened)}
function setNightOrderMode(mode){nightOrderMode=mode==='selected'?'selected':'all';if(currentMeta&&isST&&currentMeta.phase==='NIGHT'){const el=document.querySelector('#nightDrawer');if(el){const next=document.createElement('div');next.innerHTML=nightOrderHtml(currentMeta);const newer=next.querySelector('#nightDrawer');el.replaceWith(newer);document.querySelectorAll('.nightTab,.nightShade').forEach(e=>e.remove());const tab=next.querySelector('.nightTab'),shade=next.querySelector('.nightShade');document.querySelector('#app').prepend(shade);document.querySelector('#app').prepend(tab);}}}

function openPicker(title,body){document.querySelector('#pickerOverlay')?.remove();document.body.insertAdjacentHTML('beforeend',`<div id="pickerOverlay" class="pickerOverlay" onclick="if(event.target===this)closePicker()"><div class="pickerSheet"><div class="drawerHead"><b>${esc(title)}</b><button class="secondary" onclick="closePicker()">✕</button></div><div class="pickerBody">${body}</div></div></div>`)}
function closePicker(){document.querySelector('#pickerOverlay')?.remove()}
function tokenText(uid2){const a=window._tokens?.[uid2];return Array.isArray(a)?a.filter(Boolean):a&&typeof a==='object'?Object.values(a).filter(Boolean):[]}
function availableTokens(uid2){const role=charByRole(window._roles?.[uid2]);const own=Array.isArray(role?.reminders)?role.reminders:[];const global=(window._scriptData||[]).flatMap(x=>Array.isArray(x?.remindersGlobal)?x.remindersGlobal:[]);const common=['중독됨','취함','보호됨','오늘 선택됨','사망'];return [...new Set([...own,...global,...common].filter(Boolean))]}
function tokenBadgeHtml(t,cls='reminderToken'){const n=String(t||'').trim();let mark='',extra='';if(n==='보호됨'||n==='보호'){mark='🛡';extra=' statusProtected'}else if(n==='중독됨'||n==='중독'){mark='☠';extra=' statusPoisoned'}else if(n==='취함'){mark='🍺';extra=' statusDrunk'}else if(n==='사망'){mark='✕';extra=' statusDead'}return `<span class="${cls}${extra}"><span class="reminderTokenInner">${mark?`<span class="statusMark">${mark}</span>`:''}<span class="tokenLabel">${esc(n)}</span></span></span>`}
function openTokenMenu(uid2){const opts=availableTokens(uid2);const role=window._roles?.[uid2]||'현재 역할';const body=`<div class="small muted pickerHint">${esc(role)}의 JSON reminder 토큰을 우선 표시합니다.</div>${opts.map(t=>`<button class="pickerItem tokenPick" onclick="selectToken('${esc(uid2)}','${esc(t)}')">${tokenBadgeHtml(t)}<span>${esc(t)}</span></button>`).join('')}<button class="pickerItem customPick" onclick="customToken('${esc(uid2)}')">＋ 커스텀 토큰</button>`;openPicker('토큰 추가',body)}
async function selectToken(uid2,t){const cur=tokenText(uid2);if(cur.includes(t))return toast('이미 붙어 있는 토큰입니다.');await db.ref(`rooms/${room}/private/st/tokens/${uid2}`).set([...cur,t]);closePicker()}
async function customToken(uid2){const v=prompt('커스텀 토큰 이름을 입력하세요.','');if(v===null||!v.trim())return;await selectToken(uid2,v.trim())}
function availableRoles(){return (window._scriptData||[]).filter(x=>x&&x.id!=='_meta').map(x=>String(x.name||x.id||'').trim()).filter(Boolean)}
function changeRole(uid2){openRoleMenu(uid2)}
async function removeToken(uid2,idx){const cur=tokenText(uid2);if(idx<0||idx>=cur.length)return;if(!confirm(`「${cur[idx]}」 토큰을 제거할까요?`))return;cur.splice(idx,1);await db.ref(`rooms/${room}/private/st/tokens/${uid2}`).set(cur.length?cur:null);}
function grimoireText(){const ps=Object.values(window._players||{}),m=window._roles||{};const lines=['##마도서 보기##'];ps.forEach(p=>{const role=(m[p.uid]||'역할 미입력').trim();const ts=tokenText(p.uid);lines.push(`${p.name} - ${role}${ts.length?' - '+ts.join(', '):''}`)});return lines.join('\n')+'\n\n';}
function autoGrow(el){if(!el)return;el.style.height='auto';el.style.height=Math.min(Math.max(el.scrollHeight,42),260)+'px'}
function addGrimoire(uid2){const q=$(`#q-${uid2}`);if(!q)return;const g=grimoireText();q.value=q.value.trim()?g+q.value:g;autoGrow(q);q.focus();}
function renderSTNight(m){const draft=readSTDraft();h(`${nightOrderHtml(m)}<div class="top"><div><div class="brand">${phaseTitle(m)}</div><div class="small muted" style="margin-top:2px">방 ${esc(room)}</div></div><button class="danger" onclick="endGame()">🔴 게임 종료</button></div><div id="stMain"></div><div class="card compactHistory"><div class="row"><b>밤 Q&A 이력</b><span class="pill">ST 전용</span></div><div style="margin-top:8px">${stHistoryHtml()}</div></div>`);updateSTProgress(m,draft)}
function readSTDraft(){const d={};document.querySelectorAll('.composePerson').forEach(el=>{const cb=el.querySelector('[data-real]');if(!cb)return;const id=cb.getAttribute('data-real');d[id]={real:cb.checked,text:el.querySelector('textarea')?.value||''}});return d}
async function updateSTProgress(m,draft){
  const root=$('#stMain');if(!root)return;const updateRoom=room,updateRound=m.currentRound;
  const ps=window._players||{}, players=Object.values(ps), rid=m.currentRound||0, nightRound=m.nightRound||0;
  let rr=nightRound>0?(window._responses?.[String(rid)]||window._responses?.[rid]||{}):{};
  if(nightRound>0 && !Object.keys(rr).length){
    try{rr=(await db.ref(`rooms/${room}/private/responses/${rid}`).once('value')).val()||{};}catch(e){console.error('round response read error',e);}
  }
  if(root!==$('#stMain')||room!==updateRoom||currentMeta?.currentRound!==updateRound||currentMeta?.phase!=='NIGHT')return;
  const answered=nightRound>0?players.filter(p=>!!rr[p.uid]).length:0;
  const allDone=nightRound>0&&players.length>0&&answered===players.length;
  const readyForNext=nightRound===0||allDone||!!m.roundClosed;
  const roles=window._roles||{};
  const currentPrompts=(window._roundHistory?.[String(rid)]||window._roundHistory?.[rid]||{}).prompts||{};
  const statusList=players.map(p=>{const done=!!rr[p.uid];const isReal=!!currentPrompts[p.uid]?.real;const answer=(done&&isReal)?esc(rr[p.uid]?.answer||''):'';return `<div class="statusChip ${done?'done':'wait'}"><div class="statusTop"><b>${esc(p.name)}</b><span>${done?'✓ 완료':'◷ 대기'}</span></div>${done&&isReal?`<div class="liveAnswer"><b>답변</b> ${answer}</div>`:''}</div>`}).join('');
  const composeList=players.map(p=>{const ts=tokenText(p.uid);return `<div class="composePerson"><div class="composeHead"><div><b>${esc(p.name)}</b><button class="roleChangeBtn${roleTeamClass(roles[p.uid])}" onclick="openRoleMenu('${esc(p.uid)}')">${roleIconHtml(roles[p.uid])}<span>${esc(roles[p.uid]||'역할 선택')}</span><b>⌄</b></button><div class="tokenLine">${ts.map((t,i)=>`<button class="tokenMini" onclick="removeToken('${esc(p.uid)}',${i})">${tokenBadgeHtml(t,'reminderToken tiny')}<span>${esc(t)}</span> ×</button>`).join('')}<button class="tokenMini add" onclick="openTokenMenu('${esc(p.uid)}')">＋ 토큰⌄</button></div></div><label class="radio compactCheck"><input type="checkbox" data-real="${esc(p.uid)}" onchange="toggleReal('${esc(p.uid)}')"> 실제</label></div><textarea id="q-${esc(p.uid)}" disabled oninput="autoGrow(this)" placeholder="더미 문장이 자동 배포됩니다."></textarea><button class="grimoireBtn secondary" data-grimoire="${esc(p.uid)}" disabled onclick="addGrimoire('${esc(p.uid)}')" title="마도서 삽입">📖</button></div>`}).join('');
  const resultBlock=nightRound>0?`<div class="statusGrid">${statusList}</div>`:'';
  const composeBlock=readyForNext?`<div class="composeGrid" style="margin-top:${nightRound>0?'10':'0'}px">${composeList}</div><button style="width:100%;margin-top:10px" onclick="deployRound()">🌙 ${nightRound===0?'첫 질문 전원 배포':'다음 질문 전원 배포'}</button>${m.roundClosed?'<div class="notice" style="margin-top:8px">이전 질문의 미응답자를 건너뛰었습니다. 다음 질문을 배포할 수 있습니다.</div>':''}`:`<button class="danger" style="width:100%;margin-top:10px" onclick="forceNextTurn()">⏭️ 미응답 강제 넘김 · 다음 질문 준비</button>`;
  draft=draft||readSTDraft();
  root.innerHTML=`<div class="card"><div class="row"><b>질문·답변 턴${nightRound?` · ${nightRound}턴`:''}</b><span class="pill">${answered}/${players.length}</span></div>
  <p class="muted small">질문을 배포하면 참가자는 이번 턴에 한 번만 답변할 수 있습니다. 전원이 답변해야 다음 질문을 배포할 수 있습니다.</p>
  ${resultBlock}${composeBlock}
  </div><div class="card"><div class="row"><b>게임 단계 이동</b><span class="pill">밤 → 낮</span></div><p class="muted small">질문·답변 완료 여부와 관계없이 사회자가 현재 밤을 끝내고 다음 낮으로 이동합니다.</p><button style="width:100%" onclick="nextDay()">☀️ 다음 단계: ${m.dayNumber+1}번째 낮</button></div><details class="card reconnectFold"><summary>🔄 참가자 재접속 <span class="pill">ST 전용</span></summary><div class="list" style="margin-top:8px">${reconnectList(ps)}</div></details><div class="card"><button class="secondary" style="width:100%" onclick="openScript()">📜 스크립트 보기</button></div>`
  for(const [id,v] of Object.entries(draft||{})){const cb=document.querySelector(`[data-real="${id}"]`),q=document.getElementById('q-'+id);if(cb&&q){cb.checked=!!v.real;q.value=v.text||'';toggleReal(id);autoGrow(q)}}
}
function toggleReal(uid2){const cb=document.querySelector(`[data-real="${uid2}"]`),q=$(`#q-${uid2}`),g=document.querySelector(`[data-grimoire="${uid2}"]`);if(q){q.disabled=!cb.checked;q.placeholder=cb.checked?'실제 능력 질문을 직접 입력하세요.':'더미 문장이 자동 배포됩니다.'}if(g)g.disabled=!cb.checked}
async function deployRound(){
  try{
    const m=(await db.ref(`rooms/${room}/public/meta`).once('value')).val();
    if(m.phase!=='NIGHT')return toast('현재는 밤 단계가 아닙니다.');
    const ps=window._players||{}, players=Object.values(ps), rid=m.currentRound||0, nightRound=m.nightRound||0;
    if(!players.length)return toast('참가자가 없습니다.');
    const rr=nightRound>0?((await db.ref(`rooms/${room}/private/responses/${rid}`).once('value')).val()||{}):{};
    const allDone=nightRound>0&&players.every(p=>!!rr[p.uid]);
    if(nightRound>0&&!allDone&&!m.roundClosed)return toast('아직 답변하지 않은 참가자가 있습니다. 전원 답변을 기다리거나 「질문·답변 턴 강제 넘기기」를 눌러 주세요.');
    const newRound=rid+1, newNightRound=nightRound+1, updates={}, historyPrompts={};
    for(const p of players){
      const real=!!document.querySelector(`[data-real="${p.uid}"]`)?.checked;
      const q=$(`#q-${p.uid}`)?.value.trim();
      if(real&&!q)throw Error(`${p.name}의 실제 질문을 입력해 주세요.`);
      const text=real?q:randomDummy();
      updates[`private/playerPrompts/${p.uid}`]={round:newRound,nightRound:newNightRound,text,requiresExact:!real,issuedAt:firebase.database.ServerValue.TIMESTAMP};
      historyPrompts[p.uid]={uid:p.uid,name:p.name,real,text};
    }
    updates[`private/st/roundHistory/${newRound}`]={round:newRound,nightNumber:m.nightNumber||1,nightRound:newNightRound,prompts:historyPrompts,issuedAt:firebase.database.ServerValue.TIMESTAMP};
    updates['public/meta/currentRound']=newRound;
    updates['public/meta/nightRound']=newNightRound;
    updates['public/meta/roundClosed']=false;
    await db.ref(`rooms/${room}`).update(updates);
  }catch(e){toast(e.message||String(e))}
}
async function forceNextTurn(){
  if(!confirm('미응답자의 현재 질문을 종료하고 다음 질문을 준비할까요?'))return;
  const m=(await db.ref(`rooms/${room}/public/meta`).once('value')).val();
  const rid=m.currentRound||0, nightRound=m.nightRound||0;if(!rid||!nightRound)return;
  const ps=window._players||{}, updates={'public/meta/roundClosed':true};
  Object.values(ps).forEach(p=>{updates[`private/playerPrompts/${p.uid}`]=null});
  await db.ref(`rooms/${room}`).update(updates);
}
function renderPlayerNight(m){const saved=$('#answer')?.value||'',oldPrompt=window._activePrompt;h(`<div class="top"><div class="brand">${phaseTitle(m)}</div><button class="secondary" onclick="openScript()">스크립트</button></div><div id="playerMain"></div>`);updatePlayerPrompt(window._myPrompt||null,m);if(saved&&oldPrompt&&window._myPrompt&&oldPrompt.round===window._myPrompt.round&&oldPrompt.text===window._myPrompt.text&&$('#answer'))$('#answer').value=saved;}

function promptDisplay(text){const raw=String(text||'');if(raw.startsWith('##마도서 보기##')){const parts=raw.split(/\n\n/);const grim=parts.shift()||'';const lines=grim.split('\n').slice(1);return `<div class="grimoireCard"><div class="grimoireTitle">📖 마도서 보기</div>${lines.map(x=>`<div class="grimLine">${esc(x)}</div>`).join('')}</div>${parts.length?`<div class="questionText">${esc(parts.join('\n\n'))}</div>`:''}`}return `<div class="questionText">${esc(raw)}</div>`}
function updatePlayerPrompt(p,m){const root=$('#playerMain');if(!root)return;const draft=$('#answer')?.value||'';const prev=window._activePrompt;window._activePrompt=p||null;if(!p){root.innerHTML=`<div class="card playerWait"><div class="phase">🌙 밤이 진행 중입니다</div><p class="muted">잠시 후 사회자로부터 문장이 전달됩니다.</p><div class="waitGuide"><b>실제 질문</b> → 질문에 맞게 답변해 주세요.<br><b>더미 문장</b> → 표시된 짧은 문장을 그대로 입력해 주세요.</div><p class="small muted">어떤 내용을 받았는지는 다른 참가자에게 알려주지 마세요.</p></div>`;return}root.innerHTML=`<div class="card"><div class="muted small">${p.requiresExact?'더미 문장을 그대로 입력해야 전송됩니다.':'사회자가 지정한 질문입니다.'}</div><div class="prompt" style="margin-top:8px">${promptDisplay(p.text)}</div><label style="margin-top:12px">답변</label><textarea id="answer" placeholder="답변을 입력하세요."></textarea><button style="width:100%;margin-top:10px" onclick="submitCurrentAnswer()">전송</button></div>`;if(p&&prev&&p.round===prev.round&&p.text===prev.text&&$('#answer'))$('#answer').value=draft}
function submitCurrentAnswer(){const p=window._activePrompt;if(!p)return toast('현재 답변할 질문이 없습니다.');return submitAnswer(p.round,!!p.requiresExact,String(p.text??''))}
async function submitAnswer(round,exact,text){const a=$('#answer')?.value||'';if(!a.trim())return toast('답변을 입력해 주세요.');if(exact&&a!==text)return toast('더미 문장을 정확히 그대로 입력해 주세요.');const btn=document.querySelector('#playerMain button');if(btn)btn.disabled=true;try{const m=(await db.ref(`rooms/${room}/public/meta`).once('value')).val();if((m.currentRound||0)!==round||m.roundClosed){if(btn)btn.disabled=false;return toast('이미 종료된 턴입니다.');}await db.ref(`rooms/${room}`).update({[`private/responses/${round}/${uid}`]:{uid,name:meName,answer:a,submittedAt:firebase.database.ServerValue.TIMESTAMP},[`private/playerPrompts/${uid}`]:null});window._myPrompt=null;window._activePrompt=null;updatePlayerPrompt(null,m);}catch(e){if(btn)btn.disabled=false;toast('답변 전송에 실패했습니다: '+(e.message||e));}}
function renderDay(m){h(`<div class="top"><div><div class="brand">${phaseTitle(m)}</div>${isST?`<div class="small muted" style="margin-top:2px">방 ${esc(room)}</div>`:''}</div>${isST?'<button class="danger" onclick="endGame()">🔴 게임 종료</button>':''}</div>${isST?`<details class="card reconnectFold"><summary>🔄 참가자 재접속 <span class="pill">ST 전용</span></summary><div class="list" style="margin-top:8px">${reconnectList(window._players||{})}</div></details><div class="card compactHistory"><div class="row"><b>밤 Q&A 이력</b><span class="pill">ST 전용</span></div><div style="margin-top:8px">${stHistoryHtml()}</div></div>`:''}<div class="card center"><div class="phase">☀️ ${m.dayNumber}번째 낮</div><p class="muted">현재 스크립트를 확인할 수 있습니다.</p><button style="width:100%" onclick="openScript()">📜 스크립트 보기</button></div>${isST?`<div class="card"><button style="width:100%" onclick="nextNight()">🌙 다음 밤으로</button></div>`:''}`)}
async function nextDay(){
  if(!confirm('현재 질문·답변 상태와 관계없이 밤 단계를 끝내고 다음 낮으로 이동할까요?'))return;
  const m=(await db.ref(`rooms/${room}/public/meta`).once('value')).val(), ps=window._players||{}, updates={};
  Object.values(ps).forEach(p=>{updates[`private/playerPrompts/${p.uid}`]=null});
  updates['public/meta/phase']='DAY';updates['public/meta/dayNumber']=(m.dayNumber||0)+1;updates['public/meta/roundClosed']=true;
  await db.ref(`rooms/${room}`).update(updates);
}
async function nextNight(){const m=(await db.ref(`rooms/${room}/public/meta`).once('value')).val();await db.ref(`rooms/${room}/public/meta`).update({phase:'NIGHT',nightNumber:(m.nightNumber||0)+1,nightRound:0,roundClosed:false})}
async function endGame(){if(!confirm('게임을 종료할까요? 모든 참가자는 종료 화면으로 이동합니다.'))return;await db.ref(`rooms/${room}/public/meta`).update({status:'ENDED',endedAt:firebase.database.ServerValue.TIMESTAMP});}
async function openScript(){const s=await db.ref(`rooms/${room}/public/script`).once('value');const data=s.val()||[];const chars=data.filter(x=>x.id!=='_meta');const groups=[['townsfolk','마을주민'],['outsider','이방인'],['minion','하수인'],['demon','악마']];const known=new Set(groups.map(g=>g[0]));const section=(team,label)=>{const items=chars.filter(x=>String(x.team||'').toLowerCase()===team);if(!items.length)return '';return `<section class="scriptgroup team-${team}"><div class="scriptgroup-title">${esc(label)} <span class="pill">${items.length}</span></div><div class="scriptTokenGrid">${items.map(x=>`<div class="scriptchar tokenChar">${roleIconHtml(x.name||charId(x),'scriptIcon')}<div><b>${esc(x.name||x.id)}</b><div class="muted small">${esc(x.ability||'')}</div></div></div>`).join('')}</div></section>`};const other=chars.filter(x=>!known.has(String(x.team||'').toLowerCase()));const otherHtml=other.length?`<section class="scriptgroup team-other"><div class="scriptgroup-title">기타 <span class="pill">${other.length}</span></div><div class="scriptTokenGrid">${other.map(x=>`<div class="scriptchar tokenChar">${roleIconHtml(x.name||charId(x),'scriptIcon')}<div><b>${esc(x.name||x.id)}</b><div class="muted small">${esc(x.ability||'')}</div></div></div>`).join('')}</div></section>`:'';h(`<div class="top"><div class="brand">📜 스크립트</div><button class="secondary" onclick="startRoom()">돌아가기</button></div><div class="card scriptbox"><h2>${esc(scriptName(data))}</h2>${groups.map(g=>section(g[0],g[1])).join('')}${otherHtml}</div>`)}
function clearEndedSession(){const old=room;if(old){localStorage.removeItem('botc_last_room');localStorage.removeItem('botc_name_'+old);localStorage.removeItem('botc_mode_'+old)}try{history.replaceState(null,'',location.pathname+location.search)}catch(e){location.hash=''}room=null;currentMeta=null;window._myPrompt=null;window._activePrompt=null}
function goHomeAfterEnd(){clearEndedSession();renderHome()}
function renderEnded(){clearEndedSession();h(`<div class="card center endCard" style="margin-top:20vh"><div class="phase">🏆 게임이 종료되었습니다</div><p class="muted">수고하셨습니다.</p><button style="width:100%" onclick="goHomeAfterEnd()">🏠 처음 화면으로</button></div>`)}
auth.onAuthStateChanged(async u=>{if(!u){try{await auth.signInAnonymously();}catch(e){app.innerHTML=`<div class="card center"><div class="phase">접속 오류</div><p class="muted">Firebase 익명 로그인이 되지 않습니다.<br>Firebase Authentication에서 익명 로그인을 켜 주세요.</p><p class="small muted">${esc(e.message||e)}</p></div>`;}return;}uid=u.uid;const r=(location.hash.slice(1)||localStorage.getItem('botc_last_room')||'').toUpperCase();if(r){room=r;try{const ms=await db.ref(`rooms/${room}/public/meta`).once('value'),m=ms.val();if(!m){localStorage.removeItem('botc_last_room');return renderHome();}const savedMode=localStorage.getItem('botc_mode_'+room);isST=m.ownerUid===uid&&savedMode!=='PLAYER';if(m.status==='ENDED'){renderEnded();return;}if(!isST){const admitted=(await db.ref(`rooms/${room}/public/players/${uid}`).once('value')).exists();if(!admitted){if(m.status!=='WAITING'){h(`<div class="card center" style="margin-top:20vh"><div class="phase">재접속</div><p class="muted">자동 복귀에 실패했습니다.<br>사회자에게 재접속 허용을 요청한 뒤 같은 방 코드와 이름으로 입장하세요.</p><button onclick="showJoin();document.querySelector('#joinCode').value='${esc(room)}'">재접속 입력</button></div>`);return;}localStorage.removeItem('botc_last_room');location.hash='';showJoin();const c=$('#joinCode');if(c)c.value=room;return;}meName=localStorage.getItem('botc_name_'+room)||'참가자';}localStorage.setItem('botc_last_room',room);if(!location.hash)location.hash=room;startRoom()}catch(e){app.innerHTML=`<div class="card center"><div class="phase">접속 오류</div><p class="muted">Firebase 데이터베이스에 연결할 수 없습니다.</p><p class="small muted">${esc(e.message||e)}</p></div>`}}else renderHome();});
window.cancelReconnectWait=cancelReconnectWait;window.renderHome=renderHome;window.leaveRoomToHome=leaveRoomToHome;window.showCreate=showCreate;window.showJoin=showJoin;window.createRoom=createRoom;window.createCustomRoom=createCustomRoom;window.joinRoom=joinRoom;window.startGame=startGame;window.allowReconnect=allowReconnect;window.toggleReal=toggleReal;window.deployRound=deployRound;window.forceNextTurn=forceNextTurn;window.submitCurrentAnswer=submitCurrentAnswer;window.submitAnswer=submitAnswer;window.nextDay=nextDay;window.nextNight=nextNight;window.endGame=endGame;window.openScript=openScript;window.removeToken=removeToken;window.addGrimoire=addGrimoire;window.changeRole=changeRole;window.openRoleMenu=openRoleMenu;window.openTokenMenu=openTokenMenu;window.setRole=setRole;window.customRole=customRole;window.selectToken=selectToken;window.customToken=customToken;window.closePicker=closePicker;window.toggleNightDrawer=toggleNightDrawer;window.setNightOrderMode=setNightOrderMode;window.goHomeAfterEnd=goHomeAfterEnd;window.autoGrow=autoGrow;
