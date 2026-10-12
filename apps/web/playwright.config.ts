import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    channel:
      process.env.RELAY_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    baseURL: 'http://127.0.0.1:8001',
    viewport: { width: 1440, height: 1050 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command:
      process.platform === 'win32'
        ? '..\\..\\.venv\\Scripts\\python.exe ../../scripts/e2e_server.py'
        : '../../.venv/bin/python ../../scripts/e2e_server.py',
    url: 'http://127.0.0.1:8001/api/health',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
