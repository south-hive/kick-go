(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FlightModel = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const GOAL = 5000;
  const START_HEIGHT = 240;
  const TUNING = [
    { id: 'gravity', name: '중력 가속도', unit: 'm/s²', value: 14, min: 0, max: 60, step: .5, help: '매초 아래 방향 속도에 더해지는 양. 클수록 빨리 떨어집니다.' },
    { id: 'startHeight', name: '시작 높이', unit: 'm', value: 240, min: 30, max: 1000, step: 10, help: '도약 전 절벽의 높이' },
    { id: 'launchSpeed', name: '기본 도약 속도', unit: 'm/s', value: 75, min: 10, max: 250, step: 5, help: '여기에 충전 힘과 도약 강화가 더해집니다.' },
    { id: 'launchPower', name: '충전 추가 속도', unit: 'm/s', value: 50, min: 0, max: 150, step: 5, help: '최대 충전으로 더해지는 속도' },
    { id: 'neutralDrag', name: '활강 공기 저항', unit: '1/s', value: .026, min: 0, max: .2, step: .001, help: '무입력 활강의 감속. 클수록 에너지를 빨리 잃습니다.' },
    { id: 'flightDrag', name: '상승·급강하 기본 저항', unit: '1/s', value: .012, min: 0, max: .2, step: .001, help: '↑ 또는 ↓ 조작 중의 기본 공기 저항' },
    { id: 'pullDrag', name: '상승 추가 저항', unit: '1/s', value: .028, min: 0, max: .2, step: .001, help: '기수를 들 때 추가로 잃는 속도' },
    { id: 'glideAngle', name: '활강 하강 각도', unit: '°', value: .22 * 180 / Math.PI, min: 1, max: 60, step: .1, help: '클수록 무입력 활강이 가파릅니다.' },
    { id: 'glideLift', name: '자동 활강 보정', unit: 'rad/s', value: .65, min: 0, max: 3, step: .05, help: '0이면 자동으로 기수를 들지 않아 중력으로 계속 가속합니다.' },
    { id: 'pullRate', name: '상승 회전 반응', unit: 'rad/s', value: .95, min: .1, max: 3, step: .05, help: '↑를 누를 때 기수를 드는 속도. 실제 반응은 비행 속도에 비례합니다.' },
    { id: 'diveRate', name: '급강하 회전 반응', unit: 'rad/s', value: .55, min: .1, max: 3, step: .05, help: '↓를 누를 때 기수를 내리는 속도' },
    { id: 'staminaDrain', name: '상승 스태미너 소모', unit: '/s', value: 8, min: 4, max: 30, step: .5, help: '날개 강화로 감소하기 전의 초당 소모량' },
    { id: 'boostSpeed', name: '대시 수평 속도 추가', unit: 'm/s', value: 30, min: 0, max: 100, step: 2, help: '섭리의 힘 강화 효과는 별도로 더해집니다.' },
    { id: 'boostLift', name: '대시 상승 속도 추가', unit: 'm/s', value: 16, min: 0, max: 75, step: 1, help: '대시로 얻는 위쪽 속도' },
  ];
  const GEAR = [
    { id: 'stamina', name: '회색갈기의 지구력', icon: '◈', text: '최대 스태미너 +22', base: 45 },
    { id: 'leap', name: '힘의 도약', icon: '↗', text: '도약 속도 +12', base: 40 },
    { id: 'wing', name: '까마귀의 날개', icon: '羽', text: '기수 들기 소모 감소 · 공기 저항 감소', base: 60 },
    { id: 'abyss', name: '섭리의 힘', icon: '✧', text: '공중 추진력 · 상승력 증가', base: 65 },
    { id: 'magnet', name: '심연의 인력', icon: '◎', text: '수집 반경 +14m', base: 35 },
    { id: 'meal', name: '야영지 요리', icon: '♨', text: '보급품 스태미너 회복 +7', base: 40 },
  ];
  const REGIONS = [
    { at: 0, name: '헤르난드의 초원', short: '헤르난드', color: '#8aa48b', sky: '#8fafad' },
    { at: 900, name: '페일룬의 설산', short: '페일룬', color: '#bed6d7', sky: '#7c9bad' },
    { at: 2200, name: '붉은사막의 협곡', short: '붉은사막', color: '#d09361', sky: '#c0937b' },
    { at: 4000, name: '심연의 경계', short: '심연', color: '#84c9c4', sky: '#576e80' },
  ];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const finite = (x, fallback = 0) => typeof x === 'number' && Number.isFinite(x) ? x : fallback;
  const integer = (x, max) => Math.floor(clamp(finite(x), 0, max));
  function tuning(value) {
    return Object.fromEntries(TUNING.map(t => [t.id, clamp(finite(value?.[t.id], t.value), t.min, t.max)]));
  }
  function profile(value) {
    const p = value && typeof value === 'object' ? value : {};
    return { version: 1, character: p.character === 'damian' ? 'damian' : 'kliff', silver: integer(p.silver, 10000000), best: clamp(finite(p.best), 0, GOAL),
      runs: integer(p.runs, 1000000), total: clamp(finite(p.total), 0, 1000000000),
      upgrades: Object.fromEntries(GEAR.map(g => [g.id, integer(p.upgrades?.[g.id], 5)])) };
  }
  function cost(p, id) {
    const gear = GEAR.find(g => g.id === id);
    return !gear || p.upgrades[id] >= 5 ? null : Math.round(gear.base * Math.pow(1.7, p.upgrades[id]));
  }
  function buy(p, id) {
    const price = cost(p, id);
    if (price === null || p.silver < price) return false;
    p.silver -= price; p.upgrades[id]++; return true;
  }
  function region(x) { return REGIONS.filter(r => r.at <= x).at(-1) || REGIONS[0]; }
  function create(p, seed = 17, settings) {
    const physics = tuning(settings);
    const levels = { ...profile(p).upgrades };
    let randomState = (seed >>> 0) || 1;
    const random = () => ((randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0) / 4294967296);
    const items = [];
    for (let x = 140, n = 0; x < GOAL; x += 115, n++) {
      const type = n % 7 === 3 ? 'food' : n % 7 === 6 ? 'wind' : 'silver';
      items.push({ x, y: 42 + random() * 150, type, taken: false });
      if (type === 'silver') items.push({ x: x + 28, y: items.at(-1).y + 8, type, taken: false });
    }
    return { phase: 'ready', x: 0, y: physics.startHeight, vx: 0, vy: 0, time: 0, levels, tuning: physics,
      stamina: 100 + levels.stamina * 22, maxStamina: 100 + levels.stamina * 22,
      cooldown: 0, boostTrail: 0, hit: 0, gliding: false, pitch: 0, stalled: false, items, coins: 0, collected: 0,
      ruins: [740, 1640, 2540, 3440, 4340].map((x, i) => ({ x, y: 65 + (i % 3) * 35, hit: false })),
      notice: '', noticeTime: 0, maxHeight: physics.startHeight, rewarded: false, reward: 0, reason: '' };
  }
  function launch(run, angle = 38, power = .85) {
    if (run.phase !== 'ready') return false;
    const rad = clamp(finite(angle, 38), 15, 75) * Math.PI / 180;
    const speed = run.tuning.launchSpeed + clamp(finite(power, .85), .2, 1) * run.tuning.launchPower + run.levels.leap * 12;
    run.vx = Math.cos(rad) * speed; run.vy = Math.sin(rad) * speed;
    run.phase = 'flying'; return true;
  }
  function boost(run) {
    if (run.phase !== 'flying' || run.stamina < 24 || run.cooldown > 0) return false;
    run.stamina -= 24; run.vx = Math.min(250, run.vx + run.tuning.boostSpeed + run.levels.abyss * 8);
    run.vy = Math.min(75, run.vy + run.tuning.boostLift + run.levels.abyss * 3);
    run.cooldown = 1.2; run.boostTrail = .7;
    run.notice = '섭리의 힘 · 대시'; run.noticeTime = 1;
    return true;
  }
  function step(run, dt, input = {}) {
    if (run.phase !== 'flying' && run.phase !== 'sliding') return;
    dt = clamp(finite(dt), 0, .05);
    run.time += dt; run.cooldown = Math.max(0, run.cooldown - dt);
    run.boostTrail = Math.max(0, run.boostTrail - dt); run.hit = Math.max(0, run.hit - dt);
    run.noticeTime = Math.max(0, run.noticeTime - dt);
    run.gliding = run.phase === 'flying' && !!input.glide && !input.dive && run.stamina > 0;
    if (run.phase === 'flying') {
      // Gravity trades height for speed. Lift rotates velocity without adding energy.
      // Exact ballistic displacement plus dissipative drag keeps every pull-up lossy.
      const oldVy = run.vy;
      run.vy -= run.tuning.gravity * dt;
      run.y += (oldVy + run.vy) * .5 * dt;
      run.x += run.vx * dt;
      const speed = Math.hypot(run.vx, run.vy);
      let angle = Math.atan2(run.vy, run.vx);
      run.stalled = run.gliding && speed < 48;
      if (run.gliding) {
        run.stamina = Math.max(0, run.stamina - (run.tuning.staminaDrain - run.levels.wing * .7) * dt);
        const authority = clamp((speed - 32) / 75, 0, 1);
        angle += Math.min(Math.max(0, Math.PI * .36 - angle), run.tuning.pullRate * authority * dt);
      } else if (input.dive) {
        angle -= Math.min(Math.max(0, angle + Math.PI * .43), run.tuning.diveRate * dt);
      } else {
        // Unheld wings steer gently toward a descending glide, without adding energy.
        const target = -run.tuning.glideAngle * Math.PI / 180, authority = clamp((speed - 28) / 65, 0, 1);
        if (angle < target) angle += Math.min(target - angle, run.tuning.glideLift * authority * dt);
      }
      const drag = ((input.dive || run.gliding ? run.tuning.flightDrag : run.tuning.neutralDrag) + (run.gliding ? run.tuning.pullDrag : 0) + (run.stalled ? .055 : 0)) * (1 - run.levels.wing * .07);
      const remainingSpeed = speed * Math.exp(-drag * dt);
      run.vx = Math.cos(angle) * remainingSpeed;
      run.vy = Math.sin(angle) * remainingSpeed;
      run.maxHeight = Math.max(run.maxHeight, run.y);
      for (const item of run.items) {
        if (item.taken || Math.hypot(run.x - item.x, run.y - item.y) > 30 + run.levels.magnet * 14) continue;
        item.taken = true; run.collected++;
        if (item.type === 'silver') { run.coins += 8; run.notice = '은화 +8'; }
        else if (item.type === 'food') {
          run.stamina = Math.min(run.maxStamina, run.stamina + 24 + run.levels.meal * 7);
          run.notice = '야영 보급 · 스태미너 회복';
        } else {
          run.vy = Math.max(run.vy, 22); run.vx = Math.min(250, run.vx + 12);
          run.notice = '상승 기류';
        }
        run.noticeTime = 1.4;
      }
      for (const rock of run.ruins) {
        if (rock.hit || Math.abs(run.x - rock.x) > 24 || Math.abs(run.y - rock.y) > 23) continue;
        rock.hit = true; run.hit = .7; run.vx *= .65; run.vy = -15;
        run.stamina = Math.max(0, run.stamina - 15); run.notice = '부유 유적 충돌'; run.noticeTime = 1.5;
      }
      if (run.y <= 0) { run.y = 0; run.vy = 0; run.phase = 'sliding'; run.gliding = false; }
    } else {
      run.x += run.vx * dt; run.vx = Math.max(0, run.vx - 65 * dt);
      if (run.vx <= 1) { run.phase = 'over'; run.reason = 'landed'; }
    }
    run.pitch = Math.atan2(run.vy, run.vx);
    if (run.x >= GOAL) { run.x = GOAL; run.phase = 'over'; run.reason = 'goal'; }
    else if (run.time >= 90) { run.phase = 'over'; run.reason = 'storm'; }
  }
  function settle(p, run) {
    if (run.phase !== 'over' || run.rewarded) return false;
    run.rewarded = true; run.newBest = Math.floor(run.x) > p.best;
    run.reward = 12 + Math.floor(run.x / 12) + run.coins + (run.reason === 'goal' ? 200 : 0);
    p.silver = Math.min(10000000, p.silver + run.reward); p.best = Math.max(p.best, Math.floor(run.x));
    p.total = Math.min(1000000000, p.total + Math.floor(run.x)); p.runs++;
    return true;
  }
  return { GOAL, START_HEIGHT, TUNING, tuning, GEAR, REGIONS, profile, cost, buy, region, create, launch, boost, step, settle };
});
