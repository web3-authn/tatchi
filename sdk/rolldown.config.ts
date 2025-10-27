import { defineConfig } from 'rolldown';
import { BUILD_PATHS } from './build-paths.ts';
import * as path from 'path';
import * as fs from 'fs';

const external = [
  // React dependencies
  'react',
  'react-dom',
  'react/jsx-runtime',

  // All @near-js packages
  /@near-js\/.*/,

  // Exclude Lit SSR shim (not needed for client-side only)
  '@lit-labs/ssr-dom-shim',
  // Externalize Lit for library builds so host bundler resolves a single copy
  'lit',
  /lit\/directives\/.*/,
  'lit-html',
  /lit-html\/.*/,

  // Node.js native modules for /server SDK
  'fs',
  'path',
  'url',
  'module',
  'crypto',
  'util',
  // Express-only helpers (optional consumers)
  'express',
  'cors',

  // Core dependencies that should be provided by consuming application
  'borsh',
  'bs58',
  '@noble/ed25519',
  'qrcode',
  'jsqr',
  'js-sha256',
  'idb',
  'near-api-js',

  // Other common packages
  'tslib',
  // UI libs used by React components should be provided by the app bundler
  'lucide-react',

  // WASM modules - externalize so bundlers handle them correctly
  /\.wasm$/,
];

// External dependencies for embedded components.
// IMPORTANT: Externalize Lit so the host app's bundler (e.g., Vite) serves a consistent copy.
// Bundling Lit directly into SDK bundles caused internal node_modules paths and ESM export mismatches.
// Embedded bundles are loaded directly in the browser (no bundler/import maps),
// so do NOT externalize dependencies. Bundle everything needed.
const embeddedExternal: (string | RegExp)[] = [];

const aliasConfig = {
  '@build-paths': path.resolve(process.cwd(), 'build-paths.ts'),
  '@/*': path.resolve(process.cwd(), 'src/*')
};

// Static assets expected to be served under `/sdk/*` by hosts.
// Emitting them into dist/esm/sdk ensures deploy steps that rsync the SDK
// directory (often with --delete) keep these files available in production.
const WALLET_SHIM_SOURCE = "window.global ||= window; window.process ||= { env: {} };\n";
const WALLET_SURFACE_CSS = [
  'html, body { background: transparent !important; margin:0; padding:0; }',
  '',
  // Class-based surface for strict CSP setups (toggled by wallet host bootstrap)
  'html.w3a-transparent, body.w3a-transparent { background: transparent !important; margin:0; padding:0; }',
  '',
  // Minimal portal styles used by confirm-ui (no animation; child components handle transitions)
  '.w3a-portal { position: relative; z-index: 2147483647; opacity: 0; pointer-events: none; }',
  '.w3a-portal.w3a-portal--visible { opacity: 1; pointer-events: auto; }',
  '',
  // Offscreen utility for legacy clipboard fallback (avoids inline styles under strict CSP)
  '.w3a-offscreen { position: fixed; left: -9999px; top: 0; opacity: 0; pointer-events: none; }',
  '',
].join('\n');

