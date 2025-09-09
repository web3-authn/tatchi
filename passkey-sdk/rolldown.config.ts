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

  // Node.js native modules for /server SDK
  'fs',
  'path',
  'url',
  'crypto',
  'util',

  // Core dependencies that should be provided by consuming application
  'borsh',
  'bs58',
  'js-sha256',
  'idb',
  'near-api-js',

  // Other common packages
  'tslib',
  // UI libs used by React components should be provided by the app bundler
  'lucide-react'
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
    input: 'src/wasm_vrf_worker/wasm_vrf_worker.js',
    output: {
      dir: `${BUILD_PATHS.BUILD.ESM}/wasm_vrf_worker`,
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
          const wasmSource = path.join(process.cwd(), 'src/wasm_vrf_worker/wasm_vrf_worker_bg.wasm');
          const wasmDest = path.join(process.cwd(), `${BUILD_PATHS.BUILD.ESM}/wasm_vrf_worker/wasm_vrf_worker_bg.wasm`);

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
  // Button-with-Tooltip component - bundles Lit for iframe usage
  {
    input: 'src/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/ButtonWithTooltip.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.ESM}/react/embedded`,
      format: 'esm',
      entryFileNames: 'button-with-tooltip.js'
    },
    external: embeddedExternal,
    resolve: {
      alias: aliasConfig
    },
  },
  // Modal Transaction Confirm element bundle for iframe usage
  {
    input: 'src/core/WebAuthnManager/LitComponents/modal.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.ESM}/react/embedded`,
      format: 'esm',
      entryFileNames: 'modal-tx-confirm.js'
    },
    external: embeddedExternal,
    resolve: {
      alias: aliasConfig
    },
  },
  // Embedded Transaction Confirmation Iframe Host component + Modal Host
  {
    input: {
      'iframe-button': 'src/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/IframeButtonHost.ts',
      'iframe-button-bootstrap': 'src/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/iframe-button-bootstrap-script.ts',
      'iframe-modal': 'src/core/WebAuthnManager/LitComponents/IframeModalConfirmer/IframeModalHost.ts',
      'iframe-modal-bootstrap': 'src/core/WebAuthnManager/LitComponents/IframeModalConfirmer/iframe-modal-bootstrap-script.ts',
      // Wallet service host (headless)
      'wallet-iframe-host': 'src/core/WalletIframe/wallet-iframe-host.ts',
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
]);
