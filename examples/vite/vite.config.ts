import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { tatchiApp, tatchiWalletServer } from '@tatchi-xyz/sdk/plugins/vite'

/**
 * Do NOT use optional chaining or dynamic access such as `import.meta?.env`
 * or `import.meta["env"]`. Those patterns prevent Vite's static analysis
 * and will yield `undefined` at runtime without errors.
 * See: https://vite.dev/guide/env-and-mode
 */

export default defineConfig(({ mode }) => {
  // `loadEnv()` only reads from `.env*` files; it does not include `process.env`.
  // Merge them so Playwright/webServer env injection (and other runtime env) is honored.
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') } as Record<string, string | undefined>
  const walletOrigins = (env.VITE_WALLET_ORIGIN || 'https://wallet.example.localhost')
    .split(/[,\s]+/)
    .map((v) => v.trim())
    .filter(Boolean)
  // Default COEP off on app pages (extension embedding + password managers).
  // Opt in to cross-origin isolation via VITE_COEP_MODE=strict.
  const coepMode = (() => {
    const override = (env.VITE_COEP_MODE || '').trim()
    if (override === 'off') return 'off'
    if (override === 'strict') return 'strict'
    return 'off'
  })()
  return {
    clearScreen: false,
    logLevel: 'info',
    server: {
      port: 5174,
      // Allow access via reverse-proxied hosts (Caddy) and Bonjour (.local)
      allowedHosts: ['example.localhost', 'wallet.example.localhost', 'pta-m4.local'],
    },
    plugins: [
      react(),
      ...(mode === 'ci'
        ? [
            // CI runs a single dev server (no Caddy + no separate wallet server).
            // Serve `/wallet-service` + `/sdk/*` on the app origin so wallet-service
            // CSP tests can validate the actual wallet HTML.
            tatchiWalletServer({ walletOrigins, enableDebugRoutes: true, coepMode }),
          ]
        : [
            // Cross‑origin dev (serve): headers only. Build (emitHeaders=true): emit _headers
            // for COOP/COEP/CORP + Permissions‑Policy; wallet HTML gets strict CSP.
            ...tatchiApp({ walletOrigins, enableDebugRoutes: true, emitHeaders: true, coepMode }),
          ]),
    ],
  }
})
