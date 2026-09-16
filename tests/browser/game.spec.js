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
    await guest.locator('#online-tools summary').click();await guest.locator('#room-leave').click(); await guest.locator('#accept').click();
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

test('classic selection removes special rules, plays a recorded shot, and modern restores them',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/alkkagi.html');
  await page.locator('#ruleset').selectOption('classic');await page.locator('#cancel').click();
  await expect(page.locator('#ruleset')).toHaveValue('modern');
  await page.locator('#ruleset').selectOption('classic');await page.locator('#accept').click();
  await expect(page.locator('#ruleset')).toHaveValue('classic');
  await expect(page.locator('#iron-panel')).toBeHidden();await expect(page.locator('#spin-panel')).toBeHidden();await expect(page.locator('#guide-0')).toBeHidden();
  expect(await page.evaluate(()=>phase)).toBe('aim');
  await page.locator('#local-mode').click();await page.locator('#accept').click();
  const planned=await page.evaluate(()=>{
    window.observed=[];window.alkkagiEffects.on('*',(_,type)=>window.observed.push(type));
    launch(stones[0],100,0);
    return{result:lastShot.result,frames:lastShot.frames.length,before:stones[0].x,target:lastShot.frames.at(-1)[0].x};
  });
  expect(planned.frames).toBeGreaterThan(1);expect(planned.target).toBeGreaterThan(planned.before);
  await expect.poll(()=>page.evaluate(()=>phase)).toBe('aim');
  expect(await page.evaluate(()=>stones)).toEqual(await page.evaluate(()=>lastShot.frames.at(-1)));
  expect(await page.evaluate(()=>window.observed)).toEqual(expect.arrayContaining(['shot:prepared','shot:start','shot:end','turn:start']));
  await page.locator('#help-open').click();await expect(page.locator('#help-ruleset')).toContainText('클래식');await expect(page.locator('.help-guide')).toBeHidden();await page.locator('#help-close').click();
  await page.setViewportSize({width:320,height:740});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/classic-mobile.png',fullPage:true});
  await page.locator('#ruleset').selectOption('modern');await page.locator('#accept').click();
  await expect(page.locator('#spin-panel')).toBeVisible();await expect(page.locator('#guide-0')).toBeVisible();await expect(page.locator('#iron-panel')).toBeVisible();
  expect(await page.evaluate(()=>lastShot)).toBe(null);expect(errors).toEqual([]);
});

test('character presets react separately to real iron hits and customize the guided-shot hook',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/alkkagi.html');
  await page.evaluate(()=>{
    AlkkagiCharacters.register({id:'test-hero',name:'테스트 공격자',responses:{
      'iron:hit':{actor:{lines:['막혔네!'],effects:[{type:'test-flash'}]}},
      'guide:used':{actor:{lines:['계산하고 간다!'],effects:[{type:'guide-cue'}]}},
    }});
    AlkkagiCharacters.register({id:'test-rival',name:'테스트 수비자',responses:{'iron:hit':{target:{lines:['내가 막았다!'],effects:[{type:'test-flash'}]}}}});
    setMode('local');phase='aim';turn=0;
    alkkagiCharacters.assign(0,'test-hero');alkkagiCharacters.assign(1,'test-rival');
    window.customEffects=[];window.reactions=[];window.guideEvents=[];
    alkkagiPresentation.registerEffect('test-flash',reaction=>customEffects.push({team:reaction.team,role:reaction.role}));
    alkkagiEffects.on('character:reaction',reaction=>reactions.push(reaction));
    alkkagiEffects.on('guide:used',event=>guideEvents.push(event));
    stones=[{id:0,team:0,x:400,y:400,vx:0,vy:0,alive:true},{id:5,team:1,x:600,y:400,vx:0,vy:0,alive:true,iron:true}];
    launch(stones[0],700,0);
  });
  await expect(page.locator('#character-reaction-0')).toContainText('막혔네!');
  await expect(page.locator('#character-reaction-1')).toContainText('내가 막았다!');
  expect(await page.evaluate(()=>customEffects)).toEqual([{team:0,role:'actor'},{team:1,role:'target'}]);
  const positions=await page.evaluate(()=>{
    reset();phase='aim';turn=0;guideArmed[0]=true;
    const before=stones.map(s=>[s.x,s.y]);launch(stones[0],100,0);return before;
  });
  await expect(page.locator('#shot-cue-line')).toHaveText('계산하고 간다!');
  await expect(page.locator('#shot-cue')).toBeVisible();
  expect(await page.evaluate(()=>stones.map(s=>[s.x,s.y]))).toEqual(positions);
  expect(await page.evaluate(()=>guideEvents.length)).toBe(1);
  await page.locator('#help-open').click();await page.waitForTimeout(150);
  expect(await page.evaluate(()=>stones.map(s=>[s.x,s.y]))).toEqual(positions);
  await page.locator('#help-close').click();
  await expect(page.locator('#shot-cue')).toBeHidden();
  expect(await page.evaluate(()=>guideEvents.length)).toBe(1);
  await page.evaluate(()=>{reset();});
  await expect(page.locator('#character-reaction-0')).toBeHidden();await expect(page.locator('#character-reaction-1')).toBeHidden();
  expect(errors).toEqual([]);
});

