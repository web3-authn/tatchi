import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { tatchiWallet } from '@tatchi-xyz/sdk/plugins/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

/**
 * Do NOT use optional chaining or dynamic access such as `import.meta?.env`
 * or `import.meta["env"]`. Those patterns prevent Vite's static analysis
 * and will yield `undefined` at runtime without errors.
 * See: https://vite.dev/guide/env-and-mode
 */

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const appSrc = fileURLToPath(new URL('./src', import.meta.url))
  const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url))
  // Bitwarden and other password managers inject extension iframes/scripts that are blocked
  // by COEP=require-corp on the host page. Default to COEP off for the docs site; switch
  // back on explicitly when you need cross-origin isolation testing.
  const coepMode = (env.VITE_COEP_MODE === 'strict' ? 'strict' : 'off') as 'strict' | 'off'
  // Make VITE_* visible to Node-side dev plugins
  if (env.VITE_WEBAUTHN_CONTRACT_ID) process.env.VITE_WEBAUTHN_CONTRACT_ID = env.VITE_WEBAUTHN_CONTRACT_ID
  if (env.VITE_NEAR_RPC_URL) process.env.VITE_NEAR_RPC_URL = env.VITE_NEAR_RPC_URL
  if (env.VITE_ROR_METHOD) process.env.VITE_ROR_METHOD = env.VITE_ROR_METHOD
  return {
    clearScreen: false,
    logLevel: 'info',
    server: {
      port: 5174,
      host: 'localhost',
      // Allow access via reverse-proxied hosts (Caddy) and Bonjour (.local)
      // Needed to avoid Vite's DNS‑rebinding protection blocking mDNS hosts
      allowedHosts: ['example.localhost', 'wallet.example.localhost', 'pta-m4.local'],
      open: false,
      fs: {
        allow: [
          workspaceRoot
          // Allow serving files from entire workspace including SDK
        ]
      },
    },
    plugins: [
      react(),
      // Polyfill Node globals and built-ins needed by chainsig.js (Buffer, process, etc.)
      nodePolyfills({
        protocolImports: true,
        globals: {
          Buffer: true,
          process: true,
        },
      }),
      // Web3Authn dev integration: wallet server (serve SDK + wallet HTML + headers)
      // Build: emit _headers for COOP + Permissions‑Policy (and optional COEP/CORP when enabled); wallet HTML gets strict CSP.
      tatchiWallet({
        enableDebugRoutes: true,
        sdkBasePath: env.VITE_SDK_BASE_PATH || '/sdk',
        walletServicePath: env.VITE_WALLET_SERVICE_PATH || '/wallet-service',
        walletOrigin: env.VITE_WALLET_ORIGIN,
        emitHeaders: true,
        coepMode,
        // Build-time: emit _headers for Cloudflare Pages/Netlify with COOP/COEP and
        // a Permissions-Policy delegating WebAuthn to the wallet origin.
        // If your CI already writes a _headers file, this plugin will no-op.
      }),
    ],
    define: {
      // Shim minimal globals some legacy/browserified deps expect
      global: 'globalThis',
      'process.env': {},
    },
    optimizeDeps: {
      include: [
        'buffer',
        'events',
        'util',
        'stream-browserify',
        'crypto-browserify',
      ],
      esbuildOptions: {
        define: {
          global: 'globalThis',
          'process.env': '{}',
          'process.browser': 'true',
          'process.version': '"v0.0.0"',
        },
      },
    },
    resolve: {
      alias: {
        '@': appSrc,
        stream: 'stream-browserify',
        crypto: 'crypto-browserify',
        util: 'util',
        events: 'events',
        buffer: 'buffer',
        process: 'process/browser',
      },
    },
  }
})
