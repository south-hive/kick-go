const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../web/robot-model');
const entry=code=>({name:'로봇',code});
const idle='항상 : 정지';
function run(entries,seed=1){const world=M.create(entries,seed);for(let i=0;i<5401&&world.phase==='running';i++)M.step(world);return world;}
test('rule parser validates budgets, syntax and commands without executing input',()=>{
  const p=M.compile('체력 < 30 : 후진(70), 방어\n항상 : 추적, 전진(70), 공격');
  assert.equal(p.rules.length,2);assert.equal(p.rules[0].actions.move,-70);
  assert.equal(M.count(' 항 상 : 정 지\n'),5);
  for(const bad of ['', '항상:eval(1)', '항상:공격,방어', '항상:전진(101)', '항상:회전(181)', '항상:후진(-1)', '적거리=20:공격','항상:공격,공격','항상:추적,회전(20)','항상:전진(20),정지','a'.repeat(501),idle+' '.repeat(10001)])assert.throws(()=>M.compile(bad));
  assert.throws(()=>M.compile('항상:정지\n적거리<20:쏘기'),/2행/);
  assert.throws(()=>M.compile(Array(33).fill('항상:정지').join('\n')),/32/);
  for(const preset of M.PRESETS)assert.ok(M.compile(preset.code).count<=500);
});
test('first matching rule wins and nonmatching programs stop',()=>{
  const w=M.create([entry('체력>50:정지\n항상:전진(100),공격'),entry('체력<0:공격')]);
  M.step(w);assert.equal(w.bots[0].activeLine,1);assert.equal(w.bots[0].action.move,0);
  assert.equal(w.bots[1].activeLine,0);assert.equal(w.bots[1].shots,0);
});
test('2 to 4 entrants and all seed placements are valid and reproducible',()=>{
  assert.throws(()=>M.create([entry(idle)]));assert.throws(()=>M.create(Array(5).fill(entry(idle))));
  for(let n=2;n<=4;n++)for(let seed=1;seed<=8;seed++){
    const entries=M.PRESETS.slice(0,n),w=M.create(entries,seed);
    assert.deepEqual(w,M.create(entries,seed));
    for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)assert.ok(Math.hypot(w.bots[i].x-w.bots[j].x,w.bots[i].y-w.bots[j].y)>M.RADIUS*2);
  }
});
test('shots hit, shields reduce damage and dead bots cannot shoot',()=>{
  for(const defend of [false,true]){
    const w=M.create([entry('항상:공격'),entry(defend?'항상:방어':idle)]);
    Object.assign(w.bots[0],{x:200,y:400,angle:0,turret:0});Object.assign(w.bots[1],{x:300,y:400,angle:Math.PI,turret:Math.PI});
    for(let i=0;i<15;i++)M.step(w);
    assert.equal(w.bots[1].hp,defend?97:88);assert.equal(w.bots[0].hits,1);assert.equal(w.bots[0].damage,defend?3:12);
    if(defend)assert.ok(w.bots[1].energy<100);
    w.bots[0].hp=0;const shots=w.bots[0].shots;M.step(w);assert.equal(w.bots[0].shots,shots);
  }
});
test('segment collision prevents tunneling and simultaneous knockout is a draw',()=>{
  assert.ok(M.segmentHit(0,0,100,0,{x:50,y:0})!==null);
  assert.equal(M.segmentHit(0,0,100,0,{x:50,y:50}),null);
  const w=M.create([entry(idle),entry(idle)]);w.bots.forEach(b=>b.hp=12);
  w.bullets=w.bots.map((bot,i)=>({owner:1-i,x:bot.x,y:bot.y,vx:0,vy:0,life:1}));
  M.step(w);assert.equal(w.phase,'over');assert.equal(w.winner,null);assert.equal(w.events.length,2);
});
test('shield consumes energy, blocks firing and allows recharge when not defending',()=>{
  const w=M.create([entry('항상:방어'),entry(idle)]);
  for(let i=0;i<60;i++)M.step(w);
  assert.ok(Math.abs(w.bots[0].energy-76)<1e-8);assert.equal(w.bots[0].shots,0);
  w.bots[0].program=M.compile(idle);for(let i=0;i<60;i++)M.step(w);
  assert.ok(Math.abs(w.bots[0].energy-88)<1e-8);
});
test('full battles terminate deterministically, results freeze and edited rules affect outcomes',()=>{
  for(let n=2;n<=4;n++){
    const entries=M.PRESETS.slice(0,n),a=run(entries),b=run(entries);
    assert.equal(a.phase,'over');assert.deepEqual(a,b);
    const before=JSON.stringify(a);M.step(a);assert.equal(JSON.stringify(a),before);
    for(const bot of a.bots)assert.ok(Number.isFinite(bot.x+bot.y+bot.hp+bot.energy));
  }
  const a=run([entry(idle),M.PRESETS[0]]),b=run([M.PRESETS[2],M.PRESETS[0]]);
  assert.notEqual(a.bots[0].damage,b.bots[0].damage);
});
test('inactive matches end from the closing safe zone, and movement stays inside walls',()=>{
  const w=run([entry(idle),entry(idle)]);assert.equal(w.phase,'over');assert.ok(w.ticks/60<=90);assert.equal(w.winner,null);
  const movers=run(Array(4).fill(entry('항상:전진(100),회전(180)')));
  for(const b of movers.bots){assert.ok(b.x>=18&&b.x<=782);assert.ok(b.y>=18&&b.y<=782);}
});
