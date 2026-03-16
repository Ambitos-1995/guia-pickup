const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

test('shell branding points to Punto de encuentro inclusivo', () => {
  assert.match(indexHtml, /<title>Punto de encuentro inclusivo<\/title>/);
  assert.match(indexHtml, /apple-mobile-web-app-title" content="Punto de encuentro inclusivo"/);
  assert.equal(manifest.name, 'Punto de encuentro inclusivo');
  assert.equal(manifest.short_name, 'Punto de encuentro inclusivo');
});

test('legacy visible TMG branding is not present in shell files', () => {
  assert.equal(indexHtml.includes('Pickup TMG'), false);
  assert.equal(indexHtml.includes('>TMG<'), false);
  assert.equal(indexHtml.includes(' TMG'), false);
});

test('critical scripts keep the expected load order', () => {
  const scriptOrder = [
    'js/utils.js',
    'js/api.js',
    'js/pin.js',
    'js/schedule.js',
    'js/clock.js',
    'js/guia.js',
    'js/payment.js',
    'js/admin.js',
    'js/install.js',
    'vendor/supabase/supabase.min.js',
    'js/realtime.js',
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
});