const copyWasmAsset = (source: string, destination: string, label: string): void => {
  if (!fs.existsSync(source)) {
    throw new Error(`Missing WASM source at ${source}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  console.log(label);
};

export default defineConfig([
  // ESM build
  {
    input: 'src/index.ts',
    output: {
      dir: BUILD_PATHS.BUILD.ESM,
      format: 'esm',
      preserveModules: true,
      preserveModulesRoot: 'src',
      sourcemap: true
    },
    external,
    resolve: {
      alias: aliasConfig
    },
  },
  // CJS build
  {
    input: 'src/index.ts',
    output: {
      dir: BUILD_PATHS.BUILD.CJS,
      format: 'cjs',
      preserveModules: true,
      preserveModulesRoot: 'src',
      sourcemap: true,
      exports: 'named'
    },
    external,
    resolve: {
      alias: aliasConfig
    },
  },
  // Server ESM build
  {
    input: 'src/server/index.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.ESM}/server`,
      format: 'esm',
      preserveModules: true,
      preserveModulesRoot: 'src/server',
      sourcemap: true
    },
    external,
    resolve: {
      alias: aliasConfig
    },
  },
  // Server CJS build
  {
    input: 'src/server/index.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.CJS}/server`,
      format: 'cjs',
      preserveModules: true,
      preserveModulesRoot: 'src/server',
      sourcemap: true,
      exports: 'named'
    },
    external,
    resolve: {
      alias: aliasConfig
    },
  },
  // Express router helper ESM bundle
  {
    input: 'src/server/router/express-adaptor.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.ESM}/server/router`,
      format: 'esm',
      entryFileNames: 'express.js',
      sourcemap: true,
    },
    external,
    resolve: {
      alias: aliasConfig,
    },
  },
  // Express router helper CJS bundle
  {
    input: 'src/server/router/express-adaptor.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.CJS}/server/router`,
      format: 'cjs',
      entryFileNames: 'express.js',
      sourcemap: true,
      exports: 'named',
    },
    external,
    resolve: {
      alias: aliasConfig,
    },
  },
  // Cloudflare Workers router adaptor ESM bundle
  {
    input: 'src/server/router/cloudflare-adaptor.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.ESM}/server/router`,
      format: 'esm',
      entryFileNames: 'cloudflare.js',
      sourcemap: true,
    },
    external,
    resolve: {
      alias: aliasConfig,
    },
  },
  // Cloudflare Workers router adaptor CJS bundle
  {
    input: 'src/server/router/cloudflare-adaptor.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.CJS}/server/router`,
      format: 'cjs',
      entryFileNames: 'cloudflare.js',
      sourcemap: true,
      exports: 'named',
    },
    external,
    resolve: {
      alias: aliasConfig,
    },
  },
  // WASM signer re-export ESM
  {
    input: 'src/server/wasm/signer.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.ESM}/server/wasm`,
      format: 'esm',
      entryFileNames: 'signer.js',
      sourcemap: true,
    },
    external,
    resolve: {
      alias: aliasConfig,
    },
  },
  // WASM signer re-export CJS
  {
    input: 'src/server/wasm/signer.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.CJS}/server/wasm`,
      format: 'cjs',
      entryFileNames: 'signer.js',
      sourcemap: true,
      exports: 'named',
    },
    external,
    resolve: {
      alias: aliasConfig,
    },
  },
  // WASM VRF re-export ESM
  {
    input: 'src/server/wasm/vrf.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.ESM}/server/wasm`,
      format: 'esm',
      entryFileNames: 'vrf.js',
      sourcemap: true,
    },
    external,
    resolve: {
      alias: aliasConfig,
    },
  },
  // WASM VRF re-export CJS
  {
    input: 'src/server/wasm/vrf.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.CJS}/server/wasm`,
      format: 'cjs',
      entryFileNames: 'vrf.js',
      sourcemap: true,
      exports: 'named',
    },
    external,
    resolve: {
      alias: aliasConfig,
    },
  },
  // React ESM build
  {
    input: 'src/react/index.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.ESM}/react`,
      format: 'esm',
      preserveModules: true,
      preserveModulesRoot: 'src/react',
      sourcemap: true
    },
    external,
    resolve: {
      alias: aliasConfig
    },
  },
  // React CJS build
  {
    input: 'src/react/index.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.CJS}/react`,
      format: 'cjs',
      preserveModules: true,
      preserveModulesRoot: 'src/react',
      sourcemap: true,
      exports: 'named'
    },
    external,
    resolve: {
      alias: aliasConfig
    },
  },
  // React CSS build - output to separate styles directory to avoid JS conflicts
  {
    input: 'src/react/styles.css',
    output: {
      dir: `${BUILD_PATHS.BUILD.ESM}/react/styles`,
      format: 'esm',
      assetFileNames: 'styles.css'
    },
  },
  // WASM VRF Worker build for server usage - includes WASM binary
  {
    input: 'src/wasm_vrf_worker/pkg/wasm_vrf_worker.js',
    output: {
      dir: `${BUILD_PATHS.BUILD.ESM}/wasm_vrf_worker/pkg`,
      format: 'esm',
      assetFileNames: '[name][extname]'
    },
    plugins: [
      // Custom plugin to copy WASM files
      {
        name: 'copy-wasm',
        generateBundle() {
          try {
            copyWasmAsset(
              path.join(process.cwd(), 'src/wasm_vrf_worker/pkg/wasm_vrf_worker_bg.wasm'),
              path.join(process.cwd(), `${BUILD_PATHS.BUILD.ESM}/wasm_vrf_worker/pkg/wasm_vrf_worker_bg.wasm`),
              '✅ WASM file copied to dist/esm/wasm_vrf_worker/pkg/'
            );
          } catch (error) {
            console.error('❌ Failed to copy VRF WASM asset:', error);
            throw error;
          }
        }
      }
    ]
  },
  // WASM Signer Worker build for server usage - includes WASM binary
  {
    input: 'src/wasm_signer_worker/pkg/wasm_signer_worker.js',
    output: {
      dir: `${BUILD_PATHS.BUILD.ESM}/wasm_signer_worker/pkg`,
      format: 'esm',
      assetFileNames: '[name][extname]'
    },
    plugins: [
      {
        name: 'copy-wasm-signer',
        generateBundle() {
          try {
            copyWasmAsset(
              path.join(process.cwd(), 'src/wasm_signer_worker/pkg/wasm_signer_worker_bg.wasm'),
              path.join(process.cwd(), `${BUILD_PATHS.BUILD.ESM}/wasm_signer_worker/pkg/wasm_signer_worker_bg.wasm`),
              '✅ WASM file copied to dist/esm/wasm_signer_worker/pkg/'
            );
          } catch (error) {
            console.error('❌ Failed to copy signer WASM asset:', error);
            throw error;
          }
        }
      }
    ]
  },
  // Button-with-Tooltip component - bundles Lit for iframe usage
  {
    input: 'src/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/ButtonWithTooltip.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.ESM}/sdk`,
      format: 'esm',
      // Align emitted filename with iframe srcdoc import expectation
      entryFileNames: 'w3a-button-with-tooltip.js'
    },
    external: embeddedExternal,
    resolve: {
      alias: aliasConfig
    },
  },
  // Confirm UI helpers and elements bundle for iframe usage
  // Build from confirm-ui.ts (container-agnostic); keep output filename stable
  {
    input: 'src/core/WebAuthnManager/LitComponents/confirm-ui.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.ESM}/sdk`,
      format: 'esm',
      entryFileNames: 'tx-confirm-ui.js'
    },
    external: embeddedExternal,
    resolve: {
      alias: aliasConfig
    },
  },
  // Embedded Transaction Confirmation Iframe Host component + Modal Host
  {
    input: {
      // SendTxButtonWithTooltip component (Button with ToolTip)
      'w3a-tx-button': 'src/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/iframe-host.ts',
      'iframe-tx-button-bootstrap': 'src/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/iframe-tx-button-bootstrap-script.ts',
      // Tx Confirmer component
      'w3a-tx-confirmer': 'src/core/WebAuthnManager/LitComponents/IframeTxConfirmer/tx-confirmer-wrapper.ts',
      // Wallet service host (headless)
      'wallet-iframe-host': 'src/core/WalletIframe/host/wallet-iframe-host.ts',
      // Export viewer host + bootstrap
      'iframe-export-bootstrap': 'src/core/WebAuthnManager/LitComponents/ExportPrivateKey/iframe-export-bootstrap-script.ts',
    },
    output: {
      dir: `${BUILD_PATHS.BUILD.ESM}/sdk`,
      format: 'esm',
      entryFileNames: '[name].js'
    },
    external: embeddedExternal,
    resolve: {
      alias: aliasConfig
    },
    plugins: [
      {
        name: 'emit-wallet-service-static',
        generateBundle() {
          try {
            const sdkDir = path.join(process.cwd(), `${BUILD_PATHS.BUILD.ESM}/sdk`);
            fs.mkdirSync(sdkDir, { recursive: true });
            const copyIf = (src: string, dest: string) => {
              if (fs.existsSync(src) && !fs.existsSync(dest)) fs.copyFileSync(src, dest);
            };
            const shimPath = path.join(sdkDir, 'wallet-shims.js');
            if (!fs.existsSync(shimPath)) fs.writeFileSync(shimPath, WALLET_SHIM_SOURCE, 'utf-8');
            const cssPath = path.join(sdkDir, 'wallet-service.css');
            if (!fs.existsSync(cssPath)) fs.writeFileSync(cssPath, WALLET_SURFACE_CSS, 'utf-8');
            // Generate w3a-components.css from single-source palette
            try {
              const palettePath = path.join(process.cwd(), 'src/theme/palette.json');
              const paletteRaw = fs.readFileSync(palettePath, 'utf-8');
              const p = JSON.parse(paletteRaw) as any;
              const sel = [
                'w3a-tx-tree',
                'w3a-drawer',
                'w3a-modal-tx-confirmer',
                'w3a-drawer-tx-confirmer',
                'w3a-button-with-tooltip',
                'w3a-halo-border',
                'w3a-passkey-halo-loading',
              ].join(',\n');
              const lines: string[] = [];
              lines.push('/* Generated from src/theme/palette.json. Do not edit by hand. */');
              lines.push(`${sel} {`);
              // Base tokens (dark defaults) referencing palette vars
              lines.push(`  --w3a-colors-textPrimary: var(--w3a-grey75);`);
              lines.push(`  --w3a-colors-textSecondary: var(--w3a-grey500);`);
              lines.push(`  --w3a-colors-surface: var(--w3a-slate700);`);
              lines.push(`  --w3a-colors-surface2: var(--w3a-slate750);`);
              lines.push(`  --w3a-colors-surface3: var(--w3a-slate800);`);
              lines.push(`  --w3a-colors-borderPrimary: var(--w3a-grey650);`);
              lines.push(`  --w3a-colors-borderSecondary: var(--w3a-slate650);`);
              lines.push(`  --w3a-colors-colorBackground: var(--w3a-grey800);`);
              // Component defaults
              lines.push(`  --w3a-modal__btn__focus-outline-color: #3b82f6;`);
              lines.push(`  --w3a-tree__file-content__scrollbar-track__background: rgba(255,255,255,0.06);`);
              lines.push(`  --w3a-tree__file-content__scrollbar-thumb__background: rgba(255,255,255,0.22);`);
              // GREY
              Object.keys(p.grey || {}).forEach((k) => {
                lines.push(`  --w3a-grey${k}: ${p.grey[k]};`);
              });
              // SLATE
              Object.keys(p.slate || {}).forEach((k) => {
                lines.push(`  --w3a-slate${k}: ${p.slate[k]};`);
              });
              // CHROMA
              const chroma = p.chroma || {};
              Object.keys(chroma).forEach((family) => {
                const scale = chroma[family] || {};
                Object.keys(scale).forEach((k) => {
                  lines.push(`  --w3a-${family}${k}: ${scale[k]};`);
                });
              });
              // Gradients
              Object.keys(p.gradients || {}).forEach((name) => {
                lines.push(`  --w3a-gradient-${name}: ${p.gradients[name]};`);
              });
              lines.push('}');
              // Light theme overrides for core tokens on supported hosts
              const selLight = [
                'w3a-tx-tree[theme="light"]',
                'w3a-drawer[theme="light"]',
                'w3a-modal-tx-confirmer[theme="light"]',
                'w3a-drawer-tx-confirmer[theme="light"]',
                'w3a-button-with-tooltip[theme="light"]',
                'w3a-halo-border[theme="light"]',
                'w3a-passkey-halo-loading[theme="light"]',
              ].join(',\n');
              lines.push(`${selLight} {`);
              lines.push(`  --w3a-colors-textPrimary: var(--w3a-grey975);`);
              lines.push(`  --w3a-colors-textSecondary: var(--w3a-grey500);`);
              lines.push(`  --w3a-colors-surface: var(--w3a-slate100);`);
              lines.push(`  --w3a-colors-surface2: var(--w3a-slate150);`);
              lines.push(`  --w3a-colors-surface3: var(--w3a-slate200);`);
              lines.push(`  --w3a-colors-borderPrimary: var(--w3a-slate300);`);
              lines.push(`  --w3a-colors-borderSecondary: var(--w3a-grey300);`);
              lines.push(`  --w3a-colors-colorBackground: var(--w3a-grey50);`);
              lines.push('}');
              fs.writeFileSync(path.join(sdkDir, 'w3a-components.css'), lines.join('\n') + '\n', 'utf-8');
            } catch (e) {
              console.warn('⚠️  Failed to generate w3a-components.css from palette:', e);
              // Fallback: copy static if present
              const src = path.join(process.cwd(), 'src/core/WebAuthnManager/LitComponents/css/w3a-components.css');
              const dest = path.join(sdkDir, 'w3a-components.css');
              if (fs.existsSync(src)) fs.copyFileSync(src, dest);
            }
            copyIf(path.join(process.cwd(), 'src/core/WebAuthnManager/LitComponents/css/tx-tree.css'), path.join(sdkDir, 'tx-tree.css'));
            copyIf(path.join(process.cwd(), 'src/core/WebAuthnManager/LitComponents/css/modal-confirmer.css'), path.join(sdkDir, 'modal-confirmer.css'));
            copyIf(path.join(process.cwd(), 'src/core/WebAuthnManager/LitComponents/css/drawer.css'), path.join(sdkDir, 'drawer.css'));
            copyIf(path.join(process.cwd(), 'src/core/WalletIframe/client/overlay.css'), path.join(sdkDir, 'overlay.css'));
            console.log('✅ Emitted /sdk wallet-shims.js and wallet-service.css');
          } catch (err) {
            console.warn('⚠️  Unable to emit wallet static assets:', err);
          }
        }
      }
    ]
  },
  // Export Private Key viewer bundle (Lit element rendered inside iframe)
  {
    input: 'src/core/WebAuthnManager/LitComponents/ExportPrivateKey/viewer.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.ESM}/sdk`,
      format: 'esm',
      entryFileNames: 'export-private-key-viewer.js',
    },
    external: embeddedExternal,
    resolve: {
      alias: aliasConfig,
    },
  },
  // Standalone bundles for HaloBorder + PasskeyHaloLoading (for iframe/embedded usage)
  {
    input: {
      'halo-border': 'src/core/WebAuthnManager/LitComponents/HaloBorder/index.ts',
      'passkey-halo-loading': 'src/core/WebAuthnManager/LitComponents/PasskeyHaloLoading/index.ts',
    },
    output: {
      dir: `${BUILD_PATHS.BUILD.ESM}/sdk`,
      format: 'esm',
      entryFileNames: '[name].js',
    },
    external: embeddedExternal,
    resolve: {
      alias: aliasConfig,
    },
  }
  ,
  // Web Components (bundle all deps for vanilla HTML usage)
  {
    input: {
      'profile-settings': 'src/web-components/profile-settings.ts',
      'index': 'src/web-components/index.ts',
    },
    output: {
      dir: `${BUILD_PATHS.BUILD.ESM}/web-components`,
      format: 'esm',
      entryFileNames: '[name].js',
      sourcemap: true,
    },
    external: embeddedExternal,
    resolve: {
      alias: aliasConfig,
    },
  }
  ,
  // Vite plugin ESM build (source moved to src/plugins)
  {
    input: 'src/plugins/vite.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.ESM}/plugins`,
      format: 'esm',
      preserveModules: true,
      preserveModulesRoot: 'src/plugins',
      sourcemap: true
    },
    external,
    resolve: {
      alias: aliasConfig
    }
  },
  // Vite plugin CJS build (source moved to src/plugins)
  {
    input: 'src/plugins/vite.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.CJS}/plugins`,
      format: 'cjs',
      preserveModules: true,
      preserveModulesRoot: 'src/plugins',
      sourcemap: true,
      exports: 'named'
    },
    external,
    resolve: {
      alias: aliasConfig
    }
  }
]);
