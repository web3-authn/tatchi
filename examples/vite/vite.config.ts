import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
  ],
  define: {
    // Shim minimal globals some legacy/browserified deps expect
    global: 'globalThis',
  },
})
