'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const P=require('../web/physics');
const Rules=require('../web/rules');
const Shots=require('../web/shot-engine');
const {Room}=require('../multiplayer');
const copy=value=>JSON.parse(JSON.stringify(value));
const shot={stone:0,vx:180,vy:-980,side:0,follow:0};
function room(ruleset='modern'){
  const r=new Room('ABCDEF123456',Date.now(),0,ruleset);
  for(const t of [0,1])r.seat(t,{readyState:1});
  if(ruleset==='modern')for(const t of [0,1])r.selectIron(t,{stone:t*5+4,match:r.match});
  return r;
}
function fire(r,extra={}){r.shot(r.turn,{...shot,...extra,revision:r.revision,match:r.match});}

test('only classic and modern are released; invalid rule sets cannot create rooms',()=>{
  assert.deepEqual(Object.keys(Rules.sets),['classic','modern']);
  for(const id of ['avant-garde','__proto__','constructor','',null])assert.throws(()=>room(id),/INVALID_RULESET/);
  assert.equal(room().ruleset,'modern');
});
for(const ruleset of ['classic','modern'])test(`${ruleset}: precomputed frames match independent live physics and playback does not simulate again`,()=>{
  const initial=P.setup();if(ruleset==='modern')initial[8].iron=true;
  const untouched=copy(initial),record=Shots.plan(initial,shot,{ruleset,id:'test'}),live=copy(initial);
  assert.deepEqual(initial,untouched);assert.ok(Object.isFrozen(record.frames[0][0]));
  if(ruleset==='classic')live.forEach(s=>s.iron=false);
  P.shoot(live[0],shot.vx,shot.vy,0,0);
  assert.deepEqual(live,record.frames[0]);
  for(let i=1;i<record.frames.length;i++){P.step(live,Shots.DT,()=>{},()=>{},()=>{},Rules.get(ruleset));assert.deepEqual(live,record.frames[i]);}
  const output=copy(initial),events=[],playback=new Shots.Playback(record,output,e=>events.push(e));
  const step=P.step;P.step=()=>{throw Error('Playback must not recompute physics');};
  try{playback.advance(record.duration/3);playback.advance(record.duration);playback.advance(1);}finally{P.step=step;}
  assert.deepEqual(output,record.frames.at(-1));assert.deepEqual(events,record.events);assert.equal(playback.done,true);
  output[0].x=0;assert.notEqual(record.frames.at(-1)[0].x,0);
});

test('classic starts immediately, rejects disabled abilities, and preserves rules through rematch',()=>{
  const r=room('classic');assert.equal(r.phase,'aim');assert.deepEqual(r.guideRemaining,[0,0]);
  assert.throws(()=>r.selectIron(0,{stone:0,match:1}),/RULE_DISABLED/);
  assert.throws(()=>r.armGuide(0,{match:1,revision:r.revision}),/RULE_DISABLED/);
  assert.throws(()=>fire(r,{side:.5}),/RULE_DISABLED/);assert.equal(r.lastShot,null);assert.equal(r.phase,'aim');
  fire(r);assert.ok(r.lastShot.result);assert.equal(r.snapshot(0).ruleset,'classic');
  while(r.phase==='moving')r.step(1/60);
  assert.deepEqual(r.stones,r.lastShot.frames.at(-1));
  r.phase='over';r.rematch(0,{match:1});r.rematch(1,{match:1});
  assert.equal(r.phase,'aim');assert.equal(r.ruleset,'classic');assert.equal(r.firstPlayer,1);assert.equal(r.lastShot,null);assert.deepEqual(r.guideRemaining,[0,0]);
});

test('guided shots are planned before the cue but reveal no future events or secret state',()=>{
  const r=room(),before=copy(r.stones);r.armGuide(0,{match:1,revision:r.revision});
  fire(r,{stone:4,vx:100,vy:0});
  assert.ok(r.lastShot.result);assert.deepEqual(r.stones,before);assert.equal(r.playback.started,false);
  for(const viewer of [0,1,null]){
    const state=r.snapshot(viewer);assert.equal(state.shotPlayback.result,null);assert.deepEqual(state.shotPlayback.events.map(e=>e.type),['guide:used']);
    assert.ok(state.shotPlayback.events.every(e=>e.tick<0));
    for(const key of ['frames','shot','duration','lastShot'])assert.equal(key in state.shotPlayback,false);
  }
  r.step(1.35);assert.equal(r.playback.started,true);assert.equal(r.stones[4].iron,false);
  assert.ok(r.snapshot(0).shotPlayback.events.some(e=>e.type==='protection:spent'));
  assert.ok(!r.snapshot(1).shotPlayback.events.some(e=>e.type==='protection:spent'));
  assert.ok(r.snapshot(null).shotPlayback.events.some(e=>e.type==='protection:spent'));
  while(r.phase==='moving')r.step(1/60);
  assert.deepEqual(r.snapshot(1).shotPlayback.result,r.lastShot.result);
});

