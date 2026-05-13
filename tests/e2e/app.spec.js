const { test, expect } = require('@playwright/test');
const { setupMockApi } = require('./helpers/mock-api');
const OFFLINE_DB_NAME = 'pickup-tmg-offline-clock-v1';

async function enterPin(page, pin) {
  const inMainPinScreen = await page.locator('#screen-pin.active').isVisible().catch(() => false);

  for (const digit of String(pin)) {
    if (inMainPinScreen) {
      await page.locator(`#screen-pin.active .key-btn[data-key="${digit}"]`).click({ force: true });
    } else {
      await page.locator(`#direct-pin-keypad .key-btn[data-key="${digit}"]`).click({ force: true });
    }
  }
}

async function enterDirectDialogPin(page, pin) {
  for (const digit of String(pin)) {
    await page.locator(`#direct-dialog-keypad .key-btn[data-key="${digit}"]`).click({ force: true });
  }
}

async function readOfflineStores(page) {
  return page.evaluate(async (dbName) => {
    if (!window.indexedDB) {
      return { queue: [], pinCache: [] };
    }

    function requestToPromise(request) {
      return new Promise((resolve, reject) => {
        request.onsuccess = function () { resolve(request.result); };
        request.onerror = function () { reject(request.error || new Error('IndexedDB error')); };
      });
    }

    const db = await new Promise((resolve, reject) => {
      const request = window.indexedDB.open(dbName);
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('Open DB failed')); };
    });

    try {
      const queueTx = db.transaction('clock_actions', 'readonly');
      const pinTx = db.transaction('employee_pin_cache', 'readonly');
      const queueRequest = queueTx.objectStore('clock_actions').getAll();
      const pinRequest = pinTx.objectStore('employee_pin_cache').getAll();
      const [queue, pinCache] = await Promise.all([
        requestToPromise(queueRequest),
        requestToPromise(pinRequest)
      ]);
      return { queue, pinCache };
    } finally {
      db.close();
    }
  }, OFFLINE_DB_NAME);
}

async function enableSwTestApi(page) {
  await page.addInitScript(() => {
    window.__ENABLE_SW_TEST_API__ = true;
  });
}

test.afterEach(async ({ page }) => {
  if (!page) return;

  await page.evaluate(async () => {
    try {
      window.localStorage.clear();
    } catch (error) {}

    try {
      window.sessionStorage.clear();
    } catch (error) {}

    if (window.indexedDB) {
      await new Promise((resolve) => {
        const request = window.indexedDB.deleteDatabase('pickup-tmg-offline-clock-v1');
        request.onsuccess = function () { resolve(); };
        request.onerror = function () { resolve(); };
        request.onblocked = function () { resolve(); };
      });
    }
  }).catch(() => {});
});

test('app boots into the internal PIN screen', async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await expect(page.locator('#screen-pin.active')).toBeVisible();

  await expect(page).toHaveTitle('Punto de encuentro inclusivo');
  await expect(page.locator('#pin-prompt')).toHaveText('Introduce tu PIN de 4 o 6 cifras');
  await expect(page.locator('body')).not.toContainText('Pickup TMG');
  await expect(page.locator('#pin-public-schedule')).toBeHidden();
});

test.describe('service worker shell', () => {
  test.use({ serviceWorkers: 'allow' });

  test('main shell reloads offline once the service worker is controlling the page', async ({ page, context }) => {
    await setupMockApi(page);
    await page.goto('/');
    await page.waitForFunction(() => !!navigator.serviceWorker);
    await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true));

    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);

    await context.setOffline(true);
    await page.reload();

    await expect(page.locator('#screen-pin.active')).toBeVisible();
    await expect(page.locator('#pin-prompt')).toContainText('Introduce');

    await context.setOffline(false);
  });
});

test('main shell shows the manual update action only on safe screens', async ({ page }) => {
  await enableSwTestApi(page);
  await setupMockApi(page);
  await page.goto('/');
  await page.waitForFunction(() => !!window.__swRegisterTestApi);

  await page.evaluate(() => window.__swRegisterTestApi.setWaitingWorkerForTest());
  await expect(page.locator('#update-btn')).toBeVisible();

  await enterPin(page, '1234');
  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await page.locator('#card-fichar').click();
  await expect(page.locator('#screen-clock.active')).toBeVisible();

  await page.evaluate(() => window.__swRegisterTestApi.syncUpdateButtonForTest());
  await expect(page.locator('#update-btn')).toBeHidden();
});

test('direct route exposes the manual update action and requests skip waiting', async ({ page }) => {
  await enableSwTestApi(page);
  await setupMockApi(page);
  await page.goto('/direct/');
  await page.waitForFunction(() => !!window.__swRegisterTestApi);

  await page.evaluate(() => window.__swRegisterTestApi.setWaitingWorkerForTest());
  await expect(page.locator('#update-btn')).toBeVisible();
  await page.locator('#update-btn').click();

  await expect.poll(async () => {
    return page.evaluate(() => window.__swRegisterTestApi.getWaitingWorkerMessages());
  }).toEqual([{ type: 'SKIP_WAITING' }]);
});

test('admin shows the installed-app update banner and routes back to menu for a safe refresh', async ({ page }) => {
  await enableSwTestApi(page);
  await setupMockApi(page);
  await page.goto('/');
  await page.waitForFunction(() => !!window.__swRegisterTestApi);

  await enterPin(page, '123456');
  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await page.locator('#menu-admin-shortcut').click();
  await expect(page.locator('#screen-admin.active')).toBeVisible();

  await page.evaluate(() => window.__swRegisterTestApi.setWaitingWorkerForTest());

  await expect(page.locator('#admin-update-banner')).toBeVisible();
  await expect(page.locator('#admin-update-message')).toContainText('Vuelve al menu');
  await expect(page.locator('#update-btn')).toBeHidden();

  await page.locator('#admin-update-action').click();
  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await expect(page.locator('#update-btn')).toBeVisible();
});

test('main PIN layout fits inside a short mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await setupMockApi(page);
  await page.goto('/');
  await expect(page.locator('#screen-pin.active')).toBeVisible();

  const metrics = await page.evaluate(() => {
    const container = document.querySelector('.pin-container');
    const keypad = document.getElementById('pin-keypad');
    const scroller = document.scrollingElement || document.documentElement;

    return {
      viewport: window.innerHeight,
      containerBottom: Math.ceil(container.getBoundingClientRect().bottom),
      keypadBottom: Math.ceil(keypad.getBoundingClientRect().bottom),
      overflow: Math.max(0, scroller.scrollHeight - window.innerHeight)
    };
  });

  expect(metrics.containerBottom).toBeLessThanOrEqual(metrics.viewport);
  expect(metrics.keypadBottom).toBeLessThanOrEqual(metrics.viewport);
  expect(metrics.overflow).toBeLessThanOrEqual(2);
});

