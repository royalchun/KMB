import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 45000,
  expect: { timeout: 10000 },
  use: { baseURL: 'http://127.0.0.1:3101', launchOptions: { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] } },
  webServer: { command: 'npm start', env: { PORT: '3101' }, url: 'http://127.0.0.1:3101/api/health', reuseExistingServer: false, timeout: 30_000 },
});
