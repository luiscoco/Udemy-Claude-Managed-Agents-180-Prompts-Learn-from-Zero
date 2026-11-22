import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  (process.platform === 'win32' && existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
    ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined);

export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.ts', timeout: 60000, workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4060', viewport: { width: 1600, height: 1000 },
    launchOptions: { executablePath }, screenshot: 'only-on-failure', trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run start:test', url: 'http://127.0.0.1:4060/api/config',
    reuseExistingServer: false, timeout: 30000,
  },
  projects: [
    { name: 'chromium', testIgnore: /lesson\.spec\.ts/ },
    { name: 'lesson', testMatch: /lesson\.spec\.ts/, use: {
      viewport: { width: 1920, height: 1080 }, video: { mode: 'on', size: { width: 1920, height: 1080 } },
    } },
  ],
});




