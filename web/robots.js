(() => {
  'use strict';
  const M=RobotModel,$=id=>document.getElementById(id),canvas=$('robot-canvas'),ctx=canvas.getContext('2d');
  const STORAGE='code-arena:v1';
  const cleanEntry=(value,i)=>({name:typeof value?.name==='string'?value.name.slice(0,20):`로봇 ${i+1}`,code:typeof value?.code==='string'?value.code.slice(0,10000):M.PRESETS[i%4].code});
  let saved;try{saved=JSON.parse(localStorage.getItem(STORAGE));}catch{}
  const drafts={practice:cleanEntry(saved?.practice,0),slots:Array.from({length:4},(_,i)=>cleanEntry(saved?.slots?.[i],i))};
  let mode='practice',world=null,paused=false,last=0,accumulator=0,lastHUD=0,matchEntries=null,matchSeed=1;
  let editors=[];
  const text=(id,value)=>{if($(id).textContent!==String(value))$(id).textContent=value;};
  const running=()=>world?.phase==='running';
  const entries=()=>mode==='practice'?[drafts.practice]:drafts.slots.slice(0,+$('robot-count').value);
  function save(){try{localStorage.setItem(STORAGE,JSON.stringify(drafts));text('robot-save-status','이 브라우저에 자동 저장됨');}catch{text('robot-save-status','저장 불가 · 코드를 복사해 보관하세요.');}}
  function report(message){text('robot-status',message);}
  function valid(){let ok=true;for(const editor of editors){const code=editor.entry.code;text(editor.count.id,`${M.count(code)} / 500자`);try{const result=M.compile(code);editor.error.textContent=`준비 완료 · ${result.rules.length}개 규칙`;editor.error.style.color='#80d3b7';}catch(e){editor.error.textContent=e.message;editor.error.style.color='#ffb4a2';ok=false;}}$('robot-start').disabled=running()||!ok;return ok;}
  function lock(){const busy=running();for(const node of document.querySelectorAll('.robot-lab input,.robot-lab select,.robot-lab textarea,.robot-lab button'))node.disabled=busy;$('robot-seed').disabled=busy;$('robot-pause').disabled=!busy;$('robot-stop').disabled=!busy;$('robot-start').disabled=busy;$('robot-pause').textContent=paused?'계속 보기':'일시정지';if(!busy)valid();}
  function buildEditors(){
    editors=[];$('robot-editors').replaceChildren();$('builder-slot').replaceChildren();
    entries().forEach((entry,i)=>{
      const card=document.createElement('article');card.className='robot-editor';card.style.setProperty('--bot-color',M.COLORS[i]);
      card.innerHTML=`<div class="editor-top"><label>슬롯 ${i+1} · 이름<input id="robot-name-${i}" maxlength="20" aria-label="슬롯 ${i+1} 로봇 이름"></label><select id="preset-${i}" aria-label="슬롯 ${i+1} 예제"><option value="">예제 불러오기</option>${M.PRESETS.map((p,j)=>`<option value="${j}">${p.name}</option>`).join('')}</select></div><label for="robot-code-${i}" class="code-meta">행동 스크립트<span id="code-count-${i}"></span></label><textarea id="robot-code-${i}" spellcheck="false" maxlength="10000" aria-describedby="code-error-${i}"></textarea><p class="code-error" id="code-error-${i}" role="status"></p>`;
      $('robot-editors').append(card);
      const area=$(`robot-code-${i}`),name=$(`robot-name-${i}`);area.value=entry.code;name.value=entry.name;
      editors.push({entry,area,count:$(`code-count-${i}`),error:$(`code-error-${i}`)});
      name.oninput=()=>{entry.name=name.value;save();};area.oninput=()=>{entry.code=area.value;save();valid();};
      $(`preset-${i}`).onchange=e=>{if(e.target.value==='')return;entry.code=M.PRESETS[+e.target.value].code;area.value=entry.code;e.target.value='';save();valid();};
      const option=document.createElement('option');option.value=i;option.textContent=`슬롯 ${i+1}`;$('builder-slot').append(option);
    });valid();lock();
  }
  function setMode(next){world=null;paused=false;accumulator=0;last=0;mode=next;canvas.dataset.phase='ready';$('practice-tab').setAttribute('aria-pressed',String(mode==='practice'));$('battle-tab').setAttribute('aria-pressed',String(mode==='battle'));$('practice-options').hidden=mode!=='practice';$('battle-options').hidden=mode!=='battle';text('lab-title',mode==='practice'?'내 로봇 만들기':'참가 스크립트 입력');text('arena-title',mode==='practice'?'테스트 아레나':'한 기기 대전');text('robot-start',mode==='practice'?'연습 시작 →':'대전 시작 →');$('arena-empty').hidden=false;$('robot-result').hidden=true;$('robot-live').replaceChildren();$('robot-events').replaceChildren();text('match-clock','90.0s');report('스크립트를 준비하고 시작을 누르세요.');buildEditors();}
  $('practice-tab').onclick=()=>setMode('practice');$('battle-tab').onclick=()=>setMode('battle');$('robot-count').onchange=buildEditors;
  $('builder-add').onclick=()=>{
    const slot=+$('builder-slot').value,editor=editors[slot];if(!editor||running())return;
    for(const id of ['builder-value','builder-speed','builder-angle'])if(!$(id).reportValidity())return;
    const condition=$('builder-sensor').value==='항상'?'항상':`${$('builder-sensor').value} ${$('builder-operator').value} ${$('builder-value').value}`;
    const actions=[];const move=$('builder-move').value,turn=$('builder-turn').value,combat=$('builder-combat').value;
    if(move)actions.push(move==='정지'?move:`${move}(${$('builder-speed').value})`);
    if(turn)actions.push(turn==='추적'?turn:`회전(${$('builder-angle').value})`);if(combat)actions.push(combat);
    if(!actions.length){report('행동을 하나 이상 선택하세요.');return;}
    const code=`${condition} : ${actions.join(', ')}\n${editor.entry.code}`;
    try{M.compile(code);editor.entry.code=code;editor.area.value=code;save();valid();report('새 규칙을 맨 위에 추가했습니다.');}catch(error){report(error.message);}
  };
  function start(repeat=false){
    if(running())return;
    if(!repeat){if(!valid()||!$('robot-seed').reportValidity())return;matchSeed=+$('robot-seed').value;matchEntries=mode==='practice'?[{...drafts.practice},{name:`연습 · ${M.PRESETS[+$('practice-opponent').value].name}`,code:M.PRESETS[+$('practice-opponent').value].code}]:entries().map(e=>({...e}));}
    if(!matchEntries)return;
    try{world=M.create(matchEntries,matchSeed);}catch(error){report(error.message);return;}
    paused=false;accumulator=0;last=0;lastHUD=0;canvas.dataset.phase='running';$('arena-empty').hidden=true;$('robot-result').hidden=true;$('robot-events').replaceChildren();$('robot-live').replaceChildren();
    for(const bot of world.bots){const row=document.createElement('div');row.id=`live-${bot.id}`;row.className='live-bot';row.style.setProperty('--bot-color',bot.color);row.innerHTML=`<b></b><span class="live-stats"></span><div class="meters"><meter min="0" max="100" value="100" aria-label="체력"></meter><meter min="0" max="100" value="100" aria-label="에너지"></meter></div><code></code>`;row.querySelector('b').textContent=`${bot.id+1}. ${bot.name}`;$('robot-live').append(row);}
    lock();report('전투 중 · 규칙은 잠겼습니다. 실행 중인 행을 아래에서 확인하세요.');hud();
    canvas.scrollIntoView({block:'nearest',behavior:'instant'});
  }
  $('robot-start').onclick=()=>start();$('robot-rematch').onclick=()=>start(true);
  function pause(){if(!running())return;paused=!paused;last=0;lock();report(paused?'일시정지 · 실행 규칙과 체력·에너지를 살펴보세요.':'전투를 계속합니다.');}
  $('robot-pause').onclick=pause;
  $('robot-stop').onclick=()=>{if(!world)return;world.phase='stopped';paused=false;accumulator=0;canvas.dataset.phase='stopped';lock();report('중단했습니다. 규칙을 고친 뒤 같은 배치로 다시 시험해 보세요.');};
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running()&&!paused)pause();last=0;});
  window.addEventListener('keydown',e=>{if(e.code==='Escape'&&!e.repeat){e.preventDefault();pause();}});
  function hud(){
    if(!world)return;text('match-clock',`${Math.max(0,M.DURATION-world.ticks*M.DT).toFixed(1)}s`);
    for(const bot of world.bots){const row=$(`live-${bot.id}`);if(!row)continue;row.classList.toggle('dead',bot.hp<=0);row.querySelector('.live-stats').textContent=`HP ${Math.ceil(bot.hp)} · EN ${Math.floor(bot.energy)}${bot.shield?' · 방어':''}`;const meters=row.querySelectorAll('meter');meters[0].value=bot.hp;meters[1].value=bot.energy;row.querySelector('code').textContent=bot.hp<=0?'탈락':bot.activeLine?`${bot.activeLine}행 ▶ ${bot.program.rules.find(r=>r.line===bot.activeLine).text}`:'맞는 규칙 없음 · 정지';}
    if($('robot-events').children.length!==world.events.length){$('robot-events').replaceChildren();for(const event of world.events){const li=document.createElement('li');li.textContent=event;$('robot-events').append(li);}}
  }
  function finish(){canvas.dataset.phase='over';lock();hud();$('robot-result').hidden=false;text('robot-winner',world.winner===null?'무승부':`${world.bots[world.winner].name} 승리`);text('robot-result-reason',world.reason==='timeout'?'90초 종료 · 남은 체력, 준 피해 순으로 판정했습니다.':'마지막 생존 로봇으로 판정했습니다. 동시 전멸은 무승부입니다.');$('robot-result-rows').replaceChildren();for(const bot of world.bots){const row=document.createElement('tr');for(const value of [bot.name,Math.ceil(bot.hp),Math.round(bot.damage),`${bot.shots?Math.round(bot.hits/bot.shots*100):0}%`,`${bot.survival.toFixed(1)}s`]){const td=document.createElement('td');td.textContent=value;row.append(td);}$('robot-result-rows').append(row);}report('경기 종료 · 규칙을 수정하거나 같은 조건으로 재대결하세요.');}
  function draw(){
    ctx.clearRect(0,0,800,800);ctx.fillStyle='#0c1c27';ctx.fillRect(0,0,800,800);
    ctx.strokeStyle='#73b2b414';ctx.lineWidth=1;for(let p=0;p<=800;p+=40){ctx.beginPath();ctx.moveTo(p,0);ctx.lineTo(p,800);ctx.moveTo(0,p);ctx.lineTo(800,p);ctx.stroke();}
    ctx.strokeStyle='#69979866';ctx.lineWidth=3;ctx.strokeRect(7,7,786,786);
    ctx.strokeStyle='#72b8b42a';ctx.beginPath();ctx.arc(400,400,120,0,Math.PI*2);ctx.moveTo(375,400);ctx.lineTo(425,400);ctx.moveTo(400,375);ctx.lineTo(400,425);ctx.stroke();
    if(!world)return;
    if(world.ticks*M.DT>45){ctx.save();ctx.beginPath();ctx.rect(0,0,800,800);ctx.arc(400,400,world.safeRadius,0,Math.PI*2,true);ctx.fillStyle='#e1744b24';ctx.fill('evenodd');ctx.beginPath();ctx.arc(400,400,world.safeRadius,0,Math.PI*2);ctx.strokeStyle='#ff9d60';ctx.lineWidth=3;ctx.setLineDash([9,7]);ctx.stroke();ctx.restore();}
    for(const bullet of world.bullets){ctx.strokeStyle=world.bots[bullet.owner].color;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(bullet.x-bullet.vx*.025,bullet.y-bullet.vy*.025);ctx.lineTo(bullet.x,bullet.y);ctx.stroke();ctx.fillStyle='#fff6d5';ctx.beginPath();ctx.arc(bullet.x,bullet.y,3,0,Math.PI*2);ctx.fill();}
    for(const bot of world.bots){ctx.save();ctx.translate(bot.x,bot.y);if(bot.hp<=0){ctx.strokeStyle='#82929366';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-12,-12);ctx.lineTo(12,12);ctx.moveTo(-12,12);ctx.lineTo(12,-12);ctx.stroke();ctx.restore();continue;}
      if(bot.shield){ctx.fillStyle=bot.color+'22';ctx.strokeStyle=bot.color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,29,0,Math.PI*2);ctx.fill();ctx.stroke();}
      ctx.save();ctx.rotate(bot.angle);ctx.fillStyle='#080f15';ctx.fillRect(-20,-21,40,10);ctx.fillRect(-20,11,40,10);ctx.strokeStyle='#50666c';ctx.lineWidth=2;for(let x=-16;x<20;x+=8){ctx.beginPath();ctx.moveTo(x,-21);ctx.lineTo(x,-11);ctx.moveTo(x,11);ctx.lineTo(x,21);ctx.stroke();}ctx.fillStyle=bot.color;ctx.beginPath();ctx.roundRect(-18,-13,36,26,5);ctx.fill();ctx.fillStyle='#132b35';ctx.fillRect(-11,-9,15,18);ctx.restore();
      ctx.save();ctx.rotate(bot.turret);ctx.fillStyle='#b6d5d0';ctx.fillRect(0,-4,29,8);ctx.fillStyle=bot.color;ctx.beginPath();ctx.arc(0,0,10,0,Math.PI*2);ctx.fill();ctx.fillStyle='#172e37';ctx.beginPath();ctx.arc(0,0,4,0,Math.PI*2);ctx.fill();ctx.restore();
      ctx.fillStyle='#081820';ctx.fillRect(-24,-38,48,5);ctx.fillStyle=bot.color;ctx.fillRect(-24,-38,48*bot.hp/100,5);ctx.font='bold 13px system-ui';ctx.textAlign='center';ctx.fillStyle='#e0efe9';ctx.fillText(`${bot.id+1} · ${bot.name.slice(0,9)}`,0,43);ctx.restore();}
    if(paused){ctx.fillStyle='#08182066';ctx.fillRect(0,0,800,800);ctx.fillStyle='#ddf4ea';ctx.font='bold 28px system-ui';ctx.textAlign='center';ctx.fillText('Ⅱ 일시정지',400,400);}
  }
  function frame(now){const delta=last?Math.min((now-last)/1000,.1):0;last=now;if(running()&&!paused&&!document.hidden){accumulator+=delta*+$('robot-speed').value;let steps=0;while(accumulator>=M.DT&&running()&&steps++<30){M.step(world);accumulator-=M.DT;}if(world.phase==='over')finish();}if(now-lastHUD>100){hud();lastHUD=now;}draw();requestAnimationFrame(frame);}
  setMode('practice');requestAnimationFrame(frame);
})();
