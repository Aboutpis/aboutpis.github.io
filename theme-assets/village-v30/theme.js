/* RC32 visual layer. Reads rendered state; never writes to Firebase or changes game controls. */
(() => {
  'use strict';
  const root = document.getElementById('app');
  if (!root) return;
  const counts = [5,6,7,8,9,10,11,12,13,14,15];
  const rows = [
    ['주민',[3,3,5,5,5,7,7,7,9,9,9]],
    ['외지인',[0,1,0,1,2,0,1,2,0,1,2]],
    ['하수인',[1,1,1,1,1,2,2,2,3,3,3]],
    ['악마',[1,1,1,1,1,1,1,1,1,1,1]]
  ];
  const disclaimer = '시나리오 특별규칙 및 역할 능력에 따라 구성이 달라질 수 있습니다.';
  function state() {
    const meta = typeof currentMeta === 'undefined' ? null : currentMeta;
    const storyteller = typeof isST !== 'undefined' && isST;
    if (root.querySelector('.homeScene')) return ['home',false,meta];
    if (root.querySelector('#jsonFile')) return ['create',false,meta];
    if (root.querySelector('#joinCode')) return ['join',false,meta];
    if (root.querySelector('.scriptbox')) return ['script',!storyteller,meta];
    if (meta?.status === 'ENDED') return ['end',!storyteller,meta];
    if (root.querySelector('#voteScreen')) {
      const vote = typeof voteCurrent === 'undefined' ? null : voteCurrent;
      const ackKey = storyteller ? 'ST' : (typeof uid === 'undefined' ? '' : uid);
      const acked = typeof voteAcks !== 'undefined' && voteAcks[ackKey] === true;
      const now = Date.now() + (window._serverOffset || 0);
      const key = vote?.stage === 'RESULT' ? (acked?'vote_ack':'vote_result')
        : now - Number(vote?.startedAt || now) < 5000 ? 'vote_prepare'
        : (vote?.order?.length || 0) >= 15 ? 'vote_many' : 'vote';
      return [key,!storyteller,meta];
    }
    if (meta?.status === 'WAITING') return [storyteller ? (Object.keys(window._players||{}).length?'lobby':'lobby_empty') : 'playerlobby',!storyteller,meta];
    if (meta?.phase === 'PREPARING') {
      if (storyteller) {
        if (root.querySelector('.setupSummary')) {
          const hasRole = (typeof setupRows !== 'undefined' ? setupRows : []).some(r=>!!r.real);
          const mode = typeof setupMode === 'undefined' ? 'auto' : setupMode;
          return [!hasRole?'setup_empty':mode==='manual'?'setup_manual':mode==='draw'?'setup_draw_mode':'setup_auto',false,meta];
        }
        const key = meta.setupMode === 'draw' ? (meta.drawQueue?.length?'setup_draw_st':'setup_draw_done') : 'setup_distributing';
        return [key,false,meta];
      }
      if (!window._myRole) {
        if (meta.setupStage !== 'DISTRIBUTING') return ['prep_wait',true,meta];
        if (meta.setupMode !== 'draw') return ['prep_transfer',true,meta];
        const mine = Object.values(window._drawClaims||{}).some(c=>c?.uid===(typeof uid==='undefined'?'':uid));
        return [mine?'draw_selected':meta.drawQueue?.[0]===(typeof uid==='undefined'?'':uid)?'draw_choose':'draw_wait',true,meta];
      }
      const visible = typeof roleVisible !== 'undefined' && roleVisible;
      return [visible?'role':'role_hidden',true,meta];
    }
    if (meta?.phase === 'NIGHT') return [storyteller?'stnight':window._myPrompt?(window._myPrompt.requiresExact?'dummy':'question'):'wait',!storyteller,meta];
    if (meta?.phase === 'DAY') return [storyteller?'stday':'day',!storyteller,meta];
    return ['loading',!storyteller,meta];
  }
  function table(n, participant) {
    const value = Number.isSafeInteger(n) && n > 0 ? n : null;
    const cell = (tag,v,active,scope='')=>`<${tag}${active?' class="composition-active"':''}${scope?` scope="${scope}"`:''}>${v}</${tag}>`;
    return `<section class="composition-reference ${participant?'composition-player':'composition-st'}" aria-label="5명부터 15명까지 역할 기본 구성표" data-count="${value||''}"><div class="composition-head"><strong>역할 기본 구성표</strong><span>시작 인원 ${value?value+'명':'확인 중'}</span></div><table aria-label="역할 기본 구성표"><colgroup><col>${counts.map(()=>'<col>').join('')}</colgroup><thead><tr><th scope="col">인원</th>${counts.map(x=>cell('th',x,x===value,'col')).join('')}</tr></thead><tbody>${rows.map(([name,values])=>`<tr><th scope="row">${name}</th>${values.map((v,i)=>cell('td',v,counts[i]===value)).join('')}</tr>`).join('')}</tbody></table>${participant?`<p class="composition-note">${disclaimer}</p>`:''}</section>`;
  }
  function sync() {
    const [key,participant,meta] = state();
    if (document.body.dataset.screen !== key) document.body.dataset.screen=key;
    if (document.body.dataset.participant !== String(participant)) document.body.dataset.participant=String(participant);
    const playerRef = participant && ['wait','question','dummy','day'].includes(key);
    const stRef = key.startsWith('setup_') && !!root.querySelector('.setupSummary');
    document.body.classList.toggle('has-player-reference',playerRef);
    const existing = root.querySelector('.composition-reference');
    if (!playerRef && !stRef) existing?.remove();
    else {
      // lockedCount is written by the existing startGame(). Never derive this from online/alive players.
      const saved = Number(meta?.lockedCount);
      const count = Number.isSafeInteger(saved) && saved > 0 ? saved : null;
      const expectedClass = playerRef?'composition-player':'composition-st';
      if (!existing || existing.dataset.count !== String(count||'') || !existing.classList.contains(expectedClass)) {
        existing?.remove();
        if (playerRef) root.insertAdjacentHTML('beforeend',table(count,true));
        else root.querySelector('.setupSummary').insertAdjacentHTML('beforebegin',table(count,false));
      }
    }
    root.querySelectorAll('.drawGrid button').forEach(button=>{
      const claimed = button.textContent.trim()==='선택됨';
      const label = claimed?'선택됨':button.disabled?'차례 대기':'봉인된 운명';
      button.classList.toggle('is-claimed',claimed);
      if (button.dataset.sealState !== label) button.dataset.sealState=label;
    });
    document.documentElement.classList.add('theme-village');
  }
  let queued=false;
  function requestSync(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;sync()})}
  new MutationObserver(requestSync).observe(root,{childList:true,subtree:true});
  // Labels and layout are read-only. No listeners are added to game action buttons.
  sync();
  window.BOTC_THEME = Object.freeze({version:'RC5.8.7.32',refresh:requestSync});
})();
