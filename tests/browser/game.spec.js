const { test, expect } = require('@playwright/test');
test.beforeEach(async({page})=>{await page.addInitScript(()=>{Math.random=()=>.1;});});

async function online(page) {
  await page.goto('/alkkagi.html'); await page.evaluate(()=>setMode('online')); // Legacy invitation flow remains supported.
}
async function shoot(page, id) {
  await page.locator('#game').scrollIntoViewIfNeeded();
  const box = await page.locator('#game').boundingBox();
  const stone = await page.evaluate(id => viewPoint(stones.find(s => s.id === id)), id);
  const x = box.x + stone.x / 1200 * box.width, y = box.y + stone.y / 1200 * box.height;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 12, y, { steps: 3 }); await page.mouse.up();
}

test('two browser contexts trade shots, share positions, and resume after reload', async ({ browser }) => {
  const a = await browser.newContext({ baseURL: 'http://127.0.0.1:8091', viewport: { width: 393, height: 852 } });
  const b = await browser.newContext({ baseURL: 'http://127.0.0.1:8091', viewport: { width: 393, height: 852 } });
  const c = await browser.newContext({baseURL:'http://127.0.0.1:8091',viewport:{width:393,height:852}});
  const host = await a.newPage(), guest = await b.newPage(), watch=await c.newPage();
  const errors = []; for (const p of [host, guest, watch]) p.on('pageerror', e => errors.push(e.message));
  try {
    await online(host); await host.locator('#room-create').click();
    await expect(host.locator('#online-role')).toHaveText('나: 흑돌');
    await expect(host.locator('#online-lobby')).toBeHidden();
    const link = await host.locator('#invite-link').inputValue();
    await guest.goto(link); await guest.locator('#room-join').click();
    await expect(guest.locator('#online-role')).toHaveText('나: 백돌');
    await host.locator('#iron-options button').nth(4).click();await host.locator('#iron-confirm').click();
    await guest.locator('#iron-options button').nth(4).click();await guest.locator('#iron-confirm').click();
    await expect.poll(()=>host.evaluate(()=>phase)).toBe('aim');
    const watchLink=new URL(link);watchLink.searchParams.set('watch','1');await watch.goto(watchLink.href);await expect(watch.locator('#online-role')).toHaveText('관전 중');
    const firstTeam=await host.evaluate(()=>net.state.firstPlayer);
    const first=firstTeam===0?host:guest,second=firstTeam===0?guest:host;
    await expect(first.locator('#status')).toContainText('내 차례');
    expect(await host.evaluate(()=>stones.filter(s=>s.team===1).some(s=>'iron' in s))).toBe(false);
    expect(await guest.evaluate(()=>stones.filter(s=>s.team===0).some(s=>'iron' in s))).toBe(false);
    expect(await guest.evaluate(()=>viewPoint(stones.find(s=>s.id===5)).y)).toBeGreaterThan(600);
    expect(await host.evaluate(()=>flippedView())).toBe(false);
    await guest.locator('#game').screenshot({path:'test-results/white-online-view.png'});
    await expect(second.locator('#strike-pad')).toBeDisabled();
    await first.locator('#guide-'+firstTeam).click();
    await expect.poll(()=>first.evaluate(()=>net.state.guideArmed[net.session.team])).toBe(true);
    await shoot(first, firstTeam*5);
    await expect(first.locator('#shot-cue')).toBeVisible();
    await expect(second.locator('#shot-cue')).toBeVisible();
    await expect(watch.locator('#shot-cue')).toBeVisible();
    await expect(watch.locator('#shot-cue-name')).toHaveText(await first.locator('#shot-cue-name').textContent());
    await expect(second.locator('#status')).toContainText('내 차례');
    await expect(first.locator('#strike-pad')).toBeDisabled();
    expect(await first.evaluate(()=>net.state.guideRemaining[net.session.team])).toBe(0);
    const board = await host.evaluate(() => stones.map(({ x, y, alive }) => ({ x, y, alive })));
    await expect.poll(() => guest.evaluate(() => stones.map(({ x, y, alive }) => ({ x, y, alive })))).toEqual(board);
    await guest.reload();
    await expect(guest.locator('#online-role')).toHaveText('나: 백돌');
    await expect(second.locator('#status')).toContainText('내 차례');
    await expect.poll(() => guest.evaluate(() => stones.map(({ x, y, alive }) => ({ x, y, alive })))).toEqual(board);
    await shoot(second, (1-firstTeam)*5); await expect(first.locator('#status')).toContainText('내 차례');
    await expect(first.locator('#guide-'+firstTeam)).toBeDisabled();
    await host.locator('#online-panel').scrollIntoViewIfNeeded();
    await host.screenshot({ path: 'test-results/online-mobile.png', fullPage: true });
    await guest.locator('#room-leave').click(); await guest.locator('#accept').click();
    await expect(host.locator('#online-message')).toContainText('종료');
    expect(errors).toEqual([]);
  } finally { await a.close(); await b.close(); await c.close(); }
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
  // CI rendering can advance the fixed-step simulation slower than wall time.
  await shoot(page, 0); await expect.poll(() => page.evaluate(() => turn), { timeout: 10000, intervals: [100] }).toBe(1);
});

