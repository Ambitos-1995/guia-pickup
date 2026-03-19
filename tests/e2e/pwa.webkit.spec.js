const { test, expect } = require('@playwright/test');
const { setupMockApi } = require('./helpers/mock-api');

test.describe('webkit pwa smoke', () => {
  test.use({ serviceWorkers: 'allow' });

  test('main shell loads and registers the service worker on webkit', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');
    await page.waitForFunction(() => !!navigator.serviceWorker);
    await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true));

    await expect(page.locator('#screen-pin.active')).toBeVisible();
    await expect(page.locator('#pin-prompt')).toContainText('Introduce');
  });

  test('direct shell loads and stays navigable on webkit', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/direct/');
    await page.waitForFunction(() => !!navigator.serviceWorker);
    await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true));

    await expect(page.locator('#direct-schedule-grid')).toBeVisible();
    await expect(page.locator('#direct-schedule-title')).toBeVisible();
  });

  test('direct shell exposes update logic hooks on webkit direct mode', async ({ page }) => {
    await page.addInitScript(() => {
      window.__ENABLE_SW_TEST_API__ = true;
    });

    await setupMockApi(page);
    await page.goto('/direct/');
    await page.waitForLoadState('load');
    await page.waitForFunction(() => !!window.__swRegisterTestApi);

    await page.evaluate(() => {
      window.__swRegisterTestApi.setWaitingWorkerForTest();
      window.__swRegisterTestApi.syncUpdateButtonForTest();
    });
    await expect(page.locator('#update-btn')).toHaveCount(1);
    await expect.poll(async () => {
      return page.evaluate(() => window.__swRegisterTestApi.isSafeToReloadForTest());
    }).toBe(true);
  });
});
