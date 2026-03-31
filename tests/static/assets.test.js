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
const apiJs = fs.readFileSync(path.join(root, 'js', 'api.js'), 'utf8');
const offlineQueueJs = fs.readFileSync(path.join(root, 'js', 'offline-clock-queue.js'), 'utf8');
const guiaJs = fs.readFileSync(path.join(root, 'js', 'guia.js'), 'utf8');
const stylesCss = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');
const paymentJs = fs.readFileSync(path.join(root, 'js', 'payment.js'), 'utf8');
const adminJs = fs.readFileSync(path.join(root, 'js', 'admin.js'), 'utf8');
const utilsJs = fs.readFileSync(path.join(root, 'js', 'utils.js'), 'utf8');
const clockFunction = fs.readFileSync(path.join(root, 'supabase', 'functions', 'kiosk-clock', 'index.ts'), 'utf8');
const supabaseConfig = fs.readFileSync(path.join(root, 'supabase', 'config.toml'), 'utf8');
const receiptFunction = fs.readFileSync(path.join(root, 'supabase', 'functions', 'kiosk-payment-receipt', 'index.ts'), 'utf8');
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

test('receipt signing reuses the authenticated user session without asking for the PIN again', () => {
  const startSigningSource = paymentJs.slice(
    paymentJs.indexOf('function startReceiptSigning()'),
    paymentJs.indexOf('function bindReceiptKeypad()')
  );
  assert.match(startSigningSource, /goToReceiptSign\(\);/);
  assert.doesNotMatch(startSigningSource, /showReceiptStep\('pin'\)/);
  assert.doesNotMatch(startSigningSource, /verifyReceiptPin\(\)/);
  assert.doesNotMatch(paymentJs, /La validacion del PIN ha caducado/);
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