test('main PIN keypad stays horizontally centered', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await setupMockApi(page);
  await page.goto('/');
  await expect(page.locator('#screen-pin.active')).toBeVisible();

  const metrics = await page.evaluate(() => {
    const keypad = document.getElementById('pin-keypad');
    const rect = keypad.getBoundingClientRect();
    return {
      leftGap: Math.round(rect.left),
      rightGap: Math.round(window.innerWidth - rect.right)
    };
  });

  expect(Math.abs(metrics.leftGap - metrics.rightGap)).toBeLessThanOrEqual(4);
});

test('anonymous users cannot reach authenticated screens', async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await expect(page.locator('#screen-pin.active')).toBeVisible();

  await page.evaluate(() => window.App.navigate('screen-schedule'));
  await expect(page.locator('#screen-pin.active')).toBeVisible();
  await expect(page.locator('#screen-schedule.active')).toHaveCount(0);

  await page.evaluate(() => window.App.navigate('screen-guia'));
  await expect(page.locator('#screen-pin.active')).toBeVisible();
  await expect(page.locator('#screen-guia.active')).toHaveCount(0);

  await page.evaluate(() => window.App.navigate('screen-admin'));
  await expect(page.locator('#screen-pin.active')).toBeVisible();
  await expect(page.locator('#screen-admin.active')).toHaveCount(0);
});

test('employee login opens the main menu and unlocks personal actions', async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await expect(page.locator('#screen-pin.active')).toBeVisible();

  await enterPin(page, '1234');

  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await expect(page.locator('#greeting')).toHaveText('Ismael Perez');
  await expect(page.locator('#card-fichar')).toBeVisible();
  await expect(page.locator('#card-schedule')).toBeVisible();
  await expect(page.locator('#card-guia')).toBeVisible();
  await expect(page.locator('#card-payment')).toBeVisible();
  await expect(page.locator('#card-admin')).toBeHidden();
  await expect(page.locator('#menu-direct-shortcut')).toBeHidden();
  await expect(page.locator('#logout-btn')).toBeVisible();
});

test('employee session persists after reload while still valid', async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await expect(page.locator('#screen-pin.active')).toBeVisible();

  await enterPin(page, '1234');
  await expect(page.locator('#screen-menu.active')).toBeVisible();

  await page.reload();

  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await expect(page.locator('#greeting')).toContainText('Ismael');
  await expect(page.locator('#card-payment')).toBeVisible();
  await expect(page.locator('#menu-login-btn')).toBeHidden();
});

test('employee payment receipt stays read-only once signed and never exposes the signing flow', async ({ page }) => {
  const state = await setupMockApi(page, {
    myReceipt: {
      id: 'receipt-1',
      status: 'signed',
      employee_name_snapshot: 'Ismael Perez',
      hours_worked: 24,
      hourly_rate: 13.02,
      amount_earned: 312.5,
      employee_signed_at: '2026-03-31T11:08:00.000Z'
    }
  });
  await page.goto('/');
  await enterPin(page, '1234');

  await page.locator('#card-payment').click();
  await expect(page.locator('#screen-payment.active')).toBeVisible();
  await expect(page.locator('#receipt-document')).toBeVisible();
  await expect(page.locator('#receipt-doc-body')).toContainText('Recibo personal de gratificacion');
  await expect(page.locator('#receipt-doc-body')).toContainText('Punto Inclusivo');

  await expect(page.locator('#receipt-banner')).toBeVisible();
  await expect(page.locator('#receipt-banner')).toContainText('Recibo firmado');
  await expect(page.locator('#receipt-doc-body')).toContainText('Firmado el');
  await expect(page.locator('#receipt-doc-body')).toContainText('Firma registrada');
  await expect(page.locator('#receipt-doc-body')).toContainText('ya no admite una nueva firma');
  await expect(page.locator('#receipt-btn-sign')).toHaveCount(0);
  await expect(page.locator('#receipt-step-sign')).toHaveCount(0);
  expect(state.receiptSignCalls).toHaveLength(0);
});

test('employee clock actions queue offline and sync automatically', async ({ page }) => {
  const state = await setupMockApi(page, { clockFailuresRemaining: 1 });
  const clockActions = () => state.clockActionCalls.filter((call) => call.action !== 'status');
  await page.goto('/');
  await enterPin(page, '1234');

  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await page.locator('#card-fichar').click();
  await expect(page.locator('#screen-clock.active')).toBeVisible();

  await page.locator('#btn-check-in').click();

  await expect(page.locator('#offline-clock-banner')).toBeVisible();
  await expect(page.locator('#offline-clock-banner')).toHaveText('1 fichaje pendiente de sincronizar');
  await expect(page.locator('#clock-feedback')).toContainText('guardada sin conexion');
  await expect(page.locator('#clock-feedback')).toContainText('sincronizara automaticamente');
  await expect.poll(() => clockActions().length).toBe(2, { timeout: 8000 });
  expect(clockActions()[0].clientTimestamp).toBe(clockActions()[1].clientTimestamp);
  expect(clockActions()[0].auth).toContain('Bearer employee-token');
  expect(clockActions()[0].clockToken).toBe('');
  expect(clockActions()[1].auth).toBe('');
  expect(clockActions()[1].clockToken).toContain('offline-clock-token-1');
  await expect(page.locator('#offline-clock-banner')).toBeHidden({ timeout: 8000 });
  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await expect(page.locator('#fichar-status')).toContainText('Entrada registrada');
});

