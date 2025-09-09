import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  server: {
    port: 5173, // The port Caddy is reverse_proxying to
    host: 'localhost', // Ensure Vite is accessible by Caddy on localhost
    open: 'https://example.localhost', // Automatically open this URL in the browser
    fs: {
      // Allow serving files from the linked package directory
      allow: [
        // Default: serve files from project root and repo root
        '..',
        '../..',
        // Allow serving from the linked passkey SDK dist
        '../../passkey-sdk/dist'
      ]
    },
    // Configure MIME types for WASM files
    middlewareMode: false,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
      // Allow WebAuthn in this app and delegate to wallet origin iframe
      'Permissions-Policy': 'publickey-credentials-get=(self "https://wallet.example.localhost"), publickey-credentials-create=(self "https://wallet.example.localhost")',
    }
  },
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
    // Custom plugin to serve WASM files with correct MIME type
    {
      name: 'wasm-mime-type',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.endsWith('.wasm')) {
            res.setHeader('Content-Type', 'application/wasm');
          }
          next();
        });
      },
    },
    // Serve SDK assets directly from the local workspace (zero-copy)
    {
      name: 'serve-sdk-from-workspace',
      configureServer(server) {
        const sdkDistRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../passkey-sdk/dist');
        server.middlewares.use(async (req, res, next) => {
          const url = req.url || '';
          if (!url.startsWith('/sdk/')) return next();

          // Normalize and protect against traversal
          const rel = decodeURIComponent(url.replace(/^\/sdk\//, ''));
          const absPath = path.resolve(sdkDistRoot, rel);
          if (!absPath.startsWith(sdkDistRoot)) {
            res.statusCode = 403; res.end('Forbidden'); return;
          }

          try {
            const stat = fs.statSync(absPath);
            if (stat.isDirectory()) {
              // Try index.html or pass through
              const indexPath = path.join(absPath, 'index.html');
              if (fs.existsSync(indexPath)) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                fs.createReadStream(indexPath).pipe(res); return;
              }
              return next();
            }

            // Set basic content types
            if (absPath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            else if (absPath.endsWith('.css')) res.setHeader('Content-Type', 'text/css; charset=utf-8');
            else if (absPath.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm');
            else if (absPath.endsWith('.json')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
            else if (absPath.endsWith('.map')) res.setHeader('Content-Type', 'application/json; charset=utf-8');

            fs.createReadStream(absPath).on('error', () => next()).pipe(res);
          } catch {
            next();
          }
        });
      }
    },
  ],
  resolve: {
    alias: [],
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('development'), // Hardcode for client bundle
  },
  optimizeDeps: {
  },
})
