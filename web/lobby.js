'use strict';
(()=>{
  const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
  const gameName={alkkagi:'알까기',naval:'배틀십'},pageName={alkkagi:'alkkagi.html',naval:'battleship.html'};
  let activeGame=null,net=null,state=null,navigating=false,rooms=[],directory=null,retry=0,timer,timeout;
  let returning=params.has('return');
  const connections={alkkagi:new OnlineGame(receive,render),naval:new NavalConnection(receive,render)};
  const mobile=matchMedia('(max-width: 700px)');
  const character=$('character');
  for(const preset of AlkkagiCharacters.list())character.add(new Option(preset.name,preset.id));
  function nickname(){return mobile.matches?'익명':$('nickname').value.trim()||'익명';}
  function saveName(){try{localStorage.setItem('arcade-nickname',$('nickname').value.trim());}catch{}}
  try{
    $('nickname').value=localStorage.getItem('arcade-nickname')||'';
    const saved=localStorage.getItem('arcade-character');
    if([...character.options].some(option=>option.value===saved))character.value=saved;
  }catch{}
  $('nickname').oninput=saveName;
  character.onchange=()=>{try{localStorage.setItem('arcade-character',character.value);}catch{}};
  const selected=gameName[params.get('game')]?params.get('game'):'alkkagi';
  $('game').value=selected;$('join-game').value=selected;
  if(Object.hasOwn(AlkkagiRules.sets,params.get('ruleset')))$('ruleset').value=params.get('ruleset');
  const syncRuleset=()=>{$('ruleset-field').hidden=$('game').value!=='alkkagi';$('naval-ruleset-field').hidden=$('game').value!=='naval';};
  $('game').onchange=syncRuleset;syncRuleset();
  function openDialog(id){document.querySelectorAll('.dialog-status').forEach(el=>el.textContent='');if(!$(id).open)$(id).showModal();}
  $('open-create').onclick=()=>openDialog('create-dialog');$('open-join').onclick=()=>openDialog('join-dialog');
  for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>$(button.dataset.close).close();
  let inviteHash;
  function readInvite(){
    inviteHash=new URLSearchParams(location.hash.slice(1));
    if(gameName[inviteHash.get('game')])$('join-game').value=inviteHash.get('game');
    $('code').value=/^[a-f0-9]{12}$/i.test(inviteHash.get('code')||'')?inviteHash.get('code').toUpperCase():'';
    if($('code').value&&!net?.session)openDialog('join-dialog');
  }
  readInvite();window.addEventListener('hashchange',readInvite);
  function say(message){$('status').textContent=message;for(const dialog of document.querySelectorAll('dialog[open]'))dialog.querySelector('.dialog-status').textContent=message;}
  function endpoint(game){return connections[game].endpoint();}
  function remember(){try{sessionStorage.setItem('arcade-active-game',activeGame);}catch{}}
  function enter(game,action,code){
    if(net?.active||net?.session)return;
    saveName();activeGame=game;net=connections[game];state=null;returning=false;remember();
    const options={...(game==='alkkagi'?{ruleset:$('ruleset').value,characterId:mobile.matches?'random':character.value}:{ruleset:$('naval-ruleset').value,characterId:mobile.matches?'random':character.value}),lobby:true,nickname:nickname(),title:$('title').value,public:$('visibility').value==='public'};
    if(game==='alkkagi')net.begin(action,code,options);else net.begin(action,code,nickname(),options);
    render();
  }
  function receive(next){state=next;render();if(next.phase!=='lobby'&&!returning)go();}
  function go(){if(navigating||!net?.session)return;navigating=true;remember();location.href=pageName[activeGame];}
  function render(){
    if(net&&!net.session&&!net.state)state=null;
    const joined=!!net?.session,busy=!!net?.active||joined;
    $('browse').hidden=joined;$('waiting').hidden=!joined;
    character.disabled=busy;$('nickname').disabled=busy;
    $('open-create').disabled=busy;$('open-join').disabled=busy;
    if(joined)for(const id of ['create-dialog','join-dialog'])if($(id).open)$(id).close();
    for(const id of ['create','join','watch-code'])$(id).disabled=busy;
    if(!net){say('방을 만들거나 목록에서 참가하세요.');return;}
    if(!state){say(net.message||'방에 연결하고 있습니다…');return;}
    $('room-title').textContent=state.title||'함께 한 판';$('room-game').textContent=`${gameName[activeGame]}${' · '+(activeGame==='alkkagi'?AlkkagiRules.get(state.ruleset).name:NavalModel.rules(state.ruleset).name)} · ${state.public?'공개 방':'초대 방'}`;
    const phase=state.phase,team=net.session.team,spectator=net.session.role==='spectator',connected=net.connected&&state.connected.every(Boolean);
    $('room-state').textContent=phase==='lobby'?'참가자 준비 중':phase==='over'?'경기 종료 · 같은 방에서 다시 겨룰 수 있습니다.':'경기가 진행 중입니다.';
    $('players').replaceChildren(...state.names.map((name,i)=>{
      const el=document.createElement('div');el.className='player-seat';
      const strong=document.createElement('strong');strong.textContent=`${i===0?'방장 · ':''}${name}${team===i?' (나)':''}`;
      const span=document.createElement('span');span.textContent=!state.connected[i]?'입장 / 재접속 대기':phase==='lobby'?(state.lobbyReady[i]?'준비 완료':'준비 전'):'접속 중';el.append(strong,span);if(state.connected[i]){const character=document.createElement('small');character.textContent=AlkkagiCharacters.get(state.characters[i]).name;el.append(character);}return el;
    }));
    const link=new URL('lobby.html',location.href);link.hash=new URLSearchParams({game:activeGame,code:state.code}).toString();$('invite').value=link.href;$('room-code').textContent=`방 코드 ${state.code}`;
    $('ready').hidden=spectator||!['lobby','over'].includes(phase);
    $('ready').disabled=!connected||net.pending||(phase==='over'&&state.votes[team]);
    $('ready').textContent=phase==='over'?(state.votes[team]?'상대 동의 대기':'재대결 준비'):state.lobbyReady[team]?'준비 취소':'준비';
    $('continue').hidden=phase==='lobby';$('continue').disabled=!net.connected;
    $('ready-hint').textContent=phase==='lobby'?'두 사람 모두 준비하면 게임이 시작됩니다.':phase==='over'?'두 사람이 재대결에 동의하면 같은 닉네임으로 다시 시작합니다.':'경기로 돌아가서 이어 하거나 관전할 수 있습니다.';
    say(net.message||(!connected?'참가자가 연결되면 계속할 수 있습니다.':phase==='lobby'?'준비가 되면 아래 준비 버튼을 눌러주세요.':'같은 방과 닉네임이 유지됩니다.'));
  }
  $('identity').onsubmit=e=>{e.preventDefault();saveName();$('nickname').blur();};
  $('create-form').onsubmit=e=>{e.preventDefault();enter($('game').value,'create');};
  function join(watch){const code=$('code').value.trim().toUpperCase();if(!/^[A-F0-9]{12}$/.test(code)){say('12자리 방 코드를 입력하세요.');return;}enter($('join-game').value,watch?'watch':'join',code);}
  $('join-form').onsubmit=e=>{e.preventDefault();join(false);};$('watch-code').onclick=()=>join(true);
  $('ready').onclick=()=>{
    returning=false;
    if(state.phase==='over'){if(activeGame==='alkkagi')net.rematch();else net.send('rematch');}
    else{const data={ready:!state.lobbyReady[net.session.team],match:state.match};if(activeGame==='alkkagi')net.send({type:'prepare',...data});else net.send('prepare',data);}
  };
  $('continue').onclick=go;
  $('leave').onclick=()=>{
    if(activeGame==='alkkagi')net.stop();else net.leave();
    net=null;state=null;activeGame=null;returning=false;
    try{sessionStorage.removeItem('arcade-active-game');}catch{}
    render();say('방에서 나왔습니다. 다른 경기에 참가해 보세요.');
  };
  $('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('invite').value);say('초대 링크를 복사했습니다.');}catch{$('invite').focus();$('invite').select();say('선택한 초대 링크를 복사해 주세요.');}};
  const phaseName={lobby:'대기 중',waiting:'대기 중',select:'선택 중',placing:'배치 중',aim:'진행 중',moving:'진행 중',battle:'진행 중',over:'경기 종료'};
  function drawRooms(){
    const visible=rooms.filter(r=>$('filter').value==='all'||r.game===$('filter').value);
    const list=$('rooms'),existing=new Map([...list.children].map(el=>[el.dataset.code,el]));
    for(const [index,r] of visible.entries()){
      let card=existing.get(r.code);
      if(!card){card=document.createElement('li');card.className='room-card';card.dataset.code=r.code;
        card.innerHTML='<div class="room-name"><h3></h3><span class="badge"></span></div><p></p><div class="row"><button></button></div>';
      }
      const setText=(el,text)=>{if(el.textContent!==text)el.textContent=text;};
      setText(card.querySelector('h3'),r.title);
      setText(card.querySelector('.badge'),`${gameName[r.game]}${' · '+(r.game==='alkkagi'?AlkkagiRules.get(r.ruleset||'modern').name:NavalModel.rules(r.ruleset).name)}`);
      setText(card.querySelector('p'),`${r.host} · ${r.count}/2명 · ${phaseName[r.phase]||'진행 중'}`);
      const button=card.querySelector('button'),waiting=r.phase==='lobby';
      setText(button,waiting?(r.count>=2?'참가 마감':'참가'):'관전');button.className=waiting?'primary':'';
      button.disabled=!!net?.active||!!net?.session||(waiting?(r.count>=2||!r.connected[0]):r.spectators>=20);
      button.onclick=()=>enter(r.game,waiting?'join':'watch',r.code);
      if(list.children[index]!==card)list.insertBefore(card,list.children[index]||null);
      existing.delete(r.code);
    }
    for(const card of existing.values())card.remove();
    if(directory?.readyState===1)$('directory-status').textContent=visible.length?`${visible.length}개의 공개 방 · 자동 갱신 중`:'열려 있는 공개 방이 없습니다. 첫 방을 만들어 보세요.';
  }
  $('filter').onchange=drawRooms;
  function connectDirectory(){
    const base=endpoint('alkkagi');if(!base){$('directory-status').textContent='온라인 서버 주소가 설정되지 않았습니다.';return;}
    const url=new URL(base);url.pathname='/ws/lobby';directory=new WebSocket(url);const ws=directory;
    timeout=setTimeout(()=>ws.close(),20000);
    ws.onmessage=e=>{if(directory!==ws)return;let m;try{m=JSON.parse(e.data);}catch{return;}if(m.type!=='rooms'||!Array.isArray(m.rooms))return;clearTimeout(timeout);retry=0;rooms=m.rooms;drawRooms();};
    ws.onerror=()=>{};ws.onclose=()=>{if(directory!==ws)return;clearTimeout(timeout);$('directory-status').textContent='방 목록 연결이 끊겼습니다. 재접속 중…';timer=setTimeout(connectDirectory,Math.min(1000*2**retry++,10000));};
  }
  window.addEventListener('pagehide',()=>{clearTimeout(timer);clearTimeout(timeout);const ws=directory;directory=null;ws?.close();if(net){if(activeGame==='alkkagi')net.stop(false);else net.stop();}});
  window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
  render();connectDirectory();
  let last;try{last=sessionStorage.getItem('arcade-active-game');}catch{}
  const game=gameName[params.get('game')]?params.get('game'):last;
  if(gameName[game]&&!inviteHash.has('code')){const saved=connections[game].saved();if(saved){activeGame=game;net=connections[game];net.restore(saved);}}
})();
