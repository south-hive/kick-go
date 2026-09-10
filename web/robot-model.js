(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RobotModel = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const SIZE = 800, RADIUS = 18, DT = 1 / 60, LIMIT = 500, DURATION = 90;
  const COLORS = ['#68dfc8', '#ffb36e', '#a9a1ff', '#ef8cb7'];
  const PRESETS = [
    { name: '추격자', code: '벽거리 < 45 : 후진(70), 회전(120), 공격\n적거리 > 230 : 추적, 전진(75), 공격\n항상 : 회전(35), 전진(30), 공격' },
    { name: '회피자', code: '탄환거리 < 100 : 방어, 전진(100), 회전(100)\n벽거리 < 50 : 후진(80), 회전(130)\n항상 : 추적, 전진(50), 공격' },
    { name: '수비수', code: '탄환거리 < 90 : 방어, 후진(60)\n적거리 < 180 : 후진(80), 공격\n항상 : 추적, 전진(35), 공격' },
    { name: '회전포', code: '벽거리 < 50 : 후진(90), 회전(150), 공격\n항상 : 전진(70), 회전(55), 공격' },
  ];
  const SENSORS = ['체력', '에너지', '적거리', '적각도', '벽거리', '탄환거리', '시간'];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const norm = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
  const count = source => [...String(source).normalize('NFC').replace(/\s/g, '')].length;
  function compile(source) {
    if (typeof source !== 'string' || source.length > 10000) throw Error('스크립트는 10,000자 이하의 텍스트여야 합니다.');
    source = source.normalize('NFC');
    if (count(source) > LIMIT) throw Error(`공백·줄바꿈 제외 ${LIMIT}자를 초과했습니다.`);
    const rules = [];
    for (const [index, raw] of source.split(/\r?\n/).entries()) {
      const line = raw.replace(/\s/g, '');
      if (!line) continue;
      const fail = message => { throw Error(`${index + 1}행: ${message}`); };
      const pieces = line.split(':');
      if (pieces.length !== 2) fail('조건 : 행동 형식으로 입력하세요.');
      const [condition, body] = pieces;
      let sensor = null, operator = null, value = 0;
      if (condition !== '항상') {
        const match = condition.match(/^(체력|에너지|적거리|적각도|벽거리|탄환거리|시간)(<=|>=|==|!=|<|>)(-?\d+(?:\.\d+)?)$/);
        if (!match) fail('알 수 없는 조건입니다. 예: 적거리 < 200');
        [, sensor, operator] = match; value = Number(match[3]);
        if (!Number.isFinite(value) || Math.abs(value) > 10000) fail('조건 값은 -10000~10000입니다.');
      }
      const actions = { move: 0, turn: 0, track: false, fire: false, defend: false };
      const seen = new Set();
      for (const token of body.split(',')) {
        let key;
        const argument = token.match(/^(전진|후진|회전)\((-?\d+(?:\.\d+)?)\)$/);
        if (argument) {
          const n = Number(argument[2]); key = argument[1] === '회전' ? 'turn' : 'move';
          if (!Number.isFinite(n) || (key === 'turn' ? Math.abs(n) > 180 : n < 0 || n > 100)) fail('이동은 0~100, 회전은 -180~180입니다.');
          if (key === 'turn') actions.turn = n;
          else actions.move = n * (argument[1] === '후진' ? -1 : 1);
        } else if (token === '추적') { key = 'turn'; actions.track = true; }
        else if (token === '정지') { key = 'move'; actions.move = 0; }
        else if (token === '공격') { key = 'fire'; actions.fire = true; }
        else if (token === '방어') { key = 'defend'; actions.defend = true; }
        else fail(`알 수 없는 행동: ${token || '(빈 행동)'}`);
        if (seen.has(key)) fail('같은 종류의 행동은 한 줄에 한 번만 사용하세요.');
        seen.add(key);
      }
      if (actions.fire && actions.defend) fail('공격과 방어는 같은 줄에 사용할 수 없습니다.');
      rules.push({ line: index + 1, text: raw.trim(), sensor, operator, value, actions });
      if (rules.length > 32) fail('최대 32개 규칙을 사용할 수 있습니다.');
    }
    if (!rules.length) throw Error('규칙을 한 줄 이상 입력하세요.');
    return { source, rules, count: count(source) };
  }
  function matches(rule, values) {
    if (!rule.sensor) return true;
    const a = values[rule.sensor], b = rule.value;
    switch (rule.operator) {
      case '<': return a < b; case '>': return a > b;
      case '<=': return a <= b; case '>=': return a >= b;
      case '==': return a === b; case '!=': return a !== b;
      default: return false;
    }
  }
  function sensors(world, bot) {
    let enemy = null, distance = Infinity;
    for (const other of world.bots) {
      if (other.id === bot.id || other.hp <= 0) continue;
      const d = Math.hypot(other.x - bot.x, other.y - bot.y);
      if (d < distance) { distance = d; enemy = other; }
    }
    const bulletDistance = world.bullets.reduce((best, b) => b.owner === bot.id ? best : Math.min(best, Math.hypot(b.x - bot.x, b.y - bot.y)), 9999);
    return { enemy, values: { '체력': bot.hp, '에너지': bot.energy, '적거리': enemy ? distance : 9999,
      '적각도': enemy ? norm(Math.atan2(enemy.y-bot.y, enemy.x-bot.x)-bot.angle)*180/Math.PI : 0,
      '벽거리': Math.min(bot.x, bot.y, SIZE-bot.x, SIZE-bot.y)-RADIUS,
      '탄환거리': bulletDistance, '시간': world.ticks*DT } };
  }
  function create(entries, seed = 1) {
    if (!Array.isArray(entries) || entries.length < 2 || entries.length > 4) throw Error('로봇은 2~4대가 필요합니다.');
    const programs = entries.map(e => compile(e.code));
    let randomState = (Number(seed) >>> 0) || 1;
    const random = () => ((randomState = (Math.imul(randomState, 1664525)+1013904223)>>>0)/4294967296);
    const positions = entries.map((_, i) => i);
    for (let i=positions.length-1;i>0;i--) { const j=Math.floor(random()*(i+1)); [positions[i],positions[j]]=[positions[j],positions[i]]; }
    return { ticks: 0, phase: 'running', seed: (Number(seed)>>>0)||1, bullets: [], events: [], winner: null, reason: '', safeRadius: 570,
      bots: entries.map((entry,i) => {
        const angle = positions[i]*Math.PI*2/entries.length-Math.PI/2;
        return { id:i, name:String(entry.name || `로봇 ${i+1}`).slice(0,20), color:COLORS[i], program:programs[i],
          x:400+Math.cos(angle)*275, y:400+Math.sin(angle)*275, angle:angle+Math.PI, turret:angle+Math.PI,
          hp:100, energy:100, cooldown:0, shield:false, damage:0, hits:0, shots:0, survival:0,
          activeLine:0, action:{move:0,turn:0,track:false,fire:false,defend:false}, fallenAt:null };
      }) };
  }
  // Earliest segment-circle hit prevents fast projectiles tunnelling through robots.
  function segmentHit(x, y, nx, ny, bot) {
    const dx=nx-x, dy=ny-y, ox=x-bot.x, oy=y-bot.y;
    const a=dx*dx+dy*dy, c=ox*ox+oy*oy-(RADIUS+3)**2;
    if (c<=0) return 0;
    if (!a) return null;
    const b=2*(ox*dx+oy*dy), d=b*b-4*a*c;
    if (d<0) return null;
    const t=(-b-Math.sqrt(d))/(2*a);
    return t>=0&&t<=1?t:null;
  }
  function step(world) {
    if (world.phase !== 'running') return;
    const alive = world.bots.filter(b => b.hp>0);
    const snapshot = alive.map(bot => { const sensed=sensors(world,bot); return { bot, ...sensed, target:sensed.enemy?Math.atan2(sensed.enemy.y-bot.y,sensed.enemy.x-bot.x):bot.angle }; });
    // All bots decide from the same pre-movement state, 10 times a second.
    for (const {bot,values} of snapshot) if (world.ticks%6===0) {
      const rule=bot.program.rules.find(r=>matches(r,values));
      bot.activeLine=rule?.line||0;
      bot.action=rule?{...rule.actions}:{move:0,turn:0,track:false,fire:false,defend:false};
    }
    for (const {bot,enemy,target} of snapshot) {
      const a=bot.action;
      bot.angle=norm(bot.angle+(a.track?clamp(norm(target-bot.angle),-Math.PI*DT,Math.PI*DT):a.turn*Math.PI/180*DT));
      bot.turret=norm(bot.turret+clamp(norm(target-bot.turret),-6*DT,6*DT));
      bot.x=clamp(bot.x+Math.cos(bot.angle)*a.move*1.2*DT,RADIUS,SIZE-RADIUS);
      bot.y=clamp(bot.y+Math.sin(bot.angle)*a.move*1.2*DT,RADIUS,SIZE-RADIUS);
      bot.cooldown=Math.max(0,bot.cooldown-DT);
      bot.shield=a.defend&&bot.energy>=24*DT;
      bot.energy=clamp(bot.energy+(bot.shield?-24:12)*DT,0,100);
      if(a.fire&&!a.defend&&enemy&&bot.cooldown<=0&&bot.energy>=8&&Math.abs(norm(target-bot.turret))<.14) {
        bot.energy-=8; bot.cooldown=.55; bot.shots++;
        const dx=Math.cos(bot.turret),dy=Math.sin(bot.turret);
        world.bullets.push({owner:bot.id,x:bot.x+dx*23,y:bot.y+dy*23,vx:dx*430,vy:dy*430,life:2.5});
      }
      bot.survival=(world.ticks+1)*DT;
    }
    for(let i=0;i<alive.length;i++) for(let j=i+1;j<alive.length;j++) {
      const a=alive[i],b=alive[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
      if(d>=RADIUS*2)continue;
      const ux=d?dx/d:1,uy=d?dy/d:0,push=(RADIUS*2-d)/2;
      a.x=clamp(a.x-ux*push,RADIUS,SIZE-RADIUS);a.y=clamp(a.y-uy*push,RADIUS,SIZE-RADIUS);
      b.x=clamp(b.x+ux*push,RADIUS,SIZE-RADIUS);b.y=clamp(b.y+uy*push,RADIUS,SIZE-RADIUS);
    }
    const damage=new Map(alive.map(b=>[b.id,0]));
    world.bullets=world.bullets.filter(shot=>{
      const nx=shot.x+shot.vx*DT,ny=shot.y+shot.vy*DT;
      let hit=null,earliest=Infinity;
      for(const bot of alive) {
        if(bot.id===shot.owner)continue;
        const t=segmentHit(shot.x,shot.y,nx,ny,bot);
        if(t!==null&&t<earliest){earliest=t;hit=bot;}
      }
      if(hit){const amount=hit.shield?3:12;damage.set(hit.id,damage.get(hit.id)+amount);world.bots[shot.owner].damage+=amount;world.bots[shot.owner].hits++;return false;}
      shot.x=nx;shot.y=ny;shot.life-=DT;
      return shot.life>0&&nx>=0&&ny>=0&&nx<=SIZE&&ny<=SIZE;
    });
    world.ticks++;
    const seconds=world.ticks*DT;
    world.safeRadius=seconds<=45?570:570-(seconds-45)/45*490;
    for(const bot of alive) {
      const storm=Math.hypot(bot.x-400,bot.y-400)>world.safeRadius?20*DT:0;
      bot.hp=Math.max(0,bot.hp-damage.get(bot.id)-storm);
      if(bot.hp===0){bot.fallenAt=seconds;bot.shield=false;world.events.push(`${seconds.toFixed(1)}초 · ${bot.name} 탈락`);}
    }
    const survivors=world.bots.filter(b=>b.hp>0);
    if(survivors.length<=1||world.ticks>=DURATION*60) {
      world.phase='over';world.reason=survivors.length<=1?'survival':'timeout';
      if(survivors.length===1)world.winner=survivors[0].id;
      else if(survivors.length>1){const ranked=[...survivors].sort((a,b)=>b.hp-a.hp||b.damage-a.damage);if(Math.abs(ranked[0].hp-ranked[1].hp)>1e-6||ranked[0].damage!==ranked[1].damage)world.winner=ranked[0].id;}
    }
  }
  return { SIZE, RADIUS, DT, LIMIT, DURATION, COLORS, PRESETS, SENSORS, count, compile, matches, sensors, create, step, segmentHit };
});