test('a blocked offline replay keeps the queued punch recoverable until the employee revalidates the PIN', async ({ page }) => {
  const state = await setupMockApi(page, {
    clockFailuresRemaining: 1,
    clockOfflineTokenFailuresRemaining: 1
  });
  const clockActions = () => state.clockActionCalls.filter((call) => call.action !== 'status');
  await page.goto('/');
  await enterPin(page, '1234');

  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await page.locator('#card-fichar').click();
  await expect(page.locator('#screen-clock.active')).toBeVisible();
  await page.locator('#btn-check-in').click();

  await expect(page.locator('#offline-clock-banner')).toBeVisible();
  await expect.poll(() => clockActions().length).toBe(2, { timeout: 8000 });
  expect(clockActions()[1].auth).toBe('');
  expect(clockActions()[1].clockToken).toContain('offline-clock-token-1');
  await expect(page.locator('#modal-confirm')).toBeVisible();
  await expect(page.locator('#modal-body')).toContainText('vuelve a validar tu PIN');

  const storedBeforeRecovery = await readOfflineStores(page);
  expect(storedBeforeRecovery.queue).toHaveLength(1);
  expect(storedBeforeRecovery.queue[0].offlineClockToken).toContain('offline-clock-token-1');
  expect(Object.prototype.hasOwnProperty.call(storedBeforeRecovery.queue[0], 'accessToken')).toBe(false);
  expect(storedBeforeRecovery.pinCache.length).toBeGreaterThan(0);
  expect(Object.prototype.hasOwnProperty.call(storedBeforeRecovery.pinCache[0], 'accessToken')).toBe(false);

  await page.locator('#modal-ok').click();
  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await page.locator('#logout-btn').click();
  await expect(page.locator('#screen-pin.active')).toBeVisible();

  state.clockOfflineTokenFailuresRemaining = 0;
  await enterPin(page, '1234');

  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await expect.poll(() => clockActions().length).toBe(3, { timeout: 8000 });
  expect(clockActions()[2].auth).toBe('');
  expect(clockActions()[2].clockToken).toContain('offline-clock-token-1');
  await expect(page.locator('#offline-clock-banner')).toBeHidden({ timeout: 8000 });

  const storedAfterRecovery = await readOfflineStores(page);
  expect(storedAfterRecovery.queue).toHaveLength(0);
});

test('employee clock replay stays idempotent when the backend already committed the first attempt', async ({ page }) => {
  const state = await setupMockApi(page, { clockCommitThenFailRemaining: 1 });
  const clockActions = () => state.clockActionCalls.filter((call) => call.action !== 'status');
  await page.goto('/');
  await enterPin(page, '1234');

  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await page.locator('#card-fichar').click();
  await expect(page.locator('#screen-clock.active')).toBeVisible();

  await page.locator('#btn-check-in').click();

  await expect(page.locator('#offline-clock-banner')).toBeVisible();
  await expect.poll(() => clockActions().length).toBe(2, { timeout: 8000 });
  expect(clockActions()[0].clientEventId).toBeTruthy();
  expect(clockActions()[0].clientEventId).toBe(clockActions()[1].clientEventId);
  await expect(page.locator('#offline-clock-banner')).toBeHidden({ timeout: 8000 });
  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await expect(page.locator('#fichar-status')).toContainText('Entrada registrada');
});

test('a permanently rejected queued punch is dropped so the employee is not left blocked', async ({ page }) => {
  await setupMockApi(page, {
    clockFailuresRemaining: 1,
    clockPermanentFailuresRemaining: 1,
    clockPermanentFailureMessage: 'El fichaje pendiente ya no es valido.'
  });
  await page.goto('/');
  await enterPin(page, '1234');

  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await page.getByRole('button', { name: 'Fichar' }).click();
  await expect(page.locator('#screen-clock.active')).toBeVisible();
  await page.locator('#btn-check-in').click();

  await expect(page.locator('#offline-clock-banner')).toBeVisible();
  await expect(page.locator('#clock-feedback')).toContainText('guardada sin conexion');
  await expect(page.locator('#offline-clock-banner')).toBeHidden({ timeout: 8000 });
  await expect(page.locator('#clock-feedback')).toContainText('ya no es valido');
  await expect(page.locator('#modal-confirm')).toBeVisible();
  await page.locator('#modal-ok').click();
  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await expect(page.locator('#fichar-status')).not.toContainText('Pendiente');
  await page.locator('#card-fichar').click();
  await expect(page.locator('#screen-clock.active')).toBeVisible();
  await expect(page.locator('#btn-check-in')).toBeVisible();
});

test('a pending offline punch for one employee does not block clocking for another employee', async ({ page }) => {
  await setupMockApi(page, { clockFailuresRemaining: 10 });
  await page.goto('/');
  await enterPin(page, '1234');

  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await page.getByRole('button', { name: 'Fichar' }).click();
  await expect(page.locator('#screen-clock.active')).toBeVisible();
  await page.locator('#btn-check-in').click();

  await expect(page.locator('#offline-clock-banner')).toBeVisible();
  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await page.locator('#logout-btn').click();
  await expect(page.locator('#screen-pin.active')).toBeVisible();

  await enterPin(page, '4321');
  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await expect(page.locator('#fichar-status')).not.toContainText('Pendiente');
  await page.getByRole('button', { name: 'Fichar' }).click();
  await expect(page.locator('#screen-clock.active')).toBeVisible();
  await expect(page.locator('#btn-check-in')).toBeVisible();
  await expect(page.locator('#clock-status')).toContainText('Entrada pendiente');
});

test('logout returns to the PIN-first home', async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await enterPin(page, '1234');

  await expect(page.locator('#screen-menu.active')).toBeVisible();

  await page.locator('#logout-btn').click();
  await expect(page.locator('#screen-pin.active')).toBeVisible();
  await expect(page.locator('#pin-prompt')).toHaveText('Introduce tu PIN de 4 o 6 cifras');
});

test('admin can sign in from the PIN-first entry flow', async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await expect(page.locator('#screen-pin.active')).toBeVisible();
  await expect(page.locator('#pin-prompt')).toHaveText('Introduce tu PIN de 4 o 6 cifras');

  await enterPin(page, '123456');

  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await expect(page.locator('#greeting')).toHaveText('Administrador');
  await expect(page.locator('#card-fichar')).toBeVisible();
  await expect(page.locator('#card-schedule')).toBeVisible();
  await expect(page.locator('#card-guia')).toBeVisible();
  await expect(page.locator('#card-payment')).toBeVisible();
  await expect(page.locator('#card-admin')).toBeHidden();
  await expect(page.locator('#menu-admin-shortcut')).toBeVisible();
  await expect(page.locator('#menu-direct-shortcut')).toBeVisible();
  await expect(page.locator('#logout-btn')).toBeVisible();
});

test('admin can open the same four base sections from the main menu', async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await enterPin(page, '123456');

  await expect(page.locator('#screen-menu.active')).toBeVisible();

  await page.getByRole('button', { name: 'Fichar' }).click();
  await expect(page.locator('#screen-clock.active')).toBeVisible();
  await page.locator('#screen-clock .back-btn').click();

  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await page.getByRole('button', { name: 'Mi Pago' }).click();
  await expect(page.locator('#screen-payment.active')).toBeVisible();
});

