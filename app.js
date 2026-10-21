firebase.initializeApp(firebaseConfig);
const auth=firebase.auth(), db=firebase.database();
const $=s=>document.querySelector(s), app=$('#app');
let uid=null, room=null, listeners=[], meName='', isST=false, currentMeta=null;
window._scriptData=[];window._tokens={};window._roles={};window._assignments={};window._drawClaims={};window._roleConfirmations={};window._myRole=null;let setupRows=[];let setupMode='auto';let setupReady=false;let roleVisible=false;
const SCRIPTS={
  trouble_brewing:'trouble_brewing.json',
  sects_and_violets:'sects_and_violets.json',
  bad_moon_rising:'bad_moon_rising.json'
};
const DUMMIES=['오늘 밤은 조용합니다','달빛이 창가를 비춥니다','시계 소리가 들립니다','잠시 화면을 봐주세요','오늘도 밤이 깊었습니다','별빛이 희미하게 보입니다','조용히 문장을 읽어주세요','잠시 그대로 기다려주세요'];
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function h(s){if(typeof grimClearSurface==='function' && (!isST || !currentMeta || currentMeta.status==='ENDED' || !['NIGHT','DAY'].includes(currentMeta.phase) || !matchMedia('(min-width: 1000px) and (orientation: landscape)').matches))grimClearSurface();app.innerHTML=(!isST&&room&&currentMeta&&currentMeta.status!=='ENDED'?'<div class="playerExitTop"><button class="secondary" onclick="leavePlayerRoom()">🚪 방 나가기</button></div>':'')+s;updateRoomEscapeControls()}
function updateRoomEscapeControls(){
 let bar=document.getElementById('roomEscapeBar');
 if(!bar){bar=document.createElement('div');bar.id='roomEscapeBar';document.body.appendChild(bar)}
 const active=!!room&&!!currentMeta&&currentMeta.status!=='ENDED';
 if(!active){bar.hidden=true;bar.innerHTML='';return}
 bar.hidden=true;bar.innerHTML='';
}
async function leavePlayerRoom(){
 if(isST)return toast('사회자는 게임 종료를 이용해 주세요.');
 if(!confirm('이 방에서 나가 처음 화면으로 이동할까요?\n게임 자체는 종료되지 않으며, 다시 참여하려면 재접속이 필요할 수 있습니다.'))return;
 const oldRoom=room,oldUid=uid;
 try{if(oldRoom&&oldUid)await db.ref(`rooms/${oldRoom}/public/players/${oldUid}/online`).set(false)}catch(e){console.warn('leave presence',e)}
 leaveRoomToHome();
}
function toast(msg){alert(msg)}
let presenceRef=null, presenceGeneration=0;
function stopPresence(){
  ++presenceGeneration;
  const old=presenceRef;presenceRef=null;
  if(old)old.onDisconnect().cancel().catch(e=>console.warn('presence cancellation',e));
}
function cleanup(){voteStopTimers();stopPresence();listeners.forEach(u=>u&&u());listeners=[]}
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
function code(){const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';const values=new Uint32Array(4);crypto.getRandomValues(values);return Array.from(values,n=>chars[n%chars.length]).join('')}
function randomDummy(){return DUMMIES[Math.floor(Math.random()*DUMMIES.length)]}
function phaseTitle(m){return m.phase==='NIGHT'?`🌙 ${m.nightNumber}번째 밤`:m.phase==='DAY'?`☀️ ${m.dayNumber}번째 낮`:''}
async function loadScript(key){if(window.BOTC_KO_SCRIPTS?.[key])return JSON.parse(JSON.stringify(window.BOTC_KO_SCRIPTS[key]));const r=await fetch(SCRIPTS[key]);if(!r.ok)throw Error('스크립트 파일을 불러오지 못했습니다.');return await r.json()}
function scriptName(data){return data?.[0]?.name||'사용자 스크립트'}
function renderHome(){grimClearSurface();cleanup();h(`<section class="homeScene"><div class="homeSky"><span class="homeMoon"></span><div class="homeTower"><div class="homeSpire"></div><div class="homeClock"><span class="homeHand hour"></span><span class="homeHand minute"></span></div><div class="homeWindows">✦</div></div></div><div class="homeTitle"><div class="homeEyebrow">BLOOD ON THE CLOCKTOWER</div><h1>시계탑에 흐른 피</h1><p>밤의 비밀을 위한 사회자 도우미</p></div><div class="homeActions"><button onclick="showCreate()">🌙 사회자 방 만들기</button><button class="secondary" onclick="showJoin()">🚪 참가자로 입장</button></div><div class="homeFoot">NIGHT HELPER · 비공식 개인용 보조 도구</div></section>`)}
function koreanScriptChoices(){return (window.BOTC_KO_SCRIPT_GROUPS||[]).map(group=>`<details class="scriptCatalog"><summary>${esc(group.name)} <span class="catalogCount">${group.entries.length}개</span></summary><div class="scriptCatalogList">${group.entries.map(entry=>`<button class="secondary catalogScript" onclick="createRoom('${esc(entry.key)}')"><span>${esc(entry.name.split(' | ')[0])}</span><small>${esc(entry.name.split(' | ').slice(1).join(' | '))}</small></button>`).join('')}</div></details>`).join('');}
function showCreate(){h(`<div class="top"><div class="brand">대기실 만들기</div><button class="secondary" onclick="renderHome()">뒤로</button></div><div class="card"><label>기본 시나리오</label><div class="grid"><button onclick="createRoom('trouble_brewing')">불길한 조짐 (Trouble Brewing)</button><button onclick="createRoom('sects_and_violets')">환란의 화원 (Sects and Violets)</button><button onclick="createRoom('bad_moon_rising')">어둠을 부르는 달 (Bad Moon Rising)</button></div>${koreanScriptChoices()}<hr style="border-color:#2a2d35;border-width:1px 0 0;margin:16px 0"><label>사용자 JSON</label><input id="jsonFile" type="file" accept="application/json,.json"><button class="secondary" onclick="createCustomRoom()">JSON으로 대기실 만들기</button></div>`)}
function showJoin(){h(`<div class="top"><div class="brand">참가자로 입장</div><button class="secondary" onclick="renderHome()">뒤로</button></div><div class="card"><label>입장 코드</label><input id="joinCode" maxlength="4" autocapitalize="characters" placeholder="영문 대문자·숫자 4자리"><label style="margin-top:10px">이름</label><input id="joinName" maxlength="20" placeholder="게임에서 사용할 이름"><button style="margin-top:12px;width:100%" onclick="joinRoom()">입장</button></div>`)}
async function createRoom(key){try{const data=await loadScript(key);await makeRoom(data,!!window.BOTC_KO_SCRIPTS?.[key])}catch(e){toast(e.message)}}
async function createCustomRoom(){const f=$('#jsonFile')?.files?.[0];if(!f)return toast('JSON 파일을 선택해 주세요.');try{const data=JSON.parse(await f.text());if(!Array.isArray(data)||!data.length)throw Error('JSON 형식이 올바르지 않습니다.');await makeRoom(data,true)}catch(e){toast('JSON을 읽지 못했습니다: '+e.message)}}
async function makeRoom(script,custom){
 // Firebase rules deny reading an empty meta node, so do not use a client transaction here.
 // A write to another user's room is denied by the existing ownerUid security rule.
 let roomId=null;
 for(let attempt=0;attempt<30;attempt++){
  const candidate=code();
  try{
   await db.ref(`rooms/${candidate}/public/meta`).set({ownerUid:uid,status:'WAITING',phase:'WAITING',nightNumber:0,dayNumber:0,currentRound:0,scriptName:scriptName(script),custom:!!custom,createdAt:firebase.database.ServerValue.TIMESTAMP});
   roomId=candidate;break;
  }catch(e){
   if(e.code!=='PERMISSION_DENIED'&&e.code!=='permission_denied')throw e;
  }
 }
 if(!roomId)throw Error('방 코드 생성이 거부되었습니다. Firebase 인증 및 데이터베이스 규칙을 확인해 주세요.');
 try{
  await db.ref(`rooms/${roomId}/public/script`).set(script);
  await db.ref(`rooms/${roomId}/private/st`).set({ownerUid:uid});
 }catch(e){await db.ref(`rooms/${roomId}/public/meta`).remove().catch(()=>{});throw e;}
 room=roomId;isST=true;meName='ST';localStorage.setItem('botc_last_room',roomId);localStorage.setItem('botc_mode_'+roomId,'ST');location.hash=roomId;startRoom();
}
function saveJoinedRoom(c,n){room=c;isST=false;meName=n;localStorage.setItem('botc_name_'+c,n);localStorage.setItem('botc_last_room',c);localStorage.setItem('botc_mode_'+c,'PLAYER');location.hash=c;}
async function joinRoom(){
  const c=($('#joinCode')?.value||'').trim().toUpperCase(), n=($('#joinName')?.value||'').trim();
  if(!/^[A-Z0-9]{4}$/.test(c))return toast('영문 대문자·숫자 4자리 입장 코드를 확인해 주세요.');
  if(!n)return toast('이름을 입력해 주세요.');
  try{
    const snap=await db.ref(`rooms/${c}/public/meta`).once('value'),m=snap.val();
    if(!m)return toast('입장 코드를 찾을 수 없습니다.');
    if(m.status==='WAITING'){
      await db.ref(`rooms/${c}/public/players/${uid}`).set({uid,name:n,online:true,joinedAt:firebase.database.ServerValue.TIMESTAMP});
      saveJoinedRoom(c,n);startRoom();return;
    }
    if(m.status==='PLAYING'||m.status==='PREPARING'){
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

function startRoom(){cleanup();listen(db.ref('.info/serverTimeOffset'),'value',snap=>{window._serverOffset=snap.val()||0;});window._responses={};window._myRole=null;window._assignments={};window._drawClaims={};window._roleConfirmations={};roleVisible=false;listen(db.ref(`rooms/${room}/public/script`),'value',snap=>{window._scriptData=snap.val()||[];if(currentMeta&&(currentMeta.phase==='NIGHT'||currentMeta.phase==='PREPARING'))renderByPhase(currentMeta);});listen(db.ref(`rooms/${room}/public/meta`),'value',snap=>{const m=snap.val();if(!m)return leaveRoomToHome();currentMeta=m;updateRoomEscapeControls();if(isST&&m.phase==='PREPARING'&&m.setupStage==='DISTRIBUTING'&&m.setupMode==='draw')processDrawClaims();if(isST&&m.phase==='PREPARING'&&m.setupStage==='DISTRIBUTING'&&m.setupMode==='draw')scheduleDrawTurnCheck();if(m.status==='ENDED'){grimClearSurface();cleanup();if(m.resetToHome){leaveRoomToHome();return;}renderEnded(m);return}renderByPhase(m);updateRoomEscapeControls();});listen(db.ref(`rooms/${room}/public/players`),'value',snap=>{window._players=snap.val()||{};if(currentMeta&&!document.querySelector('.loading'))renderByPhase(currentMeta);});listen(db.ref(`rooms/${room}/public/roleConfirmations`),'value',snap=>{window._roleConfirmations=snap.val()||{};if(currentMeta?.phase==='PREPARING')renderByPhase(currentMeta);});if(isST){grimInitListeners();listen(db.ref(`rooms/${room}/private/st/tokens`),'value',snap=>{window._tokens=snap.val()||{};if(currentMeta)renderByPhase(currentMeta);if(grimOpen)grimRender();});listen(db.ref(`rooms/${room}/private/st/roles`),'value',snap=>{window._roles=snap.val()||{};if(currentMeta)renderByPhase(currentMeta);if(grimOpen)grimRender();});listen(db.ref(`rooms/${room}/private/st/assignments`),'value',snap=>{window._assignments=snap.val()||{};if(currentMeta?.phase==='PREPARING')renderByPhase(currentMeta);});listen(db.ref(`rooms/${room}/public/drawClaims`),'value',snap=>{window._drawClaims=snap.val()||{};if(currentMeta?.phase==='PREPARING'){processDrawClaims();renderByPhase(currentMeta);}});listen(db.ref(`rooms/${room}/private/st/roundHistory`),'value',snap=>{window._roundHistory=snap.val()||{};if(currentMeta)renderByPhase(currentMeta);},err=>{console.error('history listener error',err);});listen(db.ref(`rooms/${room}/private/responses`),'value',snap=>{window._responses=snap.val()||{};if(currentMeta&&currentMeta.phase==='NIGHT')updateSTProgress(currentMeta);},err=>{console.error('responses listener error',err);});listen(db.ref(`rooms/${room}/public/reconnectRequests`),'child_added',snap=>{handleReconnectRequest(snap.key,snap.val()).catch(e=>console.error('reconnect error',e));});}voteStartListeners();if(!isST)listen(db.ref(`rooms/${room}/private/playerRoles/${uid}`),'value',snap=>{const next=snap.val()||null;if(JSON.stringify(next)!==JSON.stringify(window._myRole))roleVisible=false;window._myRole=next;if(currentMeta?.phase==='PREPARING')renderByPhase(currentMeta);});if(!isST)listen(db.ref(`rooms/${room}/public/drawClaims`),'value',snap=>{window._drawClaims=snap.val()||{};if(currentMeta?.phase==='PREPARING')renderByPhase(currentMeta);});if(!isST)listen(db.ref(`rooms/${room}/private/playerPrompts/${uid}`),'value',snap=>{window._myPrompt=snap.val();updatePlayerPrompt(window._myPrompt,currentMeta||{});});listen(db.ref('.info/connected'),'value',snap=>{if(isST||!uid||!room)return;if(snap.val())setPresenceOnline(room,uid);});}
function renderByPhase(m){if(m.status==='WAITING')return renderLobby(m);if(m.phase==='PREPARING')return renderPreparation(m);if(m.phase==='NIGHT')return renderNight(m);if(m.phase==='DAY'){if(voteIsActive()){grimClearSurface();voteRender();return;}renderDay(m);if(isST){appendRestartControl();grimMountSplit();}return;}}
function charId(x){return String(x?.id||'').replace(/^ko_KR_/i,'')}
function charByRole(name){const n=String(name||'').trim();return (window._scriptData||[]).find(x=>x&&x.id!=='_meta'&&(String(x.name||'').trim()===n||charId(x)===n))||null}
function charIcon(x){if(!x)return '';const bundled=window.BOTC_ROLE_ICONS?.[charId(x)];if(bundled)return bundled;let im=x.image;if(Array.isArray(im))im=im[0];if(im)return String(im);const id=charId(x),ed=String(x.edition||'').toLowerCase();if(!id||!ed)return '';const team=String(x.team||'').toLowerCase();const a=(team==='minion'||team==='demon')?'e':(team==='townsfolk'||team==='outsider')?'g':'';return `https://release.botc.app/resources/characters/${encodeURIComponent(ed)}/${encodeURIComponent(id)}${a?'_'+a:''}.webp`}
function roleFallbackIcon(x){const name=String(x?.name||x?.id||'역할').slice(0,2);const evil=['minion','demon'].includes(x?.team);const fill=evil?'#4f2935':'#233c4d';return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><circle cx="80" cy="80" r="75" fill="${fill}" stroke="#b6a58a" stroke-width="4"/><circle cx="80" cy="80" r="65" fill="none" stroke="#b6a58a" stroke-opacity=".45"/><text x="80" y="82" dominant-baseline="middle" text-anchor="middle" fill="#f4eee2" font-family="sans-serif" font-size="40">${esc(name)}</text></svg>`)}
function roleIconHtml(role,cls='roleIcon'){const x=charByRole(role)||{name:role};const src=charIcon(x)||roleFallbackIcon(x);return `<img class="${cls}" src="${esc(src)}" alt="" data-role="${esc(role)}" onerror="this.onerror=null;this.src=roleFallbackIcon(charByRole(this.dataset.role)||{name:this.dataset.role})">`}
function roleTeamClass(role){const x=charByRole(role);return x?' team-'+String(x.team||'other').toLowerCase():' team-other'}
function teamLabel(t){return ({townsfolk:'마을주민',outsider:'이방인',minion:'하수인',demon:'악마',traveller:'여행자',traveler:'여행자',fabled:'우화',loric:'전승'}[String(t||'').toLowerCase()]||'기타')}
function playerList(players,owner){return Object.values(players||{}).map(p=>`<div class="person"><div class="personline"><span class="${p.online?'':'offlineName'}">${esc(p.name)}</span><span class="${p.online?'online':'offline'}">● ${p.online?'온라인':'오프라인'}</span></div>${owner&&currentMeta?.status==='PLAYING'?`<button class="secondary reconnectBtn" onclick="allowReconnect('${esc(p.uid)}','${esc(p.name)}')">🔄 재접속 허용</button>`:''}</div>`).join('')||'<div class="muted">아직 참가자가 없습니다.</div>'}
function leaveRoomToHome(){grimClearSurface();cleanup();const old=room;if(old){localStorage.removeItem('botc_last_room');localStorage.removeItem('botc_mode_'+old)}try{history.replaceState(null,'',location.pathname+location.search)}catch(e){location.hash=''}room=null;isST=false;meName='';currentMeta=null;updateRoomEscapeControls();window._myPrompt=null;window._activePrompt=null;window._players={};window._myRole=null;setupRows=[];renderHome()}
function renderLobby(m){const ps=window._players||{};h(`<div class="top lobbyTop"><div class="brand">대기실</div><div class="row"><span class="pill lobbyScriptTitle">${esc(m.scriptName)}</span>${isST?'<button class="secondary" onclick="leaveRoomToHome()">처음 화면</button>':''}</div></div><div class="card center"><div class="muted">입장 코드</div><div class="code">${esc(room)}</div><div class="small muted">참가자에게 이 코드를 알려주세요.</div></div><div class="card"><div class="row"><b>참가자 ${Object.keys(ps).length}명</b><span class="pill">${Object.values(ps).filter(p=>p.online).length}명 온라인</span></div><div class="list" style="margin-top:10px">${playerList(ps,isST)}</div></div><div class="card">${isST?`<button style="width:100%" onclick="startGame()">인원 확정 · 캐릭터 배분</button>`:`<div class="notice">사회자가 게임을 시작하면 자동으로 이동합니다.</div>`}</div>`);}
function reconnectList(players){return Object.values(players||{}).map(p=>`<div class="person personline"><span class="${p.online?'':'offlineName'}">${esc(p.name)} <small class="${p.online?'online':'offline'}">● ${p.online?'온라인':'오프라인'}</small></span><button class="secondary reconnectBtn" onclick="allowReconnect('${esc(p.uid)}','${esc(p.name)}')">재접속 허용</button></div>`).join('')||'<div class="muted">참가자가 없습니다.</div>'}
async function setRole(uid2,role){window._roles=window._roles||{};window._roles[uid2]=role;await db.ref(`rooms/${room}/private/st/roles/${uid2}`).set(role);closePicker()}
function openRoleMenu(uid2){const data=(window._scriptData||[]).filter(x=>x&&x.id!=='_meta');const teams=['townsfolk','outsider','minion','demon','traveller','traveler','fabled'];let body='';for(const team of teams){const items=data.filter(x=>String(x.team||'').toLowerCase()===team);if(!items.length)continue;body+=`<div class="pickerGroup"><div class="pickerTitle">${teamLabel(team)}</div>${items.map(x=>`<button class="pickerItem" onclick="setRole('${esc(uid2)}','${esc(x.name||charId(x))}')">${roleIconHtml(x.name||charId(x),'pickerIcon')}<span>${esc(x.name||charId(x))}</span></button>`).join('')}</div>`}body+=`<button class="pickerItem customPick" onclick="customRole('${esc(uid2)}')">＋ 커스텀 역할</button>`;openPicker('역할 변경',body)}
async function customRole(uid2){const v=prompt('커스텀 역할명을 입력하세요.',window._roles?.[uid2]||'');if(v===null||!v.trim())return;await setRole(uid2,v.trim())}
async function startGame(){
  if(!isST||currentMeta?.status!=='WAITING')return;
  const ps=Object.values(window._players||{});if(!ps.length)return toast('참가자가 한 명 이상 필요합니다.');
  if(!confirm(`${ps.length}명으로 인원을 확정하고 캐릭터 배분 화면으로 이동할까요?`))return;
  setupRows=ps.map(p=>({real:'',shown:'',uid:p.uid}));setupReady=false;setupMode='auto';
  await db.ref(`rooms/${room}/public/meta`).update({status:'PREPARING',phase:'PREPARING',lockedCount:ps.length,setupMode:'',setupStage:'CONFIG'});
}


// RC5.8: separate pre-night role allocation stage.
function setupCharacters(){return (window._scriptData||[]).filter(x=>x&&x.id!=='_meta'&&x.name&&['townsfolk','outsider','minion','demon','traveller','traveler'].includes(x.team));}
function setupOptions(value,allowDefault=false){const groups=['townsfolk','outsider','minion','demon','traveller','traveler'];let html=allowDefault?'<option value="">실제와 동일</option>':'<option value="">캐릭터 선택</option>';for(const team of groups){const chars=setupCharacters().filter(c=>c.team===team);if(chars.length)html+=`<optgroup label="${teamLabel(team)}">${chars.map(c=>`<option value="${esc(c.name)}" ${c.name===value?'selected':''}>${esc(c.name)}</option>`).join('')}</optgroup>`;}return html;}
function setupSetRole(index,field,value){if(!isST||!setupRows[index])return;setupRows[index][field]=value;setupReady=false;const y=window.scrollY;renderByPhase(currentMeta);window.scrollTo(0,y);}
function setupSetMode(value){setupMode=value;setupReady=false;const y=window.scrollY;renderByPhase(currentMeta);window.scrollTo(0,y);}
function openSetupRolePicker(index,kind){
 const groups=['townsfolk','outsider','minion','demon','traveller','traveler'];
 let body=kind==='shown'?`<button class="setupChoice" onclick="pickSetupRole(${index},'shown','')"><b>실제와 동일</b><span>실제 캐릭터 그대로 표시</span></button>`:'';
 for(const team of groups){const chars=setupCharacters().filter(c=>c.team===team);if(!chars.length)continue;
 body+=`<div class="setupChoiceGroup">${teamLabel(team)}</div>`;
 body+=chars.map(c=>`<button class="setupChoice" onclick="pickSetupRole(${index},'${kind}',${JSON.stringify(c.name).replace(/"/g,'&quot;')})"><b>${esc(c.name)}</b><span>${esc(c.ability||'능력 설명 없음')}</span></button>`).join('');}
 openPicker('캐릭터 선택 · 능력 확인',body);
}
function pickSetupRole(index,kind,value){closePicker();setupSetRole(index,kind,value);}
function setupTeamSummary(rows,total){const groups=[['townsfolk','주민'],['outsider','외지인'],['minion','하수인'],['demon','악마']];const counts={townsfolk:0,outsider:0,minion:0,demon:0};for(const r of rows){const team=charByRole(r.real)?.team;if(team in counts)counts[team]++;}const selected=rows.filter(r=>r.real).length;return `<section class="setupSummary"><div class="setupSummaryHead"><b>이번 게임 전체 구성</b><span>${selected} / ${total}명 선택</span></div><div class="setupTeamGrid">${groups.map(([key,label])=>`<div class="setupTeamCount team-${key}"><span>${label}</span><strong>${counts[key]}</strong></div>`).join('')}</div>${selected<total?'<div class="setupSummaryHint">아직 선택하지 않은 캐릭터가 있습니다.</div>':''}</section>`;}
function renderPreparation(m){if(!isST)return renderPlayerPreparation(m);const players=Object.values(window._players||{});if(!setupRows.length&&m.setupStage==='CONFIG')setupRows=players.map(p=>({uid:p.uid,real:'',shown:''}));const stage=m.setupStage||'CONFIG',assignments=window._assignments||{},done=Object.keys(assignments).length;let html=`<div class="top"><div class="brand">🎭 캐릭터 배분</div><span class="pill">인원 확정 ${m.lockedCount||players.length}명</span></div>`;
 if(stage==='CONFIG'){
 html+=setupTeamSummary(setupRows,players.length);html+=`<div class="notice">실제 캐릭터를 선택하세요. 보이는 캐릭터를 비우면 실제 캐릭터가 표시됩니다.</div><div class="card"><b>① 캐릭터 구성</b>`;
 setupRows.forEach((r,i)=>{html+=`<div class="setupRoleRow"><b>${i+1}번 캐릭터</b><div class="setupPair"><div><label>실제 캐릭터</label><button class="secondary setupPickBtn" onclick="openSetupRolePicker(${i},'real')">${esc(r.real||'캐릭터 선택')} ▾</button></div><div><label>보이는 캐릭터 (선택)</label><button class="secondary setupPickBtn" onclick="openSetupRolePicker(${i},'shown')">${esc(r.shown||'실제와 동일')} ▾</button></div></div></div>`;});
 html+=`</div><div class="card"><b>② 배분 방식</b><div class="setupMode">${[['auto','🎲 자동 배분'],['manual','✋ 수동 배분'],['draw','🎴 참가자 직접 뽑기']].map(([v,n])=>`<button class="setupModeChoice ${setupMode===v?'is-selected':'secondary'}" aria-pressed="${setupMode===v}" onclick="setupSetMode('${v}')">${n}</button>`).join('')}</div>${setupMode==='manual'?`<p class="small muted">아래에서 캐릭터별로 참가자를 지정하세요.</p>${setupRows.map((r,i)=>`<div class="setupManual"><span>${esc(r.real||'미선택')} ${r.shown?'→ '+esc(r.shown):''}</span><select onchange="setupSetManual(${i},this.value)"><option value="">참가자 선택</option>${players.map(p=>`<option value="${esc(p.uid)}" ${r.uid===p.uid?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div>`).join('')}`:''}</div><button style="width:100%" onclick="confirmRoleSetup()">배분 진행</button>`;
 }else{
 const mode=m.setupMode||'auto';if(mode==='draw')html+=drawTurnPanel(m,true);const confirmed=players.filter(p=>window._roleConfirmations?.[p.uid]===true).length;html+=`<div class="card"><b>배분 현황 ${done}/${players.length}</b><div class="setupAckCount">👁️ 캐릭터 확인 완료 ${confirmed}/${players.length}명</div><p class="muted small">${mode==='draw'?'참가자가 휴대폰에서 토큰을 선택하는 중입니다.':'역할이 배분되었습니다. 참가자는 본인 역할만 볼 수 있습니다.'}</p><div class="list">${players.map(p=>{const a=assignments[p.uid];return `<div class="person"><div class="row"><b>${esc(p.name)}</b><span class="pill">${a?esc(a.real)+(a.shown&&a.shown!==a.real?' → '+esc(a.shown):''):'선택 대기'}</span></div><div class="setupAckState ${window._roleConfirmations?.[p.uid]===true?'confirmed':''}">${a?(window._roleConfirmations?.[p.uid]===true?'✓ 확인 완료':'○ 확인 대기'):'— 미배분'}</div>${a?`<div class="small muted setupAbility">실제 능력: ${esc(charByRole(a.real)?.ability||'능력 설명 없음')}</div>${a.shown&&a.shown!==a.real?`<div class="small muted setupAbility">표시 능력: ${esc(charByRole(a.shown)?.ability||'능력 설명 없음')}</div>`:''}`:''}</div>`}).join('')}</div></div><button style="width:100%" onclick="finishRoleSetup()" ${done!==players.length?'disabled':''}>🌙 첫 번째 밤 시작</button><button class="secondary" style="width:100%;margin-top:8px" onclick="resetRoleSetup()">배분 취소 · 다시 설정</button>`;
 }html+=`<button class="secondary" style="width:100%;margin-top:8px" onclick="restartPreparationFromLobby()">🏠 처음부터 다시 시작</button>`;h(html);
}
function setupSetManual(i,v){if(!setupRows[i])return;setupRows[i].uid=v;}
function randomShuffle(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
async function confirmRoleSetup(){if(!isST||currentMeta?.setupStage!=='CONFIG')return;const players=Object.values(window._players||{});if(setupRows.length!==players.length||setupRows.some(r=>!r.real))return toast('모든 실제 캐릭터를 선택해 주세요.');if(setupMode==='manual'&&(new Set(setupRows.map(r=>r.uid)).size!==players.length||setupRows.some(r=>!players.find(p=>p.uid===r.uid))))return toast('수동 배분에서 참가자를 중복 없이 지정해 주세요.');if(!confirm('캐릭터 배분을 시작할까요?'))return;const shuffled=setupMode==='auto'?randomShuffle(players.map(p=>p.uid)):players.map(p=>p.uid);const assignments={},playerRoles={};const rows=setupRows.map(r=>({real:r.real,shown:r.shown||r.real}));if(setupMode!=='draw'){rows.forEach((r,i)=>{const id=setupMode==='manual'?setupRows[i].uid:shuffled[i];assignments[id]=r;playerRoles[id]={shown:r.shown};});}
 const updates={'public/meta/setupStage':'DISTRIBUTING','public/meta/setupMode':setupMode,'private/st/assignments':assignments||{},'private/playerRoles':playerRoles||{},'public/drawClaims':null,'public/roleConfirmations':null,'private/st/drawPlan':null,'public/meta/drawQueue':null,'public/meta/drawTurnStartedAt':null};
 if(setupMode==='draw'){const shuffledRoles=randomShuffle(rows);const plan={};shuffledRoles.forEach((r,i)=>{plan['token'+i]=r;});updates['private/st/drawPlan']=plan;updates['public/meta/drawQueue']=players.slice().sort((a,b)=>(a.joinedAt||0)-(b.joinedAt||0)).map(p=>p.uid);updates['public/meta/drawTurnStartedAt']=firebase.database.ServerValue.TIMESTAMP;updates['public/drawTokens']=Object.keys(plan).reduce((a,k)=>(a[k]={available:true},a),{});}else updates['public/drawTokens']=null;
 try{await db.ref(`rooms/${room}`).update(updates);}catch(e){toast('배분 시작 실패: '+e.message);}
}
let processingDraw=false;let drawProcessPending=false;
async function processDrawClaims(){if(!isST||currentMeta?.setupStage!=='DISTRIBUTING'||currentMeta?.setupMode!=='draw')return;if(processingDraw){drawProcessPending=true;return;}processingDraw=true;try{const [planSnap,claimSnap,assignmentSnap]=await Promise.all([db.ref(`rooms/${room}/private/st/drawPlan`).once('value'),db.ref(`rooms/${room}/public/drawClaims`).once('value'),db.ref(`rooms/${room}/private/st/assignments`).once('value')]);const plan=planSnap.val()||{},claims=claimSnap.val()||{},assignments=assignmentSnap.val()||{};const updates={};for(const [token,claim] of Object.entries(claims)){if(!claim?.uid||!plan[token]||assignments[claim.uid])continue;const player=window._players?.[claim.uid];if(!player)continue;updates[`private/st/assignments/${claim.uid}`]=plan[token];updates[`private/playerRoles/${claim.uid}`]={shown:plan[token].shown};assignments[claim.uid]=plan[token];}if(Object.keys(updates).length)await db.ref(`rooms/${room}`).update(updates);await advanceDrawQueueIfClaimed();}catch(e){console.warn('draw claim processing',e);}finally{processingDraw=false;if(drawProcessPending){drawProcessPending=false;processDrawClaims();}}}
function renderPlayerPreparation(m){const my=window._myRole;let html=`<div class="top"><div class="brand">🎭 캐릭터 배분</div><span class="pill">${esc(meName)}</span></div>`;if(!my){if(m.setupStage!=='DISTRIBUTING')html+='<div class="card center"><div class="phase">곧 캐릭터가 배분됩니다</div><p class="muted">사회자가 역할을 준비하고 있습니다.</p></div>';else if(m.setupMode==='draw'){const claims=window._drawClaims||{},tokens=Array.from({length:m.lockedCount||0},(_,i)=>'token'+i),mine=Object.entries(claims).find(([k,v])=>v?.uid===uid);html+=drawTurnPanel(m,false)+`<div class="card center"><div class="phase">🎴 운명의 토큰</div><p class="muted">${m.drawQueue?.[0]===uid?'20초 안에 토큰을 선택하세요.':'차례를 기다려 주세요.'}</p>${mine?'<div class="notice">토큰 선택 완료 · 역할을 전달하는 중입니다.</div>':`<div class="drawGrid">${tokens.map((k,i)=>`<button class="${claims[k]?'secondary':''}" ${claims[k]||m.drawQueue?.[0]!==uid?'disabled':''} onclick="claimRoleToken('${k}')">${claims[k]?'선택됨':'🎴 '+(i+1)}</button>`).join('')}</div>`}</div>`;}else html+='<div class="card center"><div class="phase">역할을 전달하는 중입니다</div></div>';}else if(!roleVisible){html+=drawTurnPanel(m,false);html+='<div class="card center secretRole"><div class="phase">당신의 역할이 준비됐습니다</div><p>주변 사람이 화면을 보지 않는지 확인하세요.</p><button onclick="toggleRoleReveal(true)">🔒 내 역할 확인하기</button></div>';}else{const c=charByRole(my.shown),src=charIcon(c);html+=`<div class="card center secretRole"><div class="small muted">당신의 캐릭터</div>${roleIconHtml(my.shown,'secretToken')}<div class="phase">${esc(my.shown)}</div><p class="secretAbility">${esc(c?.ability||'스크립트에 능력 설명이 없습니다.')}</p><button class="secondary" onclick="toggleRoleReveal(false)">🔒 역할 가리기</button>${window._roleConfirmations?.[uid]===true?'<div class="setupAckDone">✓ 사회자에게 확인 완료로 전달됐습니다.</div>':'<button class="setupAckButton" onclick="confirmMyRole()">✓ 캐릭터 확인 완료</button>'}</div>`;}h(html);}
async function confirmMyRole(){if(isST||!room||!uid||currentMeta?.phase!=='PREPARING'||!window._myRole||!roleVisible)return;try{await db.ref(`rooms/${room}/public/roleConfirmations/${uid}`).set(true);}catch(e){toast('확인 전달 실패: '+e.message);}}
function toggleRoleReveal(value){roleVisible=!!value;if(currentMeta?.phase==='PREPARING')renderByPhase(currentMeta);}
async function claimRoleToken(token){if(currentMeta?.phase!=='PREPARING'||currentMeta?.setupMode!=='draw'||window._myRole)return;if(currentMeta?.drawQueue?.[0]!==uid)return toast('아직 내 차례가 아닙니다.');try{const existing=Object.values(window._drawClaims||{}).some(c=>c?.uid===uid);if(existing)return toast('이미 토큰을 선택했습니다.');const ref=db.ref(`rooms/${room}/public/drawClaims/${token}`);const result=await ref.transaction(cur=>cur===null?{uid,claimedAt:firebase.database.ServerValue.TIMESTAMP}:undefined);if(!result.committed)toast('선택할 수 없습니다. 현재 차례와 남은 시간을 확인해 주세요.');}catch(e){toast('토큰 선택 오류: '+e.message);}}
async function resetRoleSetup(){if(!isST||!confirm('배분을 취소하고 다시 구성할까요? 참가자의 역할 표시가 사라집니다.'))return;const players=Object.values(window._players||{});setupRows=players.map(p=>({real:'',shown:'',uid:p.uid}));await db.ref(`rooms/${room}`).update({'public/meta/setupStage':'CONFIG','public/meta/setupMode':'','private/st/assignments':null,'private/st/drawPlan':null,'private/playerRoles':null,'public/drawClaims':null,'public/drawTokens':null,'public/roleConfirmations':null,'public/meta/drawQueue':null,'public/meta/drawTurnStartedAt':null});}
async function restartPreparationFromLobby(){
 if(!isST||!currentMeta||!['PREPARING','NIGHT','DAY'].includes(currentMeta.phase))return;
 if(!confirm('현재 방을 완전히 종료하고 처음부터 다시 시작할까요?\n사회자와 모든 참가자가 최초 화면으로 이동합니다.'))return;
 try{
  // Keep the room metadata long enough for every connected client to receive the reset event.
  // Marking ENDED prevents old links from silently rejoining this room.
  await db.ref(`rooms/${room}/public/meta`).update({status:'ENDED',resetToHome:true,endedAt:firebase.database.ServerValue.TIMESTAMP});
  leaveRoomToHome();
 }catch(e){toast('처음부터 다시 시작 실패: '+e.message);}
}
async function finishRoleSetup(){
 if(!isST)return;
 const players=Object.values(window._players||{});
 if(players.some(p=>!window._assignments?.[p.uid]))return toast('아직 역할이 배분되지 않은 참가자가 있습니다.');
 const unchecked=players.filter(p=>window._roleConfirmations?.[p.uid]!==true);
 if(!confirm(unchecked.length?`아직 ${unchecked.length}명이 캐릭터 확인을 완료하지 않았습니다.\n그래도 첫 번째 밤을 시작할까요?`:'모든 참가자가 확인했습니다. 첫 번째 밤을 시작할까요?'))return;
 const roles={};for(const p of players)roles[p.uid]=window._assignments[p.uid].real;
 const updates={'private/st/roles':roles,'public/meta/status':'PLAYING','public/meta/phase':'NIGHT','public/meta/nightNumber':1,'public/meta/dayNumber':0,'public/meta/currentRound':0,'public/meta/nightRound':0,'public/meta/roundClosed':false,'public/meta/startedAt':firebase.database.ServerValue.TIMESTAMP};
 // RC28: seed the shown role into the existing editable, ST-only character reminders.
 const shownPlayers=players.filter(p=>{const a=window._assignments[p.uid];return typeof a.shown==='string'&&a.shown.trim()&&a.shown!==a.real;});
 try{
  if(shownPlayers.length){
   const saved=(await db.ref(`rooms/${room}/private/st/grimoireState`).once('value')).val()||{};
   for(const p of shownPlayers){
    const shown=window._assignments[p.uid].shown,existing=saved[p.uid]?.extraRoles;
    updates[`private/st/grimoireState/${p.uid}/extraRoles`]=[shown,...(Array.isArray(existing)?existing:[]).filter(r=>r!==shown)];
   }
  }
  await db.ref(`rooms/${room}`).update(updates);
 }catch(e){toast('첫 번째 밤 시작 실패: '+e.message);}
}

async function allowReconnect(oldUid,name){if(!confirm(`${name} 참가자의 재접속을 허용할까요?\n참가자는 방 코드와 같은 이름으로 다시 입장하면 됩니다.`))return;await db.ref(`rooms/${room}/public/meta`).update({reconnectAllowedUid:oldUid,reconnectAllowedName:name,reconnectCompletedUid:null});toast(`${name} 재접속 허용됨`);}
const reconnectInFlight=new Set();
async function handleReconnectRequest(newUid,req){if(!isST||!req||!currentMeta||reconnectInFlight.has(newUid))return;reconnectInFlight.add(newUid);try{const m=(await db.ref(`rooms/${room}/public/meta`).once('value')).val()||{};if(newUid===req.oldUid||m.reconnectAllowedUid!==req.oldUid||String(m.reconnectAllowedName||'')!==String(req.name||''))return;const oldUid=req.oldUid;const old=(await db.ref(`rooms/${room}/public/players/${oldUid}`).once('value')).val();if(!old)return;const role=window._roles?.[oldUid]||null,tokens=window._tokens?.[oldUid]||null;const assigned=window._assignments?.[oldUid]||null;const updates={};updates[`public/players/${newUid}`]={uid:newUid,name:old.name,online:true,joinedAt:old.joinedAt||firebase.database.ServerValue.TIMESTAMP,reconnectedAt:firebase.database.ServerValue.TIMESTAMP};updates[`public/players/${oldUid}`]=null;if(role!==null){updates[`private/st/roles/${newUid}`]=role;updates[`private/st/roles/${oldUid}`]=null}if(tokens!==null){updates[`private/st/tokens/${newUid}`]=tokens;updates[`private/st/tokens/${oldUid}`]=null}if(assigned){updates[`private/st/assignments/${newUid}`]=assigned;updates[`private/st/assignments/${oldUid}`]=null;updates[`private/playerRoles/${newUid}`]={shown:assigned.shown||assigned.real};updates[`private/playerRoles/${oldUid}`]=null}const prompt=(await db.ref(`rooms/${room}/private/playerPrompts/${oldUid}`).once('value')).val();if(prompt){updates[`private/playerPrompts/${newUid}`]=prompt;updates[`private/playerPrompts/${oldUid}`]=null}const rid=m.currentRound||0;if(rid){const resp=(await db.ref(`rooms/${room}/private/responses/${rid}/${oldUid}`).once('value')).val();if(resp){updates[`private/responses/${rid}/${newUid}`]={...resp,uid:newUid};updates[`private/responses/${rid}/${oldUid}`]=null}const hp=(await db.ref(`rooms/${room}/private/st/roundHistory/${rid}/prompts/${oldUid}`).once('value')).val();if(hp){updates[`private/st/roundHistory/${rid}/prompts/${newUid}`]={...hp,uid:newUid};updates[`private/st/roundHistory/${rid}/prompts/${oldUid}`]=null}}const acknowledged=window._roleConfirmations?.[oldUid]===true;if(acknowledged){updates[`public/roleConfirmations/${newUid}`]=true;updates[`public/roleConfirmations/${oldUid}`]=null;}updates[`public/reconnectRequests/${newUid}`]=null;updates['public/meta/reconnectAllowedUid']=null;updates['public/meta/reconnectAllowedName']=null;updates['public/meta/reconnectCompletedUid']=newUid;await db.ref(`rooms/${room}`).update(updates);
}finally{reconnectInFlight.delete(newUid);}}
function stRoleList(){const ps=Object.values(window._players||{}),roles=window._roles||{};return ps.map(p=>`<div class="person"><div class="row"><b>${esc(p.name)}</b><span class="pill">${esc(roles[p.uid]||'역할 미입력')}</span></div></div>`).join('')||'<div class="muted">참가자가 없습니다.</div>'}
function renderNight(m){if(isST){renderSTNight(m);appendRestartControl();return;}return renderPlayerNight(m)}
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
function renderSTNight(m){const draft=readSTDraft();h(`${nightOrderHtml(m)}<div class="top"><div><div class="brand">${phaseTitle(m)}</div><div class="small muted" style="margin-top:2px">방 ${esc(room)}</div></div><button class="danger" onclick="endGame()">🔴 게임 종료</button></div>${grimButton()}<div id="stMain"></div><div class="card compactHistory"><div class="row"><b>밤 Q&A 이력</b><span class="pill">ST 전용</span></div><div style="margin-top:8px">${stHistoryHtml()}</div></div>`);updateSTProgress(m,draft);grimMountSplit()}
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
  const composeList=players.map(p=>{const ts=tokenText(p.uid);return `<div class="composePerson"><div class="composeHead"><div><b>${esc(p.name)}</b><button class="roleChangeBtn${roleTeamClass(roles[p.uid])}" onclick="openRoleMenu('${esc(p.uid)}')">${roleIconHtml(roles[p.uid])}<span>${esc(roles[p.uid]||'역할 선택')}</span><b>⌄</b></button><div class="tokenLine">${grimStatusBadges(p.uid)}${ts.map((t,i)=>`<button class="tokenMini" onclick="removeToken('${esc(p.uid)}',${i})">${tokenBadgeHtml(t,'reminderToken tiny')}<span>${esc(t)}</span> ×</button>`).join('')}<button class="tokenMini add" onclick="openTokenMenu('${esc(p.uid)}')">＋ 토큰⌄</button></div></div><label class="radio compactCheck"><input type="checkbox" data-real="${esc(p.uid)}" onchange="toggleReal('${esc(p.uid)}')"> 실제</label></div><textarea id="q-${esc(p.uid)}" disabled oninput="autoGrow(this)" placeholder="더미 문장이 자동 배포됩니다."></textarea><button class="grimoireBtn secondary" data-grimoire="${esc(p.uid)}" disabled onclick="addGrimoire('${esc(p.uid)}')" title="마도서 삽입">📖</button></div>`}).join('');
  const resultBlock=nightRound>0?`<div class="statusGrid">${statusList}</div>`:'';
  const composeBlock=readyForNext?`<div class="composeGrid" style="margin-top:${nightRound>0?'10':'0'}px">${composeList}</div><button style="width:100%;margin-top:10px" onclick="deployRound()">🌙 ${nightRound===0?'첫 질문 전원 배포':'다음 질문 전원 배포'}</button>${m.roundClosed?'<div class="notice" style="margin-top:8px">이전 질문의 미응답자를 건너뛰었습니다. 다음 질문을 배포할 수 있습니다.</div>':''}`:`<button class="danger" style="width:100%;margin-top:10px" onclick="forceNextTurn()">⏭️ 미응답 강제 넘김 · 다음 질문 준비</button>`;
  draft=draft||readSTDraft();
  root.innerHTML=`<div class="card"><div class="row"><b>질문·답변 턴${nightRound?` · ${nightRound}턴`:''}</b><span class="pill">${answered}/${players.length}</span></div>
  <p class="muted small">질문을 배포하면 참가자는 이번 턴에 한 번만 답변할 수 있습니다. 전원이 답변해야 다음 질문을 배포할 수 있습니다.</p>
  ${resultBlock}${composeBlock}
  </div><div class="card"><div class="row"><b>게임 단계 이동</b><span class="pill">밤 → 낮</span></div><p class="muted small">질문·답변 완료 여부와 관계없이 사회자가 현재 밤을 끝내고 다음 낮으로 이동합니다.</p><button style="width:100%" onclick="nextDay()">☀️ 다음 단계: ${m.dayNumber+1}번째 낮</button></div><details class="card reconnectFold"><summary>🔄 참가자 재접속 (<span class="${Object.values(ps).some(p=>!p.online)?'offlineName':''}">미접속 ${Object.values(ps).filter(p=>!p.online).length}명</span>) <span class="pill">ST 전용</span></summary><div class="list" style="margin-top:8px">${reconnectList(ps)}</div></details><div class="card"><button class="secondary" style="width:100%" onclick="openScript()">📜 스크립트 보기</button></div>`
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
function renderPlayerNight(m){const saved=$('#answer')?.value||'',oldPrompt=window._activePrompt;h(`<div class="top playerNightTop"><div class="brand">${phaseTitle(m)}</div></div><div class="playerScriptTools"><button class="secondary" onclick="openScript()">스크립트</button></div><div id="playerMain"></div>`);updatePlayerPrompt(window._myPrompt||null,m);if(saved&&oldPrompt&&window._myPrompt&&oldPrompt.round===window._myPrompt.round&&oldPrompt.text===window._myPrompt.text&&$('#answer'))$('#answer').value=saved;}

function promptDisplay(text){const raw=String(text||'');if(raw.startsWith('##마도서 보기##')){const parts=raw.split(/\n\n/);const grim=parts.shift()||'';const lines=grim.split('\n').slice(1);return `<div class="grimoireCard"><div class="grimoireTitle">📖 마도서 보기</div>${lines.map(x=>`<div class="grimLine">${esc(x)}</div>`).join('')}</div>${parts.length?`<div class="questionText">${esc(parts.join('\n\n'))}</div>`:''}`}return `<div class="questionText">${esc(raw)}</div>`}
function updatePlayerPrompt(p,m){const root=$('#playerMain');if(!root)return;const draft=$('#answer')?.value||'';const prev=window._activePrompt;window._activePrompt=p||null;if(!p){root.innerHTML=`<div class="card playerWait"><div class="phase">🌙 밤이 진행 중입니다</div><p class="muted">잠시 후 사회자로부터 문장이 전달됩니다.</p><div class="waitGuide"><b>실제 질문</b> → 질문에 맞게 답변해 주세요.<br><b>더미 문장</b> → 표시된 짧은 문장을 그대로 입력해 주세요.</div><p class="small muted">어떤 내용을 받았는지는 다른 참가자에게 알려주지 마세요.</p></div>`;return}root.innerHTML=`<div class="card"><div class="muted small">${p.requiresExact?'더미 문장을 그대로 입력해야 전송됩니다.':'사회자가 지정한 질문입니다.'}</div><div class="prompt" style="margin-top:8px">${promptDisplay(p.text)}</div><label style="margin-top:12px">답변</label><textarea id="answer" placeholder="답변을 입력하세요."></textarea><button style="width:100%;margin-top:10px" onclick="submitCurrentAnswer()">전송</button></div>`;if(p&&prev&&p.round===prev.round&&p.text===prev.text&&$('#answer'))$('#answer').value=draft}
function submitCurrentAnswer(){const p=window._activePrompt;if(!p)return toast('현재 답변할 질문이 없습니다.');return submitAnswer(p.round,!!p.requiresExact,String(p.text??''))}
async function submitAnswer(round,exact,text){const a=$('#answer')?.value||'';if(!a.trim())return toast('답변을 입력해 주세요.');if(exact&&a!==text)return toast('더미 문장을 정확히 그대로 입력해 주세요.');const btn=document.querySelector('#playerMain button');if(btn)btn.disabled=true;try{const m=(await db.ref(`rooms/${room}/public/meta`).once('value')).val();if((m.currentRound||0)!==round||m.roundClosed){if(btn)btn.disabled=false;return toast('이미 종료된 턴입니다.');}await db.ref(`rooms/${room}`).update({[`private/responses/${round}/${uid}`]:{uid,name:meName,answer:a,submittedAt:firebase.database.ServerValue.TIMESTAMP},[`private/playerPrompts/${uid}`]:null});window._myPrompt=null;window._activePrompt=null;updatePlayerPrompt(null,m);}catch(e){if(btn)btn.disabled=false;toast('답변 전송에 실패했습니다: '+(e.message||e));}}
function renderDay(m){h(`<div class="top"><div><div class="brand">${phaseTitle(m)}</div>${isST?`<div class="small muted" style="margin-top:2px">방 ${esc(room)}</div>`:''}</div>${isST?'<button class="danger" onclick="endGame()">🔴 게임 종료</button>':''}</div>${isST?`${grimButton()}<details class="card reconnectFold"><summary>🔄 참가자 재접속 (<span class="${Object.values(window._players||{}).some(p=>!p.online)?'offlineName':''}">미접속 ${Object.values(window._players||{}).filter(p=>!p.online).length}명</span>) <span class="pill">ST 전용</span></summary><div class="list" style="margin-top:8px">${reconnectList(window._players||{})}</div></details><div class="card compactHistory"><div class="row"><b>밤 Q&A 이력</b><span class="pill">ST 전용</span></div><div style="margin-top:8px">${stHistoryHtml()}</div></div>`:''}<div class="card center"><div class="phase">☀️ ${m.dayNumber}번째 낮</div><p class="muted">현재 스크립트를 확인할 수 있습니다.</p><button style="width:100%" onclick="openScript()">📜 스크립트 보기</button></div>${voteDayHtml()}${isST?`<div class="card"><button style="width:100%" onclick="nextNight()">🌙 다음 밤으로</button></div>`:''}`)}
async function nextDay(){
  if(!confirm('현재 질문·답변 상태와 관계없이 밤 단계를 끝내고 다음 낮으로 이동할까요?'))return;
  const m=(await db.ref(`rooms/${room}/public/meta`).once('value')).val(), ps=window._players||{}, updates={};
  Object.values(ps).forEach(p=>{updates[`private/playerPrompts/${p.uid}`]=null});
  updates['public/meta/phase']='DAY';updates['public/meta/dayNumber']=(m.dayNumber||0)+1;updates['public/meta/roundClosed']=true;
  await db.ref(`rooms/${room}`).update(updates);
}
async function nextNight(){const m=(await db.ref(`rooms/${room}/public/meta`).once('value')).val();await db.ref(`rooms/${room}/public/meta`).update({phase:'NIGHT',nightNumber:(m.nightNumber||0)+1,nightRound:0,roundClosed:false})}
async function endGame(){
 if(!isST||!confirm('게임을 종료할까요? 모든 참가자에게 실제 역할이 공개됩니다.'))return;
 try{
  const [playersSnap,assignSnap]=await Promise.all([
   db.ref(`rooms/${room}/public/players`).once('value'),
   db.ref(`rooms/${room}/private/st/assignments`).once('value')
  ]);
  const players=Object.values(playersSnap.val()||{}).sort((a,b)=>(a.joinedAt||0)-(b.joinedAt||0));
  const assignments=assignSnap.val()||{};
  if(players.some(p=>!assignments[p.uid]?.real))return toast('실제 역할을 확인할 수 없는 참가자가 있습니다. 게임 종료를 중단했습니다.');
  const roleReveal=players.map(p=>({name:p.name,role:assignments[p.uid]?.real||'역할 미배분'}));
  // 공개 데이터와 종료 상태를 같은 update로 기록하여 참가자에게 동시에 보입니다.
  await db.ref(`rooms/${room}/public/meta`).update({roleReveal,status:'ENDED',endedAt:firebase.database.ServerValue.TIMESTAMP});
 }catch(e){toast('게임 종료 처리 실패: '+(e.message||e))}
}
async function openScript(){const s=await db.ref(`rooms/${room}/public/script`).once('value');const data=s.val()||[];const chars=data.filter(x=>x.id!=='_meta');const groups=[['townsfolk','마을주민'],['outsider','이방인'],['minion','하수인'],['demon','악마'],['traveller','여행자'],['traveler','여행자'],['fabled','우화'],['loric','전승']];const known=new Set(groups.map(g=>g[0]));const section=(team,label)=>{const items=chars.filter(x=>String(x.team||'').toLowerCase()===team);if(!items.length)return '';return `<section class="scriptgroup team-${team}"><div class="scriptgroup-title">${esc(label)} <span class="pill">${items.length}</span></div><div class="scriptTokenGrid">${items.map(x=>`<div class="scriptchar tokenChar">${roleIconHtml(x.name||charId(x),'scriptIcon')}<div class="scriptCharacterText"><b>${esc(x.name||x.id)}</b><div class="muted small">${esc(x.ability||'')}</div></div></div>`).join('')}</div></section>`};const other=chars.filter(x=>!known.has(String(x.team||'').toLowerCase()));const otherHtml=other.length?`<section class="scriptgroup team-other"><div class="scriptgroup-title">기타 <span class="pill">${other.length}</span></div><div class="scriptTokenGrid">${other.map(x=>`<div class="scriptchar tokenChar">${roleIconHtml(x.name||charId(x),'scriptIcon')}<div class="scriptCharacterText"><b>${esc(x.name||x.id)}</b><div class="muted small">${esc(x.ability||'')}</div></div></div>`).join('')}</div></section>`:'';h(`<div class="top"><div class="brand">📜 스크립트</div><button class="secondary" onclick="startRoom()">돌아가기</button></div><div class="card scriptbox"><h2>${esc(scriptName(data))}</h2>${groups.map(g=>section(g[0],g[1])).join('')}${otherHtml}</div>`)}
function clearEndedSession(){const old=room;if(old){localStorage.removeItem('botc_last_room');localStorage.removeItem('botc_name_'+old);localStorage.removeItem('botc_mode_'+old)}try{history.replaceState(null,'',location.pathname+location.search)}catch(e){location.hash=''}room=null;currentMeta=null;updateRoomEscapeControls();window._myPrompt=null;window._activePrompt=null}
function goHomeAfterEnd(){clearEndedSession();renderHome()}
function renderEnded(meta=currentMeta){
 const reveal=Array.isArray(meta?.roleReveal)?meta.roleReveal:[];
 const names=reveal.length?`<div class="endReveal"><h3>🎭 실제 역할 공개</h3>${reveal.map(x=>`<div class="endRevealRow"><b>${esc(x.name)}</b><span>${esc(x.role)}</span></div>`).join('')}</div>`:'';
 grimClearSurface();clearEndedSession();
 h(`<div class="card center endCard" style="margin-top:12vh"><div class="phase">🏆 게임이 종료되었습니다</div><p class="muted">수고하셨습니다.</p>${names}<button style="width:100%" onclick="goHomeAfterEnd()">🏠 처음 화면으로</button></div>`)
}
auth.onAuthStateChanged(async u=>{if(!u){try{await auth.signInAnonymously();}catch(e){app.innerHTML=`<div class="card center"><div class="phase">접속 오류</div><p class="muted">Firebase 익명 로그인이 되지 않습니다.<br>Firebase Authentication에서 익명 로그인을 켜 주세요.</p><p class="small muted">${esc(e.message||e)}</p></div>`;}return;}uid=u.uid;const r=(location.hash.slice(1)||localStorage.getItem('botc_last_room')||'').toUpperCase();if(r){room=r;try{const ms=await db.ref(`rooms/${room}/public/meta`).once('value'),m=ms.val();if(!m){localStorage.removeItem('botc_last_room');return leaveRoomToHome();}const savedMode=localStorage.getItem('botc_mode_'+room);isST=m.ownerUid===uid&&savedMode!=='PLAYER';if(m.status==='ENDED'){if(m.resetToHome){leaveRoomToHome();return;}renderEnded(m);return;}if(!isST){const admitted=(await db.ref(`rooms/${room}/public/players/${uid}`).once('value')).exists();if(!admitted){if(m.status!=='WAITING'){h(`<div class="card center" style="margin-top:20vh"><div class="phase">재접속</div><p class="muted">자동 복귀에 실패했습니다.<br>사회자에게 재접속 허용을 요청한 뒤 같은 방 코드와 이름으로 입장하세요.</p><button onclick="showJoin();document.querySelector('#joinCode').value='${esc(room)}'">재접속 입력</button></div>`);return;}localStorage.removeItem('botc_last_room');location.hash='';showJoin();const c=$('#joinCode');if(c)c.value=room;return;}meName=localStorage.getItem('botc_name_'+room)||'참가자';}localStorage.setItem('botc_last_room',room);if(!location.hash)location.hash=room;startRoom()}catch(e){app.innerHTML=`<div class="card center"><div class="phase">접속 오류</div><p class="muted">Firebase 데이터베이스에 연결할 수 없습니다.</p><p class="small muted">${esc(e.message||e)}</p></div>`}}else renderHome();});
window.leavePlayerRoom=leavePlayerRoom;window.restartPreparationFromLobby=restartPreparationFromLobby;window.cancelReconnectWait=cancelReconnectWait;window.renderHome=renderHome;window.leaveRoomToHome=leaveRoomToHome;window.showCreate=showCreate;window.showJoin=showJoin;window.createRoom=createRoom;window.createCustomRoom=createCustomRoom;window.joinRoom=joinRoom;window.startGame=startGame;window.allowReconnect=allowReconnect;window.toggleReal=toggleReal;window.deployRound=deployRound;window.forceNextTurn=forceNextTurn;window.submitCurrentAnswer=submitCurrentAnswer;window.submitAnswer=submitAnswer;window.nextDay=nextDay;window.nextNight=nextNight;window.endGame=endGame;window.openScript=openScript;window.removeToken=removeToken;window.addGrimoire=addGrimoire;window.changeRole=changeRole;window.openRoleMenu=openRoleMenu;window.openTokenMenu=openTokenMenu;window.setRole=setRole;window.customRole=customRole;window.selectToken=selectToken;window.customToken=customToken;window.closePicker=closePicker;window.toggleNightDrawer=toggleNightDrawer;window.setNightOrderMode=setNightOrderMode;window.goHomeAfterEnd=goHomeAfterEnd;window.autoGrow=autoGrow;

Object.assign(window,{setupSetRole,setupSetMode,setupSetManual,confirmRoleSetup,claimRoleToken,toggleRoleReveal,resetRoleSetup,finishRoleSetup});

// RC5.8.6 sequential token draw. ST alone manages queue; Firebase rules gate claims.
let drawTimerHandle=null,drawTurnBusy=false;
function drawTurnPanel(m,st){
 if(m.setupMode!=='draw'||m.setupStage!=='DISTRIBUTING')return '';
 const q=m.drawQueue||[],players=window._players||{},start=Number(m.drawTurnStartedAt||0),remaining=Math.max(0,Math.ceil((start+20000-(Date.now()+(window._serverOffset||0)))/1000));
 const names=q.map((id,i)=>`<span class="drawQueuePerson ${i===0?'drawCurrent':''} ${id===uid?'drawMine':''}">${esc(players[id]?.name||'참가자')}</span>`).join('<span class="drawArrow"> → </span>');
 return `<div class="card drawTurnPanel"><div class="row"><b>${q.length?'🎴 '+esc(players[q[0]]?.name||'참가자')+'님 선택 중':'🎴 모든 토큰 선택 완료'}</b><b class="drawCountdown">${q.length?remaining+'초':''}</b></div><div class="drawQueueLine">${names||'전원 선택 완료'}</div>${!st&&q.length?`<div class="small muted">${q[0]===uid?'지금 내 차례입니다.':`내 차례: ${q.indexOf(uid)>=0?q.indexOf(uid)+1+'번째':'선택 완료'}`}</div>`:''}${st&&q.length>1?`<details class="drawAdmin"><summary>⚙ 진행 관리</summary><button class="secondary" onclick="forceDrawSkip()">현재 차례 강제로 넘기기</button></details>`:''}</div>`;
}
function scheduleDrawTurnCheck(){if(drawTimerHandle)return;drawTimerHandle=setInterval(async()=>{
 if(!currentMeta||currentMeta.phase!=='PREPARING'||currentMeta.setupMode!=='draw'||currentMeta.setupStage!=='DISTRIBUTING'||!isST){clearInterval(drawTimerHandle);drawTimerHandle=null;return;}
 const q=currentMeta.drawQueue||[],start=Number(currentMeta.drawTurnStartedAt||0);if(!q.length)return;
 const countdown=document.querySelector('.drawCountdown');if(countdown)countdown.textContent=Math.max(0,Math.ceil((start+20000-(Date.now()+(window._serverOffset||0)))/1000))+'초';
 if(start&&Date.now()+(window._serverOffset||0)>=start+20000)await advanceDrawQueueIfClaimed(true);
 },500);}
async function advanceDrawQueueIfClaimed(timeout=false){if(!isST||drawTurnBusy)return;drawTurnBusy=true;try{
 const ref=db.ref(`rooms/${room}/public/meta`),snap=await ref.once('value'),m=snap.val()||{},q=m.drawQueue||[];
 if(m.setupStage!=='DISTRIBUTING'||m.setupMode!=='draw'||!q.length)return;
 const claims=(await db.ref(`rooms/${room}/public/drawClaims`).once('value')).val()||{};
 const current=q[0],picked=Object.values(claims).some(c=>c?.uid===current);
 const timedOut=Number(m.drawTurnStartedAt||0)>0&&Date.now()+(window._serverOffset||0)>=Number(m.drawTurnStartedAt)+20000;
 if(!picked&&!(timeout&&timedOut))return;
 const next=picked?q.slice(1):[...q.slice(1),q[0]];
 await ref.transaction(v=>{if(!v||v.setupMode!=='draw'||v.setupStage!=='DISTRIBUTING'||JSON.stringify(v.drawQueue||[])!==JSON.stringify(q)||v.drawTurnStartedAt!==m.drawTurnStartedAt)return;
 v.drawQueue=next;v.drawTurnStartedAt=Date.now()+(window._serverOffset||0);return v;});
 }catch(e){console.warn('draw queue advance',e);}finally{drawTurnBusy=false;}}
async function forceDrawSkip(){if(!isST||!(currentMeta?.drawQueue?.length>1))return;
 const name=window._players?.[currentMeta.drawQueue[0]]?.name||'현재 참가자';
 if(!confirm(`${name}님의 차례를 강제로 넘길까요?\n맨 뒤로 이동하며 다음 차례에 20초가 다시 주어집니다.`))return;
 const ref=db.ref(`rooms/${room}/public/meta`);try{await ref.transaction(v=>{if(!v||v.setupMode!=='draw'||!v.drawQueue||v.drawQueue.length<2)return;v.drawQueue=[...v.drawQueue.slice(1),v.drawQueue[0]];v.drawTurnStartedAt=Date.now()+(window._serverOffset||0);return v;});}catch(e){toast('강제 넘기기 실패: '+e.message);}}

function appendRestartControl(){if(!isST||document.querySelector('.alwaysRestart')||document.querySelector('button[onclick="endGame()"]'))return;const b=document.createElement('button');b.className='secondary alwaysRestart';b.style.cssText='width:100%;margin:18px 0 24px';b.textContent='🏠 처음부터 다시 시작';b.onclick=restartPreparationFromLobby;app.appendChild(b);}
// Keep participant countdown live without re-rendering their token grid.
setInterval(()=>{if(isST||currentMeta?.phase!=='PREPARING'||currentMeta?.setupMode!=='draw')return;const el=document.querySelector('.drawCountdown');if(el&&currentMeta.drawQueue?.length){const left=Math.max(0,Math.ceil((Number(currentMeta.drawTurnStartedAt||0)+20000-Date.now()-(window._serverOffset||0))/1000));el.textContent=left+'초';}},500);
Object.assign(window,{openSetupRolePicker,pickSetupRole,forceDrawSkip});

function grimStatusBadges(id){const s=grimState[id]||{};return `<span class="small">${s.dead?(s.ghostSpent?'⚫ 사망·투표권 소진':'💀 사망·유령투표 가능'):'❤️ 생존'}</span>`}
