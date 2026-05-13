const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const paymentFn = fs.readFileSync(
  path.join(root, 'supabase', 'functions', 'kiosk-payment', 'index.ts'),
  'utf8',
);
const sharedKiosk = fs.readFileSync(
  path.join(root, 'supabase', 'functions', '_shared', 'kiosk.ts'),
  'utf8',
);
const apiJs = fs.readFileSync(path.join(root, 'js', 'api.js'), 'utf8');
const adminJs = fs.readFileSync(path.join(root, 'js', 'admin.js'), 'utf8');
const clockJs = fs.readFileSync(path.join(root, 'js', 'clock.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('kiosk-payment handleSetAmount persists hourly_rate column', () => {
  assert.match(paymentFn, /hourlyRate\?: number/);
  // El UPSERT del set-amount debe incluir el campo hourly_rate.
  assert.match(paymentFn, /hourly_rate: hourlyRate/);
});

test('kiosk-payment handleCalculate implements fixed rate + proportional cap', () => {
  // Lectura del campo nuevo del payment_month.
  assert.match(
    paymentFn,
    /kiosk_payment_months\?select=total_amount,hourly_rate/,
  );
  // Detección del modo tarifa fija y aplicación del cap proporcional.
  assert.match(paymentFn, /isFixedRate/);
  assert.match(paymentFn, /adjustmentFactor/);
  assert.match(paymentFn, /cap_applied/);
  // Las sesiones se agrupan por (employee, date, slot) leyendo check_in y check_out.
  assert.match(paymentFn, /action=in\.\(check_in,check_out\)/);
  // El bucle calcula minutos por solape entre sesión y slot, no 1:1.
  assert.match(paymentFn, /slotMinutes\.set\(slot\.id/);
});

test('computeWorkedMinutes accepts optional checkOutIso for real exit time', () => {
  assert.match(
    sharedKiosk,
    /checkOutIso\?: string \| null/,
  );
  assert.match(
    sharedKiosk,
    /Math\.min\(slotEnd\.getTime\(\), new Date\(checkOutIso\)\.getTime\(\)\)/,
  );
});

test('Api.setPaymentAmount forwards hourlyRate to backend', () => {
  assert.match(apiJs, /function setPaymentAmount\(year, month, totalAmount, hourlyRate\)/);
  assert.match(apiJs, /payload\.hourlyRate = Number\(hourlyRate\)/);
});

test('Admin payment form has hourly rate input and gates calculate button', () => {
  assert.ok(
    indexHtml.includes('id="admin-pay-rate"'),
    'index.html should expose the #admin-pay-rate input',
  );
  assert.match(adminJs, /refreshCalcButtonState/);
  assert.match(adminJs, /tarifa por hora valida/);
  // El cálculo debe deshabilitar el botón mientras no haya tarifa válida.
  assert.match(adminJs, /calcBtn\.disabled = !\(rateVal > 0\)/);
});

test('Clock shows TMG warning when next consecutive slot is open after check_out', () => {
  assert.match(clockJs, /maybeShowNextSlotPrompt/);
  assert.match(clockJs, /Tienes otro turno hoy de/);
  // Re-habilita el botón Entrada si hay slot consecutivo disponible.
  assert.match(clockJs, /btnIn\.classList\.remove\('hidden'\)/);
});

test('kiosk-clock status action exposes todaySlots with their states', () => {
  const clockFn = fs.readFileSync(
    path.join(root, 'supabase', 'functions', 'kiosk-clock', 'index.ts'),
    'utf8',
  );
  assert.match(clockFn, /todaySlots: dayState\.todaySlots\.map/);
  assert.match(clockFn, /state: dayState\.slotStates\[slot\.id\]/);
});
