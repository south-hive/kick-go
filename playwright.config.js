const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/browser', timeout: 30000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:8091', viewport: { width: 393, height: 852 }, trace: 'retain-on-failure' },
  webServer: { command: 'node server.js', url: 'http://127.0.0.1:8091/health', env: { PORT: '8091' }, reuseExistingServer: !process.env.CI },
});
