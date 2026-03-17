const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const directManifest = JSON.parse(fs.readFileSync(path.join(root, 'direct', 'manifest.json'), 'utf8'));
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const swRegister = fs.readFileSync(path.join(root, 'js', 'sw-register.js'), 'utf8');

test('manifest icons exist on disk', () => {
  manifest.icons.forEach((icon) => {
    const filePath = path.join(root, icon.src);
    assert.ok(fs.existsSync(filePath), `Missing icon: ${icon.src}`);
  });

  directManifest.icons.forEach((icon) => {
    const filePath = path.join(root, icon.src.replace(/^\//, ''));
    assert.ok(fs.existsSync(filePath), `Missing direct icon: ${icon.src}`);
  });
});

test('core cached assets exist in the project', () => {
  const requiredFiles = [
    'css/styles.css',
    'js/app.js',
    'js/admin.js',
    'js/api.js',
    'js/pin.js',
    'manifest.json',
    'sw.js',
    'direct/index.html',
    'direct/manifest.json',
    'direct/direct.css',
    'direct/direct.js'
  ];

  requiredFiles.forEach((filePath) => {
    assert.ok(fs.existsSync(path.join(root, filePath)), `Missing required file: ${filePath}`);
  });
});

test('service worker uses network-first for app shell requests', () => {
  assert.match(sw, /function isAppShellRequest/);
  assert.match(sw, /e\.respondWith\(networkFirst\(e\.request\)\)/);
  assert.match(sw, /pathname === '\/direct' \|\|/);
  assert.match(sw, /return caches\.match\('\/direct\/index\.html'\)/);
});

test('service worker registration bypasses cache and activates updates silently', () => {
  assert.match(swRegister, /updateViaCache:\s*'none'/);
  assert.match(swRegister, /postMessage\(\{\s*type:\s*'SKIP_WAITING'\s*\}\)/);
  assert.match(swRegister, /window\.SW_REGISTER_URL \|\| '\.\/sw\.js'/);
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
