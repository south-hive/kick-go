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
function cycleControl() {
  let pull = false;
  return r => {
    if (r.vy < -35) pull = true;
    if (r.vy > 28 || Math.hypot(r.vx, r.vy) < 50) pull = false;
    return { glide: pull, dive: !pull && r.vy < 0 };
  };
}
test('timed pull-ups beat holding continuously and finish by landing', () => {
  const neutral = fly(), held = fly(M.profile(), () => ({ glide: true }));
  const cycled = fly(M.profile(), cycleControl());
  assert.ok(neutral.x > held.x);
  assert.ok(cycled.x > held.x * 1.2);
  assert.equal(cycled.reason, 'landed');
  assert.ok(cycled.stamina < cycled.maxStamina);
  assert.ok(cycled.time < 90);
});
test('descent gains speed and a sustained pull converts it into actual ascent', () => {
  const r = M.create(M.profile()); M.launch(r);
  r.items = []; r.ruins = []; r.y = 350; r.vx = 95; r.vy = -25;
  const speed = Math.hypot(r.vx, r.vy);
  for (let i = 0; i < 120; i++) M.step(r, 1 / 120);
  assert.ok(Math.hypot(r.vx, r.vy) > speed);
  const fast = Math.hypot(r.vx, r.vy);
  for (let i = 0; i < 120; i++) M.step(r, 1 / 120, { glide: true });
  assert.ok(r.vy > 0);
  assert.ok(Math.hypot(r.vx, r.vy) < fast);
  const low = r.y;
  for (let i = 0; i < 30; i++) M.step(r, 1 / 120, { glide: true });
  assert.ok(r.y > low);
  assert.ok(r.pitch > 0);
});
test('pull-ups never create energy, even with unlimited stamina and best wings', () => {
  for (const wing of [0, 5]) {
    const r = M.create(M.profile({ upgrades: { wing } })); M.launch(r);
    r.items = []; r.ruins = [];
    const control = cycleControl();
    let previous = r.vx ** 2 / 2 + r.vy ** 2 / 2 + 14 * r.y;
    let climbs = 0, oldVy = r.vy, elapsed = 0;
    for (let i = 0; i < 120 * 300 && r.phase === 'flying'; i++) {
      r.stamina = r.maxStamina;
      r.x = 0; r.time = 0; // Disable goal and timeout: require a physical landing.
      elapsed += 1 / 120;
      M.step(r, 1 / 120, control(r));
      const energy = r.vx ** 2 / 2 + r.vy ** 2 / 2 + 14 * r.y;
      assert.ok(energy <= previous + 1e-7);
      previous = energy;
      if (oldVy < 0 && r.vy > 0) climbs++;
      oldVy = r.vy;
    }
    assert.ok(climbs >= 2);
    assert.equal(r.phase, 'sliding');
    assert.ok(elapsed < 300);
  }
});
test('low speed loses pull-up authority and dive takes priority', () => {
  const r = M.create(M.profile()); M.launch(r); r.items = []; r.ruins = [];
  r.vx = 20; r.vy = 0;
  M.step(r, .05, { glide: true });
  assert.equal(r.stalled, true); assert.ok(r.vy < 0);
  const stamina = r.stamina;
  M.step(r, .05, { glide: true, dive: true });
  assert.equal(r.gliding, false); assert.equal(r.stalled, false);
  assert.equal(r.stamina, stamina); assert.ok(r.pitch < 0);
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
  const upgraded=fly(p,cycleControl());assert.equal(upgraded.reason,'goal');assert.equal(upgraded.x,5000);
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

test('character choice survives saves, accepts old saves, and leaves flight performance identical', () => {
  assert.equal(M.profile({ silver: 77 }).character, 'kliff');
  assert.equal(M.profile({ character: 'unknown' }).character, 'kliff');
  const p = M.profile({ character: 'damian', silver: 77, upgrades: { wing: 2 } });
  assert.deepEqual(M.profile(JSON.parse(JSON.stringify(p))), p);
  const kliff = fly({ ...p, character: 'kliff' }, cycleControl());
  const damian = fly(p, cycleControl());
  assert.deepEqual(damian, kliff);
});

test('neutral input glides gently while up climbs and down dives', () => {
  const simulate = input => {
    const r = M.create(M.profile()); M.launch(r);
    r.y = 300; r.vx = 110; r.vy = -24; r.items = []; r.ruins = [];
    for (let i = 0; i < 180; i++) M.step(r, 1 / 120, input);
    return r;
  };
  const neutral = simulate({}), up = simulate({ glide: true }), down = simulate({ dive: true });
  assert.ok(neutral.vy < 0 && neutral.vy > -30);
  assert.ok(up.vy > 0 && up.y > neutral.y);
  assert.ok(down.vy < neutral.vy && down.y < neutral.y);
  assert.equal(neutral.stamina, neutral.maxStamina);
  assert.equal(down.stamina, down.maxStamina);
  assert.ok(up.stamina < up.maxStamina);
});

test('tuned gravity accelerates descent every second and stronger gravity falls faster', () => {
  const fall = gravity => {
    const r = M.create(M.profile(), 17, { gravity, startHeight: 500, glideLift: 0, neutralDrag: 0 });
    M.launch(r); r.vx = 80; r.vy = 0; r.items = []; r.ruins = [];
    for (let i=0;i<120;i++) M.step(r,1/120);
    const first = r.vy;
    for (let i=0;i<120;i++) M.step(r,1/120);
    assert.ok(Math.abs(first + gravity) < 1e-8);
    assert.ok(Math.abs(r.vy + 2 * gravity) < 1e-8);
    assert.ok(Math.abs(r.y - (500 - gravity * 2)) < 1e-8);
    return r;
  };
  const low = fall(10), high = fall(30);
  assert.ok(high.y < low.y); assert.ok(high.vy < low.vy);
});
test('tuning sanitizes saved values and applies launch, height and dash settings', () => {
  const sanitized = M.tuning({ gravity: Infinity, startHeight: -100, neutralDrag: -1, pullRate: 99 });
  assert.equal(sanitized.gravity, 14); assert.equal(sanitized.startHeight, 30);
  assert.equal(sanitized.neutralDrag, 0); assert.equal(sanitized.pullRate, 3);
  const settings = M.tuning({ startHeight: 450, launchSpeed: 100, launchPower: 80, boostSpeed: 40, boostLift: 20 });
  assert.deepEqual(M.tuning(JSON.parse(JSON.stringify(settings))), settings);
  const r = M.create(M.profile(), 17, settings);
  assert.equal(r.y, 450); assert.equal(r.maxHeight, 450);
  M.launch(r, 15, 1); assert.ok(Math.abs(Math.hypot(r.vx, r.vy) - 180) < 1e-8);
  const vx = r.vx, vy = r.vy; M.boost(r);
  assert.equal(r.vx, vx + 40); assert.equal(r.vy, vy + 20);
  settings.gravity = 60; assert.equal(r.tuning.gravity, 14);
});
