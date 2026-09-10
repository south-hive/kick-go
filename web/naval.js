(() => {
  'use strict';
  const M=NavalModel,$=id=>document.getElementById(id),text=(id,value)=>{if($(id).textContent!==String(value))$(id).textContent=value;};
  let state=null,draft=[],selected='carrier',vertical=false,draftKey='',lastEvent='',sound=false,audio=null;
  const boards={own:[],enemy:[]};
  const net=new NavalConnection(onState,render);
  const observer=()=>state?.role==='spectator';
  const editable=()=>state?.phase==='placing'&&!observer()&&!state.ready[state.team]&&net.connected&&!net.pending;
  const canFire=()=>state?.phase==='battle'&&!observer()&&state.turn===state.team&&state.connected.every(Boolean)&&net.connected&&!net.pending;
  function persist(){try{sessionStorage.setItem('naval-draft:v1',JSON.stringify({key:draftKey,ships:draft}));}catch{}}
  function onState(next){
    const key=`${next.code}:${next.match}:${next.team}`;
    if(draftKey!==key){text('naval-effect','');draftKey=key;draft=[];selected='carrier';vertical=false;lastEvent=`${next.match}:${next.lastShot?.id||0}`;try{const saved=JSON.parse(sessionStorage.getItem('naval-draft:v1'));if(saved?.key===key)draft=M.validate(saved.ships,false);}catch{}}
    if(next.role==='player'&&next.ready[next.team])draft=next.ownShips;
    state=next;render();
    const event=next.lastShot,eventKey=`${next.match}:${event?.id||0}`;
    if(event&&lastEvent!==eventKey){lastEvent=eventKey;effect(event);}
  }
  function status(){if(net.message)return net.message;if(!state)return '별명 없이도 입장할 수 있습니다.';if(!net.connected)return '재접속 중 · 조작이 잠겼습니다.';if(!state.connected.every(Boolean)&&state.phase!=='waiting')return '상대 연결이 끊겼습니다. 같은 자리로 돌아오면 이어집니다.';if(state.phase==='waiting')return observer()?'함장 입장을 기다리는 중입니다.':'초대 링크를 보내 상대 함장을 초대하세요.';if(state.phase==='placing')return observer()?'함선 배치 중 · 배치 과정은 공개되지 않습니다.':state.ready[state.team]?'배치 확정 완료 · 상대 준비를 기다립니다.':'아래 내 해역에 함선 5척을 배치하세요.';if(state.phase==='battle')return observer()?`${state.names[state.turn]}의 공격 차례 · 관전 중`:net.pending?'사격 결과를 확인 중…':state.turn===state.team?'내 차례 · 위 상대 해역의 좌표를 누르세요.':'상대 차례 · 아래 내 해역을 지켜보세요.';return observer()?'경기 종료 · 양쪽 함선이 공개되었습니다.':state.votes[state.team]?'재대결 준비 완료 · 상대 동의를 기다립니다.':'경기 종료 · 두 함장이 동의하면 다시 배치합니다.';}
  function render(){
    if(!net.session&&!net.state)state=null;
    text('naval-status',status());$('naval-lobby').hidden=!!state;$('naval-room').hidden=!state;
    $('naval-create').disabled=net.active&&!state;$('naval-join').disabled=net.active&&!state;$('naval-watch').disabled=net.active&&!state;
    $('naval-reconnect').hidden=net.connected||(!net.session&&!net.active);
    document.querySelectorAll('.naval-phases li').forEach(li=>li.classList.toggle('active',li.dataset.phase===(state?.phase||'waiting')));
    if(!state)return;
    const side=observer()?0:state.team,enemy=1-side;
    text('naval-role',observer()?'관전자':`나: ${state.names[side]}`);text('naval-room-code',state.code);text('naval-viewers',`관전 ${state.spectators}명`);
    const link=new URL(location.href);link.hash=`naval=${state.code}`;$('naval-invite').value=link.href;
    $('naval-waiting').hidden=state.phase!=='waiting';$('naval-placement').hidden=observer()||state.phase!=='placing';$('naval-observer-wait').hidden=!observer()||state.phase!=='placing';$('naval-seas').hidden=observer()&&['waiting','placing'].includes(state.phase);
    text('naval-enemy-name',`${observer()?'참가자 2':'상대'} · ${state.names[enemy]}`);text('naval-own-name',`${observer()?'참가자 1':'나'} · ${state.names[side]}`);
    text('own-overline',observer()?'CAPTAIN 01':'YOUR FLEET');text('enemy-overline',observer()?'CAPTAIN 02':'TARGET SEA');
    const divider=document.querySelector('.sea-divider');divider.firstElementChild.textContent=observer()?'참가자 2 ↑':'상대 해역 ↑';divider.lastElementChild.textContent=observer()?'↓ 참가자 1':'↓ 내 해역';
    for(const spec of M.FLEET){const button=$(`ship-${spec.id}`),ship=draft.find(s=>s.id===spec.id);button.disabled=!editable();button.setAttribute('aria-pressed',String(selected===spec.id));button.querySelector('span').textContent=(ship?'✓ ':'')+'■'.repeat(spec.length);}
    for(const id of ['naval-rotate','naval-remove','naval-random','naval-clear'])$(id).disabled=!editable();
    text('naval-rotate',vertical?'세로 ↓ · 가로로 전환':'가로 → · 세로로 전환');
    let complete=false;try{M.validate(draft);complete=true;}catch{}
    $('naval-ready').disabled=!editable()||!complete;text('naval-placement-status',state.ready[side]?'준비 완료 · 함선 위치가 잠겼습니다.':`${draft.length} / 5척 배치 · ${M.FLEET.find(s=>s.id===selected).name} 선택됨`);
    const ownShips=observer()?state.ownShips:state.phase==='placing'?draft:state.ownShips;
    paint('own',ownShips,state.incomingShots,editable());paint('enemy',state.opponentShips,state.ownShots,canFire());
    const ownSunk=ownShips.filter(s=>M.cells(s).every(c=>state.incomingShots[c]===3)).length,enemySunk=state.opponentShips.filter(s=>M.cells(s).every(c=>state.ownShots[c]===3)).length;
    text('naval-own-fleet',state.phase==='placing'&&!observer()?`${draft.length}척 배치`:`${ownSunk} / 5척 격침`);text('naval-enemy-fleet',`${enemySunk} / 5척 격침`);
    $('naval-result').hidden=state.phase!=='over';if(state.phase==='over'){text('naval-winner',observer()?`${state.names[state.winner]} 승리`:state.winner===state.team?'승리 · 해역을 지켰습니다':'패배 · 함대가 격침됐습니다');text('naval-result-detail',`승리 함장: ${state.names[state.winner]} · ${state.lastShot?.id||0}회 사격`);$('naval-rematch').hidden=observer();$('naval-rematch').disabled=!net.connected||net.pending||!state.connected.every(Boolean)||(!observer()&&state.votes[state.team]);text('naval-rematch-status',observer()?'두 함장이 재대결하면 관전을 이어갑니다.':'두 사람 모두 재대결을 누르면 새 배치가 시작됩니다. 선공은 번갈아 바뀝니다.');}
  }
  function paint(which,ships,shots,enabled){const occupied=new Map();for(const ship of ships)for(const cell of M.cells(ship))occupied.set(cell,ship);boards[which].forEach((button,cell)=>{const ship=occupied.get(cell),shot=shots[cell];button.className='sea-cell'+(ship?' ship'+(ship.vertical?' vertical':''):'')+(shot===1?' miss':shot===2?' hit':shot===3?' sunk':'');button.textContent=shot===1?'·':shot===2?'✦':shot===3?'✕':'';button.disabled=!enabled||(which==='enemy'&&!!shot);button.setAttribute('aria-label',`${M.coordinate(cell)} ${shot===1?'빗나감':shot===2?'명중':shot===3?'격침':ship?M.FLEET.find(s=>s.id===ship.id).name:'미확인'}`);});}
  for(const which of ['own','enemy'])for(let cell=0;cell<100;cell++){const b=document.createElement('button');b.type='button';b.className='sea-cell';b.dataset.cell=cell;b.dataset.row=String.fromCharCode(65+Math.floor(cell/10));b.disabled=true;$(`naval-${which}-board`).append(b);boards[which].push(b);b.onclick=()=>{if(which==='enemy'){if(canFire()&&!state.ownShots[cell])net.send('fire',{cell});return;}if(!editable())return;try{draft=M.place(draft,{id:selected,start:cell,vertical});persist();const next=M.FLEET.find(s=>!draft.some(p=>p.id===s.id));if(next)selected=next.id;render();}catch{text('naval-placement-status','해역 밖이거나 다른 함선과 겹칩니다. 시작 칸이나 방향을 바꿔 주세요.');}};if(which==='own')b.onpointerenter=()=>{if(!editable())return;const ship={id:selected,start:cell,vertical},cells=M.cells(ship)||[cell];let valid=true;try{M.place(draft,ship);}catch{valid=false;}for(const c of cells)boards.own[c].classList.add(valid?'preview':'invalid-preview');};b.onpointerleave=()=>{boards.own.forEach(c=>c.classList.remove('preview','invalid-preview'));};}
  for(const spec of M.FLEET){const b=document.createElement('button');b.className='fleet-pick';b.id=`ship-${spec.id}`;b.innerHTML=`${spec.name}<span></span>`;b.onclick=()=>{selected=spec.id;const ship=draft.find(s=>s.id===selected);if(ship)vertical=ship.vertical;render();};$('naval-fleet-picker').append(b);}
  $('naval-rotate').onclick=()=>{vertical=!vertical;render();};$('naval-remove').onclick=()=>{draft=draft.filter(s=>s.id!==selected);persist();render();};$('naval-random').onclick=()=>{draft=M.randomFleet();persist();render();};$('naval-clear').onclick=()=>{draft=[];persist();render();};$('naval-ready').onclick=()=>{if(editable())net.send('ready',{ships:draft});};
  function enter(type){const code=$('naval-code').value.trim().toUpperCase();if(type!=='create'&&!/^[A-F0-9]{12}$/.test(code)){text('naval-status','12자리 방 코드를 입력하세요.');$('naval-code').focus();return;}state=null;net.begin(type,code,$('naval-nickname').value);}
  $('naval-create').onclick=()=>enter('create');$('naval-join').onclick=()=>enter('join');$('naval-watch').onclick=()=>enter('watch');
  $('naval-leave').onclick=()=>{if(!observer()&&!window.confirm('방을 나가면 상대와 관전자에게도 경기가 종료됩니다. 나갈까요?'))return;net.leave();state=null;render();};
  $('naval-rematch').onclick=()=>net.send('rematch');$('naval-reconnect').onclick=()=>{const saved=net.session||net.saved();if(saved)net.restore(saved);else if(net.action)net.begin(net.action.type,net.action.code,net.action.nickname);};
  $('naval-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('naval-invite').value);text('naval-status','초대 링크를 복사했습니다. 링크에서 함장 또는 관전으로 입장할 수 있습니다.');}catch{$('naval-invite').focus();$('naval-invite').select();text('naval-status','선택된 링크를 직접 복사해 주세요.');}};
  function effect(shot){const side=observer()?0:state.team,which=shot.team===side?'enemy':'own';const outcome=shot.result==='sunk'?`${M.FLEET.find(s=>s.id===shot.sunk).name} 격침!`:shot.result==='hit'?'명중!':'물보라 · 빗나감';text('naval-effect',`${state.names[shot.team]} · ${M.coordinate(shot.cell)} · ${outcome}`);const cells=shot.cells.length?shot.cells:[shot.cell];for(const cell of cells){const b=boards[which][cell];b.classList.add(`burst-${shot.result}`);setTimeout(()=>b.classList.remove(`burst-${shot.result}`),1400);}if(sound&&audio){const o=audio.createOscillator(),g=audio.createGain();o.type=shot.result==='miss'?'sine':'triangle';o.frequency.setValueAtTime(shot.result==='sunk'?90:shot.result==='hit'?180:500,audio.currentTime);g.gain.setValueAtTime(.06,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.35);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+.36);}}
  $('naval-sound').onclick=()=>{sound=!sound;if(sound){try{audio||=new(window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{});}catch{sound=false;}}$('naval-sound').setAttribute('aria-pressed',String(sound));$('naval-sound').setAttribute('aria-label',sound?'효과음 끄기':'효과음 켜기');};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&net.connected)net.send('sync');});
  const hash=location.hash.match(/^#naval=([a-f0-9]{12})$/i);if(hash)$('naval-code').value=hash[1].toUpperCase();
  render();const saved=net.saved();if(saved&&(!hash||saved.code===$('naval-code').value))net.restore(saved);
})();
