const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const directIndexHtml = fs.readFileSync(path.join(root, 'direct', 'index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

test('shell branding points to Punto de encuentro inclusivo', () => {
  assert.match(indexHtml, /<title>Punto de encuentro inclusivo<\/title>/);
  assert.match(indexHtml, /apple-mobile-web-app-title" content="Punto de encuentro inclusivo"/);
  assert.equal(manifest.name, 'Punto de encuentro inclusivo');
  assert.equal(manifest.short_name, 'Punto SEUR');
  assert.equal(manifest.id, '/');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.lang, 'es');
});

test('direct shell exposes kiosk branding inside the main PWA', () => {
  assert.match(directIndexHtml, /<title>Punto directo<\/title>/);
  assert.match(directIndexHtml, /Horario semanal/);
  assert.match(directIndexHtml, /Fichaje rapido/);
  assert.match(directIndexHtml, /<link rel="manifest" href="\/manifest\.json">/);
  assert.match(directIndexHtml, /<script src="\/js\/pin-pad\.js"><\/script>/);
  assert.match(directIndexHtml, /id="update-btn"/);
  assert.match(directIndexHtml, /<script src="\/js\/offline-clock-queue\.js"><\/script>/);
  assert.ok(directIndexHtml.indexOf('js/offline-clock-queue.js') < directIndexHtml.indexOf('direct/direct.js'));
  assert.doesNotMatch(directIndexHtml, /direct\/manifest\.json/);
  assert.doesNotMatch(directIndexHtml, /window\.SW_REGISTER_URL/);
});

test('legacy visible TMG branding is not present in shell files', () => {
  assert.equal(indexHtml.includes('Pickup TMG'), false);
  assert.equal(indexHtml.includes('>TMG<'), false);
  assert.equal(indexHtml.includes(' TMG'), false);
});

test('critical scripts keep the expected load order', () => {
  const scriptOrder = [
    'js/utils.js',
    'js/pin-pad.js',
    'js/api.js',
    'js/offline-clock-queue.js',
    'js/pin.js',
    'js/schedule.js',
    'js/clock.js',
    'js/guia.js',
    'js/payment.js',
    'js/admin.js',
    'js/install.js',
    'js/app.js',
    'js/sw-register.js'
  ];

  let lastPosition = -1;
  scriptOrder.forEach((scriptPath) => {
    const position = indexHtml.indexOf(`src="${scriptPath}"`);
    assert.notEqual(position, -1, `${scriptPath} should be present in index.html`);
    assert.ok(position > lastPosition, `${scriptPath} should load after the previous script`);
    lastPosition = position;
  });

  assert.equal(indexHtml.includes('vendor/supabase/supabase.min.js'), false);
  assert.equal(indexHtml.includes('js/realtime.js'), false);
});
