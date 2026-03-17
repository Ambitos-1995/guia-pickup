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

test('public shell loads with updated branding and menu actions', async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await expect(page.locator('#screen-menu.active')).toBeVisible();

  await expect(page).toHaveTitle('Punto de encuentro inclusivo');
  await expect(page.locator('#screen-menu')).toContainText('Guia Pickup');
  await expect(page.locator('body')).not.toContainText('Pickup TMG');
  await expect(page.locator('#card-admin')).toBeVisible();
  await expect(page.locator('#menu-login-btn')).toBeVisible();
});

test('public shell keeps mi horario and guia pickup locked until login', async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await expect(page.locator('#screen-menu.active')).toBeVisible();

  await expect(page.locator('#card-schedule')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#card-guia')).toHaveAttribute('aria-disabled', 'true');

  await page.locator('#card-schedule').click({ force: true });
  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await expect(page.locator('#screen-schedule.active')).toHaveCount(0);

  await page.locator('#card-guia').click({ force: true });
  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await expect(page.locator('#screen-guia.active')).toHaveCount(0);
});

test('employee login unlocks personal actions and payment summary', async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await expect(page.locator('#screen-menu.active')).toBeVisible();

  await page.getByRole('button', { name: 'Iniciar sesion' }).click();
  await expect(page.locator('#screen-pin.active')).toBeVisible();

  await enterPin(page, '1234');

  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await expect(page.locator('#greeting')).toHaveText('Ismael Pérez');
  await expect(page.locator('#card-payment')).toBeVisible();
  await expect(page.locator('#card-schedule')).toHaveAttribute('aria-disabled', 'false');
  await expect(page.locator('#card-guia')).toHaveAttribute('aria-disabled', 'false');
  await expect(page.locator('#menu-admin-shortcut')).toBeHidden();
  await expect(page.locator('#admin-build-version')).toBeHidden();

  await page.getByRole('button', { name: 'Mi Pago' }).click();
  await expect(page.locator('#screen-payment.active')).toBeVisible();
  await expect(page.locator('#pay-hours')).toContainText('24');
  await expect(page.locator('#payment-status')).toContainText('Liquidacion calculada');
});

test('employee session persists after reload while still valid', async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await expect(page.locator('#screen-menu.active')).toBeVisible();

  await page.getByRole('button', { name: 'Iniciar sesion' }).click();
  await expect(page.locator('#screen-pin.active')).toBeVisible();
  await enterPin(page, '1234');

  await expect(page.locator('#greeting')).toContainText('Ismael');
  await expect(page.locator('#card-payment')).toBeVisible();

  await page.reload();

  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await expect(page.locator('#greeting')).toContainText('Ismael');
  await expect(page.locator('#card-payment')).toBeVisible();
  await expect(page.locator('#menu-admin-shortcut')).toBeHidden();
  await expect(page.locator('#menu-login-btn')).toBeHidden();
});

test('admin can sign in from iniciar sesion with a 6-digit PIN', async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await expect(page.locator('#screen-menu.active')).toBeVisible();

  await page.getByRole('button', { name: 'Iniciar sesion' }).click();
  await expect(page.locator('#screen-pin.active')).toBeVisible();
  await expect(page.locator('#pin-prompt')).toHaveText('Introduce tu PIN (4 o 6 digitos)');

  await enterPin(page, '123456');

  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await expect(page.locator('#menu-admin-shortcut')).toBeVisible();
  await expect(page.locator('#menu-direct-shortcut')).toBeVisible();
  await expect(page.locator('#menu-login-btn')).toBeHidden();
  await expect(page.locator('#logout-btn')).toBeVisible();
});

test('admin can load payments and save a configured amount', async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await expect(page.locator('#screen-menu.active')).toBeVisible();

  await page.getByRole('button', { name: 'Ajustes' }).click();
  await enterPin(page, '123456');
  await expect(page.locator('#screen-menu.active')).toBeVisible();
  await expect(page.locator('#menu-admin-shortcut')).toBeVisible();

  await page.getByRole('button', { name: 'Ajustes' }).click();
  await expect(page.locator('#screen-admin.active')).toBeVisible();
  await expect(page.locator('#admin-build-version')).toContainText('Version 2026.03.16-r1');
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
  await expect(page.locator('#screen-menu.active')).toBeVisible();

  await page.getByRole('button', { name: 'Ajustes' }).click();
  await enterPin(page, '123456');
  await page.getByRole('button', { name: 'Ajustes' }).click();

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

test('schedule create dialog is simplified for employee reservations', async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await expect(page.locator('#screen-menu.active')).toBeVisible();

  await page.getByRole('button', { name: 'Iniciar sesion' }).click();
  await expect(page.locator('#screen-pin.active')).toBeVisible();
  await enterPin(page, '1234');

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
  await expect(page.locator('#direct-dialog-focus')).toBeHidden();
  await expect(page.locator('#direct-dialog-body')).toHaveText('Introduce tu PIN de 4 cifras para reservar esta franja.');
  await page.locator('#direct-dialog-pin').fill('4321');
  await page.locator('#direct-dialog-submit').click();

  await expect(page.locator('#direct-schedule-status')).toContainText('Franja reservada correctamente.');
  await expect.poll(() => state.scheduleActionCalls.length).toBe(1);
  await expect.poll(() => state.scheduleActionCalls[0].action).toBe('assign');
  await expect.poll(() => state.scheduleActionCalls[0].auth).toContain('Bearer employee-token-2');
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

  await page.locator('#direct-dialog-pin').fill('4321');
  await page.locator('#direct-dialog-submit').click();

  await expect(page.locator('#direct-schedule-status')).toContainText('Franja creada y reservada correctamente.');
  await expect.poll(() => state.scheduleActionCalls.length).toBe(1);
  await expect.poll(() => state.scheduleActionCalls[0].action).toBe('create-and-assign');
  await expect.poll(() => state.scheduleActionCalls[0].auth).toContain('Bearer employee-token-2');
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

  await page.getByRole('button', { name: 'Iniciar sesion' }).click();
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