test('admin can load payments and save a configured amount with hourly rate', async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await expect(page.locator('#screen-pin.active')).toBeVisible();

  await enterPin(page, '123456');
  await expect(page.locator('#screen-menu.active')).toBeVisible();

  await page.locator('#menu-admin-shortcut').click();
  await expect(page.locator('#screen-admin.active')).toBeVisible();
  await expect(page.locator('#admin-build-version')).toContainText(/Version \d{4}\.\d{2}\.\d{2}-r\d+/);
  await page.locator('#admin-pay-prev').click();
  await expect(page.locator('#admin-pay-summary-status')).toContainText('Sin configurar');

  // Sin tarifa, el guardado debe avisar y el botón de calcular seguir deshabilitado.
  await page.locator('#admin-pay-amount').fill('1250');
  await page.locator('#admin-pay-save').click();
  await expect(page.locator('#admin-pay-feedback')).toContainText('tarifa por hora');
  await expect(page.locator('#admin-pay-calculate')).toBeDisabled();

  // Con tarifa, se guarda y el cálculo queda habilitado.
  await page.locator('#admin-pay-rate').fill('2.5');
  await page.locator('#admin-pay-save').click();
  await expect(page.locator('#admin-pay-feedback')).toContainText('Importe y tarifa guardados');
  await expect(page.locator('#admin-pay-summary-amount')).toContainText('1250.00');
  await expect(page.locator('#admin-pay-summary-status')).toContainText('Configurado');
  await expect(page.locator('#admin-pay-calculate')).toBeEnabled();
});

test('admin can create a new employee from ajustes empleados', async ({ page }) => {
  const state = await setupMockApi(page);
  await page.goto('/');
  await expect(page.locator('#screen-pin.active')).toBeVisible();

  await enterPin(page, '123456');
  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await page.locator('#menu-admin-shortcut').click();

  await page.locator('.admin-tab', { hasText: 'Empleados' }).click();
  await expect(page.locator('#admin-employee-list')).toContainText('Ismael Perez');

  await page.locator('#admin-emp-toggle-form').click();
  await page.locator('#emp-name').fill('Lucia');
  await page.locator('#emp-surname').fill('Garcia');
  await page.locator('#emp-pin').fill('4321');
  await page.locator('#admin-emp-create').click();

  await expect(page.locator('#emp-feedback')).toContainText('Empleado creado correctamente.');
  await expect(page.locator('#admin-employee-list')).toContainText('Lucia Garcia');
  await expect.poll(() => state.createCalls.length).toBe(1);
  await expect.poll(() => state.createCalls[0].pin).toBe('4321');
  await expect.poll(() => state.createCalls[0].role).toBe('employee');
});

test('admin can create a contract from the mobile native participant selector', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await setupMockApi(page);
  await page.goto('/');
  await expect(page.locator('#screen-pin.active')).toBeVisible();

  await enterPin(page, '123456');
  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await page.locator('#menu-admin-shortcut').click();

  await page.locator('.admin-tab', { hasText: 'Contratos' }).click();
  await expect(page.locator('#admin-acuerdo-list')).toContainText('Ismael Perez');

  await page.locator('#admin-acuerdo-nuevo').click();
  await expect(page.locator('#modal-acuerdo-create')).toBeVisible();
  await expect(page.locator('#acuerdo-emp-select')).toBeVisible();
  await expect(page.locator('#acuerdo-emp-select')).toBeEnabled();
  await expect(page.locator('#admin-acuerdo-crear')).toBeDisabled();

  const optionTexts = (await page.locator('#acuerdo-emp-select option').allTextContents()).map((value) => value.trim());
  expect(optionTexts).toEqual(['Seleccionar participante...', 'Ismael Perez', 'Nora Diaz']);

  await page.locator('#acuerdo-emp-select').selectOption('emp-4');
  await expect(page.locator('#admin-acuerdo-crear')).toBeEnabled();
  await page.locator('#admin-acuerdo-crear').click();

  await expect(page.locator('#modal-acuerdo-create')).toBeHidden();
  await expect(page.locator('#admin-acuerdo-list')).toContainText('Nora Diaz');
  await expect.poll(() => state.contractCreateCalls.length).toBe(1);
  await expect.poll(() => state.contractCreateCalls[0].employeeId).toBe('emp-4');
});

test('admin contract and receipt rows stack their primary actions on narrow mobile screens', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await setupMockApi(page);
  await page.goto('/');
  await expect(page.locator('#screen-pin.active')).toBeVisible();

  await enterPin(page, '123456');
  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await page.locator('#menu-admin-shortcut').click();

  await page.locator('.admin-tab', { hasText: 'Contratos' }).click();
  await expect(page.locator('#admin-acuerdo-list')).toContainText('Ismael Perez');

  const contractMetrics = await page.evaluate(() => {
    const row = document.querySelector('#admin-acuerdo-list .acuerdo-row');
    const info = row && row.querySelector('.acuerdo-row-info');
    const actions = row && row.querySelector('.acuerdo-row-actions');
    const button = row && row.querySelector('.btn-acuerdo-iniciar, .btn-acuerdo-descargar');
    if (!row || !info || !actions || !button) return null;
    const rowRect = row.getBoundingClientRect();
    const infoRect = info.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    return {
      actionsTop: Math.round(actionsRect.top),
      infoBottom: Math.round(infoRect.bottom),
      buttonRight: Math.ceil(buttonRect.right),
      rowRight: Math.ceil(rowRect.right)
    };
  });

  expect(contractMetrics).not.toBeNull();
  expect(contractMetrics.actionsTop).toBeGreaterThanOrEqual(contractMetrics.infoBottom - 1);
  expect(contractMetrics.buttonRight).toBeLessThanOrEqual(contractMetrics.rowRight);

  await page.locator('.admin-tab', { hasText: 'Recibos' }).click();
  await page.locator('#admin-receipt-prev').click();
  await expect(page.locator('#admin-receipt-list')).toContainText('Ismael Perez');

  const receiptMetrics = await page.evaluate(() => {
    const button = document.querySelector('#admin-receipt-list .btn-receipt-sign');
    const row = button ? button.closest('.receipt-row') : null;
    const info = row && row.querySelector('.receipt-row-info');
    if (!row || !info || !button) return null;
    const rowRect = row.getBoundingClientRect();
    const infoRect = info.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    return {
      buttonTop: Math.round(buttonRect.top),
      infoBottom: Math.round(infoRect.bottom),
      buttonRight: Math.ceil(buttonRect.right),
      rowRight: Math.ceil(rowRect.right)
    };
  });

  expect(receiptMetrics).not.toBeNull();
  expect(receiptMetrics.buttonTop).toBeGreaterThanOrEqual(receiptMetrics.infoBottom - 1);
  expect(receiptMetrics.buttonRight).toBeLessThanOrEqual(receiptMetrics.rowRight);
});

