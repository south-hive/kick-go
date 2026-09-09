const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../web/flight-model');
function fly(p = M.profile(), control = () => ({})) {
  const r = M.create(p); M.launch(r);
  for (let i = 0; i < 120 * 91 && r.phase !== 'over'; i++) M.step(r, 1 / 120, control(r));
  assert.equal(r.phase, 'over'); return r;
}
test('launch angle and strength change trajectory; invalid values remain finite', () => {
  const a = M.create(M.profile()), b = M.create(M.profile());
  M.launch(a, 20, .2); M.launch(b, 65, 1);
  assert.ok(b.vy > a.vy); assert.ok(Math.hypot(b.vx,b.vy) > Math.hypot(a.vx,a.vy));
  assert.equal(M.launch(b), false);
  const invalid = M.create(M.profile()); M.launch(invalid, NaN, Infinity); M.step(invalid, Infinity);
  assert.ok(Number.isFinite(invalid.x + invalid.y + invalid.vx + invalid.vy));
});
test('timed gliding spends stamina and meaningfully improves flight distance', () => {
  const ballistic = fly(), gliding = fly(M.profile(), r => ({ glide: r.vy < 2 }));
  assert.ok(gliding.x > ballistic.x * 1.5);
  assert.equal(gliding.stamina, 0);
  assert.ok(gliding.time < 90);
});
test('boost requires stamina and cooldown; exhausted gliding falls normally', () => {
  const r = M.create(M.profile()); assert.equal(M.boost(r), false); M.launch(r);
  assert.equal(M.boost(r), true); assert.equal(r.stamina, 76); assert.equal(M.boost(r), false);
  r.stamina = 0; const oldVy = r.vy; M.step(r, .05, { glide: true });
  assert.equal(r.gliding, false); assert.equal(r.stamina, 0); assert.ok(r.vy < oldVy);
});
test('pickups are single-use, food is capped, and ruins penalize once', () => {
  const r = M.create(M.profile()); M.launch(r);
  r.items = [{ x:r.x,y:r.y,type:'silver',taken:false },{x:r.x,y:r.y,type:'food',taken:false}];
  M.step(r, 0); assert.equal(r.coins,8); assert.equal(r.stamina,r.maxStamina);
  M.step(r, 0); assert.equal(r.coins,8);
  r.ruins = [{x:r.x,y:r.y,hit:false}]; M.step(r,0); assert.equal(r.stamina,85);
  M.step(r,0); assert.equal(r.stamina,85);
});
test('each flight rewards exactly once and upgrades deduct exact prices', () => {
  const p = M.profile(), r = fly(p);
  assert.equal(M.settle(p,r),true); const balance=p.silver;
  assert.ok(balance >= 40); assert.equal(p.runs,1); assert.equal(M.settle(p,r),false); assert.equal(p.silver,balance);
  const price=M.cost(p,'leap'); assert.equal(M.buy(p,'leap'),true);
  assert.equal(p.silver,balance-price); assert.equal(p.upgrades.leap,1);
  assert.equal(M.buy(p,'not-a-real-upgrade'),false);
  const poor=M.profile();assert.equal(M.buy(poor,'stamina'),false);assert.equal(poor.silver,0);
});
test('upgrades affect their intended abilities and cannot exceed five levels', () => {
  const p=M.profile({silver:100000});
  for(const g of M.GEAR)for(let i=0;i<5;i++)assert.equal(M.buy(p,g.id),true);
  assert.equal(M.buy(p,'stamina'),false);assert.equal(M.cost(p,'stamina'),null);
  const r=M.create(p);assert.equal(r.maxStamina,210);M.launch(r);const vx=r.vx;M.boost(r);assert.ok(r.vx-vx>=69);
  const upgraded=fly(p,r=>({glide:r.vy<2}));assert.equal(upgraded.reason,'goal');assert.equal(upgraded.x,5000);
});
test('save data is sanitized and round-trips without changing earned progress', () => {
  const p=M.profile({silver:-5,best:Infinity,runs:'bad',upgrades:{stamina:999,leap:-2,wing:NaN}});
  assert.equal(p.silver,0);assert.equal(p.best,0);assert.equal(p.runs,0);assert.equal(p.upgrades.stamina,5);assert.equal(p.upgrades.leap,0);
  const valid=M.profile({silver:111,best:740,runs:3,upgrades:{meal:2}});
  assert.deepEqual(M.profile(JSON.parse(JSON.stringify(valid))),valid);
});
test('identical seeds give reproducible courses and completed flights stop updating', () => {
  const p=M.profile();assert.deepEqual(M.create(p,55).items,M.create(p,55).items);
  const r=fly();const before=JSON.stringify(r);M.step(r,.05,{glide:true});assert.equal(JSON.stringify(r),before);
  assert.equal(M.region(1000).short,'페일룬');assert.equal(M.region(2500).short,'붉은사막');
});
