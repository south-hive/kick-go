const {test,expect}=require('@playwright/test');
const fleet=[{id:'carrier',cell:0},{id:'battleship',cell:10},{id:'cruiser',cell:20},{id:'submarine',cell:30},{id:'destroyer',cell:40}];
async function deploy(page){for(const ship of fleet){await page.locator(`#ship-${ship.id}`).click();await page.locator(`#naval-own-board [data-cell="${ship.cell}"]`).click();}await expect(page.locator('#naval-ready')).toBeEnabled();await page.locator('#naval-ready').click();}
test('two captains and a spectator deploy privately, trade shots, resume and rematch',async({browser})=>{
  test.setTimeout(120000);
  const contexts=await Promise.all([0,1,2].map(()=>browser.newContext({baseURL:'http://127.0.0.1:8091',viewport:{width:393,height:852}})));
  const pages=await Promise.all(contexts.map(c=>c.newPage())),[host,guest,watch]=pages;const errors=[];pages.forEach(p=>p.on('pageerror',e=>errors.push(e.message)));
  try{
    await host.goto('/');await host.locator('#choose-naval').click();await host.locator('#naval-nickname').fill('하늘');await host.locator('#naval-create').click();
    await expect(host.locator('#naval-room-code')).toHaveText(/^[A-F0-9]{12}$/);const code=await host.locator('#naval-room-code').textContent();
    await guest.goto(`/battleship.html#naval=${code}`);await guest.locator('#naval-nickname').fill('바다');await guest.locator('#naval-join').click();
    await watch.goto(`/battleship.html#naval=${code}`);await watch.locator('#naval-watch').click();
    await expect(watch.locator('#naval-observer-wait')).toBeVisible();await expect(watch.locator('#naval-seas')).toBeHidden();
    await deploy(host);await expect(host.locator('#naval-status')).toContainText('상대 준비');
    await expect(watch.locator('#naval-own-board .ship')).toHaveCount(0);await deploy(guest);
    await expect(host.locator('#naval-status')).toContainText('내 차례');await expect(guest.locator('#naval-status')).toContainText('상대 차례');
    for(const p of [host,guest]){await expect(p.locator('#naval-own-board .ship')).toHaveCount(17);await expect(p.locator('#naval-enemy-board .ship')).toHaveCount(0);const own=await p.locator('#naval-own-board').boundingBox(),enemy=await p.locator('#naval-enemy-board').boundingBox();expect(own.y).toBeGreaterThan(enemy.y);}
    await expect(watch.locator('#naval-seas')).toBeVisible();await expect(watch.locator('#naval-own-board .ship')).toHaveCount(0);
    const targets=[0,1,2,3,4,10,11,12,13,20,21,22,30,31,32,40,41];
    for(let i=0;i<targets.length;i++){
      await host.locator(`#naval-enemy-board [data-cell="${targets[i]}"]`).click();
      await expect(guest.locator(`#naval-own-board [data-cell="${targets[i]}"]`)).toHaveClass(/hit|sunk/);
      if(i===0){await guest.reload();await expect(guest.locator('#naval-own-board [data-cell="0"]')).toHaveClass(/hit/);await expect(guest.locator('#naval-status')).toContainText('내 차례');}
      if(i===4){await expect(host.locator('#naval-effect')).toContainText('격침');await expect(watch.locator('#naval-enemy-board .ship')).toHaveCount(5);await host.locator('#naval-enemy-board').screenshot({path:'test-results/naval-sunk.png'});}
      if(i<targets.length-1)await guest.locator(`#naval-enemy-board [data-cell="${80+i}"]`).click();
    }
    await expect(host.locator('#naval-winner')).toContainText('승리');await expect(guest.locator('#naval-winner')).toContainText('패배');await expect(watch.locator('#naval-winner')).toHaveText('하늘 승리');
    await host.screenshot({path:'test-results/naval-mobile.png',fullPage:true});await watch.setViewportSize({width:1280,height:900});await watch.screenshot({path:'test-results/naval-spectator.png',fullPage:true});
    await host.locator('#naval-rematch').click();await guest.locator('#naval-rematch').click();await expect(watch.locator('#naval-observer-wait')).toBeVisible();await expect(host.locator('#naval-own-board .ship')).toHaveCount(0);
    await watch.locator('#naval-leave').click();await expect(watch.locator('#naval-lobby')).toBeVisible();await expect(host.locator('#naval-placement')).toBeVisible();
    host.once('dialog',d=>d.accept());await host.locator('#naval-leave').click();await expect(guest.locator('#naval-lobby')).toBeVisible();
    expect(errors).toEqual([]);
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});