test('admin contract rows also stack on typical Android widths', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await setupMockApi(page);
  await page.goto('/');
  await expect(page.locator('#screen-pin.active')).toBeVisible();

  await enterPin(page, '123456');
  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await page.locator('#menu-admin-shortcut').click();
  await page.locator('.admin-tab', { hasText: 'Contratos' }).click();
  await expect(page.locator('#admin-acuerdo-list')).toContainText('Ismael Perez');

  const rowMetrics = await page.evaluate(() => {
    const row = document.querySelector('#admin-acuerdo-list .acuerdo-row');
    const info = row && row.querySelector('.acuerdo-row-info');
    const actions = row && row.querySelector('.acuerdo-row-actions');
    const primary = row && row.querySelector('.btn-acuerdo-iniciar, .btn-acuerdo-descargar');
    const remove = row && row.querySelector('.btn-acuerdo-eliminar');
    if (!row || !info || !actions || !primary || !remove) return null;
    const infoRect = info.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();
    const primaryRect = primary.getBoundingClientRect();
    const removeRect = remove.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    return {
      actionsTop: Math.round(actionsRect.top),
      infoBottom: Math.round(infoRect.bottom),
      primaryRight: Math.ceil(primaryRect.right),
      removeRight: Math.ceil(removeRect.right),
      rowRight: Math.ceil(rowRect.right)
    };
  });

  expect(rowMetrics).not.toBeNull();
  expect(rowMetrics.actionsTop).toBeGreaterThanOrEqual(rowMetrics.infoBottom - 1);
  expect(rowMetrics.primaryRight).toBeLessThanOrEqual(rowMetrics.rowRight);
  expect(rowMetrics.removeRight).toBeLessThanOrEqual(rowMetrics.rowRight);
});

test('admin contract rows keep inline actions on short but wide viewports', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 640 });
  await setupMockApi(page);
  await page.goto('/');
  await expect(page.locator('#screen-pin.active')).toBeVisible();

  await enterPin(page, '123456');
  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await page.locator('#menu-admin-shortcut').click();
  await page.locator('.admin-tab', { hasText: 'Contratos' }).click();
  await expect(page.locator('#admin-acuerdo-list')).toContainText('Ismael Perez');

  const rowMetrics = await page.evaluate(() => {
    const row = document.querySelector('#admin-acuerdo-list .acuerdo-row');
    const info = row && row.querySelector('.acuerdo-row-info');
    const actions = row && row.querySelector('.acuerdo-row-actions');
    if (!row || !info || !actions) return null;
    const infoRect = info.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();
    return {
      actionsTop: Math.round(actionsRect.top),
      infoBottom: Math.round(infoRect.bottom)
    };
  });

  expect(rowMetrics).not.toBeNull();
  expect(rowMetrics.actionsTop).toBeLessThan(rowMetrics.infoBottom);
});

test('admin tabs stay usable on a narrow mobile viewport including ajustes', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await setupMockApi(page);
  await page.goto('/');
  await expect(page.locator('#screen-pin.active')).toBeVisible();

  await enterPin(page, '123456');
  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await page.locator('#menu-admin-shortcut').click();

  const tabMetrics = await page.evaluate(() => {
    const tabs = document.getElementById('admin-tabs');
    const styles = window.getComputedStyle(tabs);
    return {
      overflowX: styles.overflowX,
      scrollWidth: tabs.scrollWidth,
      clientWidth: tabs.clientWidth
    };
  });

  expect(tabMetrics.overflowX).toBe('auto');
  expect(tabMetrics.scrollWidth).toBeGreaterThan(tabMetrics.clientWidth);

  await page.locator('.admin-tab', { hasText: 'Ajustes' }).click();
  await expect(page.locator('#admin-ajustes.active')).toBeVisible();
  await expect(page.locator('#admin-setting-legal-rep')).toHaveValue('Marta Admin');

  const activeTabMetrics = await page.evaluate(() => {
    const tabs = document.getElementById('admin-tabs');
    const activeTab = tabs.querySelector('.admin-tab.active');
    const tabsRect = tabs.getBoundingClientRect();
    const tabRect = activeTab.getBoundingClientRect();
    return {
      left: Math.round(tabRect.left),
      right: Math.round(tabRect.right),
      containerLeft: Math.round(tabsRect.left),
      containerRight: Math.round(tabsRect.right)
    };
  });

  expect(activeTabMetrics.left).toBeGreaterThanOrEqual(activeTabMetrics.containerLeft);
  expect(activeTabMetrics.right).toBeLessThanOrEqual(activeTabMetrics.containerRight);
});

test('admin layouts fit inside a short mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await setupMockApi(page);
  await page.goto('/');
  await expect(page.locator('#screen-pin.active')).toBeVisible();

  await enterPin(page, '123456');
  await expect(page.locator('#screen-menu.active')).toBeVisible();

  await page.locator('#menu-admin-shortcut').click();
  await expect(page.locator('#screen-admin.active')).toBeVisible();

  const paymentsMetrics = await page.evaluate(() => {
    const screen = document.querySelector('#screen-admin.active');
    const section = document.querySelector('#screen-admin.active .admin-section:not(.hidden)');
    const scroller = document.scrollingElement || document.documentElement;
    const sectionStyles = window.getComputedStyle(section);

    return {
      viewport: window.innerHeight,
      screenBottom: Math.ceil(screen.getBoundingClientRect().bottom),
      screenOverflow: Math.max(0, screen.scrollHeight - screen.clientHeight),
      sectionOverflow: Math.max(0, section.scrollHeight - section.clientHeight),
      sectionOverflowY: sectionStyles.overflowY,
      docOverflow: Math.max(0, scroller.scrollHeight - window.innerHeight)
    };
  });

  expect(paymentsMetrics.screenBottom).toBeLessThanOrEqual(paymentsMetrics.viewport);
  expect(paymentsMetrics.screenOverflow).toBeLessThanOrEqual(2);
  expect(paymentsMetrics.sectionOverflowY).toBe('auto');
  expect(paymentsMetrics.docOverflow).toBeLessThanOrEqual(2);

  await page.locator('.admin-tab', { hasText: 'Empleados' }).click();
  await expect(page.locator('.btn-edit-emp')).toHaveCount(3);

  const employeeMetrics = await page.evaluate(() => {
    const screen = document.querySelector('#screen-admin.active');
    const section = document.querySelector('#screen-admin.active .admin-section:not(.hidden)');
    const sectionStyles = window.getComputedStyle(section);
    return {
      screenOverflow: Math.max(0, screen.scrollHeight - screen.clientHeight),
      sectionOverflow: Math.max(0, section.scrollHeight - section.clientHeight),
      sectionOverflowY: sectionStyles.overflowY
    };
  });

  expect(employeeMetrics.screenOverflow).toBeLessThanOrEqual(2);
  expect(employeeMetrics.sectionOverflowY).toBe('auto');

  await page.locator('.btn-edit-emp').first().click();

  const modalMetrics = await page.evaluate(() => {
    const modal = document.querySelector('.modal:not(.hidden) .modal-card');
    return modal ? Math.max(0, modal.scrollHeight - modal.clientHeight) : Number.POSITIVE_INFINITY;
  });

  expect(modalMetrics).toBeLessThanOrEqual(2);
});

