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
    await expect(host.locator('#status')).toContainText('내 차례');
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

test('offline play, strike selection and edge-limited pull still work', async ({ page }) => {
  await page.goto('/');
  await page.locator('#choose-alkkagi').click();
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
