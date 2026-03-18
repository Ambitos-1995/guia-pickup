const { test, expect } = require('@playwright/test');
const { setupMockApi } = require('./helpers/mock-api');

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

test('app boots into the internal PIN screen', async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await expect(page.locator('#screen-pin.active')).toBeVisible();

  await expect(page).toHaveTitle('Punto de encuentro inclusivo');
  await expect(page.locator('#pin-prompt')).toHaveText('Introduce tu PIN de 4 o 6 cifras');
  await expect(page.locator('body')).not.toContainText('Pickup TMG');
  await expect(page.locator('#pin-public-schedule')).toBeHidden();
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
  await expect(page.locator('#greeting')).toHaveText('Ismael Pérez');
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

test('admin can load payments and save a configured amount', async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await expect(page.locator('#screen-pin.active')).toBeVisible();

  await enterPin(page, '123456');
  await expect(page.locator('#screen-menu.active')).toBeVisible();

  await page.locator('#menu-admin-shortcut').click();
  await expect(page.locator('#screen-admin.active')).toBeVisible();
  await expect(page.locator('#admin-build-version')).toContainText(/Version \d{4}\.\d{2}\.\d{2}-r\d+/);
  await expect(page.locator('#admin-pay-summary-status')).toContainText('Sin configurar');

  await page.locator('#admin-pay-amount').fill('1250');
  await page.locator('#admin-pay-save').click();

  await expect(page.locator('#admin-pay-feedback')).toContainText('Importe guardado.');
  await expect(page.locator('#admin-pay-summary-amount')).toContainText('1250.00');
  await expect(page.locator('#admin-pay-summary-status')).toContainText('Configurado');
});

test('admin can create a new employee from ajustes empleados', async ({ page }) => {
  const state = await setupMockApi(page);
  await page.goto('/');
  await expect(page.locator('#screen-pin.active')).toBeVisible();

  await enterPin(page, '123456');
  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await page.locator('#menu-admin-shortcut').click();

  await page.locator('.admin-tab', { hasText: 'Empleados' }).click();
  await expect(page.locator('#admin-employee-list')).toContainText('Ismael Pérez');

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

    return {
      viewport: window.innerHeight,
      screenBottom: Math.ceil(screen.getBoundingClientRect().bottom),
      screenOverflow: Math.max(0, screen.scrollHeight - screen.clientHeight),
      sectionOverflow: Math.max(0, section.scrollHeight - section.clientHeight),
      docOverflow: Math.max(0, scroller.scrollHeight - window.innerHeight)
    };
  });

  expect(paymentsMetrics.screenBottom).toBeLessThanOrEqual(paymentsMetrics.viewport);
  expect(paymentsMetrics.screenOverflow).toBeLessThanOrEqual(2);
  expect(paymentsMetrics.sectionOverflow).toBeLessThanOrEqual(2);
  expect(paymentsMetrics.docOverflow).toBeLessThanOrEqual(2);

  await page.locator('.admin-tab', { hasText: 'Empleados' }).click();
  await expect(page.locator('.btn-edit-emp')).toHaveCount(3);

  const employeeMetrics = await page.evaluate(() => {
    const screen = document.querySelector('#screen-admin.active');
    const section = document.querySelector('#screen-admin.active .admin-section:not(.hidden)');
    return {
      screenOverflow: Math.max(0, screen.scrollHeight - screen.clientHeight),
      sectionOverflow: Math.max(0, section.scrollHeight - section.clientHeight)
    };
  });

  expect(employeeMetrics.screenOverflow).toBeLessThanOrEqual(2);
  expect(employeeMetrics.sectionOverflow).toBeLessThanOrEqual(2);

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
  await page.getByRole('button', { name: 'Mi Horario' }).click();
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
