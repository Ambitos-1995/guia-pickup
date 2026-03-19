const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  fullyParallel: true,
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    serviceWorkers: 'block',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node scripts/test-server.js',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 30000
  },
  projects: [
    {
      name: 'desktop-chromium',
      testIgnore: /pwa\.webkit\.spec\.js/,
      use: {
        ...devices['Desktop Chrome']
      }
    },
    {
      name: 'mobile-chrome',
      testIgnore: /pwa\.webkit\.spec\.js/,
      use: {
        ...devices['Pixel 7']
      }
    },
    {
      name: 'desktop-webkit',
      testMatch: /pwa\.webkit\.spec\.js/,
      use: {
        browserName: 'webkit',
        viewport: { width: 1280, height: 800 }
      }
    }
  ]
});
