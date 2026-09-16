const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../web/physics');
const AI = require('../web/ai');
const stone = (x,y,vx=0,vy=0) => ({x,y,vx,vy,alive:true,team:0});
test('belief starts uniformly, tracks public launches and keeps a spent hypothesis',()=>{
  const belief=new AI.Belief(P.setup());
  assert.deepEqual(Object.values(belief.active),[.2,.2,.2,.2,.2]);
  belief.observeShot(0,0);
  assert.equal(belief.probability(0),0);assert.ok(belief.spent>0);
  assert.ok(belief.probability(1)>.2);
  const prior=belief.probability(1);belief.observeShot(0,0);assert.ok(belief.probability(1)>prior);
  for(let id=1;id<5;id++)belief.observeShot(id,0);
  assert.equal(belief.spent,1);assert.ok(Object.values(belief.active).every(p=>p===0));
});
test('visible block reveals expenditure while normal motion rules out a defender',()=>{
  for(const iron of [true,false]){
    const board=[{...stone(437,400),id:0,iron},{...stone(800,400),id:1},{...stone(400,400),id:5,team:1}];
    const belief=new AI.Belief(board);P.shoot(board[2],500,0);
    const before=AI.visible(board);P.step(board,1/120);belief.observeStep(before,AI.visible(board));
    assert.equal(belief.probability(0),0);
    if(iron){assert.equal(belief.spent,1);assert.equal(belief.probability(1),0);}
    else{assert.equal(belief.spent,0);assert.equal(belief.probability(1),1);}
  }
});
test('risk evaluation penalizes a dangerous rebound and favors a safe probing shot',()=>{
  const board=[{...stone(200,400),id:0},{...stone(130,400),id:5,team:1}];
  const suspicious=new AI.Belief(board),spent=new AI.Belief(board);spent.observeShot(0,0);
  const hard={id:5,angle:0,speed:1330},probe={id:5,angle:0,speed:200};
  assert.ok(AI.evaluate(board,hard,suspicious)<AI.evaluate(board,hard,spent)-100);
  assert.ok(AI.evaluate(board,probe,suspicious)>AI.evaluate(board,hard,suspicious));
});
test('planner and belief never read secret fields, even through getters',()=>{
  const board=[{...stone(437,400),id:0},{...stone(400,400),id:5,team:1}];
  for(const s of board)Object.defineProperty(s,'iron',{get(){throw Error('secret read');}});
  const belief=new AI.Belief(board);assert.ok(AI.chooseShot(board,belief,()=>.5));
  belief.observeStep(board,board);assert.equal(belief.probability(0),1);
});
test('AI decisions never depend on secret iron selections or mutate the real board',()=>{
  const random=seed=>()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
  for(const seed of [1,42,2026]){
    const board=P.setup(),expected=AI.chooseShot(board,new AI.Belief(board),random(seed));
    for(let i=0;i<5;i++){
      board.forEach(s=>s.iron=s.id===i||s.id===9-i);
      const before=JSON.stringify(board);
      assert.deepEqual(AI.chooseShot(board,new AI.Belief(board),random(seed)),expected);
      assert.equal(JSON.stringify(board),before);
    }
    assert.ok(expected.id>=5&&expected.id<=9);
    assert.ok(Math.hypot(expected.vx,expected.vy)<=1360.001);
  }
});
test('AI adds aim and power error and handles an empty side',()=>{
  const board=[{...stone(400,400),id:0},{...stone(800,400),id:5,team:1}];
  const roll=(angle,power)=>{const values=[0,angle,power];return()=>values.shift();};
  const center=AI.chooseShot(board,new AI.Belief(board),roll(.5,.5));
  const a=AI.chooseShot(board,new AI.Belief(board),roll(.1,.1)),b=AI.chooseShot(board,new AI.Belief(board),roll(.9,.9));
  const angleFromCenter=s=>Math.atan2(center.vx*s.vy-center.vy*s.vx,center.vx*s.vx+center.vy*s.vy);
  assert.ok(angleFromCenter(a)<0&&angleFromCenter(b)>0);
  for(const s of [a,b])assert.ok(Math.abs(angleFromCenter(s))<Math.PI/180);
  assert.ok(Math.hypot(a.vx,a.vy)<Math.hypot(center.vx,center.vy));
  assert.ok(Math.hypot(b.vx,b.vy)>Math.hypot(center.vx,center.vy));
  assert.equal(AI.chooseShot([]),null);board[0].alive=false;assert.equal(AI.chooseShot(board),null);
});

test('targets hiding behind either hinge trigger a safe approach with a clear next shot',()=>{
  for(const x of [270,930])for(const flip of [false,true])for(const random of [0,.5,.99]){
    const board=[{...stone(x,flip?400:800),id:0},{...stone(x,flip?800:400),id:5,team:1}];
    const before=JSON.stringify(board),belief=new AI.Belief(board);
    const direct={id:5,angle:Math.atan2(board[0].y-board[1].y,0),speed:1030};
    assert.ok(AI.evaluate(board,direct,belief)<-100,'the old direct shot rebounds out');
    const shot=AI.chooseShot(board,belief,()=>random);
    assert.equal(JSON.stringify(board),before);
    const sim=board.map(s=>({...s}));P.shoot(sim[1],shot.vx,shot.vy);
    for(let n=0;n<1300&&P.moving(sim);n++)P.step(sim,1/120);
    assert.equal(sim[1].alive,true,'AI must not sacrifice its last stone against a hinge');
    assert.equal(P.moving(sim),false);
    assert.ok(Math.abs(sim[1].x-x)>P.R*2,'move to the side rather than repeat the blocked shot');
    if(sim[0].alive){
      const angle=Math.atan2(sim[0].y-sim[1].y,sim[0].x-sim[1].x);let firstContact=null;
      P.shoot(sim[1],Math.cos(angle)*750,Math.sin(angle)*750);
      for(let n=0;n<1300&&P.moving(sim)&&firstContact===null;n++)P.step(sim,1/120,()=>{},()=>{},(a,b)=>{firstContact??=b?'stone':'hinge';});
      assert.equal(firstContact,'stone','the repositioning must open an attack lane');
    }
  }
});

test('an open winning shot is preferred to harmless repositioning',()=>{
  const board=[{...stone(1080,400),id:0},{...stone(800,400),id:5,team:1}];
  const belief=new AI.Belief(board);belief.observeShot(0,0);
  for(const random of [0,.5,.99]){
    const sim=board.map(s=>({...s})),shot=AI.chooseShot(board,belief,()=>random);
    P.shoot(sim[1],shot.vx,shot.vy);for(let n=0;n<1300&&P.moving(sim);n++)P.step(sim,1/120);
    assert.equal(sim[0].alive,false);assert.equal(sim[1].alive,true);
  }
});
