import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(here, '..');
const repoRoot = path.resolve(extensionRoot, '..', '..');

const sdkDistRoot = path.join(repoRoot, 'sdk', 'dist');
const srcSdkEsmRoot = path.join(sdkDistRoot, 'esm', 'sdk');
const srcWorkersRoot = path.join(sdkDistRoot, 'workers');
const srcReactStyles = path.join(sdkDistRoot, 'esm', 'react', 'styles', 'styles.css');

const destSdkRoot = path.join(extensionRoot, 'sdk');
const destWorkersRoot = path.join(destSdkRoot, 'workers');
const destReactStyles = path.join(destSdkRoot, 'react-styles.css');

function requireDir(dirPath) {
  try {
    const st = fs.statSync(dirPath);
    if (!st.isDirectory()) throw new Error('not a directory');
  } catch {
    throw new Error(`Missing directory: ${dirPath}\nBuild the SDK first (pnpm -C sdk build).`);
  }
}

requireDir(srcSdkEsmRoot);
requireDir(srcWorkersRoot);
try {
  const st = fs.statSync(srcReactStyles);
  if (!st.isFile()) throw new Error('not a file');
} catch {
  throw new Error(`Missing file: ${srcReactStyles}\nBuild the SDK first (pnpm -C sdk build).`);
}

fs.rmSync(destSdkRoot, { recursive: true, force: true });
fs.mkdirSync(destWorkersRoot, { recursive: true });

fs.cpSync(srcSdkEsmRoot, destSdkRoot, { recursive: true });
fs.cpSync(srcWorkersRoot, destWorkersRoot, { recursive: true });
fs.cpSync(srcReactStyles, destReactStyles);

console.log('[chrome-extension] synced SDK assets:', {
  sdk: path.relative(repoRoot, destSdkRoot),
  workers: path.relative(repoRoot, destWorkersRoot),
  reactStyles: path.relative(repoRoot, destReactStyles),
});
