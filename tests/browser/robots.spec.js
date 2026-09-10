const {test,expect}=require('@playwright/test');

test('hub opens robot practice, validates scripts, remembers drafts and builds rules',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.locator('#choose-robots').click();
  await expect(page.locator('#robot-start')).toBeEnabled();
  await page.locator('#robot-code-0').fill('항상 : 공격, 방어');
  await expect(page.locator('#code-error-0')).toContainText('같은 줄');
  await expect(page.locator('#robot-start')).toBeDisabled();
  await page.locator('#robot-code-0').fill('항상 : 정지');
  await page.locator('#robot-name-0').fill('내 실험 로봇');
  await page.reload();await expect(page.locator('#robot-name-0')).toHaveValue('내 실험 로봇');
  await expect(page.locator('#robot-code-0')).toHaveValue('항상 : 정지');
  await page.locator('.rule-builder summary').click();
  await page.locator('#builder-sensor').selectOption('적거리');
  await page.locator('#builder-add').click();
  await expect(page.locator('#robot-code-0')).toHaveValue('적거리 < 150 : 공격\n항상 : 정지');
  await page.setViewportSize({width:360,height:800});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.setViewportSize({width:1280,height:900});
  await page.screenshot({path:'test-results/robots-desktop.png',fullPage:true});
  expect(errors).toEqual([]);
});

test('practice can pause and revise while a four-robot pasted-script match reaches a result',async({page})=>{
  test.setTimeout(75000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/robots.html');
  await page.locator('#robot-start').click();
  await expect(page.locator('#robot-code-0')).toBeDisabled();
  await page.locator('#robot-pause').click();
  const clock=await page.locator('#match-clock').textContent();
  await page.waitForTimeout(150);await expect(page.locator('#match-clock')).toHaveText(clock);
  await page.locator('#robot-stop').click();
  await expect(page.locator('#robot-code-0')).toBeEnabled();
  await page.locator('#battle-tab').click();await page.locator('#robot-count').selectOption('4');
  const scripts=['항상:추적,전진(70),공격','탄환거리<80:방어,후진(60)\n항상:추적,공격','항상:전진(60),회전(40),공격','항상:추적,전진(35),공격'];
  for(let i=0;i<4;i++){
    await page.locator(`#robot-name-${i}`).fill(`참가자 ${i+1}`);
    await page.locator(`#robot-code-${i}`).fill(scripts[i]);
  }
  await page.locator('#robot-speed').selectOption('4');await page.locator('#robot-start').click();
  await expect(page.locator('#robot-live .live-bot')).toHaveCount(4);
  await expect(page.locator('#robot-result')).toBeVisible({timeout:30000});
  await expect(page.locator('#robot-result-rows tr')).toHaveCount(4);
  const result=await page.locator('#robot-result-rows').textContent();
  await page.screenshot({path:'test-results/robots-mobile.png',fullPage:true});
  await page.locator('#robot-rematch').click();
  await expect(page.locator('#robot-result')).toBeVisible({timeout:30000});
  await expect(page.locator('#robot-result-rows')).toHaveText(result);
  expect(errors).toEqual([]);
});

test('blocked storage and malicious pasted text remain playable and are never executed',async({page})=>{
  await page.addInitScript(()=>{Storage.prototype.getItem=()=>{throw Error('blocked');};Storage.prototype.setItem=()=>{throw Error('blocked');};});
  await page.goto('/robots.html');
  await page.locator('#robot-code-0').fill('항상:window.alert(1)');
  await expect(page.locator('#robot-start')).toBeDisabled();
  await expect(page.locator('#robot-save-status')).toContainText('저장 불가');
  await page.locator('#robot-code-0').fill('항상:공격');
  await expect(page.locator('#robot-start')).toBeEnabled();
  await page.locator('#robot-start').click();
  await expect(page.locator('#robot-canvas')).toHaveAttribute('data-phase','running');
});