test('aim cancels with Escape, release on cancel button and a second touch without spending a guide',async({page})=>{
  await page.goto('/alkkagi.html');await page.locator('#iron-options button').first().click();await page.locator('#iron-confirm').click();
  await page.locator('#guide-0').click();await page.locator('#game').scrollIntoViewIfNeeded();
  const before=await page.evaluate(()=>JSON.stringify(stones));
  const box=await page.locator('#game').boundingBox();
  const x=box.x+256/1200*box.width,y=box.y+984/1200*box.height;
  async function aim(){await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+25,y);await expect(page.locator('#cancel-aim')).toBeEnabled();}
  await aim();await page.keyboard.press('Escape');await page.mouse.up();
  expect(await page.evaluate(()=>drag)).toBe(null);expect(await page.evaluate(()=>JSON.stringify(stones))).toBe(before);
  await aim();
  const cancel=await page.locator('#cancel-aim').boundingBox();await page.mouse.move(cancel.x+cancel.width/2,cancel.y+cancel.height/2);await page.mouse.up();
  expect(await page.evaluate(()=>drag)).toBe(null);expect(await page.evaluate(()=>JSON.stringify(stones))).toBe(before);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+20,y,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x+20,y,id:1},{x:x+60,y:y-50,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  expect(await page.evaluate(()=>drag)).toBe(null);expect(await page.evaluate(()=>JSON.stringify(stones))).toBe(before);
  expect(await page.evaluate(()=>guideRemaining[0])).toBe(1);await expect(page.locator('#power-number')).toHaveText('0%');
  await aim();await page.mouse.up();await expect.poll(()=>page.evaluate(()=>guideRemaining[0])).toBe(0);
});

test('rematch request is visible on the result overlay and acceptance sends the current match',async({page})=>{
  await page.goto('/alkkagi.html');
  await page.evaluate(()=>{
    setMode('online');net.connected=true;net.session={team:0,code:'ABCDEF123456'};
    net.state={phase:'over',turn:0,match:3,revision:10,firstPlayer:1,guideRemaining:[0,0],guideArmed:[false,false],ironReady:[true,true],votes:[false,true],connected:[true,true],stones:P.setup()};
    applyOnlineState(net.state);renderOnline();window.sent=[];net.send=m=>{window.sent.push(m);return true;};
  });
  await expect(page.locator('#result')).toBeVisible();await expect(page.locator('#rematch-message')).toContainText('상대가 재대결');
  await expect(page.locator('#again')).toHaveText('재대결 수락');await page.locator('#again').click();
  expect(await page.evaluate(()=>window.sent)).toEqual([{type:'rematch',match:3}]);
  expect(await page.evaluate(()=>{net.session.team=null;return flippedView();})).toBe(false);
});

