'use strict';
const P=Physics,$=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d');
let stones,turn=0,mode='ai',phase='aim',drag=null,falls=[],last=0,accumulator=0,aiAt=0,sound=false,audio=null,pending=null;
const MAX_PULL=250,MAX_SPEED=1360;
let strike={x:0,y:0},strikePointer=null;
function canSetStrike(){return phase==='aim'&&!(turn===1&&mode==='ai')&&(mode!=='online'||net.canShoot())&&!$('confirm').open;}
function updateStrike(x=0,y=0){const d=Math.max(1,Math.hypot(x,y));strike={x:x/d,y:y/d};$('strike-dot').style.left=`${50+strike.x*38}%`;$('strike-dot').style.top=`${50+strike.y*38}%`;const labels=[];if(Math.abs(strike.y)>.05)labels.push(strike.y>0?'백샷':'전진');if(Math.abs(strike.x)>.05)labels.push(strike.x>0?'우회전':'좌회전');$('strike-value').textContent=labels.length?`${labels.join(' + ')} ${Math.round(Math.hypot(strike.x,strike.y)*100)}%`:'중앙 · 무회전';}
function strikeAt(e){const r=$('strike-pad').getBoundingClientRect();updateStrike((e.clientX-r.left-r.width/2)/(r.width*.38),(e.clientY-r.top-r.height/2)/(r.height*.38));}
$('strike-pad').addEventListener('pointerdown',e=>{if(!canSetStrike()||strikePointer!==null)return;strikePointer=e.pointerId;$('strike-pad').setPointerCapture(e.pointerId);strikeAt(e);});
$('strike-pad').addEventListener('pointermove',e=>{if(e.pointerId===strikePointer&&canSetStrike())strikeAt(e);});
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('strike-pad').addEventListener(event,()=>{strikePointer=null;});
$('strike-pad').addEventListener('keydown',e=>{if(!canSetStrike())return;const keys={ArrowLeft:[-.1,0],ArrowRight:[.1,0],ArrowUp:[0,-.1],ArrowDown:[0,.1]};if(keys[e.key]){e.preventDefault();updateStrike(strike.x+keys[e.key][0],strike.y+keys[e.key][1]);}else if(e.key==='Home'){e.preventDefault();updateStrike();}});
$('strike-reset').onclick=()=>{if(canSetStrike())updateStrike();};
const wood=document.createElement('canvas');wood.width=600;wood.height=600;
const w=wood.getContext('2d');
const gradient=w.createLinearGradient(43,0,557,0);gradient.addColorStop(0,'#b98143');gradient.addColorStop(.45,'#deb478');gradient.addColorStop(.5,'#cfa066');gradient.addColorStop(1,'#d8ad72');w.fillStyle=gradient;w.fillRect(43,43,514,514);
let seed=17;function random(){seed=(seed*16807)%2147483647;return seed/2147483647;}
for(let i=0;i<480;i++){const x=43+random()*514;w.beginPath();w.moveTo(x,43);w.bezierCurveTo(x+random()*9-4,180,x+random()*12-6,420,x+random()*6,557);w.strokeStyle=`rgba(95,53,20,${.02+random()*.09})`;w.lineWidth=random()*1.4;w.stroke();}
w.strokeStyle='#694c2b88';w.lineWidth=1;
for(let i=0;i<19;i++){let p=66+i*26;w.beginPath();w.moveTo(p,66);w.lineTo(p,534);w.moveTo(66,p);w.lineTo(534,p);w.stroke();}
w.fillStyle='#604624';for(const x of [144,300,456])for(const y of [144,300,456]){w.beginPath();w.arc(x,y,3,0,Math.PI*2);w.fill();}
w.fillStyle='#68421e70';w.fillRect(298,43,4,514);w.fillStyle='#f5cc8c77';w.fillRect(302,43,1,514);
function resize(){const scale=Math.min(devicePixelRatio||1,3);canvas.width=Math.round(canvas.clientWidth*scale);canvas.height=canvas.width;}
new ResizeObserver(resize).observe(canvas);
function tone(speed=100,drop=false){if(!sound||!audio)return;const o=audio.createOscillator(),g=audio.createGain();o.type=drop?'sine':'triangle';o.frequency.setValueAtTime(drop?180:750+Math.min(speed,900),audio.currentTime);o.frequency.exponentialRampToValueAtTime(drop?55:240,audio.currentTime+.08);g.gain.setValueAtTime(Math.min(.12,speed/6000),audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.12);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+.13);}
function score(){const counts=[0,0];stones.forEach(s=>{if(s.alive)counts[s.team]++;});$('black-count').textContent=counts[0];$('white-count').textContent=counts[1];return counts;}
function status(){if(mode==='online'){renderOnline();return;}$('restart').disabled=false;$('restart').textContent='↻ 새 게임';$('again').disabled=false;$('again').textContent='한 판 더 하기 ↗';$('strike-pad').disabled=!canSetStrike();$('strike-reset').disabled=!canSetStrike();const name=turn===0?'흑돌':'백돌';$('black-player').classList.toggle('active',turn===0);$('white-player').classList.toggle('active',turn===1);$('status').textContent=phase==='over'?'경기 종료':phase==='moving'?'돌이 멈출 때까지 기다려 주세요':turn===1&&mode==='ai'?'백돌이 다음 수를 생각하고 있어요…':`${name} 차례 · 돌을 당겨 조준하세요`;}
function reset(){updateStrike();stones=P.setup();turn=0;phase='aim';drag=null;falls=[];aiAt=0;accumulator=0;$('result').hidden=true;power(0);score();status();}
function power(p){$('power-fill').style.width=`${p*100}%`;$('power-number').textContent=`${Math.round(p*100)}%`;}
function pos(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*P.SIZE/r.width,y:(e.clientY-r.top)*P.SIZE/r.height};}
canvas.addEventListener('pointerdown',e=>{if(drag||!canSetStrike())return;const p=pos(e);const s=stones.filter(s=>s.alive&&s.team===turn).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y)).find(s=>Math.hypot(s.x-p.x,s.y-p.y)<Math.max(36,24*P.SIZE/canvas.clientWidth));if(!s)return;drag={s,start:p,end:p,id:e.pointerId,screenX:e.clientX,screenY:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;drag.end=pos(e);power(shotVector().p);});
function shotVector(){
  const dx=drag.start.x-drag.end.x,dy=drag.start.y-drag.end.y,d=Math.hypot(dx,dy);
  const px=d?-dx/d:0,py=d?-dy/d:0;
  const viewport=window.visualViewport;
  const left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0;
  const right=left+(viewport?.width||innerWidth),bottom=top+(viewport?.height||innerHeight);
  const roomX=px>0?(right-drag.screenX-16)/px:px<0?(drag.screenX-left-16)/-px:Infinity;
  const roomY=py>0?(bottom-drag.screenY-16)/py:py<0?(drag.screenY-top-16)/-py:Infinity;
  const pull=Math.min(MAX_PULL,Math.max(50,Math.min(roomX,roomY)*.85*P.SIZE/canvas.clientWidth));
  return{dx,dy,d,p:Math.min(1,d/pull),pull};
}
canvas.addEventListener('pointerup',e=>{if(!drag||e.pointerId!==drag.id)return;drag.end=pos(e);const v=shotVector(),s=drag.s;drag=null;power(0);if(v.d<14)return;launch(s,v.dx/v.d*MAX_SPEED*v.p,v.dy/v.d*MAX_SPEED*v.p);});
function cancelDrag(){drag=null;power(0);}canvas.addEventListener('pointercancel',cancelDrag);canvas.addEventListener('lostpointercapture',cancelDrag);
function launch(s,vx,vy){if(mode==='online'){net.shoot(s.id,vx,vy,strike.x,-strike.y);status();return;}P.shoot(s,vx,vy,mode==='ai'&&turn===1?0:strike.x,mode==='ai'&&turn===1?0:-strike.y);phase='moving';aiAt=0;status();}
function finish(){updateStrike();const c=score();if(c[0]===0||c[1]===0){phase='over';$('result').hidden=false;$('winner').textContent=c[0]===c[1]?'무승부':c[1]===0?'흑돌 승리':'백돌 승리';$('result-detail').textContent=c[0]===c[1]?'마지막 돌이 함께 판을 떠났어요.':`남은 돌 ${Math.max(...c)}개 · 멋진 승부였어요`;}else{turn=1-turn;phase='aim';if(turn===1&&mode==='ai')aiAt=performance.now()+750;}status();}
function chooseAI(){
  let best=null,bestScore=-Infinity;
  for(const s of stones.filter(s=>s.alive&&s.team===1))for(const target of stones.filter(s=>s.alive&&s.team===0))for(const offset of [-.14,0,.14])for(const speed of [750,1030,1330]){
    const a=Math.atan2(target.y-s.y,target.x-s.x)+offset,vx=Math.cos(a)*speed,vy=Math.sin(a)*speed,sim=stones.map(v=>({...v}));sim.find(v=>v.id===s.id).vx=vx;sim.find(v=>v.id===s.id).vy=vy;
    for(let n=0;n<1300&&P.moving(sim);n++)P.step(sim,1/120);
    let value=0;for(const v of sim){const orig=stones.find(o=>o.id===v.id);if(!orig.alive)continue;if(!v.alive)value+=v.team===0?100:-115;else if(v.team===0)value+=(Math.hypot(v.x-600,v.y-600)-Math.hypot(orig.x-600,orig.y-600))*.035;}
    value+=Math.random()*3;if(value>bestScore){bestScore=value;best={s,vx,vy};}
  }if(best)launch(best.s,best.vx,best.vy);
}
function drawStone(s,alpha=1,scale=1){ctx.save();ctx.globalAlpha=alpha;ctx.translate(s.x,s.y);ctx.scale(scale,scale);ctx.shadowColor='#0007';ctx.shadowBlur=8;ctx.shadowOffsetY=5;const g=ctx.createRadialGradient(-6,-7,1,0,0,20);g.addColorStop(0,s.team?'#ffffff':'#686c6c');g.addColorStop(.5,s.team?'#f0efe7':'#292d2d');g.addColorStop(1,s.team?'#b5b5a9':'#090e0e');ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,P.R,0,Math.PI*2);ctx.fill();ctx.shadowColor='transparent';ctx.strokeStyle=s.team?'#fff8':'#6c747455';ctx.lineWidth=1;ctx.stroke();ctx.restore();}
function draw(now){ctx.setTransform(canvas.width/600,0,0,canvas.height/600,0,0);ctx.clearRect(0,0,600,600);
  ctx.fillStyle='#0c1512';ctx.fillRect(44,53,514,517);ctx.save();ctx.shadowColor='#0009';ctx.shadowBlur=24;ctx.shadowOffsetY=10;ctx.fillStyle='#9a6a35';ctx.fillRect(43,43,514,514);ctx.restore();ctx.save();ctx.translate(600,0);ctx.rotate(Math.PI/2);ctx.drawImage(wood,0,0);ctx.restore();
  ctx.strokeStyle='#f0c99088';ctx.lineWidth=2;ctx.strokeRect(44,44,512,512);
  for(const obstacle of P.hinges){const h={x:obstacle.x/2,y:obstacle.y/2,w:obstacle.w/2,h:obstacle.h/2};ctx.save();ctx.shadowColor='#0006';ctx.shadowBlur=4;ctx.shadowOffsetY=3;const g=ctx.createLinearGradient(h.x,0,h.x+h.w,0);g.addColorStop(0,'#6d716a');g.addColorStop(.4,'#c2c1ad');g.addColorStop(.55,'#898c7e');g.addColorStop(1,'#60665f');ctx.fillStyle=g;ctx.beginPath();ctx.roundRect(h.x,h.y,h.w,h.h,3);ctx.fill();ctx.shadowColor='transparent';ctx.strokeStyle='#e3e0c755';ctx.stroke();ctx.fillStyle='#4d554c';ctx.fillRect(h.x+1,299,h.w-2,2);for(const x of [h.x+5,h.x+h.w-5])for(const y of [h.y+3.5,h.y+h.h-3.5]){ctx.fillStyle='#4b5149';ctx.beginPath();ctx.arc(x,y,1.4,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#c8c8b7';ctx.beginPath();ctx.moveTo(x-.8,y+.5);ctx.lineTo(x+.8,y-.5);ctx.stroke();}ctx.restore();}
  ctx.scale(600/P.SIZE,600/P.SIZE);
  for(const f of falls){const t=(now-f.time)/450;if(t<1)drawStone({...f,y:f.y+t*26},1-t,1-t*.6);}falls=falls.filter(f=>now-f.time<450);
  for(const s of stones){if(!s.alive)continue;if(canSetStrike()&&s.team===turn){ctx.strokeStyle=drag?.s===s?'#fff0c1':'#fff1bc80';ctx.lineWidth=drag?.s===s?2.5:1.3;ctx.beginPath();ctx.arc(s.x,s.y,24,0,Math.PI*2);ctx.stroke();}drawStone(s);}
  if(drag){const {dx,dy,d,p,pull}=shotVector();if(d>2){const s=drag.s,nx=dx/d,ny=dy/d,len=38+p*95;ctx.save();ctx.strokeStyle='#ffefc4';ctx.fillStyle='#ffefc4';ctx.lineWidth=3;ctx.setLineDash([5,7]);ctx.beginPath();ctx.moveTo(s.x+nx*26,s.y+ny*26);ctx.lineTo(s.x+nx*len,s.y+ny*len);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(s.x+nx*(len+10),s.y+ny*(len+10));ctx.lineTo(s.x+nx*len-ny*6,s.y+ny*len+nx*6);ctx.lineTo(s.x+nx*len+ny*6,s.y+ny*len-nx*6);ctx.fill();ctx.strokeStyle='#fff6';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(s.x-nx*23,s.y-ny*23);ctx.lineTo(s.x-nx*p*pull,s.y-ny*p*pull);ctx.stroke();ctx.restore();}}
}
function frame(now){const delta=last?Math.min((now-last)/1000,.05):0;last=now;if(mode==='online'){if(onlineTargets&&phase==='moving'){const mix=1-Math.exp(-22*delta);for(const s of stones){const target=onlineTargets[s.id];if(s.alive&&target){s.x+=(target.x-s.x)*mix;s.y+=(target.y-s.y)*mix;}}}}else if(!document.hidden&&!$('confirm').open){if(phase==='moving'){accumulator+=delta;while(accumulator>=1/120){P.step(stones,1/120,(s,v)=>{if(v>70)tone(v);},s=>{falls.push({...s,time:now});tone(500,true);score();});accumulator-=1/120;}if(!P.moving(stones))finish();}else if(aiAt&&now>=aiAt){aiAt=0;chooseAI();}}draw(now);requestAnimationFrame(frame);}
function requestReset(nextMode=mode){if(mode==='online'&&nextMode==='online'){net.rematch();return;}pending=nextMode;cancelDrag();$('confirm').showModal();}
function setMode(next){
  if(mode==='online'&&next!=='online'){net.stop();history.replaceState(null,'',location.pathname+location.search);}
  mode=next;onlineTargets=null;
  for(const key of ['ai','local','online']){$(key+'-mode').classList.toggle('selected',mode===key);$(key+'-mode').setAttribute('aria-pressed',mode===key);}
  $('online-panel').hidden=mode!=='online';
  $('black-label').textContent=mode==='ai'?'나의 흑돌':'플레이어 1';$('white-label').textContent=mode==='ai'?'상대 백돌':'플레이어 2';
  reset();if(mode==='online'){phase='waiting';renderOnline();}
}
$('restart').onclick=()=>requestReset();$('again').onclick=()=>{if(mode==='online')net.rematch();else reset();};$('ai-mode').onclick=()=>{if(mode!=='ai')requestReset('ai');};$('local-mode').onclick=()=>{if(mode!=='local')requestReset('local');};$('cancel').onclick=()=>{$('confirm').close();pending=null;};$('accept').onclick=()=>{$('confirm').close();setMode(pending||mode);pending=null;};$('sound').onclick=()=>{sound=!sound;$('sound').setAttribute('aria-pressed',sound);$('sound').setAttribute('aria-label',sound?'효과음 끄기':'효과음 켜기');if(sound){const Audio=window.AudioContext||window.webkitAudioContext;if(Audio){audio=audio||new Audio();audio.resume();tone(450);}else{sound=false;$('sound').setAttribute('aria-pressed','false');}}};
let onlineTargets=null;
const net=new OnlineGame(applyOnlineState,()=>{if(mode==='online')renderOnline();});
function applyOnlineState(state){
  if(mode!=='online')return;
  const changed=phase!==state.phase||turn!==state.turn;
  if(changed){cancelDrag();updateStrike();}
  onlineTargets=state.stones.map(s=>({...s}));
  stones=state.stones.map(s=>{const old=stones.find(o=>o.id===s.id);if(old?.alive&&!s.alive){falls.push({...old,time:performance.now()});tone(500,true);}return state.phase==='moving'&&old?.alive&&s.alive?{...s,x:old.x,y:old.y}:{...s};});
  turn=state.turn;phase=state.phase;score();
  $('result').hidden=phase!=='over';
  if(phase==='over'){const c=score();$('winner').textContent=c[0]===c[1]?'무승부':c[1]===0?'흑돌 승리':'백돌 승리';$('result-detail').textContent=c[0]===c[1]?'마지막 돌이 함께 판을 떠났어요.':`남은 돌 ${Math.max(...c)}개 · 멋진 승부였어요`;}
}
function renderOnline(){
  const text=net.text(),session=net.session,state=net.state;
  $('online-message').textContent=text;$('status').textContent=text;
  $('online-role').textContent=session?(session.team===0?'나: 흑돌':'나: 백돌'):'';
  $('black-label').textContent=session?.team===0?'나의 흑돌':'상대 흑돌';$('white-label').textContent=session?.team===1?'나의 백돌':'상대 백돌';
  $('black-player').classList.toggle('active',turn===0);$('white-player').classList.toggle('active',turn===1);
  $('strike-pad').disabled=!canSetStrike();$('strike-reset').disabled=!canSetStrike();
  $('online-lobby').hidden=!!session;$('online-room').hidden=!session;
  $('room-create').disabled=net.active;$('room-join').disabled=net.active;
  $('room-reconnect').hidden=net.connected||net.active||!session;
  if(session){const invite=new URL(location.href);invite.hash='room='+session.code;$('invite-link').value=invite.href;}
  const canRematch=net.connected&&state?.phase==='over'&&state.connected.every(Boolean)&&!state.votes[session.team];
  $('restart').disabled=!canRematch;$('restart').textContent='↻ 재대결';
  $('again').disabled=!canRematch;$('again').textContent=state?.votes[session?.team]?'상대 동의 대기 중':'재대결 신청 ↗';
}
$('online-mode').onclick=()=>{if(mode!=='online')requestReset('online');};
$('room-create').onclick=()=>net.begin('create');
$('room-form').onsubmit=e=>{e.preventDefault();const code=$('room-code').value.trim().toUpperCase();if(/^[A-F0-9]{12}$/.test(code))net.begin('join',code);};
$('room-leave').onclick=()=>requestReset('ai');
$('room-reconnect').onclick=()=>{if(net.session)net.restore(net.session);};
$('invite-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('invite-link').value);$('copy-message').textContent='복사했습니다';}catch{$('invite-link').focus();$('invite-link').select();$('copy-message').textContent='링크를 길게 눌러 복사해 주세요';}};
document.addEventListener('visibilitychange',()=>{last=0;cancelDrag();if(!document.hidden&&mode==='online')net.send({type:'sync'});});
reset();resize();requestAnimationFrame(frame);
const invited=new URLSearchParams(location.hash.slice(1)).get('room'),saved=net.saved();
if(saved&&(!invited||invited.toUpperCase()===saved.code)){setMode('online');net.restore(saved);}
else if(invited&&/^[a-fA-F0-9]{12}$/.test(invited)){setMode('online');$('room-code').value=invited.toUpperCase();$('online-panel').scrollIntoView({block:'nearest'});}
