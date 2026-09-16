const {test}=require('node:test'),assert=require('node:assert/strict');
const A=require('../web/aim-input');
test('clockwise clock angles map to screen directions on both player views',()=>{
  for(const flipped of [false,true])for(const [angle,x,y] of [[0,0,-1],[90,1,0],[180,0,1],[270,-1,0],[360,0,-1]]){
    const v=A.velocity(angle,50,flipped),sign=flipped?-1:1;
    assert.ok(Math.abs(v.vx-x*680*sign)<1e-9);assert.ok(Math.abs(v.vy-y*680*sign)<1e-9);
  }
});
test('decimal aiming round-trips precisely without coupling power to angle',()=>{
  for(const flipped of [false,true])for(const angle of [0.001,12.345678,179.999,359.999]){
    const v=A.velocity(angle,37.125,flipped);
    assert.ok(Math.abs(A.angle(v.vx,v.vy,flipped)-angle)<1e-10);
    assert.ok(Math.abs(Math.hypot(v.vx,v.vy)-1360*.37125)<1e-9);
  }
});
test('invalid numeric input cannot produce a shot',()=>{
  for(const [a,p] of [[NaN,50],[Infinity,50],[-1,50],[361,50],[0,0],[0,.01],[0,-1],[0,101],[0,NaN],['',50]])assert.equal(A.velocity(a,p),null);
});
