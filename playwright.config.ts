import { defineConfig, devices } from '@playwright/test'

const port = process.env.E2E_PORT ?? '4174'

export default defineConfig({
  testDir: './e2e',
  snapshotPathTemplate: '{snapshotDir}/{testFileName}-snapshots/{arg}{ext}',
  timeout: 90_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
