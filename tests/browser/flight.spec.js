const { test, expect } = require('@playwright/test');

test('selector opens both games and preserves old online invitations', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#choose-flight')).toBeVisible();
  await page.locator('#choose-flight').click();
  await expect(page.locator('#flight-launch')).toBeEnabled();
  await page.locator('.back-link').click();
  await page.locator('#choose-alkkagi').click();
  await expect(page.locator('#game')).toBeVisible();
  await page.goto('/#room=ABCDEF123456');
  await expect(page).toHaveURL(/alkkagi\.html#room=ABCDEF123456/);
  await expect(page.locator('#room-code')).toHaveValue('ABCDEF123456');
});

test('mobile launch, stamina, boost, pause, landing and reward loop', async ({ page }) => {
  test.setTimeout(45000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/flight.html');
  await page.locator('#flight-launch').click();
  await expect(page.locator('#flight-launch')).toBeDisabled();
  await expect.poll(async()=>parseInt((await page.locator('#flight-distance').textContent()).replaceAll(',',''))).toBeGreaterThan(10);
  const button=await page.locator('#flight-glide').boundingBox();
  await page.mouse.move(button.x+button.width/2,button.y+button.height/2);await page.mouse.down();
  await expect.poll(async()=>+(await page.locator('#flight-stamina-bar').getAttribute('aria-valuenow'))).toBeLessThan(96);
  await page.mouse.up();
  await page.locator('#flight-boost').click();
  await expect(page.locator('#flight-boost')).toBeDisabled();
  await page.locator('#flight-pause').click();
  await expect(page.locator('#flight-paused')).toBeVisible();
  const distance=await page.locator('#flight-distance').textContent();
  await page.waitForTimeout(150);await expect(page.locator('#flight-distance')).toHaveText(distance);
  await page.locator('#flight-resume').click();
  await page.keyboard.down('ArrowDown');
  await expect(page.locator('#flight-result')).toBeVisible({timeout:20000});await page.keyboard.up('ArrowDown');
  await expect.poll(async()=>+await page.locator('#flight-silver').textContent()).toBeGreaterThan(0);
  const best=await page.locator('#flight-best').textContent(),silver=await page.locator('#flight-silver').textContent();
  await page.locator('#flight-again').click();await expect(page.locator('#flight-launch')).toBeEnabled();
  await expect(page.locator('#flight-silver')).toHaveText(silver);
  await page.reload();await expect(page.locator('#flight-best')).toHaveText(best);await expect(page.locator('#flight-silver')).toHaveText(silver);
  expect(errors).toEqual([]);
});

test('upgrades spend currency once and persist; portrait and desktop fit the viewport', async ({ page }) => {
  await page.goto('/flight.html');
  await page.evaluate(()=>localStorage.setItem('crimson-flight:v1',JSON.stringify({silver:100,upgrades:{},best:320})));
  await page.reload();
  await page.locator('#buy-stamina').click();
  await expect(page.locator('#flight-silver')).toHaveText('55');
  await expect(page.locator('#flight-stamina-text')).toHaveText('122 / 122');
  await page.reload();await expect(page.locator('#flight-silver')).toHaveText('55');
  await expect(page.locator('#buy-stamina')).toBeDisabled();
  await page.screenshot({path:'test-results/flight-mobile.png',fullPage:true});
  for(const viewport of [{width:360,height:800},{width:1280,height:800}]){
    await page.setViewportSize(viewport);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await expect(page.locator('#flight-launch')).toBeVisible();
  }
  await page.screenshot({path:'test-results/flight-desktop.png',fullPage:true});
  await page.goto('/');await page.screenshot({path:'test-results/arcade-desktop.png',fullPage:true});
});

test('drag launch and corrupt or unavailable storage remain playable', async ({ page }) => {
  await page.addInitScript(()=>{
    Storage.prototype.getItem=function(){throw new Error('storage disabled');};
    Storage.prototype.setItem=function(){throw new Error('storage disabled');};
  });
  await page.goto('/flight.html');
  const box=await page.locator('#flight-canvas').boundingBox();
  await page.mouse.move(box.x+90,box.y+250);await page.mouse.down();
  await page.mouse.move(box.x+210,box.y+170,{steps:5});await page.mouse.up();
  await expect(page.locator('#flight-launch')).toBeDisabled();
  await expect.poll(async()=>+await page.locator('#flight-distance').textContent()).toBeGreaterThan(1);
});

test('character selection persists and touch dive releases on pause', async ({ page }) => {
  await page.goto('/flight.html');
  await page.locator('#flight-character').selectOption('damian');
  await expect(page.locator('#flight-greeting')).toContainText('데미안');
  await page.reload();
  await expect(page.locator('#flight-character')).toHaveValue('damian');
  await expect(page.locator('#flight-boost')).toContainText('섭리의 힘');
  await page.locator('#flight-launch').click();
  await page.keyboard.down('ArrowUp');
  await expect(page.locator('#flight-glide')).toHaveClass(/active/);
  await page.keyboard.up('ArrowUp');
  const dive = page.locator('#flight-dive');
  await dive.scrollIntoViewIfNeeded();
  const box = await dive.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(dive).toHaveClass(/active/);
  await page.keyboard.press('Escape');
  await expect(dive).not.toHaveClass(/active/);
  await page.mouse.up();
  await page.locator('#flight-resume').click();
  await expect(dive).toBeEnabled();
  await expect(dive).not.toHaveClass(/active/);
  await page.keyboard.down('ArrowDown');
  await expect(dive).toHaveClass(/active/);
  await page.keyboard.up('ArrowDown');
  await expect(dive).not.toHaveClass(/active/);
});