test('admin layouts fit inside a short landscape viewport', async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await setupMockApi(page);
  await page.goto('/');
  await expect(page.locator('#screen-pin.active')).toBeVisible();

  await enterPin(page, '123456');
  await expect(page.locator('#screen-menu.active')).toBeVisible();

  await page.locator('#menu-admin-shortcut').click();
  await expect(page.locator('#screen-admin.active')).toBeVisible();

  await page.locator('.admin-tab', { hasText: 'Empleados' }).click();
  await expect(page.locator('.btn-edit-emp')).toHaveCount(3);

  const employeeMetrics = await page.evaluate(() => {
    const screen = document.querySelector('#screen-admin.active');
    const section = document.querySelector('#screen-admin.active .admin-section:not(.hidden)');
    const scroller = document.scrollingElement || document.documentElement;

    return {
      viewport: window.innerHeight,
      screenBottom: Math.ceil(screen.getBoundingClientRect().bottom),
      screenOverflow: Math.max(0, screen.scrollHeight - screen.clientHeight),
      sectionOverflow: Math.max(0, section.scrollHeight - section.clientHeight),
      docOverflow: Math.max(0, scroller.scrollHeight - window.innerHeight)
    };
  });

  expect(employeeMetrics.screenBottom).toBeLessThanOrEqual(employeeMetrics.viewport);
  expect(employeeMetrics.screenOverflow).toBeLessThanOrEqual(2);
  expect(employeeMetrics.sectionOverflow).toBeLessThanOrEqual(2);
  expect(employeeMetrics.docOverflow).toBeLessThanOrEqual(2);

  await page.locator('.btn-edit-emp').first().click();

  const modalMetrics = await page.evaluate(() => {
    const modal = document.querySelector('.modal:not(.hidden) .modal-card');
    return modal ? Math.max(0, modal.scrollHeight - modal.clientHeight) : Number.POSITIVE_INFINITY;
  });

  expect(modalMetrics).toBeLessThanOrEqual(2);
});

test('schedule create dialog is simplified for employee reservations', async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await expect(page.locator('#screen-pin.active')).toBeVisible();
  await enterPin(page, '1234');

  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await page.getByRole('button', { name: 'Mi Horario' }).click();
  await expect(page.locator('#screen-schedule.active')).toBeVisible();

  await page.locator('.sched-empty[data-day="2"][data-hour="15"]').click();

  await expect(page.locator('#schedule-slot-mode')).toHaveText('Hueco disponible');
  await expect(page.locator('#schedule-slot-title')).toHaveText('Crear y reservar franja');
  await expect(page.locator('#schedule-slot-focus-day')).toHaveText('Martes');
  await expect(page.locator('#schedule-slot-focus-time')).toHaveText('15:00 - 16:00');
  await expect(page.locator('#schedule-slot-summary')).toBeHidden();
  await expect(page.locator('#schedule-slot-body')).toBeHidden();
  await expect(page.locator('#schedule-slot-note')).toBeHidden();
  await expect(page.locator('#schedule-slot-secondary')).toBeHidden();
  await expect(page.locator('#schedule-slot-submit')).toHaveText('Crear y reservar');
});

test('schedule refreshes within a few seconds when backend slots change', async ({ page }) => {
  const state = await setupMockApi(page);
  await page.goto('/');
  await expect(page.locator('#screen-pin.active')).toBeVisible();
  await enterPin(page, '1234');

  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await page.locator('#card-schedule').click();
  await expect(page.locator('#screen-schedule.active')).toBeVisible();
  await expect(page.locator('.sched-cell[data-slot-id="slot-1"]')).toHaveCount(1);

  state.scheduleSlots = state.scheduleSlots.filter((slot) => slot.id !== 'slot-1');

  await expect(page.locator('.sched-cell[data-slot-id="slot-1"]')).toHaveCount(0, { timeout: 7000 });
});

test('direct route allows atomic schedule reservation with pin', async ({ page }) => {
  const state = await setupMockApi(page);
  await page.goto('/direct/');

  await expect(page.locator('.direct-brand')).toContainText('Punto de encuentro inclusivo');
  await expect(page.locator('#direct-schedule-grid')).toBeVisible();

  await page.locator('#direct-schedule-grid .sched-cell[data-slot-id="slot-2"]').click();
  await expect(page.locator('#direct-schedule-dialog')).toHaveJSProperty('open', true);
  await expect(page.locator('#direct-dialog-mode')).toHaveText('Franja libre');
  await expect(page.locator('#direct-dialog-title')).toHaveText('Reservar franja');
  await expect(page.locator('#direct-dialog-summary')).toHaveText('Martes - 16:00 - 17:00');
  await expect(page.locator('#direct-dialog-focus-day')).toHaveText('Martes');
  await expect(page.locator('#direct-dialog-focus-time')).toHaveText('16:00 - 17:00');
  await expect(page.locator('#direct-dialog-body')).toHaveText('Introduce tu PIN de 4 cifras para reservar esta franja.');
  await enterDirectDialogPin(page, '4321');
  await page.locator('#direct-dialog-submit').click();

  await expect(page.locator('#direct-schedule-status')).toContainText('Franja reservada correctamente.');
  await expect.poll(() => state.scheduleActionCalls.length).toBe(1);
  await expect.poll(() => state.scheduleActionCalls[0].action).toBe('assign');
  await expect.poll(() => state.scheduleActionCalls[0].auth).toContain('Bearer employee-token-2');
});

