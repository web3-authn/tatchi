import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Ensure tests default to NO_CADDY mode unless explicitly overridden.
if (!process.env.USE_CADDY && !process.env.NO_CADDY) {
  process.env.NO_CADDY = '1';
}

/**
 * @see https://playwright.dev/docs/test-configuration
 */
const USE_RELAY_SERVER = process.env.USE_RELAY_SERVER === '1' || process.env.USE_RELAY_SERVER === 'true';
const NO_CADDY = process.env.NO_CADDY === '1' || process.env.VITE_NO_CADDY === '1' || process.env.CI === '1';

// Resolve absolute path to the examples/vite folder from this config location
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXAMPLES_VITE_DIR = path.resolve(path.join(__dirname, '../examples/vite'));

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
  // Increase default per-test timeout (Playwright default is 30s). Some
  // end-to-end flows (registration/login/action) can legitimately exceed 30s
  // under CI or when relay/network is slow.
  timeout: 60_000,
  reporter: 'html',
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:5174',
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
      : (NO_CADDY ? `pnpm -C ${EXAMPLES_VITE_DIR} run dev:ci` : `pnpm -C ${EXAMPLES_VITE_DIR} dev`),
    url: 'http://localhost:5174',
    reuseExistingServer: true,
    timeout: 60000, // Allow time for relay health check + build
  },
});
