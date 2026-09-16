const {test,expect}=require('@playwright/test');
for(const game of ['alkkagi','naval'])test(`${game} public lobby starts only after readiness and supports game return and watching`,async({browser})=>{
  test.setTimeout(60000);
  const contexts=await Promise.all([0,1,2].map(()=>browser.newContext({baseURL:'http://127.0.0.1:8091',viewport:{width:393,height:852}})));
  const [host,guest,watch]=await Promise.all(contexts.map(c=>c.newPage())),errors=[];
  for(const p of [host,guest,watch])p.on('pageerror',e=>errors.push(e.message));
  try{
    await host.goto('/');await host.locator('#choose-online').click();
    await host.locator('#nickname').fill('친구');await host.locator('#game').selectOption(game);await host.locator('#title').fill('같이 하는 경기');await host.locator('#create').click();
    await expect(host.locator('#waiting')).toBeVisible();await expect(host.locator('#ready')).toBeDisabled();
    const invite=await host.locator('#invite').inputValue(),code=new URLSearchParams(new URL(invite).hash.slice(1)).get('code');
    await guest.goto('/lobby.html');await guest.locator('#nickname').fill('친구');
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
  const a=await browser.newContext(),b=await browser.newContext();const host=await a.newPage(),guest=await b.newPage();
  try{
    await host.goto('http://127.0.0.1:8091/lobby.html');await host.locator('#nickname').fill('<b>나</b>');await host.locator('#title').fill('<img src=x onerror=alert(1)>');await host.locator('#visibility').selectOption('private');await host.locator('#create').click();await expect(host.locator('#waiting')).toBeVisible();
    const invite=await host.locator('#invite').inputValue(),code=new URLSearchParams(new URL(invite).hash.slice(1)).get('code');
    await guest.goto('http://127.0.0.1:8091/lobby.html');await expect(guest.locator('#directory-status')).not.toHaveText('방 목록 연결 중…');await expect(guest.locator(`.room-card[data-code="${code}"]`)).toHaveCount(0);
    await guest.goto(invite);await expect(guest.locator('#code')).toHaveValue(code);await guest.locator('#join').click();await expect(guest.locator('#waiting')).toBeVisible();await expect(guest.locator('#room-title')).toHaveText('<img src=x onerror=alert(1)>');await expect(guest.locator('#room-title img')).toHaveCount(0);await expect(guest.locator('#players')).toContainText('<b>나</b>');
    await host.setViewportSize({width:1280,height:900});await host.screenshot({path:'test-results/lobby-desktop.png',fullPage:true});
  }finally{await a.close();await b.close();}
});
