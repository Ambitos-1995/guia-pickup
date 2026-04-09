const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const directIndexHtml = fs.readFileSync(path.join(root, 'direct', 'index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const swRegister = fs.readFileSync(path.join(root, 'js', 'sw-register.js'), 'utf8');
const vercelIgnore = fs.readFileSync(path.join(root, '.vercelignore'), 'utf8');
const apiJs = fs.readFileSync(path.join(root, 'js', 'api.js'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const offlineQueueJs = fs.readFileSync(path.join(root, 'js', 'offline-clock-queue.js'), 'utf8');
const guiaJs = fs.readFileSync(path.join(root, 'js', 'guia.js'), 'utf8');
const stylesCss = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');
const paymentJs = fs.readFileSync(path.join(root, 'js', 'payment.js'), 'utf8');
const adminJs = fs.readFileSync(path.join(root, 'js', 'admin.js'), 'utf8');
const utilsJs = fs.readFileSync(path.join(root, 'js', 'utils.js'), 'utf8');
const pinPadJs = fs.readFileSync(path.join(root, 'js', 'pin-pad.js'), 'utf8');
const clockFunction = fs.readFileSync(path.join(root, 'supabase', 'functions', 'kiosk-clock', 'index.ts'), 'utf8');
const supabaseConfig = fs.readFileSync(path.join(root, 'supabase', 'config.toml'), 'utf8');
const receiptFunction = fs.readFileSync(path.join(root, 'supabase', 'functions', 'kiosk-payment-receipt', 'index.ts'), 'utf8');
const sharedKiosk = fs.readFileSync(path.join(root, 'supabase', 'functions', '_shared', 'kiosk.ts'), 'utf8');
const baselineContractMigration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260330092629_add_kiosk_contracts.sql'), 'utf8');
const contractStatusMigration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260330103212_add_participant_verified_at_and_pending_admin_status.sql'), 'utf8');
const supersededContractMigration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260330120000_add_kiosk_contracts.sql'), 'utf8');
const baselineAuditMigration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260330122835_kiosk_row_level_audit_triggers.sql'), 'utf8');
const supersededAuditMigration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260330150000_kiosk_row_level_audit_triggers.sql'), 'utf8');
const baselineAuditExpansionMigration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260330123332_audit_triggers_all_tables.sql'), 'utf8');
const supersededAuditExpansionMigration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260330160000_audit_triggers_all_tables.sql'), 'utf8');
const supersededReceiptMigration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260331100000_add_kiosk_payment_receipts.sql'), 'utf8');
const baselineReceiptMigration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260331103702_add_kiosk_payment_receipts.sql'), 'utf8');
const queuedRecordSource = offlineQueueJs.slice(
  offlineQueueJs.indexOf('function buildQueuedRecord'),
  offlineQueueJs.indexOf('function generateClientEventId')
);
const pinCacheSource = offlineQueueJs.slice(
  offlineQueueJs.indexOf('function rememberVerifiedPin'),
  offlineQueueJs.indexOf('function resolveOfflinePin')
);

test('manifest icons exist on disk', () => {
  manifest.icons.forEach((icon) => {
    const filePath = path.join(root, icon.src);
    assert.ok(fs.existsSync(filePath), `Missing icon: ${icon.src}`);
  });
});

test('core cached assets exist in the project', () => {
  const requiredFiles = [
    'css/styles.css',
    'js/app.js',
    'js/admin.js',
    'js/api.js',
    'js/offline-clock-queue.js',
    'js/pin.js',
    'manifest.json',
    'sw.js',
    'direct/index.html',
    'direct/direct.css',
    'direct/direct.js'
  ];

  requiredFiles.forEach((filePath) => {
    assert.ok(fs.existsSync(path.join(root, filePath)), `Missing required file: ${filePath}`);
  });

  assert.equal(fs.existsSync(path.join(root, 'direct', 'manifest.json')), false);
});

test('guide screenshots exist as webp assets', () => {
  [
    '1.webp',
    '2.webp',
    '3.webp',
    '4.webp',
    '5.webp',
    '6.webp',
    '7.webp',
    '8.webp',
    '9.webp',
    '10.webp',
    '11.webp'
  ].forEach((fileName) => {
    const filePath = path.join(root, 'img', 'fotos-con-circulos', fileName);
    assert.ok(fs.existsSync(filePath), `Missing guide image: ${fileName}`);
  });

  assert.match(guiaJs, /fotos-con-circulos\/1\.webp/);
  assert.doesNotMatch(guiaJs, /fotos-con-circulos\/1\.png/);
});

test('service worker uses network-first for app shell requests', () => {
  assert.match(sw, /function isAppShellRequest/);
  assert.match(sw, /e\.respondWith\(networkFirst\(e\.request\)\)/);
  assert.match(sw, /pathname === '\/direct' \|\|/);
  assert.match(sw, /return caches\.match\('\/direct\/index\.html'\)/);
  assert.doesNotMatch(sw, /direct\/manifest\.json/);
  assert.doesNotMatch(sw, /fotos-con-circulos\/\d+\.(png|webp)/);
  [
    './js/legal-templates.js',
    './js/pin-pad.js',
    './js/pin.js',
    './js/schedule.js',
    './js/clock.js',
    './js/guia.js',
    './js/payment.js',
    './js/admin.js',
    './js/install.js',
    './js/offline-clock-queue.js',
    './js/app.js'
  ].forEach((assetPath) => {
    assert.match(sw, new RegExp(assetPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
  assert.doesNotMatch(sw, /vendor\/supabase\/supabase\.min\.js/);
});

test('service worker registration exposes the manual update button and avoids the asset probe', () => {
  assert.match(swRegister, /updateViaCache:\s*'none'/);
  assert.match(swRegister, /getElementById\('update-btn'\)/);
  assert.match(swRegister, /postMessage\(\{\s*type:\s*'SKIP_WAITING'\s*\}\)/);
  assert.match(swRegister, /window\.SW_REGISTER_URL \|\| '\/sw\.js'/);
  assert.match(swRegister, /window\.location\.pathname\.indexOf\('\/direct'\)\s*===\s*0/);
  assert.doesNotMatch(swRegister, /method:\s*'HEAD'/);
  assert.doesNotMatch(swRegister, /assetProbeIntervalId/);
  assert.doesNotMatch(swRegister, /fetchAssetFingerprint/);
});

test('vercel deployment excludes internal source and audit artifacts from the public static output', () => {
  [
    'supabase',
    'tests',
    'test-results',
    'docs',
    'scripts',
    'skills',
    'node_modules'
  ].forEach((entry) => {
    assert.match(vercelIgnore, new RegExp(`^${entry}$`, 'm'));
  });
});

test('service worker offline api fallback returns 503', () => {
  assert.match(sw, /status:\s*503/);
  assert.match(sw, /statusText:\s*'Offline'/);
});

test('index shell contains the main screen anchors', () => {
  [
    'screen-menu',
    'screen-pin',
    'screen-schedule',
    'screen-clock',
    'screen-guia',
    'screen-payment',
    'screen-admin'
  ].forEach((screenId) => {
    assert.match(indexHtml, new RegExp(`id="${screenId}"`), `Missing screen container ${screenId}`);
  });
});

test('shells expose the offline clock banner placeholder', () => {
  assert.match(indexHtml, /id="offline-clock-banner"/);
  assert.match(directIndexHtml, /id="offline-clock-banner"/);
});

test('direct shell also exposes the service worker update button', () => {
  assert.match(directIndexHtml, /id="update-btn"/);
});

test('kiosk-clock keeps the original client timestamp when replaying offline punches', () => {
  assert.match(clockFunction, /clientTimestamp\?: string/);
  assert.match(clockFunction, /clientEventId\?: string/);
  assert.match(clockFunction, /const eventNow = parseClientTimestamp\(clientTimestamp\) \|\| new Date\(\);/);
  assert.match(clockFunction, /recorded_at: eventNow\.toISOString\(\)/);
  assert.match(clockFunction, /client_event_id: clientEventId \|\| null/);
  assert.ok(
    clockFunction.indexOf('const employeeName =') < clockFunction.indexOf('return await buildReplayResponse('),
    'employeeName must be initialized before the replay branch uses it'
  );
  assert.match(clockFunction, /buildReplayResponseFromExistingAttendance/);
});

test('clock requests carry a stable client event id through queue and api layers', () => {
  assert.match(apiJs, /clientEventId:/);
  assert.match(offlineQueueJs, /clientEventId/);
  assert.match(offlineQueueJs, /generateClientEventId/);
});

test('offline queue stores only scoped clock credentials and requests storage persistence progressively', () => {
  assert.match(apiJs, /X-Kiosk-Clock-Token/);
  assert.match(offlineQueueJs, /navigator\.storage\.persist/);
  assert.match(offlineQueueJs, /sanitizePersistedCredentials/);
  assert.match(queuedRecordSource, /offlineClockToken:/);
  assert.match(queuedRecordSource, /offlineClockTokenExpiresAt:/);
  assert.doesNotMatch(queuedRecordSource, /accessToken:/);
  assert.doesNotMatch(queuedRecordSource, /expiresAt:/);
  assert.match(pinCacheSource, /offlineClockToken:/);
  assert.match(pinCacheSource, /offlineClockTokenExpiresAt:/);
  assert.doesNotMatch(pinCacheSource, /accessToken:/);
  assert.doesNotMatch(pinCacheSource, /expiresAt:/);
});

test('supabase function config includes kiosk payment receipt endpoint', () => {
  assert.ok(
    fs.existsSync(path.join(root, 'supabase', 'functions', 'kiosk-payment-receipt', 'index.ts')),
    'kiosk-payment-receipt edge function source should exist'
  );
  assert.match(supabaseConfig, /\[functions\.kiosk-payment-receipt\]/);
  assert.match(supabaseConfig, /\[functions\.kiosk-payment-receipt\][\s\S]*verify_jwt\s*=\s*false/);
});

test('shared kiosk edge helpers support a configurable CORS allowlist', () => {
  assert.match(sharedKiosk, /KIOSK_ALLOWED_ORIGINS/);
  assert.match(sharedKiosk, /EDGE_ALLOWED_ORIGINS/);
  assert.match(sharedKiosk, /configuredAllowedOrigins\[0\] \|\| ""/);
});

test('touch interactions use click for action and pointerdown for visual feedback', () => {
  assert.match(pinPadJs, /addEventListener\('pointerdown', instance\.keypadPointerDownHandler\)/);
  assert.match(pinPadJs, /addEventListener\('click', instance\.keypadHandler\)/);
  assert.match(utilsJs, /target\.addEventListener\('pointerdown', onPointerDown\)/);
  assert.match(utilsJs, /target\.addEventListener\('click', onClick\)/);
  assert.match(utilsJs, /container\.addEventListener\('pointerdown', onPointerDown\)/);
  assert.match(utilsJs, /container\.addEventListener\('click', onClick\)/);
});

test('logout revokes the server-side session instead of only clearing local state', () => {
  assert.match(apiJs, /function logout\(options\)/);
  assert.match(apiJs, /action:\s*'logout'/);
  assert.match(appJs, /Api\.logout\(\{/);
  assert.match(appJs, /accessToken:\s*activeSession\.accessToken/);
  assert.match(appJs, /clearSession\(\);/);
  assert.match(
    fs.readFileSync(path.join(root, 'supabase', 'functions', 'kiosk-employees', 'index.ts'), 'utf8'),
    /action === "logout"/
  );
  assert.match(
    fs.readFileSync(path.join(root, 'supabase', 'functions', 'kiosk-employees', 'index.ts'), 'utf8'),
    /revokeSession\(supabaseUrl, key, session\.id\)/
  );
});

test('client error reporting requires an authenticated session and sanitizes payloads server-side', () => {
  const reportFunction = fs.readFileSync(path.join(root, 'supabase', 'functions', 'kiosk-report', 'index.ts'), 'utf8');
  assert.match(apiJs, /reportClientError\(payload\)/);
  assert.match(apiJs, /requiresAuth:\s*true/);
  assert.match(apiJs, /silentAuthFailure:\s*true/);
  assert.match(apiJs, /suppressTouchSession:\s*true/);
  assert.doesNotMatch(apiJs, /employeeId:\s*session/);
  assert.match(reportFunction, /requireSession\(req, url, serviceRoleKey, \["respondent", "org_admin"\]\)/);
  assert.match(reportFunction, /actor_session_id:\s*auth\.session\.id/);
  assert.match(reportFunction, /employee_id:\s*auth\.session\.employee_id/);
  assert.match(reportFunction, /normalizePayload\(body\.payload\)/);
});

test('api client keeps safe defaults but allows runtime deploy configuration', () => {
  assert.match(apiJs, /window\.__SEUR_CONFIG__/);
  assert.match(apiJs, /runtimeConfig\.orgSlug/);
  assert.match(apiJs, /runtimeConfig\.supabaseProjectUrl/);
  assert.match(apiJs, /'https:\/\/mzuvkinwebqgmnutchsv\.supabase\.co'/);
});

test('contract migration history keeps production as baseline and marks duplicate local ddl as superseded', () => {
  assert.match(baselineContractMigration, /CREATE TABLE public\.kiosk_contracts/i);
  assert.match(contractStatusMigration, /ADD COLUMN IF NOT EXISTS participant_verified_at TIMESTAMPTZ/i);
  assert.match(contractStatusMigration, /DROP CONSTRAINT IF EXISTS kiosk_contracts_status_check/i);
  assert.match(contractStatusMigration, /ADD CONSTRAINT kiosk_contracts_status_check/i);
  assert.match(supersededContractMigration, /Superseded by 20260330092629_add_kiosk_contracts\.sql/i);
  assert.doesNotMatch(supersededContractMigration, /create table|alter table|create index|create trigger/i);
});

test('audit migration history keeps the remote-applied baseline and nulls later duplicates', () => {
  assert.match(baselineAuditMigration, /create table if not exists public\.kiosk_row_audit_log/i);
  assert.match(baselineAuditExpansionMigration, /alter table public\.kiosk_row_audit_log/i);
  assert.match(baselineAuditExpansionMigration, /add column if not exists row_pk text/i);
  assert.match(supersededAuditMigration, /Superseded by 20260330122835_kiosk_row_level_audit_triggers\.sql/i);
  assert.match(supersededAuditExpansionMigration, /Superseded by 20260330123332_audit_triggers_all_tables\.sql/i);
  assert.doesNotMatch(supersededAuditMigration, /create table|create trigger|create function|grant select/i);
  assert.doesNotMatch(supersededAuditExpansionMigration, /alter table|create trigger|create function|create index/i);
});

test('payment receipt migration history keeps the remote-applied baseline and nulls the local duplicate', () => {
  assert.match(baselineReceiptMigration, /CREATE TABLE public\.kiosk_payment_receipts/i);
  assert.match(baselineReceiptMigration, /CREATE UNIQUE INDEX kiosk_payment_receipts_active_unique/i);
  assert.match(supersededReceiptMigration, /Superseded by 20260331103702_add_kiosk_payment_receipts\.sql/i);
  assert.doesNotMatch(supersededReceiptMigration, /create table|alter table|create index|create policy/i);
});

test('receipt signing has been removed from the employee payment screen', () => {
  assert.doesNotMatch(paymentJs, /startReceiptSigning/);
  assert.doesNotMatch(paymentJs, /submitReceiptSignature/);
  assert.doesNotMatch(paymentJs, /receipt-btn-sign/);
  assert.doesNotMatch(paymentJs, /receiptSignPad/);
  assert.doesNotMatch(paymentJs, /_debugGetReceiptPad/);
  assert.match(paymentJs, /Consulta con tu responsable/);
});

test('receipt signing is available in the admin panel with employee PIN verification', () => {
  assert.match(adminJs, /openAdminReceiptSigning/);
  assert.match(adminJs, /verifyArPin/);
  assert.match(adminJs, /submitArSignature/);
  assert.match(adminJs, /Api\.verifyReceiptPin/);
  assert.match(adminJs, /Api\.signReceipt/);
  assert.match(indexHtml, /admin-receipt-signing/);
  assert.match(indexHtml, /admin-receipt-pin-keypad/);
  assert.match(indexHtml, /admin-receipt-canvas/);
});

test('signed receipts render an internal signed mark and explain that the document is blocked', () => {
  assert.match(paymentJs, /receipt-doc-mark/);
  assert.match(paymentJs, /Firma registrada/);
  assert.match(paymentJs, /ya no admite una nueva firma/);
  assert.match(stylesCss, /\.receipt-doc-mark/);
  assert.match(stylesCss, /\.receipt-doc-mark-title/);
});

test('receipt legal copy uses the rehabilitacion template for new documents', () => {
  assert.match(paymentJs, /buildCurrentReceiptContent/);
  assert.match(indexHtml, /receipt-doc-header-title/);
  assert.match(indexHtml, /js\/legal-templates\.js/);
  assert.doesNotMatch(indexHtml, /Real Decreto 2274\/1985/);
});

test('participant receipt document hides the hourly rate and keeps only hours plus amount', () => {
  assert.doesNotMatch(paymentJs, /Tarifa\/hora/);
  assert.match(paymentJs, /Horas trabajadas/);
  assert.match(paymentJs, /Importe del recibo/);
  assert.doesNotMatch(receiptFunction, /TARIFA\/HORA/);
  assert.match(receiptFunction, /IMPORTE DEL RECIBO/);
});

test('payment summary uses the same participant-facing amount wording across the screen', () => {
  assert.match(indexHtml, /Importe recibido/);
  assert.doesNotMatch(indexHtml, /Total ganado/);
});

test('hidden utility still hides xlarge action buttons after signing flows', () => {
  assert.match(stylesCss, /\.btn-xlarge\.hidden \{\s*display: none !important;\s*\}/);
});

test('signature images are cropped and placed in pdfs without forced distortion', () => {
  assert.match(utilsJs, /findInkBounds/);
  assert.match(utilsJs, /getImageData\(0,\s*0,\s*sourceCanvas\.width,\s*sourceCanvas\.height\)/);
  assert.match(adminJs, /drawContainedSignature/);
  assert.match(adminJs, /cropSignatureDataUrl/);
  assert.doesNotMatch(adminJs, /addImage\(data\.participant_sign_base64, 'PNG', margin, y, colW, 22\)/);
  assert.match(receiptFunction, /containImage/);
  assert.match(receiptFunction, /Firma del participante/);
  assert.match(receiptFunction, /DOCUMENTO MENSUAL/);
  assert.match(receiptFunction, /FIRMA REGISTRADA/);
  assert.match(receiptFunction, /Recibo validado electronicamente por/);
});

// ── Security regression tests ────────────────────────────────────────────────

test('admin.js escapeHtml encodes apostrophes', () => {
  assert.match(adminJs, /replace\(\/'\//);
});

test('shared kiosk CORS does not fall back to wildcard', () => {
  assert.doesNotMatch(sharedKiosk, /\|\|\s*["']\*["']/);
});

test('getSessionSecret does not fall back to SUPABASE_SERVICE_ROLE_KEY', () => {
  const fnStart = sharedKiosk.indexOf('function getSessionSecret');
  const fnEnd = sharedKiosk.indexOf('function getPinLookupSecret');
  const sessionSecretFn = sharedKiosk.slice(fnStart, fnEnd);
  assert.doesNotMatch(sessionSecretFn, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('insertDebugRow validates table names against allowlist', () => {
  assert.match(sharedKiosk, /ALLOWED_DEBUG_TABLES/);
});

test('api.js freezes window.__SEUR_CONFIG__', () => {
  assert.match(apiJs, /Object\.freeze/);
});
