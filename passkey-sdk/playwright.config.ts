import { defineConfig, devices } from '@playwright/test';

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './src/__tests__/e2e',
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

  /* Run your local dev server before starting the tests */
  webServer: {
    // Start Vite dev server only (no Caddy); tests use http://localhost:5173
    command: 'pnpm -C ../examples/vite dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120000, // Increased timeout to allow for build
  },
});
