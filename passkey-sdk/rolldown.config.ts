import { defineConfig } from 'rolldown';
import { BUILD_PATHS } from './build-paths.ts';
import * as path from 'path';

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
];

// External dependencies for embedded components.
// IMPORTANT: Externalize Lit so the host app's bundler (e.g., Vite) serves a consistent copy.
// Bundling Lit into /sdk/embedded caused internal node_modules paths and ESM export mismatches.
// Embedded bundles are loaded directly in the browser (no bundler/import maps),
// so do NOT externalize dependencies. Bundle everything needed.
const embeddedExternal: (string | RegExp)[] = [];

const aliasConfig = {
  '@build-paths': path.resolve(process.cwd(), 'build-paths.ts'),
  '@/*': path.resolve(process.cwd(), 'src/*')
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
    input: 'src/server/router/express.ts',
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
    input: 'src/server/router/express.ts',
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
          // Copy WASM file alongside the JS bundle
          const fs = require('fs');
          const path = require('path');
          const wasmSource = path.join(process.cwd(), 'src/wasm_vrf_worker/pkg/wasm_vrf_worker_bg.wasm');
          const wasmDest = path.join(process.cwd(), `${BUILD_PATHS.BUILD.ESM}/wasm_vrf_worker/pkg/wasm_vrf_worker_bg.wasm`);

          try {
            fs.copyFileSync(wasmSource, wasmDest);
            console.log('✅ WASM file copied to dist/esm/wasm_vrf_worker/');
          } catch (error) {
            console.warn('⚠️ Could not copy WASM file:', error.message);
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
          const fs = require('fs');
          const path = require('path');
          const wasmSource = path.join(process.cwd(), 'src/wasm_signer_worker/pkg/wasm_signer_worker_bg.wasm');
          const wasmDest = path.join(process.cwd(), `${BUILD_PATHS.BUILD.ESM}/wasm_signer_worker/pkg/wasm_signer_worker_bg.wasm`);

          try {
            fs.copyFileSync(wasmSource, wasmDest);
            console.log('✅ WASM file copied to dist/esm/wasm_signer_worker/pkg/');
          } catch (error) {
            console.warn('⚠️ Could not copy signer WASM file:', error.message);
          }
        }
      }
    ]
  },
  // Button-with-Tooltip component - bundles Lit for iframe usage
  {
    input: 'src/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/ButtonWithTooltip.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.ESM}/react/embedded`,
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
      dir: `${BUILD_PATHS.BUILD.ESM}/react/embedded`,
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
      // SecureSendTxButton component (Button with ToolTip)
      'w3a-tx-button': 'src/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/iframe-host.ts',
      'iframe-tx-button-bootstrap': 'src/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/iframe-tx-button-bootstrap-script.ts',
      // Tx Confirmer component
      'w3a-iframe-tx-confirmer': 'src/core/WebAuthnManager/LitComponents/IframeTxConfirmer/iframe-host.ts',
      'iframe-tx-confirmer-bootstrap': 'src/core/WebAuthnManager/LitComponents/IframeTxConfirmer/iframe-tx-confirmer-bootstrap-script.ts',
      // Wallet service host (headless)
      'wallet-iframe-host': 'src/core/WalletIframe/host/wallet-iframe-host.ts',
      // Export viewer host + bootstrap
      'iframe-export-bootstrap': 'src/core/WebAuthnManager/LitComponents/ExportPrivateKey/iframe-export-bootstrap-script.ts',
    },
    output: {
      dir: `${BUILD_PATHS.BUILD.ESM}/react/embedded`,
      format: 'esm',
      entryFileNames: '[name].js'
    },
    external: embeddedExternal,
    resolve: {
      alias: aliasConfig
    },
  },
  // Export Private Key viewer bundle (Lit element rendered inside iframe)
  {
    input: 'src/core/WebAuthnManager/LitComponents/ExportPrivateKey/viewer.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.ESM}/react/embedded`,
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
      dir: `${BUILD_PATHS.BUILD.ESM}/react/embedded`,
      format: 'esm',
      entryFileNames: '[name].js',
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
