#!/usr/bin/env node
/**
 * Assert that required SDK CSS assets exist in dist/esm/sdk after build.
 * Fails fast with a helpful list of missing files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve sdk root robustly regardless of CWD
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sdkRoot = path.resolve(path.join(__dirname, '..'));
const sdkEsmSdkDir = path.join(sdkRoot, 'dist', 'esm', 'sdk');

const required = [
  'wallet-service.css',
  'w3a-components.css',
  'tx-tree.css',
  'drawer.css',
  'tx-confirmer.css',
  'halo-border.css',
  'passkey-halo-loading.css',
  'padlock-icon.css',
  'export-iframe.css',
  'export-viewer.css',
  'overlay.css',
];

function fail(msg) {
  console.error(`\n[assert-sdk-css-assets] ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(sdkEsmSdkDir)) {
  fail(`Missing directory: ${sdkEsmSdkDir}. Did you run 'pnpm -C sdk build'?`);
}

const missing = required.filter((f) => !fs.existsSync(path.join(sdkEsmSdkDir, f)));
if (missing.length) {
  console.error('[assert-sdk-css-assets] Missing CSS assets in dist/esm/sdk:');
  for (const file of missing) console.error(`  - ${file}`);
  process.exit(1);
}

console.log('[assert-sdk-css-assets] OK: all required CSS assets present in dist/esm/sdk');