test('fall, self-knockout and match result events carry positions and occur in playback order',()=>{
  const stones=[{id:0,team:0,x:1105,y:400,vx:0,vy:0,alive:true},{id:5,team:1,x:400,y:400,vx:0,vy:0,alive:true}];
  const record=Shots.plan(stones,{stone:0,vx:100,vy:0},{ruleset:'classic'});
  assert.equal(record.result.winner,1);assert.equal(record.result.shooterFell,true);
  const fall=record.events.find(e=>e.type==='stone:fall');assert.equal(fall.stone,0);assert.ok(fall.x>P.SIZE-P.EDGE);
  assert.deepEqual(record.events.slice(-3).map(e=>e.type),['shot:self-knockout','shot:end','match:end']);
  assert.ok(record.events.every((e,i)=>e.sequence===i&&(!i||e.tick>=record.events[i-1].tick)));
});

test('effect failures cannot interrupt playback; remote events deduplicate and resume without replay',()=>{
  const errors=[],seen=[],hooks=new Shots.Hooks(e=>errors.push(e.message));
  const off=hooks.on('impact',()=>{throw Error('bad effect');});hooks.on('*',(_,type)=>seen.push(type));
  hooks.emit('impact',{});off();hooks.emit('impact',{});assert.deepEqual(errors,['bad effect']);assert.equal(seen.length,2);
  const remote=new Shots.RemoteEvents(hooks),event=(sequence,type)=>({sequence,type});
  remote.receive(null);remote.receive({id:'1',events:[event(0,'shot:start'),event(1,'impact')]});
  remote.receive({id:'1',events:[event(0,'shot:start'),event(1,'impact'),event(3,'shot:end')]});
  assert.deepEqual(seen.slice(2),['shot:start','impact','shot:end']);
  remote.reset();remote.receive({id:'1',events:[event(0,'shot:start'),event(1,'impact')]});
  assert.equal(seen.at(-1),'shot:resume');
  remote.receive({id:'1',events:[event(0,'shot:start'),event(1,'impact'),event(3,'shot:end')]});assert.equal(seen.at(-1),'shot:end');
});

test('a two-stone knockout is known before launch and presented once at shot end',()=>{
  const stones=[{id:0,team:0,x:990,y:410,vx:0,vy:0,alive:true},{id:5,team:1,x:1070,y:390,vx:0,vy:0,alive:true},{id:6,team:1,x:1070,y:430,vx:0,vy:0,alive:true}];
  const record=Shots.plan(stones,{stone:0,vx:1300,vy:0},{ruleset:'classic'});
  assert.equal(record.result.enemyRemoved,2);assert.equal(record.result.winner,0);assert.ok(stones.every(s=>s.alive));
  const seen=[],playback=new Shots.Playback(record,copy(stones),event=>seen.push(event));
  playback.start();assert.ok(!seen.some(e=>e.type==='shot:multi-knockout'));
  playback.advance(record.duration);playback.advance(1);
  assert.equal(seen.filter(e=>e.type==='shot:multi-knockout').length,1);
  assert.equal(seen.filter(e=>e.type==='stone:fall').length,2);
});

test('clean miss requires the fired stone to leave without touching any stone or hinge',()=>{
  const make=(id,team,x,y,iron=false)=>({id,team,x,y,iron,vx:0,vy:0,alive:true});
  const direct=Shots.plan([make(0,0,1105,400),make(5,1,400,400)],{stone:0,vx:100,vy:0});
  assert.equal(direct.events.filter(e=>e.type==='shot:clean-miss').length,1);
  assert.equal(direct.events.find(e=>e.type==='shot:clean-miss').tick,direct.events.find(e=>e.type==='stone:fall').tick);
  for(const [stones,shot] of [
    [[make(0,0,400,400),make(5,1,600,400,true)],{stone:0,vx:1300,vy:0}],
    [[make(0,0,220,650),make(5,1,800,400)],{stone:0,vx:0,vy:-1300}],
    // Positional separation can push a slow stone off the edge after its speed reaches zero.
    [[make(0,0,86.001,400),make(5,1,122.002,400)],{stone:0,vx:1,vy:0}],
  ]){
    const record=Shots.plan(stones,shot);assert.equal(record.result.shooterFell,true);
    assert.ok(!record.events.some(e=>e.type==='shot:clean-miss'));
  }
  const stopped=Shots.plan([make(0,0,400,400),make(5,1,800,400)],{stone:0,vx:10,vy:0});
  assert.ok(!stopped.events.some(e=>e.type==='shot:clean-miss'));
});

