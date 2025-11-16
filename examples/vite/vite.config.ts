import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { tatchiApp } from '@tatchi-xyz/sdk/plugins/vite'

/**
 * Do NOT use optional chaining or dynamic access such as `import.meta?.env`
 * or `import.meta["env"]`. Those patterns prevent Vite's static analysis
 * and will yield `undefined` at runtime without errors.
 * See: https://vite.dev/guide/env-and-mode
 */

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const walletOrigin = env.VITE_WALLET_ORIGIN || 'https://wallet.tatchi.xyz'
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
      // Cross‑origin dev (serve): headers only. Build (emitHeaders=true): emit _headers
      // for COOP/COEP/CORP + Permissions‑Policy; wallet HTML gets strict CSP.
      tatchiApp({ walletOrigin, enableDebugRoutes: true, emitHeaders: true }),
    ],
  }
})
