const {test,expect}=require('@playwright/test');
for(const [width,height] of [[320,568],[360,640],[393,852],[667,375],[844,390],[1280,800],[1366,768],[1920,1080]])test(`game fits one viewport at ${width}x${height}`,async({page})=>{
  await page.setViewportSize({width,height});await page.goto('/alkkagi.html');
  const bounds=await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight}));
  expect(bounds.width).toBeLessThanOrEqual(width+1);expect(bounds.height).toBeLessThanOrEqual(height+1);
  for(const selector of ['.arena','#ruleset','.scoreboard','#status','#guide-0','#guide-1','#strike-pad','#strike-reset','#cancel-aim','#local-mode','#restart','#help-open'])await expect(page.locator(selector)).toBeInViewport({ratio:.99});
  const board=await page.locator('.arena').boundingBox();expect(Math.abs(board.width-board.height)).toBeLessThanOrEqual(2);expect(board.width).toBeGreaterThan(210);
  if(width>=1024){expect(board.width).toBeGreaterThan(height*.65);expect((await page.locator('#strike-pad').boundingBox()).width).toBeGreaterThanOrEqual(90);await expect(page.locator('#strike-description')).toBeVisible();}
  await page.locator('#help-open').click();await expect(page.locator('#game-help')).toBeVisible();await page.locator('#help-close').click();
  await page.evaluate(()=>{phase='aim';alkkagiEffects.emit('iron:clash',{id:'fit',actorTeam:0,targetTeam:1,x:600,y:600});});
  await expect(page.locator('#shot-highlight')).toBeInViewport({ratio:.99});
  await page.screenshot({path:`test-results/one-screen-${width}x${height}.png`});
});