test('basic character calls shatter, tells the opponent to focus, and queues 1-2-3 without a finisher',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/alkkagi.html');
  await page.evaluate(()=>{
    setMode('local');phase='aim';turn=0;
    stones=[{id:0,team:0,x:400,y:400,vx:0,vy:0,alive:true,iron:true},{id:5,team:1,x:437,y:400,vx:0,vy:0,alive:true,iron:true}];
    launch(stones[0],100,0);
  });
  await expect(page.locator('#shot-highlight')).toHaveText('파쇄!');
  await expect.poll(()=>page.evaluate(()=>phase)).toBe('handoff');
  expect(await page.evaluate(()=>stones[1].alive)).toBe(true);expect(await page.evaluate(()=>stones[1].x)).toBeGreaterThan(437);
  await page.evaluate(()=>{
    reset();phase='aim';turn=0;
    stones=[{id:0,team:0,x:1105,y:400,vx:0,vy:0,alive:true},{id:5,team:1,x:400,y:400,vx:0,vy:0,alive:true}];
    launch(stones[0],100,0);
  });
  await expect(page.locator('#character-reaction-1')).toContainText('집중하세요.');await expect(page.locator('#character-reaction-0')).toBeHidden();
  await page.evaluate(()=>{
    ruleset='classic';setMode('local');turn=0;
    stones=[[0,0,930,400],[5,1,1072,347],[6,1,1038,427],[7,1,1083,442]].map(([id,team,x,y])=>({id,team,x,y,vx:0,vy:0,alive:true}));
    window.calls=[];alkkagiEffects.on('character:reaction',reaction=>calls.push(reaction.line));launch(stones[0],1360,0);
  });
  await expect(page.locator('#shot-combo')).toHaveText('1타2타3타');
  await expect(page.locator('#shot-combo')).toBeHidden();
  expect(await page.evaluate(()=>calls)).toEqual(['1타','2타','3타']);
  expect(errors).toEqual([]);
});

