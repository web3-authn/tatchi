import { defineConfig, devices } from '@playwright/test';

/**
 * @see https://playwright.dev/docs/test-configuration
 */
const USE_RELAY_SERVER = process.env.USE_RELAY_SERVER === '1' || process.env.USE_RELAY_SERVER === 'true';
const NO_CADDY = process.env.NO_CADDY === '1' || process.env.VITE_NO_CADDY === '1' || process.env.CI === '1';

export default defineConfig({
  testDir: './src/__tests__',
  testMatch: [
    '**/e2e/**/*.test.ts',
    '**/unit/**/*.test.ts',
    // Include wallet-iframe + lit-components tests regardless of subfolder
    '**/wallet-iframe/**/*.test.ts',
    '**/lit-components/**/*.test.ts',
  ],
  fullyParallel: false,
  retries: 0,
  workers: 1, // Reduced to 1 to prevent parallel faucet requests and rate limiting
  reporter: 'html',
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:5173',
    /* Caddy serves self-signed certs for example.localhost */
    ignoreHTTPSErrors: true,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    /* Enable verbose console logging for debugging */
    // video: 'retain-on-failure',
    // screenshot: 'only-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Note: WebAuthn Virtual Authenticator requires CDP which is only available in Chromium
    // Safari/WebKit tests would need different WebAuthn testing approach
  ],

  /* Run your local dev server(s) before starting the tests */
  webServer: {
    // If USE_RELAY_SERVER is set, start both servers with a relay health check
    command: USE_RELAY_SERVER
      ? 'node ./src/__tests__/scripts/start-servers.mjs'
      : (NO_CADDY ? 'pnpm -C ../examples/vite run dev:ci' : 'pnpm -C ../examples/vite dev'),
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 180000, // Allow time for relay health check + build
  },
});
