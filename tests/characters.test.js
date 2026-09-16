'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../web/characters');
const S=require('../web/shot-engine');
const {Room}=require('../multiplayer');
C.register({id:'test-attacker',name:'공격자 테스트',responses:{
  'iron:hit':{actor:{lines:['{name}: 몰랐네!','{name}: 이런!'],effects:[{type:'custom-flash',color:'#fff'}]}},
  'shot:multi-knockout':{actor:{lines:['{count}개 제거'],effects:[]}},
}});
C.register({id:'test-defender',name:'수비자 테스트',responses:{
  'iron:hit':{target:{lines:['{actor}, 내가 막았다!'],effects:[{type:'ring'}]}},
}});
const players=[{characterId:'test-attacker',name:'흑돌 친구'},{characterId:'test-defender',name:'백돌 친구'}];
const event={id:'1:7:4',type:'iron:hit',actorTeam:0,targetTeam:1,attacker:0,defender:5};

test('presets route actor and target reactions separately and choose the same line on every client',()=>{
  const result=C.resolve(event,players);
  assert.deepEqual(result.map(r=>[r.team,r.role,r.characterId]),[[0,'actor','test-attacker'],[1,'target','test-defender']]);
  assert.ok(result[0].line.startsWith('흑돌 친구:'));assert.equal(result[1].line,'흑돌 친구, 내가 막았다!');
  assert.deepEqual(C.resolve(JSON.parse(JSON.stringify(event)),JSON.parse(JSON.stringify(players))),result);
  assert.ok(Object.isFrozen(result[0].effects[0]));
  const swapped=C.resolve({...event,actorTeam:1,targetTeam:0},players);assert.equal(swapped.length,0);
  assert.equal(C.resolve({id:'multi',type:'shot:multi-knockout',team:0,count:3},players)[0].line,'3개 제거');
});

test('presets inherit neutral guide behavior, can mute events, and reject invalid definitions',()=>{
  const guide={id:'cue',type:'guide:used',team:0,actorTeam:0,targetTeam:1,duration:1.35,remaining:1};
  assert.equal(C.resolve(guide,players)[0].effects[0].type,'guide-cue');
  C.register({id:'test-muted',name:'빈 반응',responses:{'guide:used':{}}});
  assert.deepEqual(C.resolve(guide,[{characterId:'test-muted'},{characterId:'default'}]),[]);
  assert.throws(()=>C.get('missing'),/INVALID_CHARACTER/);assert.throws(()=>C.register({id:'default',name:'중복',responses:{}}),/DUPLICATE/);
  assert.throws(()=>C.register({id:'bad',name:'오류',responses:{'iron:hit':{actor:{lines:[42]}}}}),/INVALID_CHARACTER/);
});

test('reaction routing unsubscribes and resumes only the current guide without replaying speech',()=>{
  const hooks=new S.Hooks(),reactions=[];hooks.on('character:reaction',reaction=>reactions.push(reaction));
  const stop=C.bind(hooks,()=>players);hooks.emit('iron:hit',event);assert.equal(reactions.length,2);
  hooks.emit('shot:resume',{cue:{remaining:.4},events:[{id:'g',type:'guide:used',actorTeam:0,targetTeam:1,duration:1.35,remaining:1.35}]});
  assert.equal(reactions.length,3);assert.equal(reactions.at(-1).resumed,true);assert.equal(reactions.at(-1).event.remaining,.4);
  stop();hooks.emit('iron:hit',event);assert.equal(reactions.length,3);
});

test('participant preset ids survive server reconnect and rematch, and invalid ids do not occupy seats',()=>{
  const r=new Room('presets',Date.now(),0,'classic');
  assert.throws(()=>r.seat(0,{readyState:1},Date.now(),'missing'),/INVALID_CHARACTER/);assert.equal(r.players[0],null);
  const a=r.seat(0,{readyState:1},Date.now(),'test-attacker');r.seat(1,{readyState:1},Date.now(),'test-defender');
  assert.deepEqual(r.snapshot(null).characters,['test-attacker','test-defender']);
  r.resume(a.token,{readyState:1});assert.equal(r.players[0].characterId,'test-attacker');
  r.phase='over';r.rematch(0,{match:1});r.rematch(1,{match:1});assert.deepEqual(r.snapshot(0).characters,['test-attacker','test-defender']);
});