test('large dialogue follows the speaker side, wraps inside the board, and combo impact escalates',async({page})=>{
  await page.goto('/alkkagi.html');
  await page.evaluate(()=>{
    setMode('local');phase='aim';alkkagiCharacters.assign(0,'naruto');
    alkkagiEffects.emit('iron:clash',{id:'large-line',actorTeam:0,targetTeam:1,x:600,y:600});
  });
  const shout=page.locator('#shot-highlight');await expect(shout).toHaveText('이거 보여주려고 어그로 끌었다!');await expect(shout).toHaveAttribute('data-position','bottom');
  const arena=await page.locator('.arena').boundingBox(),box=await shout.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(arena.x);expect(box.x+box.width).toBeLessThanOrEqual(arena.x+arena.width+1);
  expect(await shout.evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(28);
  await page.locator('.arena').screenshot({path:'test-results/speaker-dialogue-mobile.png'});
  const result=await page.evaluate(()=>{
    shotEffects.reset();const before=JSON.stringify(stones),hooks=new AlkkagiShots.Hooks();let flipped=false;
    const effects=AlkkagiPresentation.install(hooks,{impact:()=>{},fall:()=>{},flipped:()=>flipped});
    const context=document.createElement('canvas').getContext('2d');
    hooks.emit('character:reaction',{id:'side',team:1,name:'백돌',line:'못 때리쥬? 약오르쥬!',effects:[],duration:1800});
    effects.draw(context,performance.now());const top=document.getElementById('character-reaction-1').dataset.position;
    flipped=true;effects.draw(context,performance.now());const bottom=document.getElementById('character-reaction-1').dataset.position;
    const strength=[];
    for(const count of [1,2,3]){
      hooks.emit('shot:combo-hit',{count,x:600,y:600});const start=performance.now();let max=0;
      for(let t=10;t<160;t+=10)effects.camera({translate:(x,y)=>max=Math.max(max,Math.hypot(x,y))},start+t);
      strength.push(max);
    }
    effects.reset();const cleared=!document.querySelector('.arena').style.getPropertyValue('--combo-glow');effects.dispose();
    return {top,bottom,strength,cleared,unchanged:before===JSON.stringify(stones)};
  });
  expect(result.top).toBe('top');expect(result.bottom).toBe('bottom');expect(result.strength[1]).toBeGreaterThan(result.strength[0]);expect(result.strength[2]).toBeGreaterThan(result.strength[1]);expect(result.cleared&&result.unchanged).toBe(true);
  await page.emulateMedia({reducedMotion:'reduce'});
  expect(await page.evaluate(()=>{
    const h=new AlkkagiShots.Hooks(),e=AlkkagiPresentation.install(h,{impact:()=>{},fall:()=>{}});let moved=false;
    h.emit('shot:combo-hit',{count:3,x:600,y:600});e.camera({translate:()=>moved=true},performance.now()+50);e.dispose();return moved;
  })).toBe(false);
});

test('combo hits accumulate immediately, persist during play and clear together',async({page})=>{
  await page.setViewportSize({width:320,height:740});await page.goto('/alkkagi.html');
  await page.evaluate(()=>{setMode('local');phase='aim';alkkagiCharacters.assign(0,'kurupping');});
  const el=page.locator('#shot-combo');
  for(const count of [1,2,3]){
    await page.evaluate(count=>alkkagiEffects.emit('shot:combo-hit',{id:'hit-'+count,count,actorTeam:0,targetTeam:1,x:1100,y:400}),count);
    await expect(el).toHaveText(Array.from({length:count},(_,i)=>`${i+1}타`).join(''));
    await expect(page.locator('#shot-highlight')).toHaveText(['하나 나갔쥬?','또 나갔쥬?','계속 나가쥬? 약오르쥬!'][count-1]);
  }
  await page.waitForTimeout(1200);await expect(el).toHaveText('1타2타3타');
  await page.screenshot({path:'test-results/cumulative-combo.png'});
  await page.evaluate(()=>alkkagiEffects.emit('shot:end',{}));
  await expect(el).toBeHidden();expect(await el.locator('b').count()).toBe(0);
  await page.evaluate(()=>{alkkagiEffects.emit('shot:combo-hit',{count:2});alkkagiEffects.emit('shot:start',{});});
  await expect(el).toBeHidden();
});


test('reconnecting during a shot restores accumulated counts without replaying old hits',async({page})=>{
  await page.goto('/alkkagi.html');
  await page.evaluate(()=>{
    const stream=new AlkkagiShots.RemoteEvents(alkkagiEffects);
    stream.receive({id:'resume-combo',done:false,events:[1,2].map(count=>({type:'shot:combo-hit',count,sequence:count}))});
  });
  await expect(page.locator('#shot-combo')).toHaveText('1타2타');
  await page.evaluate(()=>alkkagiEffects.emit('shot:resume',{done:true,events:[{type:'shot:combo-hit',count:3}]}));
  await expect(page.locator('#shot-combo')).toBeHidden();
});
