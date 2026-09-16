const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../web/physics.js');
const stone = (x,y,vx=0,vy=0) => ({x,y,vx,vy,alive:true,team:0});
test('five stones per side, with no overlapping obstacles', () => {
  const s=P.setup();assert.equal(s.filter(s=>s.team===0).length,5);assert.equal(s.filter(s=>s.team===1).length,5);
  const before=JSON.stringify(s);P.step(s,1/120);assert.equal(JSON.stringify(s),before);
});
test('impact transfers momentum to a resting stone', () => {
  const a=stone(150,300,400),b=stone(187,300);P.step([a,b],1/120);assert.ok(b.vx>300);assert.ok(a.vx<100);
});
test('center head-on shots stop the shooter and transfer velocity at every strength and direction', () => {
  for(const speed of [100,500,1360])for(const [nx,ny] of [[1,0],[-1,0],[0,1],[0,-1],[.6,.8]]){
    const a=stone(500,400),b=stone(500+nx*37,400+ny*37);
    P.shoot(a,nx*speed,ny*speed);
    for(let i=0;i<10&&!b.vx&&!b.vy;i++)P.step([a,b],1/120);
    assert.ok(Math.hypot(b.vx,b.vy)>0,'target must be struck');
    assert.ok(Math.hypot(a.vx,a.vy)<1e-9,'center strike must not follow through');
    const stop={x:a.x,y:a.y};
    for(let i=0;i<120;i++)P.step([a,b],1/120);
    assert.ok(Math.hypot(a.x-stop.x,a.y-stop.y)<1e-9,'shooter must remain at the impact position');
  }
});
test('elastic collision exchanges normal velocity while preserving tangential velocity and energy', () => {
  const a=stone(400,400,500,80),b=stone(435,400,100,-30);
  // Zero elapsed time isolates the collision from board friction.
  P.step([a,b],0);
  assert.deepEqual([a.vx,a.vy,b.vx,b.vy],[100,80,500,-30]);
  assert.equal(a.vx+b.vx,600);
  assert.equal(a.vy+b.vy,50);
  assert.equal(a.vx**2+a.vy**2+b.vx**2+b.vy**2,500**2+80**2+100**2+30**2);
});
test('metal hinge reflects a shot', () => {
  const a=stone(195.5,600,400);P.step([a],1/120);assert.ok(a.vx<0);assert.ok(a.x<=214.5-P.R);
});
test('guide predicts first impact without mutating the board and limits the exit paths',()=>{
  const a={...stone(400,400),id:0},b={...stone(520,410),id:1,team:1};
  const board=[a,b],before=JSON.stringify(board),guide=P.predict(board,0,700,0);
  assert.equal(JSON.stringify(board),before);
  assert.equal(guide.collision,true);assert.equal(guide.branches.length,2);
  assert.ok(guide.branches.every(b=>b.points.length<=25));
  const sim=board.map(s=>({...s}));P.shoot(sim[0],700,0);
  for(let i=1;i<guide.approach.length;i++)P.step(sim,1/120);
  assert.deepEqual(guide.approach.at(-1),{x:sim[0].x,y:sim[0].y});
  for(let i=1;i<guide.branches[0].points.length;i++)P.step(sim,1/120);
  for(const branch of guide.branches){const s=sim.find(s=>s.id===branch.id);assert.deepEqual(branch.points.at(-1),{x:s.x,y:s.y});}
});
test('guide reflects follow and draw shots, and ends before a second impact',()=>{
  const board=[{...stone(400,400),id:0},{...stone(440,400),id:1},{...stone(510,400),id:2}];
  for(const follow of [-1,0,1]){
    const guide=P.predict(board,0,500,0,0,follow),branch=guide.branches.find(b=>b.id===0);
    assert.ok(branch.points.length>1);
    const distance=branch.points.at(-1).x-branch.points[0].x;
    assert.equal(Math.sign(distance),follow);
    assert.equal(guide.branches.some(b=>b.id===2),false);
    assert.ok(guide.branches.find(b=>b.id===1).points.at(-1).x<510-P.R*2);
  }
});
test('all four board edges eliminate a stone once', () => {
  for(const [x,y,vx,vy] of [[87,500,-500,0],[1113,500,500,0],[500,87,0,-500],[500,1113,0,500]]){
    const s=stone(x,y,vx,vy);let falls=0;for(let i=0;i<10;i++)P.step([s],1/120,()=>{},()=>falls++);assert.equal(s.alive,false);assert.equal(falls,1);
  }
});
test('friction settles motion; fast shots remain finite', () => {
  const s=P.setup();s[0].vx=800;s[0].vy=-900;
  for(let i=0;i<1600;i++)P.step(s,1/120);
  assert.equal(P.moving(s),false);assert.ok(s.every(s=>[s.x,s.y,s.vx,s.vy].every(Number.isFinite)));
});
test('coincident stones separate without NaN',()=>{const s=[stone(200,300),stone(200,300)];P.step(s,1/120);assert.ok(Math.abs(s[0].x-s[1].x)>=P.R*2);});

