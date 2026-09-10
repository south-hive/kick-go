(() => {
  'use strict';
  const M = FlightModel, $ = id => document.getElementById(id), canvas = $('flight-canvas'), ctx = canvas.getContext('2d');
  const STORAGE = 'crimson-flight:v1', clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  let saved;
  try { saved = JSON.parse(localStorage.getItem(STORAGE)); } catch { saved = null; }
  const profile = M.profile(saved);
  let run, paused = false, last = 0, accumulator = 0, charge = null, drag = null, sound = false, audio;
  let width = 1, height = 1, lastCollected = 0, lastHit = 0, particles = [], heroPitch = 0;
  const keys = new Set(), fingers = new Set(), diveFingers = new Set();
  const picture = new Image(); picture.src = 'assets/pywel-panorama.png';
  const set = (id, text) => { if ($(id).textContent !== String(text)) $(id).textContent = text; };
  const number = x => Math.floor(x).toLocaleString('ko-KR');
  function save() {
    try { localStorage.setItem(STORAGE, JSON.stringify(profile)); return true; }
    catch { set('flight-save-status', '브라우저 저장이 차단되어 이번 기록은 창을 닫으면 사라집니다.'); return false; }
  }
  $('flight-character').value = profile.character;
  function characterUI() { set('flight-greeting', `${profile.character === 'damian' ? '데미안' : '클리프'}, 오늘은 어디까지 날아오를 수 있을까.`); }
  $('flight-character').onchange = () => {
    profile.character = $('flight-character').value === 'damian' ? 'damian' : 'kliff';
    release(); characterUI(); save();
  };
  characterUI();
  function tone(frequency = 550, duration = .1) {
    if (!sound || !audio) return;
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * .65, audio.currentTime + duration);
    gain.gain.setValueAtTime(.045, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + duration);
  }
  function shop() {
    set('flight-best', number(profile.best)); set('flight-silver', number(profile.silver));
    for (const gear of M.GEAR) {
      const price = M.cost(profile, gear.id), button = $('buy-' + gear.id), level = profile.upgrades[gear.id];
      set('level-' + gear.id, '◆'.repeat(level) + '◇'.repeat(5 - level));
      button.textContent = price === null ? '최대 강화' : '◉ ' + number(price);
      button.disabled = price === null || profile.silver < price || !['ready', 'over'].includes(run.phase);
      button.setAttribute('aria-label', `${gear.name} 강화, ${level}/5단계${price === null ? ', 최대 강화' : ', 은화 ' + price}`);
    }
  }
  for (const gear of M.GEAR) {
    const article = document.createElement('article'); article.className = 'upgrade';
    article.innerHTML = `<span class="upgrade-icon" aria-hidden="true">${gear.icon}</span><div><h3>${gear.name}</h3><p>${gear.text}</p><div class="level" id="level-${gear.id}"></div></div><button id="buy-${gear.id}"></button>`;
    $('flight-upgrades').append(article);
    $('buy-' + gear.id).onclick = () => {
      if (!['ready', 'over'].includes(run.phase) || !M.buy(profile, gear.id)) return;
      const stored = save(); tone(730); if (run.phase === 'ready') run = M.create(profile, 17 + profile.runs * 73);
      shop(); hud();
      if (stored) set('flight-save-status', `${gear.name} ${profile.upgrades[gear.id]}단계 강화 완료 · 다음 비행에 적용됩니다.`);
    };
  }
  $('journey-stops').innerHTML = M.REGIONS.map((r, i) => `<span id="region-${i}">${r.short}<b>${number(r.at)}m</b></span>`).join('') + '<span>여정 완주<b>5,000m</b></span>';
  function release() { keys.clear(); fingers.clear(); diveFingers.clear(); charge = null; drag = null; $('flight-glide').classList.remove('active'); $('flight-dive').classList.remove('active'); }
  function reset() {
    release(); run = M.create(profile, 17 + profile.runs * 73); paused = false; accumulator = 0; last = 0;
    particles = []; heroPitch = 0; lastCollected = 0; lastHit = 0;
    $('flight-result').hidden = true; $('flight-paused').hidden = true;
    $('flight-power-fill').style.width = '85%'; set('flight-power', '85%'); shop(); hud();
  }
  function start(angle = +$('flight-angle').value, power = .85) {
    if (!M.launch(run, angle, power)) return;
    release(); tone(340, .18); shop(); hud(); canvas.focus({ preventScroll: true });
  }
  function propel() { if (!paused && M.boost(run)) { tone(220, .2); burst(run.x - 20, run.y, '#88e4d7', 12); hud(); } }
  function pause(value) {
    if (!['flying', 'sliding'].includes(run.phase)) return;
    paused = value; release(); last = 0; $('flight-paused').hidden = !value; hud();
    if (value) $('flight-resume').focus({ preventScroll: true });
    else canvas.focus({ preventScroll: true });
  }
  function complete() {
    if (!M.settle(profile, run)) return;
    release(); save(); shop();
    set('flight-result-label', run.reason === 'goal' ? 'PYWEL JOURNEY COMPLETE' : run.newBest ? 'A NEW PERSONAL BEST' : 'BACK TO THE CAMP');
    set('flight-result-distance', number(run.x));
    set('flight-result-detail', `${run.reason === 'goal' ? '파이웰의 하늘을 건넜습니다!' : run.newBest ? '새로운 최고 기록을 세웠어요.' : '조금 더 멀리, 다음 바람을 기다리며.'}\n${M.region(run.x).name} · 최고 고도 ${number(run.maxHeight)}m`);
    set('flight-reward', '+' + number(run.reward)); $('flight-result').hidden = false;
    tone(run.newBest ? 840 : 420, .3); $('flight-again').focus({ preventScroll: true });
  }
  function hud() {
    const flying = run.phase === 'flying', active = flying || run.phase === 'sliding';
    set('flight-distance', number(run.x)); set('flight-region', M.region(run.x).name);
    set('flight-altitude', '고도 ' + number(run.y) + 'm · 속도 ' + number(Math.hypot(run.vx, run.vy)) + 'm/s');
    set('flight-stamina-text', `${Math.ceil(run.stamina)} / ${run.maxStamina}`);
    $('flight-stamina-fill').style.width = (run.stamina / run.maxStamina * 100) + '%';
    $('flight-stamina-bar').setAttribute('aria-valuemax', run.maxStamina);
    $('flight-stamina-bar').setAttribute('aria-valuenow', Math.ceil(run.stamina));
    $('flight-stamina-bar').classList.toggle('low', run.stamina / run.maxStamina < .2);
    $('flight-ready').hidden = run.phase !== 'ready'; $('flight-launch').disabled = run.phase !== 'ready';
    $('flight-angle').disabled = run.phase !== 'ready'; $('flight-pause').disabled = !active || paused;
    $('flight-glide').disabled = !flying || paused || run.stamina <= 0;
    $('flight-dive').disabled = !flying || paused;
    $('flight-dive').classList.toggle('active', flying && !paused && diving());
    $('flight-boost').disabled = !flying || paused || run.stamina < 24 || run.cooldown > 0;
    $('flight-glide').classList.toggle('active', run.gliding && !paused);
    const text = paused ? '잠시 쉬는 중' : run.phase === 'ready' ? '도약을 준비하세요' : run.phase === 'over' ? '다음 모험을 준비하세요' :
      run.noticeTime > 0 ? run.notice : run.phase === 'sliding' ? '착지 중…' : diving() ? '급강하 · 기수를 내려 속도를 모으는 중' : run.stamina <= 0 ? '스태미너 소진 · 착지에 대비하세요' : run.stalled ? '속도 부족 · 손을 놓고 하강해 가속하세요' : run.gliding ? (run.vy > 0 ? '상승 중 · 속도를 높이로 바꾸는 중' : '기수 들기 · 누르고 있으면 상승으로 전환') : run.vy < 0 ? '하강 가속 · SPACE를 눌러 상승하세요' : '상승 중 · 다음 하강을 기다리세요';
    set('flight-state', text);
    $('journey-progress').style.width = Math.min(100, Math.max(run.x, profile.best) / M.GOAL * 100) + '%';
    M.REGIONS.forEach((r, i) => $('region-' + i).classList.toggle('active', r.at <= Math.max(run.x, profile.best)));
  }
  function chargedPower(now) { return .35 + .65 * (.5 - Math.cos((now - charge.time) / 650 * Math.PI) * .5); }
  $('flight-launch').addEventListener('pointerdown', e => {
    if (run.phase !== 'ready' || charge) return;
    charge = { id: e.pointerId, time: performance.now() }; e.currentTarget.setPointerCapture(e.pointerId);
  });
  $('flight-launch').addEventListener('pointerup', e => {
    if (!charge || charge.id !== e.pointerId) return;
    const power = performance.now() - charge.time < 140 ? .85 : chargedPower(performance.now());
    charge = null; start(+$('flight-angle').value, power);
  });
  for (const event of ['pointercancel', 'lostpointercapture']) $('flight-launch').addEventListener(event, () => { charge = null; });
  $('flight-launch').onclick = e => { if (e.detail === 0) start(); };
  function diving() { return diveFingers.size > 0 || keys.has('ArrowDown') || keys.has('KeyS'); }
  for (const [id, held] of [['flight-glide', fingers], ['flight-dive', diveFingers]]) {
    $(id).addEventListener('pointerdown', e => {
      if (paused || run.phase !== 'flying' || e.currentTarget.disabled) return;
      held.add(e.pointerId); e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault();
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) $(id).addEventListener(event, e => held.delete(e.pointerId));
  }
  $('flight-boost').onclick = propel; $('flight-pause').onclick = () => pause(true); $('flight-resume').onclick = () => pause(false);
  $('flight-again').onclick = () => { reset(); $('flight-launch').focus({ preventScroll: true }); };
  $('flight-camp').onclick = () => {
    document.querySelector('.camp').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    const next = document.querySelector('.upgrade button:not(:disabled)');
    if (next) next.focus({ preventScroll: true });
  };
  $('flight-angle').oninput = () => set('flight-angle-value', $('flight-angle').value + '°');
  canvas.addEventListener('pointerdown', e => {
    if (run.phase !== 'ready' || drag) return;
    drag = { id: e.pointerId, x: e.offsetX, y: e.offsetY, endX: e.offsetX, endY: e.offsetY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const box = canvas.getBoundingClientRect(); drag.endX = e.clientX - box.left; drag.endY = e.clientY - box.top;
  });
  canvas.addEventListener('pointerup', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = drag.endX - drag.x, dy = drag.y - drag.endY; drag = null;
    if (dx < 10) return;
    const angle = clamp(Math.atan2(dy, dx) * 180 / Math.PI, 15, 75), power = clamp(Math.hypot(dx, dy) / 140, .2, 1);
    $('flight-angle').value = Math.round(angle); $('flight-angle').oninput(); start(angle, power);
  });
  for (const event of ['pointercancel', 'lostpointercapture']) canvas.addEventListener(event, () => { drag = null; });
  window.addEventListener('keydown', e => {
    if (e.target.matches('input,textarea,select')) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyS', 'ShiftLeft', 'ShiftRight', 'Escape'].includes(e.code)) e.preventDefault();
    if (e.code === 'Escape' && !e.repeat) { pause(!paused); return; }
    if (paused) return;
    if (e.code === 'Space' && run.phase === 'ready') { if (!e.repeat) start(); return; }
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) propel();
    keys.add(e.code);
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); last = 0; });
  $('flight-sound').onclick = () => {
    sound = !sound;
    if (sound) {
      try { const Audio = window.AudioContext || window.webkitAudioContext; audio ||= new Audio(); audio.resume().catch(() => {}); }
      catch { sound = false; }
    }
    $('flight-sound').setAttribute('aria-pressed', sound); $('flight-sound').setAttribute('aria-label', sound ? '효과음 끄기' : '효과음 켜기'); tone();
  };
  function resize() {
    const box = canvas.getBoundingClientRect(), ratio = Math.min(devicePixelRatio || 1, 2);
    width = box.width; height = box.height; canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  new ResizeObserver(resize).observe(canvas);
  function burst(x, y, color, count) {
    for (let i = 0; i < count; i++) particles.push({ x, y, vx: (Math.random() - .5) * 60, vy: Math.random() * 45, life: .7, color });
    if (particles.length > 100) particles.splice(0, particles.length - 100);
  }
  function polygon(points, fill, stroke) {
    ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function hero(x, y, now, dt) {
    ctx.save(); ctx.translate(x, y);
    const damian = profile.character === 'damian';
    const flying = run.phase === 'flying', flutter = Math.sin(now / 110) * 4;
    const targetPitch = flying ? -run.pitch : 0;
    heroPitch += (targetPitch - heroPitch) * (1 - Math.exp(-10 * dt));
    ctx.rotate(heroPitch);
    ctx.shadowColor = '#15272280'; ctx.shadowBlur = 7; ctx.shadowOffsetY = 4;
    if (flying) {
      ctx.save(); ctx.scale(1, run.gliding ? 1 : diving() ? .3 : .55);
      polygon([[-2,-8],[-63,-34+flutter],[-48,-3],[-55,-11],[-30,10],[-37,1],[-14,16],[10,3]], '#15252c', '#728582');
      polygon([[5,-9],[26,-43-flutter],[43,-56],[35,-32],[52,-41],[31,-10],[41,-19],[18,12]], '#25353c', '#839090');
      ctx.restore();
    }
    polygon([[-7,-14],[-20,5],[-40,14+flutter],[-22,20],[-10,10],[6,-1]], damian ? '#315c80' : '#823c32', damian ? '#86b7ca' : '#a5664c');
    ctx.shadowColor = 'transparent'; ctx.lineCap = 'round';
    ctx.strokeStyle = '#26302f'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(-3,8); ctx.lineTo(flying ? -17 : -6, flying ? 16 : 26); ctx.lineTo(flying ? -28 : -13, flying ? 15 : 26); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(5,8); ctx.lineTo(flying ? -4 : 8, flying ? 24 : 27); ctx.lineTo(flying ? -15 : 14, flying ? 27 : 27); ctx.stroke();
    polygon([[-8,-15],[9,-13],[13,8],[-6,13]], damian ? '#899ba7' : '#60706d', '#b0b6a2');
    polygon([[-9,-17],[-14,-10],[-3,-6],[7,-12],[12,-10],[10,-19],[2,-22]], '#a2a99a');
    ctx.strokeStyle = '#768078'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(8,-8); ctx.lineTo(flying ? 21 : 15, flying ? -1 : 7); ctx.lineTo(flying ? 27 : 9, flying ? -4 : 11); ctx.stroke();
    ctx.fillStyle = '#c29a79'; ctx.beginPath(); ctx.ellipse(3,-27,7,9,0,0,Math.PI*2); ctx.fill();
    if (damian) polygon([[-3,-32],[-12,-27],[-22,-12+flutter],[-12,-17],[-6,-26]], '#b6a075', '#ddcda1');
    polygon([[-5,-29],[-2,-37],[6,-37],[12,-31],[6,-32],[7,-26],[3,-30]], damian ? '#d6c394' : '#333735');
    if (!damian) polygon([[0,-24],[9,-25],[8,-18],[4,-17]], '#46483d');
    ctx.fillStyle = '#d0b17c'; ctx.fillRect(-7,4,18,3); ctx.fillStyle = '#a47c45'; ctx.fillRect(1,3,4,5);
    ctx.strokeStyle = '#bbc4b3'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-10,-19); ctx.lineTo(-22,19); ctx.stroke();
    ctx.strokeStyle = '#d5b278'; ctx.beginPath(); ctx.moveTo(-17,-8); ctx.lineTo(-7,-4); ctx.stroke();
    if (run.boostTrail > 0) {
      ctx.globalAlpha = run.boostTrail; polygon([[-14,-5],[-92+flutter,6],[-17,11]], '#84e4d4');
    }
    ctx.restore();
  }
  function draw(now, dt) {
    if (!width || !height) return;
    ctx.clearRect(0,0,width,height);
    const zone = M.region(run.x), unit = width < 500 ? .85 : 1.15;
    const ground = height * .88 + Math.max(0, run.y * unit - height * .57);
    const camera = run.x - width * .25 / unit, sx = x => (x - camera) * unit, sy = y => ground - y * unit;
    ctx.fillStyle = zone.sky; ctx.fillRect(0,0,width,height);
    if (picture.complete && picture.naturalWidth) {
      const ratio = Math.max(height / picture.naturalHeight, width / picture.naturalWidth);
      const w = picture.naturalWidth * ratio, h = picture.naturalHeight * ratio;
      ctx.drawImage(picture, -(w-width) * Math.min(run.x/M.GOAL,1), Math.min(0,(height-h)/2), w, h);
    }
    const shade = ctx.createLinearGradient(0,0,0,height); shade.addColorStop(0,'#142e3750'); shade.addColorStop(.5,'#1b352200'); shade.addColorStop(1,'#243d3433'); ctx.fillStyle=shade;ctx.fillRect(0,0,width,height);
    if (run.x >= 4000) { ctx.fillStyle='#23496855';ctx.fillRect(0,0,width,height); }
    // A near layer moves faster than the painted panorama.
    for (let i = Math.floor(camera / 90) - 1; i < Math.ceil((camera + width/unit) / 90) + 1; i++) {
      const x = sx(i*90), top = ground + 6 - Math.sin(i*2.1)*9;
      polygon([[x-1,top],[x+36,top-8],[x+92,top+4],[x+92,height+120],[x-1,height+120]], run.x>2200 ? '#754c3f' : '#3a5140');
      if (run.x < 2200) {
        for (let j=0;j<2;j++) { const px=x+j*36, tall=20+(i*i+j*7)%24; polygon([[px,top],[px+9,top-tall],[px+20,top]],run.x<900?'#435d49':'#809895'); }
      }
    }
    if (run.x < 250) {
      const px=sx(0), py=sy(M.START_HEIGHT)+29;
      polygon([[px-100,py+18],[px-50,py-4],[px+18,py],[px+25,py+13],[px+5,py+80],[px-20,ground+90],[px-100,ground+90]],'#5c6050','#a5a88b');
      polygon([[px-50,py-4],[px+18,py],[px+25,py+13],[px-65,py+9]],'#919875');
    }
    for (const item of run.items) {
      const x=sx(item.x), y=sy(item.y); if(item.taken||x<-35||x>width+35) continue;
      ctx.save();ctx.translate(x,y+Math.sin(now/300+item.x)*3);
      ctx.shadowColor=item.type==='silver'?'#ffe08b':'#8ce9d1';ctx.shadowBlur=14;
      if(item.type==='silver') {ctx.fillStyle='#edc46e';ctx.beginPath();ctx.ellipse(0,0,6,9,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff0a6';ctx.stroke();ctx.fillStyle='#ae7f37';ctx.fillRect(-1,-5,2,10);}
      else if(item.type==='food') {polygon([[-9,-5],[-6,-10],[7,-10],[10,-5],[8,10],[-7,10]],'#bdd18f','#f1e7b0');ctx.strokeStyle='#637445';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-5,-4);ctx.lineTo(5,4);ctx.moveTo(5,-4);ctx.lineTo(-5,4);ctx.stroke();}
      else {ctx.strokeStyle='#b6fff0';ctx.lineWidth=3;for(let k=0;k<3;k++){ctx.beginPath();ctx.arc(0,6-k*8,11-k*2,Math.PI*.12,Math.PI*.9);ctx.stroke();}}
      ctx.restore();
    }
    for(const rock of run.ruins){const x=sx(rock.x),y=sy(rock.y);if(x<-50||x>width+50)continue;
      ctx.save();ctx.translate(x,y+Math.sin(now/700)*3);polygon([[-22,-12],[17,-17],[25,4],[8,27],[-13,17]],'#526361','#b4bba4');polygon([[-22,-12],[0,-24],[17,-17],[3,-5]],'#98a28c');ctx.strokeStyle='#9be0c8';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-3,-12);ctx.lineTo(8,1);ctx.lineTo(-2,12);ctx.stroke();ctx.restore();}
    for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy-=30*dt;ctx.globalAlpha=Math.max(0,p.life/.7);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(sx(p.x),sy(p.y),2,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;particles=particles.filter(p=>p.life>0);
    const px=sx(run.x),py=sy(run.y)-(run.phase==='sliding'?28:0);
    if(run.phase==='ready'){
      const angle=+$('flight-angle').value*Math.PI/180;ctx.strokeStyle='#fff1b9b0';ctx.lineWidth=1.5;ctx.setLineDash([3,7]);ctx.beginPath();ctx.moveTo(px+20,py-15);ctx.quadraticCurveTo(px+80,py-35-Math.sin(angle)*45,px+135,py-25-Math.sin(angle)*60);ctx.stroke();ctx.setLineDash([]);
      if(drag){ctx.strokeStyle='#fff0a2';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(drag.x,drag.y);ctx.lineTo(drag.endX,drag.endY);ctx.stroke();}
    }
    hero(px,py,now,dt);
    if(run.hit>0){ctx.fillStyle=`rgba(173,62,46,${run.hit*.18})`;ctx.fillRect(0,0,width,height);}
    if(run.y*unit>height*.57){ctx.fillStyle='#f2e2bb';ctx.font='10px system-ui';ctx.fillText('↓ 지면 '+number(run.y)+'m',width-78,height-42);}
  }
  function frame(now) {
    const dt = last ? Math.min((now-last)/1000,.05) : 0; last=now;
    if (!paused && !document.hidden) {
      accumulator += dt;
      while(accumulator>=1/120){M.step(run,1/120,{glide:fingers.size>0||keys.has('Space')||keys.has('ArrowUp')||keys.has('KeyW'),dive:diving()});accumulator-=1/120;}
      if(run.collected>lastCollected){burst(run.x,run.y,'#e6d793',9);tone(780);lastCollected=run.collected;}
      if(run.hit>lastHit){burst(run.x,run.y,'#c4b59a',12);tone(130,.18);}lastHit=run.hit;
      if(run.phase==='over') complete();
    }
    if(charge){const p=chargedPower(now);set('flight-power',Math.round(p*100)+'%');$('flight-power-fill').style.width=p*100+'%';}
    draw(now,paused?0:dt);hud();requestAnimationFrame(frame);
  }
  reset(); resize(); requestAnimationFrame(frame);
})();