test('a new local game can open with white and rematch swaps opener and guide allowance',async({page})=>{
  await page.goto('/alkkagi.html');
  const result=await page.evaluate(()=>{Math.random=()=>.9;reset();const first=[firstPlayer,...guideRemaining];reset(true);return{first,second:[firstPlayer,...guideRemaining]};});
  expect(result).toEqual({first:[1,2,1],second:[0,1,2]});
});

test('guided local shot shows a board-centered nickname cue before launch and clears on reset',async({page})=>{
  await page.goto('/alkkagi.html');
  await page.evaluate(()=>localStorage.setItem('arcade-nickname','용감한 고양이'));
  await page.locator('#iron-options button').first().click();await page.locator('#iron-confirm').click();
  await page.locator('#guide-0').click();
  const before=await page.evaluate(()=>{const positions=stones.map(s=>[s.x,s.y,s.vx,s.vy]);launch(stones[0],100,0);return positions;});
  await expect(page.locator('#shot-cue')).toBeVisible();await expect(page.locator('#shot-cue-name')).toHaveText('용감한 고양이,');
  expect(await page.evaluate(()=>stones.map(s=>[s.x,s.y,s.vx,s.vy]))).toEqual(before);
  await expect(page.locator('#strike-pad')).toBeDisabled();
  await page.locator('.arena').screenshot({path:'test-results/coward-cue-mobile.png'});
  await expect(page.locator('#shot-cue')).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>stones[0].x)).toBeGreaterThan(before[0][0]);
  expect(await page.evaluate(()=>guideRemaining[0])).toBe(0);
  await page.evaluate(()=>{reset();phase='aim';turn=0;guideArmed[0]=true;launch(stones[0],100,0);reset();});
  await expect(page.locator('#shot-cue')).toBeHidden();
  expect(await page.evaluate(()=>queuedShot)).toBe(null);
});

test('help is optional, pauses local play and guide emphasis follows remaining uses',async({page})=>{
  await page.goto('/alkkagi.html');
  await expect(page.locator('#game-help')).not.toBeVisible();
  await page.locator('#iron-options button').first().click();await page.locator('#iron-confirm').click();
  await expect(page.locator('#guide-0')).toHaveClass(/guide-ready/);
  await expect(page.locator('#guide-0')).toContainText('궤적 미리보기');
  await page.locator('#help-open').click();
  await expect(page.getByRole('dialog',{name:'알까기 · 게임 방법'})).toBeVisible();
  await page.evaluate(()=>{launch(stones[0],100,0);});
  const before=await page.evaluate(()=>stones.map(s=>[s.x,s.y]));
  await page.waitForTimeout(250);
  expect(await page.evaluate(()=>stones.map(s=>[s.x,s.y]))).toEqual(before);
  await page.screenshot({path:'test-results/alkkagi-help-mobile.png'});
  await page.keyboard.press('Escape');
  await expect(page.locator('#game-help')).not.toBeVisible();
  await expect(page.locator('#help-open')).toBeFocused();
  await expect.poll(()=>page.evaluate(()=>stones[0].x)).toBeGreaterThan(before[0][0]);
  await page.evaluate(()=>{reset();phase='aim';turn=0;guideRemaining[0]=0;syncGuides();});
  await expect(page.locator('#guide-0')).toBeDisabled();
  await expect(page.locator('#guide-0')).not.toHaveClass(/has-guides|guide-ready/);
  await expect(page.locator('#guide-0')).toContainText('모두 사용했어요');
  await page.evaluate(()=>{guideRemaining[0]=1;syncGuides();});
  for(const viewport of [{width:320,height:740},{width:844,height:390}]){
    await page.setViewportSize(viewport);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/alkkagi-guide-${viewport.width}.png`,fullPage:true});
  }
});