test('low strike draws the shooter backward after a head-on collision',()=>{
  const a=stone(400,400),b=stone(437,400);P.shoot(a,500,0,0,-1);
  P.step([a,b],1/120);assert.ok(a.vx< -150&&a.vx> -220);assert.ok(b.vx>400);assert.equal(a.spinPower,0);
});
test('high strike follows forward more than a center strike',()=>{
  function impact(follow){const a=stone(400,400),b=stone(437,400);P.shoot(a,500,0,0,follow);P.step([a,b],1/120);return a.vx;}
  const boost=impact(1)-impact(0);
  assert.ok(boost>150&&boost<220);
});
test('side spin uses the launch direction and does not bend before contact',()=>{
  for(const side of [-1,1]){const a=stone(400,400),b=stone(400,360);P.shoot(a,0,-500,side,0);
    P.step([a],1/120);assert.equal(a.vx,0);
    P.step([a,b],1/120);assert.ok(a.vx*side>200);assert.equal(a.spinPower,0);
  }
});
test('spin fades over distance, clamps diagonal strikes, and settles',()=>{
  const a=stone(500,400);P.shoot(a,150,0,1,1);assert.ok(Math.hypot(a.spinSide,a.spinFollow)<=1);
  P.step([a],1/120);assert.ok(a.spinPower<150);
  for(let i=0;i<2000;i++)P.step([a],1/120);
  assert.equal(P.moving([a]),false);assert.equal(a.spinPower,0);
});

test('slow stones stop substantially sooner than the former constant friction',()=>{
  const a=stone(400,400,150);let elapsed=0;
  while(P.moving([a])&&elapsed<3){P.step([a],1/120);elapsed+=1/120;}
  const formerDistance=150*150/(2*135);
  assert.equal(P.moving([a]),false);
  assert.ok(a.x-400<formerDistance*.7);
  assert.ok(elapsed<.8);
});
test('fast free motion retains its original deceleration',()=>{
  const a=stone(400,400,1000);P.step([a],1/120);
  assert.ok(Math.abs(a.vx-(1000-135/120))<1e-9);
});
test('a strong split shot can still knock out two opponents',()=>{
  const a=stone(930,400),b=stone(1020,383),c=stone(1020,417);
  P.shoot(a,1360,0);
  for(let i=0;i<1600&&P.moving([a,b,c]);i++)P.step([a,b,c],1/120);
  assert.equal(b.alive,false);assert.equal(c.alive,false);assert.equal(a.alive,true);
});

test('iron stone stays fixed and rebounds an enemy once with reduced restitution',()=>{
  for(const reversed of [false,true]){
    const a={...stone(400,400),id:0},b={...stone(437,400),id:1,team:1,iron:true};
    P.shoot(a,500,0,0,1);const board=reversed?[b,a]:[a,b];
    P.step(board,1/120);
    assert.equal(b.x,437);assert.equal(b.y,400);assert.equal(b.vx,0);assert.equal(b.vy,0);assert.equal(b.iron,false);
    assert.ok(a.vx< -250&&a.vx> -280);
    a.x=400;P.shoot(a,500,0);P.step(board,1/120);
    assert.ok(b.vx>490);assert.ok(Math.abs(a.vx)<1e-9);
  }
});
test('shooting forfeits iron, friendly contact consumes it, prediction cannot reveal it',()=>{
  const a={...stone(400,400),id:0},b={...stone(437,400),id:1,team:1,iron:true};
  const normal=P.predict([a,{...b,iron:false}],0,500,0);
  assert.deepEqual(P.predict([a,b],0,500,0),normal);assert.equal(b.iron,true);
  b.team=0;P.shoot(a,500,0);P.step([a,b],1/120);assert.equal(b.iron,false);assert.ok(b.vx>490);
  b.iron=true;P.shoot(b,500,0);assert.equal(b.iron,false);
});

test('slow edge contact eliminates the stone before the turn can settle on all four sides',()=>{
  const transforms=[(x,y)=>[x,y],(x,y)=>[P.SIZE-x,y],(x,y)=>[y,x],(x,y)=>[y,P.SIZE-x]];
  for(const transform of transforms){
    const make=(x,vx)=>{const [px,py]=transform(x,400),[endX,endY]=transform(x+vx,400);return stone(px,py,endX-px,endY-py);};
    const a=make(P.EDGE+.001,0),b=make(P.EDGE+36.002,-1),fallen=[];
    P.step([a,b],1/120,()=>{},s=>fallen.push(s));
    assert.equal(a.alive,false);assert.equal(b.alive,true);
    assert.deepEqual(fallen,[a]);assert.equal(P.moving([a,b]),false);
    P.step([a,b],1/120,()=>{},s=>fallen.push(s));assert.equal(fallen.length,1);
  }
});

