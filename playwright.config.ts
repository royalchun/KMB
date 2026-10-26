import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  use: { baseURL: 'http://127.0.0.1:3001', launchOptions: { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] } },
  webServer: { command: 'npm start', url: 'http://127.0.0.1:3001/api/health', reuseExistingServer: !process.env.CI, timeout: 30_000 },
});
