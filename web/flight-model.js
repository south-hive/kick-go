(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FlightModel = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const GOAL = 5000;
  const GEAR = [
    { id: 'stamina', name: '회색갈기의 지구력', icon: '◈', text: '최대 스태미너 +22', base: 45 },
    { id: 'leap', name: '힘의 도약', icon: '↗', text: '도약 속도 +12', base: 40 },
    { id: 'wing', name: '까마귀의 날개', icon: '羽', text: '활공 소모 감소 · 공기 저항 감소', base: 60 },
    { id: 'abyss', name: '심연의 힘', icon: '✧', text: '공중 추진력 · 상승력 증가', base: 65 },
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
  function profile(value) {
    const p = value && typeof value === 'object' ? value : {};
    return { version: 1, silver: integer(p.silver, 10000000), best: clamp(finite(p.best), 0, GOAL),
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
  function create(p, seed = 17) {
    const levels = { ...profile(p).upgrades };
    let randomState = (seed >>> 0) || 1;
    const random = () => ((randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0) / 4294967296);
    const items = [];
    for (let x = 140, n = 0; x < GOAL; x += 115, n++) {
      const type = n % 7 === 3 ? 'food' : n % 7 === 6 ? 'wind' : 'silver';
      items.push({ x, y: 42 + random() * 150, type, taken: false });
      if (type === 'silver') items.push({ x: x + 28, y: items.at(-1).y + 8, type, taken: false });
    }
    return { phase: 'ready', x: 0, y: 64, vx: 0, vy: 0, time: 0, levels,
      stamina: 100 + levels.stamina * 22, maxStamina: 100 + levels.stamina * 22,
      cooldown: 0, boostTrail: 0, hit: 0, gliding: false, items, coins: 0, collected: 0,
      ruins: [740, 1640, 2540, 3440, 4340].map((x, i) => ({ x, y: 65 + (i % 3) * 35, hit: false })),
      notice: '', noticeTime: 0, maxHeight: 64, rewarded: false, reward: 0, reason: '' };
  }
  function launch(run, angle = 38, power = .85) {
    if (run.phase !== 'ready') return false;
    const rad = clamp(finite(angle, 38), 15, 75) * Math.PI / 180;
    const speed = 75 + clamp(finite(power, .85), .2, 1) * 50 + run.levels.leap * 12;
    run.vx = Math.cos(rad) * speed; run.vy = Math.sin(rad) * speed;
    run.phase = 'flying'; return true;
  }
  function boost(run) {
    if (run.phase !== 'flying' || run.stamina < 24 || run.cooldown > 0) return false;
    run.stamina -= 24; run.vx = Math.min(250, run.vx + 30 + run.levels.abyss * 8);
    run.vy = Math.min(75, run.vy + 16 + run.levels.abyss * 3);
    run.cooldown = 1.2; run.boostTrail = .7;
    run.notice = '심연 추진'; run.noticeTime = 1;
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
      if (run.gliding) {
        run.stamina = Math.max(0, run.stamina - (11 - run.levels.wing * 1.1) * dt);
        run.vy += (-4 - run.vy) * Math.min(1, dt * 1.4);
      } else run.vy -= (input.dive ? 40 : 24) * dt;
      run.vx *= Math.exp(-(run.gliding ? .018 : .026) * (1 - run.levels.wing * .07) * dt);
      run.x += run.vx * dt; run.y += run.vy * dt;
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
  return { GOAL, GEAR, REGIONS, profile, cost, buy, region, create, launch, boost, step, settle };
});
