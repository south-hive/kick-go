const {test,expect}=require('@playwright/test');
for(const game of ['alkkagi','naval'])test(`${game} public lobby starts only after readiness and supports game return and watching`,async({browser})=>{
  test.setTimeout(60000);
  const contexts=await Promise.all([0,1,2].map(()=>browser.newContext({baseURL:'http://127.0.0.1:8091',viewport:{width:1366,height:768}})));
  const [host,guest,watch]=await Promise.all(contexts.map(c=>c.newPage())),errors=[];
  for(const p of [host,guest,watch])p.on('pageerror',e=>errors.push(e.message));
  try{
    await host.goto('/');await host.locator('#choose-online').click();
    await expect(host.locator('#ruleset')).toHaveValue('modern');await expect(host.locator('#character')).toHaveValue('random');
    await host.locator('#nickname').fill('친구');await host.locator('#open-create').click();await host.locator('#game').selectOption(game);await host.locator('#title').fill('같이 하는 경기');await host.locator('#create').click();
    await expect(host.locator('#waiting')).toBeVisible();await expect(host.locator('#ready')).toBeDisabled();
    const invite=await host.locator('#invite').inputValue(),code=new URLSearchParams(new URL(invite).hash.slice(1)).get('code');
    await guest.goto('/lobby.html');await guest.locator('#nickname').fill('친구');
    await guest.locator('#character').selectOption('default');
    const row=guest.locator(`.room-card[data-code="${code}"]`);await expect(row).toBeVisible();await row.getByRole('button',{name:'참가',exact:true}).click();
    await expect(guest.locator('#players')).toContainText('친구 (2)');
    await host.locator('#ready').click();await expect(host.locator('#ready')).toHaveText('준비 취소');
    await expect(guest).toHaveURL(/lobby.html/);
    await host.locator('#ready').click();await expect(host.locator('#ready')).toHaveText('준비');
    await guest.reload();await expect(guest.locator('#players')).toContainText('친구 (2)');
    await host.locator('#ready').click();await guest.locator('#ready').click();
    const file=game==='alkkagi'?'alkkagi.html':'battleship.html';
    await expect(host).toHaveURL(new RegExp(file));await expect(guest).toHaveURL(new RegExp(file));
    if(game==='alkkagi'){
      await expect(host.locator('#iron-panel')).toBeVisible();
      expect(await host.evaluate(()=>net.state.ruleset)).toBe('modern');
      expect(await host.evaluate(()=>AlkkagiCharacters.list().some(p=>p.id===net.state.characters[0]))).toBe(true);
      expect(await host.evaluate(()=>net.state.characters[1])).toBe('default');
      await expect(guest.locator('#white-label')).toHaveText('친구 (2)');
    }else await expect(host.locator('#naval-placement')).toBeVisible();
    await watch.goto('/lobby.html');await watch.locator(`.room-card[data-code="${code}"]`).getByRole('button',{name:'관전',exact:true}).click();
    await expect(watch).toHaveURL(new RegExp(file));
    if(game==='alkkagi'){
      await expect(watch.locator('#online-role')).toHaveText('관전 중');await expect(watch.locator('#iron-panel')).toBeHidden();await expect(watch.locator('#strike-pad')).toBeDisabled();
      expect(await watch.evaluate(()=>stones.every(s=>s.iron===false))).toBe(true);
      for(const p of [host,guest]){await p.locator('#iron-options button').first().click();await p.locator('#iron-confirm').click();}
      await expect.poll(()=>host.evaluate(()=>phase)).toBe('aim');
      await expect.poll(()=>watch.evaluate(()=>stones.filter(visibleIron).map(s=>s.team).sort())).toEqual([0,1]);
      await expect(watch.locator('#iron-state')).toContainText('친구 금강불괴 · 대기');
      await expect(watch.locator('#iron-state')).toContainText('친구 (2) 금강불괴 · 대기');
      for(const p of [host,guest])expect(await p.evaluate(()=>stones.filter(s=>s.team!==net.session.team).some(s=>'iron' in s))).toBe(false);

    }else{await expect(watch.locator('#naval-observer-wait')).toBeVisible();await expect(watch.locator('#naval-seas')).toBeHidden();}
    await host.getByRole('link',{name:'← 온라인 로비',exact:true}).click();
    await expect(host.locator('#waiting')).toBeVisible();await expect(host.locator('#room-title')).toHaveText('같이 하는 경기');
    await expect(host.locator('#continue')).toBeVisible();await host.screenshot({path:`test-results/lobby-${game}-mobile.png`,fullPage:true});
    await host.locator('#continue').click();await expect(host).toHaveURL(new RegExp(file));
    await expect.poll(()=>game==='alkkagi'?host.evaluate(()=>net.connected):host.locator('#naval-role').textContent()).toBeTruthy();
    await host.getByRole('link',{name:'← 온라인 로비',exact:true}).click();await expect(host.locator('#waiting')).toBeVisible();await host.locator('#leave').click();await expect(host.locator('#browse')).toBeVisible();
    await expect(guest.locator(game==='alkkagi'?'#online-message':'#naval-status')).toContainText('종료');
    expect(errors).toEqual([]);
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});
test('private room stays out of the list, allows invitations, and renders names as text',async({browser})=>{
  const a=await browser.newContext({viewport:{width:1366,height:768}}),b=await browser.newContext({viewport:{width:1366,height:768}});const host=await a.newPage(),guest=await b.newPage();
  try{
    await host.goto('http://127.0.0.1:8091/lobby.html');await host.locator('#nickname').fill('<b>나</b>');await host.locator('#open-create').click();await host.locator('#title').fill('<img src=x onerror=alert(1)>');await host.locator('#visibility').selectOption('private');await host.locator('#create').click();await expect(host.locator('#waiting')).toBeVisible();
    const invite=await host.locator('#invite').inputValue(),code=new URLSearchParams(new URL(invite).hash.slice(1)).get('code');
    await guest.goto('http://127.0.0.1:8091/lobby.html');await expect(guest.locator('#directory-status')).not.toHaveText('방 목록 연결 중…');await expect(guest.locator(`.room-card[data-code="${code}"]`)).toHaveCount(0);
    await guest.goto(invite);await expect(guest.locator('#code')).toHaveValue(code);await guest.locator('#join').click();await expect(guest.locator('#waiting')).toBeVisible();await expect(guest.locator('#room-title')).toHaveText('<img src=x onerror=alert(1)>');await expect(guest.locator('#room-title img')).toHaveCount(0);await expect(guest.locator('#players')).toContainText('<b>나</b>');
    await host.setViewportSize({width:1280,height:900});await host.screenshot({path:'test-results/lobby-desktop.png',fullPage:true});
  }finally{await a.close();await b.close();}
});

test('classic lobby carries its rule set through readiness, gameplay and reconnect',async({browser})=>{
  const contexts=await Promise.all([0,1].map(()=>browser.newContext({baseURL:'http://127.0.0.1:8091',viewport:{width:1366,height:768}})));
  const [host,guest]=await Promise.all(contexts.map(c=>c.newPage()));
  const errors=[];for(const p of [host,guest])p.on('pageerror',e=>errors.push(e.message));
  try{
    await host.goto('/lobby.html?game=alkkagi');await host.locator('#character').selectOption('kurupping');await host.locator('#open-create').click();await host.locator('#ruleset').selectOption('classic');await host.locator('#create').click();
    await expect(host.locator('#room-game')).toContainText('클래식');await expect(host.locator('#players')).toContainText('쿠루삥삥');await expect(host.locator('#character')).toBeDisabled();const invite=await host.locator('#invite').inputValue();
    await guest.goto('/lobby.html');await guest.locator('#character').selectOption('naruto');await guest.goto(invite);await guest.locator('#join').click();await expect(guest.locator('#room-game')).toContainText('클래식');await expect(guest.locator('#players')).toContainText('나루토');
    await host.locator('#ready').click();await guest.locator('#ready').click();
    for(const p of [host,guest]){
      await expect(p).toHaveURL(/alkkagi\.html/);await expect(p.locator('#ruleset')).toHaveValue('classic');await expect(p.locator('#ruleset')).toBeDisabled();
      await expect(p.locator('#iron-panel')).toBeHidden();await expect(p.locator('#spin-panel')).toBeHidden();
    }
    const shooter=await host.evaluate(()=>net.state.turn===net.session.team)?host:guest;
    await shooter.evaluate(()=>launch(stones.find(s=>s.team===turn),100,0));
    await expect.poll(()=>host.evaluate(()=>net.state.shotPlayback?.done)).toBe(true);
    const end=await host.evaluate(()=>net.state.stones.map(({x,y,alive})=>({x,y,alive})));
    await guest.reload();await expect(guest.locator('#ruleset')).toHaveValue('classic');
    await expect.poll(()=>guest.evaluate(()=>net.state?.characters)).toEqual(['kurupping','naruto']);
    await expect.poll(()=>guest.evaluate(()=>net.state?.stones.map(({x,y,alive})=>({x,y,alive})))).toEqual(end);
    expect(errors).toEqual([]);
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});

test('profile persists separately and directory refresh preserves keyboard focus',async({browser})=>{
  const a=await browser.newContext({viewport:{width:1366,height:768}}),b=await browser.newContext({viewport:{width:1366,height:768}});
  try{
    const host=await a.newPage(),guest=await b.newPage();
    await host.goto('http://127.0.0.1:8091/lobby.html');await host.locator('#open-create').click();await host.locator('#create').click();
    await expect(host.locator('#waiting')).toBeVisible();const code=new URLSearchParams(new URL(await host.locator('#invite').inputValue()).hash.slice(1)).get('code');
    await guest.goto('http://127.0.0.1:8091/lobby.html');await guest.locator('#nickname').fill('프로필');await guest.locator('#character').selectOption('naruto');await guest.reload();
    await expect(guest.locator('#nickname')).toHaveValue('프로필');await expect(guest.locator('#character')).toHaveValue('naruto');
    const button=guest.locator(`[data-code="${code}"] button`);await expect(button).toBeVisible();await button.focus();await guest.waitForTimeout(1300);await expect(button).toBeFocused();
    await button.click();await expect(guest.locator('#players')).toContainText('프로필');await expect(guest.locator('#players')).toContainText('나루토');
  }finally{await a.close();await b.close();}
});

test('mobile hides profile and enters anonymously without replacing saved desktop preferences',async({page})=>{
  await page.goto('/lobby.html');await page.evaluate(()=>{localStorage.setItem('arcade-nickname','PC 이름');localStorage.setItem('arcade-character','naruto');});await page.reload();
  await expect(page.locator('.profile')).toBeHidden();
  await page.locator('#open-create').click();await page.locator('#create').click();await expect(page.locator('#waiting')).toBeVisible();
  await expect(page.locator('#players')).toContainText('익명');await expect(page.locator('#players')).not.toContainText('PC 이름');
  expect(await page.evaluate(()=>localStorage.getItem('arcade-nickname'))).toBe('PC 이름');
  expect(await page.evaluate(()=>localStorage.getItem('arcade-character'))).toBe('naruto');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
