const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

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
    'js/pin.js',
    'manifest.json',
    'sw.js'
  ];

  requiredFiles.forEach((filePath) => {
    assert.ok(fs.existsSync(path.join(root, filePath)), `Missing required file: ${filePath}`);
  });
});

test('service worker uses network-first for app shell requests', () => {
  assert.match(sw, /function isAppShellRequest/);
  assert.match(sw, /e\.respondWith\(networkFirst\(e\.request\)\)/);
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
