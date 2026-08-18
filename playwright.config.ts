import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'test',
  testMatch: 'smoke.spec.ts',
  use: { baseURL: 'http://127.0.0.1:4173' },
  webServer: {
    command: 'pnpm dev --port 4173',
    port: 4173,
    reuseExistingServer: true,
  },
})