for(const protectedShooter of [false,true])test(`iron event distinguishes ${protectedShooter?'a protected launch':'an ordinary attacker'} at the actual contact`,()=>{
  const stones=[{id:0,team:0,x:400,y:400,vx:0,vy:0,alive:true,iron:protectedShooter},{id:5,team:1,x:600,y:400,vx:0,vy:0,alive:true,iron:true}];
  const record=Shots.plan(stones,{stone:0,vx:700,vy:0}),event=record.events.find(e=>e.type.startsWith('iron:'));
  assert.equal(event.type,protectedShooter?'iron:clash':'iron:hit');assert.equal(event.attacker,0);assert.equal(event.defender,5);
  assert.equal(event.actorTeam,0);assert.equal(event.targetTeam,1);assert.ok(event.tick>0);
  assert.equal(record.frames[0][0].iron,false);assert.equal(record.frames[event.tick][1].iron,false);
  const playback=new Shots.Playback(record,copy(stones));playback.start();
  for(const viewer of [0,1,null])assert.ok(!playback.snapshot(viewer).events.some(e=>e.type.startsWith('iron:')));
  playback.advance(event.time);
  for(const viewer of [0,1,null])assert.equal(playback.snapshot(viewer).events.filter(e=>e.type.startsWith('iron:')).length,1);
  const classic=Shots.plan(stones,{stone:0,vx:700,vy:0},{ruleset:'classic'});
  assert.ok(!classic.events.some(e=>e.type.startsWith('iron:')));
});

test('guide hook occurs once before motion and resumes with remaining time without replay',()=>{
  const record=Shots.plan(P.setup(),shot,{guideName:'안내 테스트',id:'guided'}),seen=[],stones=P.setup();
  const playback=new Shots.Playback(record,stones,event=>seen.push(event));
  playback.prepare();playback.prepare();
  assert.deepEqual(seen.map(e=>e.type),['guide:used']);assert.ok(stones.every(s=>s.vx===0&&s.vy===0));
  const hooks=new Shots.Hooks(),received=[];hooks.on('*',(event,type)=>received.push({type,event}));
  const remote=new Shots.RemoteEvents(hooks);remote.receive(null);
  const snapshot=playback.snapshot(0,{...record.cue,remaining:.6});remote.receive(snapshot);remote.receive(snapshot);
  assert.equal(received.length,1);assert.equal(received[0].event.remaining,.6);
  remote.reset();remote.receive(snapshot);assert.equal(received.at(-1).type,'shot:resume');assert.equal(received.at(-1).event.cue.remaining,.6);
  playback.start();playback.start();assert.equal(seen.filter(e=>e.type==='guide:used').length,1);
  assert.equal(seen.filter(e=>e.type==='shot:start').length,1);
  assert.throws(()=>Shots.plan(P.setup(),shot,{ruleset:'classic',guideName:'안내'}),/RULE_DISABLED/);
});

test('combo hooks count opponent falls in time order, ignore own falls and reset on the next shot',()=>{
  const make=()=>[[0,0,930,400],[5,1,1072,347],[6,1,1038,427],[7,1,1083,442]].map(([id,team,x,y])=>({id,team,x,y,vx:0,vy:0,alive:true}));
  for(const id of ['first-shot','next-shot']){
    const board=make(),record=Shots.plan(board,{stone:0,vx:1360,vy:0},{ruleset:'classic',id});
    const combos=record.events.filter(e=>e.type==='shot:combo-hit');
    assert.deepEqual(combos.map(e=>e.count),[1,2,3]);assert.equal(record.result.ownRemoved,1);
    for(const combo of combos){const fall=record.events.find(e=>e.type==='stone:fall'&&e.stone===combo.stone);assert.equal(combo.tick,fall.tick);assert.equal(combo.actorTeam,0);assert.equal(combo.targetTeam,1);}
    assert.ok(!record.events.some(e=>e.type==='shot:knockout'));
    const seen=[],playback=new Shots.Playback(record,board,event=>seen.push(event));playback.start();
    assert.ok(!playback.snapshot(0).events.some(e=>e.type==='shot:combo-hit'));
    playback.advance(combos[0].time);assert.deepEqual(playback.snapshot(0).events.filter(e=>e.type==='shot:combo-hit').map(e=>e.count),[1]);
    playback.advance(record.duration);playback.advance(1);assert.deepEqual(seen.filter(e=>e.type==='shot:combo-hit').map(e=>e.count),[1,2,3]);
  }
});

test('the final iron duel transfers momentum and keeps launch provenance private until the clash',()=>{
  const r=room();r.stones=[{id:0,team:0,x:400,y:400,vx:0,vy:0,alive:true,iron:true},{id:5,team:1,x:437,y:400,vx:0,vy:0,alive:true,iron:true}];
  fire(r,{vx:100,vy:0});
  for(const viewer of [0,1,null])assert.ok(r.snapshot(viewer).stones.every(s=>!('ironShot' in s)));
  const clash=r.lastShot.events.find(e=>e.type==='iron:clash');assert.ok(clash);
  while(r.phase==='moving')r.step(1/120);
  assert.equal(r.stones[1].alive,true);assert.ok(r.stones[1].x>437);assert.equal(r.lastShot.result.over,false);
  assert.equal(r.stones[1].iron,false);assert.equal(r.stones[0].iron,false);
});
