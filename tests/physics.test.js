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
test('metal hinge reflects a shot', () => {
  const a=stone(195.5,600,400);P.step([a],1/120);assert.ok(a.vx<0);assert.ok(a.x<=214.5-P.R);
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
  P.step([a,b],1/120);assert.ok(a.vx< -200);assert.ok(b.vx>400);assert.equal(a.spinPower,0);
});
test('high strike follows forward more than a center strike',()=>{
  function impact(follow){const a=stone(400,400),b=stone(437,400);P.shoot(a,500,0,0,follow);P.step([a,b],1/120);return a.vx;}
  assert.ok(impact(1)>impact(0)+200);
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