test('basic character taunts the opponent miss, calls shatter on iron clash, and counts every combo fall',()=>{
  const players=[{characterId:'default',name:'흑돌'},{characterId:'default',name:'백돌'}];
  for(const actorTeam of [0,1]){
    const miss=C.resolve({id:'miss',type:'shot:clean-miss',actorTeam,targetTeam:1-actorTeam},players);
    assert.equal(miss.length,1);assert.equal(miss[0].team,1-actorTeam);assert.equal(miss[0].line,'집중하세요.');
    const shatter=C.resolve({id:'shatter',type:'iron:clash',actorTeam,targetTeam:1-actorTeam},players);
    assert.equal(shatter.length,1);assert.equal(shatter[0].team,actorTeam);assert.equal(shatter[0].line,'파쇄!');assert.ok(shatter[0].effects.some(e=>e.type==='shout'));
    assert.deepEqual([1,2,3].map(count=>C.resolve({id:`combo:${count}`,type:'shot:combo-hit',actorTeam,targetTeam:1-actorTeam,count},players)[0].line),['1타','2타','3타']);
    assert.deepEqual(C.resolve({id:'end',type:'shot:multi-knockout',actorTeam,targetTeam:1-actorTeam,count:3},players),[]);
  }
  assert.ok(!JSON.stringify(C.get()).includes('막타'));
});

test('Naruto dialogue routes to the correct player and preserves guide, shatter and combo effects',()=>{
  for(const team of [0,1]){
    const players=[{characterId:'naruto'},{characterId:'naruto'}];
    for(const type of ['guide:used','shot:clean-miss','shot:knockout','iron:hit','iron:clash']){
      const event={id:type,type,actorTeam:team,targetTeam:1-team};
      const [reaction,...extra]=C.resolve(event,players);
      assert.equal(extra.length,0);assert.equal(reaction.team,type==='shot:clean-miss'?1-team:team);
      assert.equal(reaction.characterId,'naruto');assert.ok(reaction.line);
      if(type==='guide:used')assert.ok(reaction.effects.some(e=>e.type==='guide-cue'));
      if(type==='iron:clash'){assert.equal(reaction.line,'이거 보여주려고 어그로 끌었다!');assert.ok(reaction.effects.some(e=>e.type==='shout'));}
      assert.deepEqual(C.resolve(event,players),[reaction]);
    }
    assert.deepEqual([1,2,3].map(count=>C.resolve({type:'shot:combo-hit',actorTeam:team,count},players)[0].line),['1타','2타','3타']);
    assert.deepEqual(C.resolve({type:'shot:multi-knockout',actorTeam:team,count:3},players),[]);
  }
});

test('meme persona taunts only the correct opponent and keeps numbered combo calls',()=>{
  for(const team of [0,1]){
    const players=[{characterId:'kurupping'},{characterId:'kurupping'}];
    const event={id:'meme',actorTeam:team,targetTeam:1-team};
    const miss=C.resolve({...event,type:'shot:clean-miss'},players);
    assert.equal(miss.length,1);assert.equal(miss[0].team,1-team);assert.match(miss[0].line,/못 때리쥬/);
    const blocked=C.resolve({...event,type:'iron:hit'},players);
    assert.equal(blocked.length,2);assert.match(blocked.find(r=>r.team===team).line,/몰랐쥬/);assert.match(blocked.find(r=>r.team!==team).line,/못 뚫쥬/);
    for(const type of ['guide:used','iron:clash','shot:knockout']){
      const reactions=C.resolve({...event,type},players);assert.equal(reactions.length,1);assert.equal(reactions[0].team,team);
      if(type==='guide:used')assert.ok(reactions[0].effects.some(e=>e.type==='guide-cue'));
      if(type==='iron:clash'){assert.match(reactions[0].line,/파쇄/);assert.ok(reactions[0].effects.some(e=>e.type==='shout'));}
    }
    assert.deepEqual([1,2,3].map(count=>C.resolve({...event,type:'shot:combo-hit',count},players)[0].line),['하나 나갔쥬?','또 나갔쥬?','계속 나가쥬? 약오르쥬!']);
    assert.deepEqual(C.resolve({...event,type:'shot:multi-knockout'},players),[]);
  }
});
