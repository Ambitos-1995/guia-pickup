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

test.describe('webkit admin ui', () => {
  test.use({ serviceWorkers: 'block' });

  test('admin contracts and ajustes remain usable on narrow webkit layout', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const state = await setupMockApi(page);
    await page.goto('/');
    await page.evaluate(() => {
      window.App.setSession({
        accessToken: 'admin-token',
        expiresAt: '2099-12-31T23:59:59.000Z',
        role: 'org_admin',
        employeeId: 'emp-2',
        employeeName: 'Marta Admin',
        organizationId: 'org-1'
      });
      window.App.navigate('screen-menu');
    });
    await expect(page.locator('#screen-menu.active')).toBeVisible();
    await page.locator('#menu-admin-shortcut').click();

    await page.locator('.admin-tab', { hasText: 'Contratos' }).click();
    await page.locator('#admin-acuerdo-nuevo').click();
    await expect(page.locator('#modal-acuerdo-create')).toBeVisible();
    await expect(page.locator('#acuerdo-emp-select')).toBeVisible();
    await expect(page.locator('#acuerdo-emp-select')).toBeEnabled();

    const optionTexts = (await page.locator('#acuerdo-emp-select option').allTextContents()).map((value) => value.trim());
    expect(optionTexts).toEqual(['Seleccionar participante...', 'Ismael Perez', 'Nora Diaz']);

    await page.locator('#acuerdo-emp-select').selectOption('emp-1');
    await expect(page.locator('#admin-acuerdo-crear')).toBeEnabled();
    await page.locator('#admin-acuerdo-crear').click();
    await expect(page.locator('#modal-acuerdo-create')).toBeHidden();
    await expect.poll(() => state.contractCreateCalls.length).toBe(1);

    await page.locator('.admin-tab', { hasText: 'Ajustes' }).click();
    await expect(page.locator('#admin-ajustes.active')).toBeVisible();
    await expect(page.locator('#admin-setting-legal-rep')).toHaveValue('Marta Admin');
  });
});
