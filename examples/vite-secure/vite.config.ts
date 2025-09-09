import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Minimal service page HTML builder for dev
// Loads the wallet service host module from the SDK assets served under /sdk
function getWalletServiceHtml(sdkBasePath: string = '/sdk'): string {
  const safeBase = String(sdkBasePath || '/sdk').replace(/[^\w\/-]/g, '').replace(/\/+/g, '/');
  const serviceHostPath = `${safeBase}/esm/react/embedded/wallet-iframe-host.js`;
  return `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <title>Web3Authn Wallet Service</title>\n  </head>\n  <body>\n    <script type="module" src="${serviceHostPath}"></script>\n  </body>\n</html>`;
}

export default defineConfig({
  server: {
    port: 5174,
    host: 'localhost',
    open: false,
    fs: {
      allow: [
        '..',
        '../..',
        // serve SDK dist directly from workspace (zero-copy)
        '../../passkey-sdk/dist'
      ]
    },
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Permissions-Policy': 'publickey-credentials-get=(self), publickey-credentials-create=(self)'
    }
  },
  plugins: [
    // Serve the wallet service HTML used for the service iframe
    {
      name: 'wallet-service-route',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.method !== 'GET') return next();
          if (!req.url) return next();

          // Serve at /wallet-service (can be changed as needed)
          const isService = req.url === '/wallet-service' || req.url.startsWith('/wallet-service?');
          if (!isService) return next();

          try {
            // Mount wallet-iframe-host module from SDK dist at /sdk
            const html = getWalletServiceHtml('/sdk');
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(html);
          } catch (err) {
            res.statusCode = 500;
            res.end('Failed to render wallet service');
          }
        });
      },
    },

    // Ensure correct MIME type for WASM
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

    // Serve SDK assets directly from the workspace dist folder under /sdk
    {
      name: 'serve-sdk-from-workspace',
      configureServer(server) {
        const sdkDistRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../passkey-sdk/dist');
        server.middlewares.use((req, res, next) => {
          const url = req.url || '';
          if (!url.startsWith('/sdk/')) return next();

          const rel = decodeURIComponent(url.replace(/^\/sdk\//, ''));

          // Special fallbacks for WASM files expected under /sdk/workers
          const wasmFallbackMap: Record<string, string> = {
            'workers/wasm_vrf_worker_bg.wasm': path.resolve(sdkDistRoot, 'esm/wasm_vrf_worker/wasm_vrf_worker_bg.wasm'),
            'workers/wasm_signer_worker_bg.wasm': path.resolve(sdkDistRoot, 'esm/wasm_signer_worker/wasm_signer_worker_bg.wasm'),
            'workers/wasm_vrf_worker.js': path.resolve(sdkDistRoot, 'esm/wasm_vrf_worker/wasm_vrf_worker.js'),
            'workers/wasm_signer_worker.js': path.resolve(sdkDistRoot, 'esm/wasm_signer_worker/wasm_signer_worker.js'),
          };

          const tryPaths = [
            path.resolve(sdkDistRoot, rel),                    // dist/<rel>
            path.resolve(sdkDistRoot, 'esm', rel),             // dist/esm/<rel>
            path.resolve(sdkDistRoot, 'esm/react', rel),       // dist/esm/react/<rel>
            wasmFallbackMap[rel] || '',                        // explicit wasm fallbacks
          ].filter(Boolean);

          const absPath = tryPaths.find(p => p.startsWith(sdkDistRoot) && fs.existsSync(p as string)) as string | undefined;
          if (!absPath) {
            return next();
          }

          try {
            const stat = fs.statSync(absPath);
            if (stat.isDirectory()) {
              const indexPath = path.join(absPath, 'index.html');
              if (fs.existsSync(indexPath)) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                fs.createReadStream(indexPath).pipe(res); return;
              }
              return next();
            }

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
  define: {
    'process.env.NODE_ENV': JSON.stringify('development'),
  },
})
