import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { tatchiDevServer, tatchiBuildHeaders } from '@tatchi-xyz/sdk/plugins/vite'

/**
 * Do NOT use optional chaining or dynamic access such as `import.meta?.env`
 * or `import.meta["env"]`. Those patterns prevent Vite's static analysis
 * and will yield `undefined` at runtime without errors.
 * See: https://vite.dev/guide/env-and-mode
 */

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url))
  return {
    server: {
      port: 5174,
      host: 'localhost',
      // Allow access via reverse-proxied hosts (Caddy) and Bonjour (.local)
      // Needed to avoid Vite's DNS‑rebinding protection blocking mDNS hosts
      allowedHosts: ['example.localhost', 'wallet.example.localhost', 'pta-m4.local'],
    },
    plugins: [
      react(),
      // Web3Authn dev integration: serves SDK, wallet service route, WASM MIME, and sets dev headers
      tatchiDevServer({
        mode: 'self-contained',
        enableDebugRoutes: true,
        // Read SDK base path so dev mirrors production asset layout
        sdkBasePath: env.VITE_SDK_BASE_PATH || '/sdk',
        // Keep wallet service path consistent with env
        walletServicePath: env.VITE_WALLET_SERVICE_PATH || '/wallet-service',
        walletOrigin: env.VITE_WALLET_ORIGIN,
      }),
      // Build-time: emit _headers for Cloudflare Pages/Netlify with COOP/COEP and
      // a Permissions-Policy delegating WebAuthn to the wallet origin.
      // If your CI already writes a _headers file, this plugin will no-op.
      tatchiBuildHeaders({ walletOrigin: env.VITE_WALLET_ORIGIN }),
    ],
  }
})
