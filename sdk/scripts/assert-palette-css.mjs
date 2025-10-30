#!/usr/bin/env node
/**
 * Assert that all colors from src/theme/palette.json exist as CSS variables
 * in the generated w3a-components.css.
 *
 * Usage:
 *   node sdk/scripts/assert-palette-css.mjs [path/to/w3a-components.css]
 * Default cssPath: sdk/dist/esm/sdk/w3a-components.css
 */
import fs from 'node:fs';
import path from 'node:path';

// Resolve SDK root robustly whether invoked from repo root or sdk/

function resolveSdkRoot() {
  const cwd = process.cwd();
  const tryDirect = path.join(cwd, 'src', 'theme', 'palette.json');
  if (fs.existsSync(tryDirect)) return cwd; // inside sdk/
  const trySdk = path.join(cwd, 'sdk', 'src', 'theme', 'palette.json');
  if (fs.existsSync(trySdk)) return path.join(cwd, 'sdk'); // repo root
  return cwd; // best effort; downstream checks will fail with clear message
}

const repoRoot = resolveSdkRoot();
const palettePath = path.join(repoRoot, 'src', 'theme', 'palette.json');
const defaultCssPath = path.join(repoRoot, 'dist', 'esm', 'sdk', 'w3a-components.css');

const cssPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : defaultCssPath;

function fail(msg) {
  console.error(`\n[assert-palette-css] ${msg}`);
  process.exit(1);
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch (e) { fail(`Unable to read JSON at ${p}: ${e?.message || e}`); }
}

function readText(p) {
  try { return fs.readFileSync(p, 'utf-8'); }
  catch (e) { fail(`Unable to read CSS at ${p}: ${e?.message || e}`); }
}

if (!fs.existsSync(palettePath)) fail(`Missing palette.json at ${palettePath}`);
if (!fs.existsSync(cssPath)) fail(`CSS not found at ${cssPath}. Did you run 'pnpm -C sdk build'?`);

const palette = readJson(palettePath);
const css = readText(cssPath);

// Collect CSS var names present in the generated file
const present = new Set();
const re = /(--w3a-[a-z0-9\-]+)\s*:/gi;
let m;
while ((m = re.exec(css)) !== null) {
  present.add(m[1]);
}

// Build expected CSS var names from palette keys
const expected = new Set();

const addVars = (prefix, obj) => {
  if (!obj) return;
  for (const k of Object.keys(obj)) {
    expected.add(`--w3a-${prefix}${k}`);
  }
};

addVars('grey', palette.grey);
addVars('slate', palette.slate);
addVars('cream', palette.cream);

const chroma = palette.chroma || {};
for (const fam of Object.keys(chroma)) {
  addVars(`${fam}`, chroma[fam]);
}

const gradients = palette.gradients || {};
for (const name of Object.keys(gradients)) {
  expected.add(`--w3a-gradient-${name}`);
}

// Diff
const missing = Array.from(expected).filter((v) => !present.has(v)).sort();

if (missing.length) {
  console.error('[assert-palette-css] Missing CSS variables from generated w3a-components.css:');
  for (const v of missing) console.error(`  ${v}`);
  process.exit(1);
}

console.log('[assert-palette-css] OK: palette variables present in CSS');