test('a stone pushed off the edge cannot strike a later neighbour in the same step',()=>{
  for(const iron of [false,true]){
    const a=stone(86.001,400),b={...stone(122.002,400,-100),team:1,iron};
    const c=stone(86.001,436.01,0,-10),control={...c},contacts=[];
    P.step([control],1/120);
    P.step([a,b,c],1/120,()=>{},()=>{},(x,y)=>contacts.push([x,y]));
    assert.equal(a.alive,false);assert.deepEqual(c,control);
    assert.equal(contacts.length,1);assert.deepEqual(contacts[0],[a,b]);
    assert.equal(a.vx,0);assert.equal(a.vy,0);
  }
});

test('outside stones cannot return inward and edge equality keeps a stone on the board',()=>{
  for(const [x,y] of [[86,86],[1114,86],[86,1114],[1114,1114]]){
    const a=stone(x,y);P.step([a],1/120);assert.equal(a.alive,true);
  }
  const a=stone(85.99,400,100),b=stone(121.99,400);let contacts=0;
  P.step([a,b],1/120,()=>{},()=>{},()=>contacts++);
  assert.equal(a.alive,false);assert.equal(contacts,0);assert.equal(b.vx,0);
});

test('settled stones have exactly zero velocity and no residual spin',()=>{
  for(const speed of [.001,.1]){
    const a={...stone(400,400,speed),spinPower:10,spinSide:1,spinFollow:1};
    P.step([a],0);
    assert.equal(P.moving([a]),false);
    assert.deepEqual([a.vx,a.vy,a.spinPower,a.spinSide,a.spinFollow],[0,0,0,0,0]);
  }
  const a=stone(400,400,.101);P.step([a],0);assert.equal(P.moving([a]),true);
});


test('friendly impact consumes protection in either pair order, but mere resting contact does not',()=>{
  for(const reversed of [false,true]){
    const a=stone(400,400,500),b={...stone(437,400),iron:true};
    P.step(reversed?[b,a]:[a,b],1/120);
    assert.equal(b.iron,false);assert.ok(b.vx>490);assert.ok(Math.abs(a.vx)<1e-9);
  }
  const a=stone(400,400),b={...stone(435,400),iron:true};
  P.step([a,b],1/120);assert.equal(b.iron,true);
});

test('iron-on-iron direct shots match ordinary collision physics, for either opener and pair order',()=>{
  const publicMotion=board=>board.map(({x,y,vx,vy,alive,spinPower,spinSide,spinFollow})=>({x,y,vx,vy,alive,spinPower,spinSide,spinFollow}));
  for(const team of [0,1])for(const reversed of [false,true])for(const speed of [100,500]){
    const attacker={...stone(400,400),id:team*5,team,iron:true};
    const defender={...stone(437,400),id:(1-team)*5,team:1-team,iron:true};
    const ordinary=[{...attacker,iron:false},{...defender,iron:false}];
    P.shoot(attacker,speed,0);P.shoot(ordinary[0],speed,0);
    const board=reversed?[defender,attacker]:[attacker,defender],control=reversed?ordinary.reverse():ordinary,events=[];
    for(let i=0;i<500&&P.moving(board);i++){
      P.step(board,1/120,()=>{},()=>{},(a,b,contact)=>{if(contact?.ironClash)events.push(contact);});
      P.step(control,1/120);assert.deepEqual(publicMotion(board),publicMotion(control));
    }
    assert.equal(events.length,1);assert.equal(events[0].attacker,attacker.id);assert.equal(events[0].defender,defender.id);
    assert.equal(defender.iron,false);assert.equal(attacker.iron,false);assert.equal(attacker.ironShot,false);
    if(speed===100)assert.equal(defender.alive,true); // A weak shot does not force ejection.
    assert.ok(defender.x>437);
  }
});

test('first contact with any stone consumes shatter eligibility even for glancing or separating contacts',()=>{
  for(const team of [0,1])for(const reversed of [false,true])for(const velocity of [[500,0],[0,500],[-500,0]]){
    const attacker={...stone(400,400),id:0,iron:true};
    const other={...stone(435,400),id:1,team};
    P.shoot(attacker,...velocity);
    P.step(reversed?[other,attacker]:[attacker,other],0);
    assert.equal(attacker.ironShot,false);
    assert.ok(!other.ironShot); // Eligibility is never transferred to the contacted stone.
    // The same moving shot subsequently reaches a protected enemy: it must be blocked.
    Object.assign(attacker,{x:400,y:400,vx:500,vy:0});
    const guard={...stone(435,400),id:5,team:1,iron:true},contacts=[];
    P.step([attacker,guard],0,undefined,undefined,(a,b,c)=>contacts.push(c));
    assert.ok(contacts.some(c=>c?.ironBlock));assert.ok(!contacts.some(c=>c?.ironClash));
    assert.equal(guard.x,435);assert.equal(guard.vx,0);assert.ok(attacker.vx<0);
  }
});

test('quiet hinge contacts also consume eligibility without relying on impact effects',()=>{
  const attacker={...stone(270,567),iron:true};P.shoot(attacker,0,1);
  let impacts=0;P.step([attacker],0,()=>impacts++);
  assert.equal(impacts,0);assert.equal(attacker.ironShot,false);
});
