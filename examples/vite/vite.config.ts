import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { web3authnDev } from '@web3authn/passkey/vite'

// Same-origin example: no wallet iframe host needed; keep config minimal
export default defineConfig({
  server: {
    port: 5173, // The port Caddy is reverse_proxying to
    host: 'localhost', // Ensure Vite is accessible by Caddy on localhost
    open: 'https://example.localhost', // Automatically open this URL in the browser
    fs: {
      // Allow serving files from the repo (linked workspace)
      allow: ['..', '../..']
    },
    // headers: Managed by Caddy in Caddyfile
  },
  plugins: [
    react(),
    // Serve SDK assets from workspace/node_modules at /sdk
    web3authnDev({ mode: 'self-contained', setDevHeaders: false }),
  ],
  define: {
    // Shim minimal globals some legacy/browserified deps expect
    global: 'globalThis',
  },
})