test('direct quick clock layout fits inside a short mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await setupMockApi(page);
  await page.goto('/direct/');

  await page.locator('#direct-tab-clock').click();
  await expect(page.locator('.direct-panel[data-panel-id="clock"]')).toHaveClass(/is-active/);

  const metrics = await page.evaluate(() => {
    const panel = document.querySelector('.direct-panel[data-panel-id="clock"]');
    const shell = document.getElementById('direct-clock-shell');
    const keypad = document.getElementById('direct-pin-keypad');
    const scroller = document.scrollingElement || document.documentElement;

    return {
      viewport: window.innerHeight,
      panelBottom: Math.ceil(panel.getBoundingClientRect().bottom),
      keypadBottom: Math.ceil(keypad.getBoundingClientRect().bottom),
      shellOverflow: Math.max(0, shell.scrollHeight - shell.clientHeight),
      docOverflow: Math.max(0, scroller.scrollHeight - window.innerHeight)
    };
  });

  expect(metrics.panelBottom).toBeLessThanOrEqual(metrics.viewport);
  expect(metrics.keypadBottom).toBeLessThanOrEqual(metrics.viewport);
  expect(metrics.shellOverflow).toBeLessThanOrEqual(2);
  expect(metrics.docOverflow).toBeLessThanOrEqual(2);
});

test('direct quick clock layout fits inside a short landscape viewport', async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await setupMockApi(page);
  await page.goto('/direct/');

  await page.locator('#direct-tab-clock').click();
  await expect(page.locator('.direct-panel[data-panel-id="clock"]')).toHaveClass(/is-active/);

  const metrics = await page.evaluate(() => {
    const panel = document.querySelector('.direct-panel[data-panel-id="clock"]');
    const shell = document.getElementById('direct-clock-shell');
    const keypad = document.getElementById('direct-pin-keypad');
    const scroller = document.scrollingElement || document.documentElement;

    return {
      viewport: window.innerHeight,
      panelBottom: Math.ceil(panel.getBoundingClientRect().bottom),
      keypadBottom: Math.ceil(keypad.getBoundingClientRect().bottom),
      shellOverflow: Math.max(0, shell.scrollHeight - shell.clientHeight),
      docOverflow: Math.max(0, scroller.scrollHeight - window.innerHeight)
    };
  });

  expect(metrics.panelBottom).toBeLessThanOrEqual(metrics.viewport);
  expect(metrics.keypadBottom).toBeLessThanOrEqual(metrics.viewport);
  expect(metrics.shellOverflow).toBeLessThanOrEqual(2);
  expect(metrics.docOverflow).toBeLessThanOrEqual(2);
});

test('direct route mirrors compact create dialog layout from main schedule', async ({ page }) => {
  const state = await setupMockApi(page);
  await page.goto('/direct/');

  await page.locator('.sched-empty[data-day="2"][data-hour="15"]').click();

  await expect(page.locator('#direct-schedule-dialog')).toHaveJSProperty('open', true);
  await expect(page.locator('#direct-schedule-dialog')).toHaveClass(/compact-create/);
  await expect(page.locator('#direct-dialog-mode')).toHaveText('Hueco disponible');
  await expect(page.locator('#direct-dialog-title')).toHaveText('Crear y reservar franja');
  await expect(page.locator('#direct-dialog-summary')).toBeHidden();
  await expect(page.locator('#direct-dialog-focus-day')).toHaveText('Martes');
  await expect(page.locator('#direct-dialog-focus-time')).toHaveText('15:00 - 16:00');
  await expect(page.locator('#direct-dialog-body')).toBeHidden();
  await expect(page.locator('#direct-dialog-submit')).toHaveText('Crear y reservar');

  await enterDirectDialogPin(page, '4321');
  await page.locator('#direct-dialog-submit').click();

  await expect(page.locator('#direct-schedule-status')).toContainText('Franja creada y reservada correctamente.');
  await expect.poll(() => state.scheduleActionCalls.length).toBe(1);
  await expect.poll(() => state.scheduleActionCalls[0].action).toBe('create-and-assign');
  await expect.poll(() => state.scheduleActionCalls[0].auth).toContain('Bearer employee-token-2');
});

test('direct schedule dialog captures physical keyboard without leaking to quick clock', async ({ page }) => {
  const state = await setupMockApi(page);
  await page.goto('/direct/');

  await page.locator('#direct-schedule-grid .sched-cell[data-slot-id="slot-2"]').click();
  await expect(page.locator('#direct-schedule-dialog')).toHaveJSProperty('open', true);

  await page.keyboard.type('43');
  await expect(page.locator('#direct-dialog-pin-dots .pin-dot.filled')).toHaveCount(2);
  await expect(page.locator('#direct-pin-dots .pin-dot.filled')).toHaveCount(0);

  await page.keyboard.press('Backspace');
  await expect(page.locator('#direct-dialog-pin-dots .pin-dot.filled')).toHaveCount(1);

  await page.keyboard.type('321');
  await expect(page.locator('#direct-dialog-pin-dots .pin-dot.filled')).toHaveCount(4);
  await page.locator('#direct-dialog-submit').click();

  await expect(page.locator('#direct-schedule-status')).toContainText('Franja reservada correctamente.');
  await expect.poll(() => state.scheduleActionCalls.length).toBe(1);
});

test('direct route performs quick clocking without persisting session', async ({ page }) => {
  const state = await setupMockApi(page);
  await page.goto('/direct/');

  const clockPanel = page.locator('.direct-panel[data-panel-id="clock"]');
  if (!(await clockPanel.evaluate((node) => window.getComputedStyle(node).display !== 'none'))) {
    await page.locator('#direct-tab-clock').click();
  }

  await expect(page.locator('#direct-clock-time')).toBeVisible();
  await enterPin(page, '4321');

  await expect(page.locator('#direct-clock-feedback')).toContainText('Lucia Garcia');
  await expect(page.locator('#direct-clock-feedback')).toContainText('ENTRADA');
  await expect.poll(() => state.clockActionCalls.length).toBe(1);
  await expect.poll(() => state.clockActionCalls[0].action).toBe('check-in');
  await expect.poll(() => state.clockActionCalls[0].auth).toContain('Bearer employee-token-2');
  await expect(page.locator('#menu-login-btn')).toHaveCount(0);
});

