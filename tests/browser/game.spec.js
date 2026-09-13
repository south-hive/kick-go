const { test, expect } = require('@playwright/test');

async function online(page) {
  await page.goto('/'); await page.locator('#choose-alkkagi').click(); await page.locator('#online-mode').click(); await page.locator('#accept').click();
}
async function shoot(page, id) {
  await page.locator('#game').scrollIntoViewIfNeeded();
  const box = await page.locator('#game').boundingBox();
  const stone = await page.evaluate(id => stones.find(s => s.id === id), id);
  const x = box.x + stone.x / 1200 * box.width, y = box.y + stone.y / 1200 * box.height;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 12, y, { steps: 3 }); await page.mouse.up();
}

test('two browser contexts trade shots, share positions, and resume after reload', async ({ browser }) => {
  const a = await browser.newContext({ baseURL: 'http://127.0.0.1:8091', viewport: { width: 393, height: 852 } });
  const b = await browser.newContext({ baseURL: 'http://127.0.0.1:8091', viewport: { width: 393, height: 852 } });
  const host = await a.newPage(), guest = await b.newPage();
  const errors = []; for (const p of [host, guest]) p.on('pageerror', e => errors.push(e.message));
  try {
    await online(host); await host.locator('#room-create').click();
    await expect(host.locator('#online-role')).toHaveText('나: 흑돌');
    await expect(host.locator('#online-lobby')).toBeHidden();
    const link = await host.locator('#invite-link').inputValue();
    await guest.goto(link); await guest.locator('#room-join').click();
    await expect(guest.locator('#online-role')).toHaveText('나: 백돌');
    await host.locator('#iron-options button').nth(4).click();await host.locator('#iron-confirm').click();
    await guest.locator('#iron-options button').nth(4).click();await guest.locator('#iron-confirm').click();
    await expect(host.locator('#status')).toContainText('내 차례');
    expect(await host.evaluate(()=>stones.filter(s=>s.team===1).some(s=>'iron' in s))).toBe(false);
    expect(await guest.evaluate(()=>stones.filter(s=>s.team===0).some(s=>'iron' in s))).toBe(false);
    await expect(guest.locator('#strike-pad')).toBeDisabled();
    await shoot(host, 0);
    await expect(guest.locator('#status')).toContainText('내 차례');
    await expect(host.locator('#strike-pad')).toBeDisabled();
    const board = await host.evaluate(() => stones.map(({ x, y, alive }) => ({ x, y, alive })));
    await expect.poll(() => guest.evaluate(() => stones.map(({ x, y, alive }) => ({ x, y, alive })))).toEqual(board);
    await guest.reload();
    await expect(guest.locator('#online-role')).toHaveText('나: 백돌');
    await expect(guest.locator('#status')).toContainText('내 차례');
    await expect.poll(() => guest.evaluate(() => stones.map(({ x, y, alive }) => ({ x, y, alive })))).toEqual(board);
    await shoot(guest, 5); await expect(host.locator('#status')).toContainText('내 차례');
    await host.locator('#online-panel').scrollIntoViewIfNeeded();
    await host.screenshot({ path: 'test-results/online-mobile.png', fullPage: true });
    await guest.locator('#room-leave').click(); await guest.locator('#accept').click();
    await expect(host.locator('#online-message')).toContainText('종료');
    expect(errors).toEqual([]);
  } finally { await a.close(); await b.close(); }
});

test('iron selection, owner marker and ordinary prediction work on mobile and desktop',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const viewport of [{width:393,height:852},{width:1366,height:900}]){
    await page.setViewportSize(viewport);await page.goto('/alkkagi.html');
    await expect(page.locator('#iron-panel')).toBeVisible();
    await page.locator('#iron-options button').first().click();await page.locator('#iron-confirm').click();
    await expect(page.locator('#iron-panel')).toBeHidden();
    await expect(page.locator('#iron-state')).toContainText('대기');
    await page.locator('#guide-0').click();
    await page.evaluate(()=>{
      stones=[{id:0,team:0,x:400,y:400,vx:0,vy:0,alive:true,iron:true},{id:5,team:1,x:550,y:410,vx:0,vy:0,alive:true,iron:true}];
      drag={s:stones[0],start:{x:400,y:400},end:{x:260,y:400},screenX:200,screenY:200};
    });
    await expect.poll(()=>page.evaluate(()=>guideCache?.path.collision)).toBe(true);
    expect(await page.evaluate(()=>guideCache.path.branches.length)).toBe(2);
    expect(await page.evaluate(()=>stones.every(s=>s.iron))).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.locator('#game').screenshot({path:`test-results/iron-guide-${viewport.width}.png`});
    await page.evaluate(()=>{cancelDrag();launch(stones[0],100,0);});
    await expect(page.locator('#iron-state')).toContainText('소진');
  }
  expect(errors).toEqual([]);
});

test('local players select privately with a handoff before the first turn',async({page})=>{
  await page.goto('/alkkagi.html');await page.locator('#local-mode').click();await page.locator('#accept').click();
  await expect(page.locator('#iron-picker')).toBeHidden();await page.locator('#iron-reveal').click();
  await page.locator('#iron-options button').nth(2).click();await page.locator('#iron-confirm').click();
  await expect(page.locator('#iron-title')).toContainText('2P');await expect(page.locator('#iron-picker')).toBeHidden();
  await page.locator('#iron-reveal').click();await page.locator('#iron-options button').nth(3).click();await page.locator('#iron-confirm').click();
  await expect(page.locator('#iron-title')).toHaveText('1P 차례');await page.locator('#iron-reveal').click();
  await expect(page.locator('#iron-panel')).toBeHidden();
  expect(await page.evaluate(()=>stones.filter(s=>s.iron).map(s=>s.id))).toEqual([2,8]);
});

test('separate AI module observes public shots, plays a turn and resets its memory',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/alkkagi.html');
  await page.locator('#iron-options button').first().click();await page.locator('#iron-confirm').click();
  const result=await page.evaluate(()=>{
    launch(stones[0],100,0);
    const excluded=aiBelief.probability(0),spent=aiBelief.spent;
    stones=P.setup();turn=1;phase='aim';chooseAI();
    const fired=phase==='moving'&&stones.some(s=>s.team===1&&Math.hypot(s.vx,s.vy)>0);
    reset();return{excluded,spent,fired,reset:aiBelief.probability(0)};
  });
  expect(result.excluded).toBe(0);expect(result.spent).toBeGreaterThan(0);
  expect(result.fired).toBe(true);expect(result.reset).toBe(.2);expect(errors).toEqual([]);
});

test('offline play, strike selection and edge-limited pull still work', async ({ page }) => {
  await page.goto('/');
  await page.locator('#choose-alkkagi').click();
  await page.locator('#iron-options button').first().click();await page.locator('#iron-confirm').click();
  await page.locator('#strike-pad').focus(); await page.keyboard.press('ArrowDown');
  await expect(page.locator('#strike-value')).toContainText('백샷');
  await page.keyboard.press('Home'); await expect(page.locator('#strike-value')).toHaveText('중앙 · 무회전');
  const edgePower = await page.evaluate(() => {
    drag = { start: { x: 256, y: 984 }, end: { x: 256, y: 1084 }, screenX: 100, screenY: innerHeight - 42 };
    const power = shotVector().p; drag = null; return power;
  });
  expect(edgePower).toBe(1);
  await shoot(page, 0); await expect.poll(() => page.evaluate(() => turn), { timeout: 2000 }).toBe(1);
});
