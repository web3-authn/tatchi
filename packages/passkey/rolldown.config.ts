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
  'tslib'
];

// External dependencies for embedded component (excludes Lit to bundle it)
const embeddedExternal = [
  // React dependencies
  'react',
  'react-dom',
  'react/jsx-runtime',
  // All @near-js packages
  /@near-js\/.*/,
  // Core dependencies that should be provided by consuming application
  'borsh',
  'bs58',
  'js-sha256',
  'idb',
  'near-api-js',
  // Other common packages
  'tslib'
  // Note: Lit is not excluded here, it will be bundled
];

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
  // Embedded Transaction Confirmation Button component - bundles Lit for iframe usage
  {
    input: 'src/core/WebAuthnManager/LitComponents/SecureTxConfirmButton/EmbeddedTxButton.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.ESM}/react/embedded`,
      format: 'esm',
      entryFileNames: 'embedded-tx-button.js'
    },
    external: embeddedExternal,
    resolve: {
      alias: aliasConfig
    },
  },
  // Embedded Transaction Confirmation Iframe Host component
  {
    input: {
      'iframe-button': 'src/core/WebAuthnManager/LitComponents/SecureTxConfirmButton/IframeButtonHost.ts',
      'iframe-bootstrap': 'src/core/WebAuthnManager/LitComponents/SecureTxConfirmButton/iframeBootstrap.ts',
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
  }
]);