test('direct route queues quick clocking offline and syncs later', async ({ page }) => {
  const state = await setupMockApi(page, { clockFailuresRemaining: 1 });
  await page.goto('/direct/');

  const clockPanel = page.locator('.direct-panel[data-panel-id="clock"]');
  if (!(await clockPanel.evaluate((node) => window.getComputedStyle(node).display !== 'none'))) {
    await page.locator('#direct-tab-clock').click();
  }

  await expect(page.locator('#direct-clock-time')).toBeVisible();
  await enterPin(page, '4321');

  await expect(page.locator('#direct-clock-feedback-badge')).toHaveText('PENDIENTE');
  await expect(page.locator('#direct-clock-feedback')).toContainText('guardada sin conexion');
  await expect(page.locator('#offline-clock-banner')).toBeVisible();
  await expect(page.locator('#offline-clock-banner')).toHaveText('1 fichaje pendiente de sincronizar');
  await expect.poll(() => state.clockActionCalls.length).toBe(2, { timeout: 8000 });
  expect(state.clockActionCalls[0].clientTimestamp).toBe(state.clockActionCalls[1].clientTimestamp);
  expect(state.clockActionCalls[0].auth).toContain('Bearer employee-token-2');
  expect(state.clockActionCalls[0].clockToken).toBe('');
  expect(state.clockActionCalls[1].auth).toBe('');
  expect(state.clockActionCalls[1].clockToken).toContain('offline-clock-token-2');
  await expect(page.locator('#offline-clock-banner')).toBeHidden({ timeout: 8000 });
});

test('direct route can verify a cached PIN offline and sync once the connection returns', async ({ page }) => {
  const state = await setupMockApi(page);
  await page.goto('/');
  await enterPin(page, '4321');
  await expect(page.locator('#screen-menu.active')).toBeVisible();

  await page.goto('/direct/');
  const clockPanel = page.locator('.direct-panel[data-panel-id="clock"]');
  if (!(await clockPanel.evaluate((node) => window.getComputedStyle(node).display !== 'none'))) {
    await page.locator('#direct-tab-clock').click();
  }

  state.employeeVerifyFailuresRemaining = 1;
  state.clockFailuresRemaining = 1;
  await enterPin(page, '4321');

  await expect(page.locator('#direct-clock-feedback-badge')).toHaveText('PENDIENTE');
  await expect(page.locator('#direct-clock-feedback')).toContainText('guardada sin conexion');
  await expect(page.locator('#offline-clock-banner')).toBeVisible();

  await expect.poll(() => state.clockActionCalls.filter((call) => call.action !== 'status').length).toBe(2, { timeout: 8000 });
  expect(state.clockActionCalls[1].auth).toBe('');
  expect(state.clockActionCalls[1].clockToken).toContain('offline-clock-token-2');
  await expect(page.locator('#offline-clock-banner')).toBeHidden({ timeout: 8000 });
});

test('direct route explains clearly when offline verification has no cached credential', async ({ page }) => {
  await setupMockApi(page, { employeeVerifyFailuresRemaining: 1 });
  await page.goto('/direct/');

  const clockPanel = page.locator('.direct-panel[data-panel-id="clock"]');
  if (!(await clockPanel.evaluate((node) => window.getComputedStyle(node).display !== 'none'))) {
    await page.locator('#direct-tab-clock').click();
  }

  await enterPin(page, '4321');
  await expect(page.locator('#direct-clock-feedback')).toContainText('no tiene credencial offline disponible');
});

test('direct route explains clearly when the cached offline credential has expired', async ({ page }) => {
  const state = await setupMockApi(page);
  await page.goto('/');
  await enterPin(page, '4321');
  await expect(page.locator('#screen-menu.active')).toBeVisible();

  await page.evaluate(async (dbName) => {
    function requestToPromise(request) {
      return new Promise((resolve, reject) => {
        request.onsuccess = function () { resolve(request.result); };
        request.onerror = function () { reject(request.error || new Error('IndexedDB error')); };
      });
    }

    const db = await new Promise((resolve, reject) => {
      const request = window.indexedDB.open(dbName);
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('Open DB failed')); };
    });

    try {
      const readTx = db.transaction('employee_pin_cache', 'readonly');
      const records = await requestToPromise(readTx.objectStore('employee_pin_cache').getAll());
      const tx = db.transaction('employee_pin_cache', 'readwrite');
      const store = tx.objectStore('employee_pin_cache');
      records.forEach((record) => {
        record.offlineClockTokenExpiresAt = '2000-01-01T00:00:00.000Z';
        store.put(record);
      });
      await new Promise((resolve) => {
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { resolve(); };
        tx.onabort = function () { resolve(); };
      });
    } finally {
      db.close();
    }
  }, OFFLINE_DB_NAME);

  await page.goto('/direct/');
  const clockPanel = page.locator('.direct-panel[data-panel-id="clock"]');
  if (!(await clockPanel.evaluate((node) => window.getComputedStyle(node).display !== 'none'))) {
    await page.locator('#direct-tab-clock').click();
  }

  state.employeeVerifyFailuresRemaining = 1;
  await enterPin(page, '4321');
  await expect(page.locator('#direct-clock-feedback')).toContainText('no tiene credencial offline disponible');
});

test('direct route shows the next assigned schedule when check-in is outside any shift', async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/direct/');

  const clockPanel = page.locator('.direct-panel[data-panel-id="clock"]');
  if (!(await clockPanel.evaluate((node) => window.getComputedStyle(node).display !== 'none'))) {
    await page.locator('#direct-tab-clock').click();
  }

  await enterPin(page, '5555');

  await expect(page.locator('#direct-clock-feedback')).toContainText('Nora Diaz');
  await expect(page.locator('#direct-clock-feedback')).toContainText('jueves 19 de marzo');
  await expect(page.locator('#direct-clock-feedback')).toContainText('17:00 a 18:00');
});

test('direct route uses panel switcher on mobile without overlapping panels', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Solo aplica a layout compacto');

  await setupMockApi(page);
  await page.goto('/direct/');

  await expect(page.locator('#direct-panel-switch')).toBeVisible();
  await expect(page.locator('.direct-panel[data-panel-id="schedule"]')).toHaveClass(/is-active/);
  await expect(page.locator('.direct-panel[data-panel-id="clock"]')).not.toHaveClass(/is-active/);

  await page.locator('#direct-tab-clock').click();

  await expect(page.locator('.direct-panel[data-panel-id="clock"]')).toHaveClass(/is-active/);
  await expect(page.locator('.direct-panel[data-panel-id="schedule"]')).not.toHaveClass(/is-active/);
  await expect(page.locator('#direct-clock-time')).toBeVisible();
});

test('admin can move between direct mode and admin panel with dedicated buttons', async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');

  await expect(page.locator('#screen-pin.active')).toBeVisible();
  await enterPin(page, '123456');

  await expect(page.locator('#menu-direct-shortcut')).toBeVisible();
  await page.locator('#menu-direct-shortcut').click();

  await expect(page).toHaveURL(/\/direct\/$/);
  await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible();

  await page.getByRole('link', { name: 'Admin' }).click();

  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await expect(page.locator('#greeting')).toHaveText('Administrador');
  await expect(page.locator('#menu-admin-shortcut')).toBeVisible();
});
