#!/usr/bin/env node
/**
 * Generate w3a-components.css from the single source of truth:
 * - sdk/src/theme/palette.json (all base scales + gradients)
 * - Mappings used by DARK_THEME/LIGHT_THEME in base-styles.ts for surfaces/text/borders
 *
 * This eliminates hardcoded palette numbers in CSS and prevents drift.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Resolve SDK root robustly whether invoked from repo root or sdk/
function resolveSdkRoot() {
  const cwd = process.cwd();
  const tryDirect = path.join(cwd, 'src', 'theme', 'palette.json');
  if (fs.existsSync(tryDirect)) return cwd; // invoked from sdk/
  const trySdk = path.join(cwd, 'sdk', 'src', 'theme', 'palette.json');
  if (fs.existsSync(trySdk)) return path.join(cwd, 'sdk'); // invoked from repo root
  return cwd; // fallback (error will be thrown below on read)
}

const repoRoot = resolveSdkRoot();
const palettePath = path.join(repoRoot, 'src', 'theme', 'palette.json');
const cssOutPath = path.join(repoRoot, 'src', 'core', 'WebAuthnManager', 'LitComponents', 'css', 'w3a-components.css');

function fail(msg) {
  console.error(`\n[generate-w3a-components-css] ${msg}`);
  process.exit(1);
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch (e) { fail(`Unable to read JSON at ${p}: ${e?.message || e}`); }
}

const palette = readJson(palettePath);

const { grey = {}, slate = {}, cream = {}, gradients = {}, tokens = {}, themes = {} } = palette;
let chroma = palette.chroma || {};
if (!chroma || Object.keys(chroma).length === 0) {
  chroma = {};
  const exclude = new Set(['grey','slate','cream','gradients','tokens','themes']);
  Object.keys(palette).filter((k) => !exclude.has(k)).forEach((fam) => {
    if (palette[fam] && typeof palette[fam] === 'object') chroma[fam] = palette[fam];
  });
}

function get(obj, path) {
  if (!obj || typeof path !== 'string') return undefined;
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function resolveRef(v) {
  if (typeof v !== 'string') return v;
  // Allow references like "grey.75" or "chroma.blue.500" or "tokens.buttonBackground" or "gradients.blue"
  const maybe = get({ grey, slate, cream, chroma, gradients, tokens }, v);
  return maybe !== undefined ? maybe : v;
}

const emitScale = (name, scale) => {
  const keys = Object.keys(scale);
  keys.sort((a, b) => Number(a) - Number(b));
  return keys.map((k) => `  --w3a-${name}${k}: ${scale[k]};`).join('\n');
};

const emitChroma = () => {
  const fams = Object.keys(chroma);
  fams.sort();
  const out = [];
  for (const fam of fams) {
    const keys = Object.keys(chroma[fam]);
    keys.sort((a, b) => Number(a) - Number(b));
    out.push(`\n  /* ${fam[0].toUpperCase()}${fam.slice(1)} */`);
    for (const k of keys) out.push(`  --w3a-${fam}${k}: ${chroma[fam][k]};`);
  }
  return out.join('\n');
};

const emitGradients = () => {
  const names = Object.keys(gradients);
  names.sort();
  return names.map((n) => `  --w3a-gradient-${n}: ${gradients[n]};`).join('\n');
};

// Use centralized theme maps from src/theme/base-styles.js
const baseStylesPath = path.join(repoRoot, 'src', 'theme', 'base-styles.js');
const base = await import(pathToFileURL(baseStylesPath).href);
const { createThemeTokens } = base;
const { DARK_THEME: DARK_VARS, LIGHT_THEME: LIGHT_VARS, CREAM_THEME: CREAM_VARS } = createThemeTokens(palette);

const header = `/*
  AUTO-GENERATED FILE – DO NOT EDIT.
  Source: sdk/src/theme/palette.json + mappings from src/theme/base-styles.js (createThemeTokens)
  Run: node sdk/scripts/generate-w3a-components-css.mjs
*/`;

const hostSelectorsArr = [
  'w3a-tx-tree',
  'w3a-drawer',
  'w3a-modal-tx-confirmer',
  'w3a-drawer-tx-confirmer',
  'w3a-tx-confirm-content',
  'w3a-halo-border',
  'w3a-passkey-halo-loading',
  // Export Private Key viewer host (responds to theme + tokens)
  'w3a-export-key-viewer',
];
const hostSelectors = hostSelectorsArr.join(',\n');

const darkBlock = `/* Base CSS variables for W3A custom elements (applied on hosts) */
${hostSelectors} {
  /* Component defaults (no token alias assignments here) */
  --w3a-modal__btn__focus-outline-color: ${chroma?.blue?.['400'] || '#3b82f6'};
  --w3a-tree__file-content__scrollbar-track__background: rgba(255,255,255,0.06);
  --w3a-tree__file-content__scrollbar-thumb__background: rgba(255,255,255,0.22);

  /* Neutral defaults for PasskeyHaloLoading (baseline outside confirmer context) */
  --w3a-modal__passkey-halo-loading__ring-background: transparent 0%, var(--w3a-blue500) 10%, var(--w3a-blue500) 25%, transparent 35%;
  --w3a-modal__passkey-halo-loading__inner-background: transparent;
  --w3a-modal__passkey-halo-loading__inner-padding: 3px;
  --w3a-modal__passkey-halo-loading-icon-container__background-color: var(--w3a-colors-surface);
  --w3a-modal__passkey-halo-loading-touch-icon__color: var(--w3a-colors-textPrimary);
  --w3a-modal__passkey-halo-loading-touch-icon__margin: 0.75rem;
  --w3a-modal__passkey-halo-loading-touch-icon__stroke-width: 3;

  /* Default token aliases (dark) so components have tokens without relying on :root */
${emitAliasBlock(DARK_VARS)}
}`;

/* No per-host token overrides; tokens come from Theme or host boundary. */
const lightBlock = '';

// Helper to emit a complete alias block from a vars map
function emitAliasBlock(vars) {
  return [
    `  --w3a-colors-textPrimary: ${vars.textPrimary};`,
    `  --w3a-colors-textSecondary: ${vars.textSecondary};`,
    `  --w3a-colors-textMuted: ${vars.textMuted};`,
    `  --w3a-colors-textButton: ${vars.textButton};`,
    `  --w3a-colors-colorBackground: ${vars.colorBackground};`,
    `  --w3a-colors-surface: ${vars.surface};`,
    `  --w3a-colors-surface2: ${vars.surface2};`,
    `  --w3a-colors-surface3: ${vars.surface3};`,
    `  --w3a-colors-surface4: ${vars.surface4};`,
    `  --w3a-colors-primary: ${vars.primary};`,
    `  --w3a-colors-primaryHover: ${vars.primaryHover};`,
    `  --w3a-colors-secondary: ${vars.secondary};`,
    `  --w3a-colors-secondaryHover: ${vars.secondaryHover};`,
    `  --w3a-colors-accent: ${vars.accent};`,
    `  --w3a-colors-buttonBackground: ${vars.buttonBackground};`,
    `  --w3a-colors-buttonHoverBackground: ${vars.buttonHoverBackground};`,
    `  --w3a-colors-hover: ${vars.hover};`,
    `  --w3a-colors-active: ${vars.active};`,
    `  --w3a-colors-focus: ${vars.focus};`,
    `  --w3a-colors-success: ${vars.success};`,
    `  --w3a-colors-warning: ${vars.warning};`,
    `  --w3a-colors-error: ${vars.error};`,
    `  --w3a-colors-info: ${vars.info};`,
    `  --w3a-colors-borderPrimary: ${vars.borderPrimary};`,
    `  --w3a-colors-borderSecondary: ${vars.borderSecondary};`,
    `  --w3a-colors-borderHover: ${vars.borderHover};`,
    `  --w3a-colors-backgroundGradientPrimary: ${vars.backgroundGradientPrimary};`,
    `  --w3a-colors-backgroundGradientSecondary: ${vars.backgroundGradientSecondary};`,
    `  --w3a-colors-backgroundGradient4: ${vars.backgroundGradient4};`,
    `  --w3a-colors-highlightReceiverId: ${vars.highlightReceiverId};`,
    `  --w3a-colors-highlightMethodName: ${vars.highlightMethodName};`,
    `  --w3a-colors-highlightAmount: ${vars.highlightAmount};`,
  ].join('\n');
}

// Also emit theme-specific alias blocks scoped to component hosts, so tokens pierce Shadow DOM via host inheritance
const hostThemeTokens = `:root[data-w3a-theme=\"light\"] ${hostSelectors} {\n${emitAliasBlock(LIGHT_VARS)}\n}\n\n:root[data-w3a-theme=\"cream\"] ${hostSelectors} {\n${emitAliasBlock(CREAM_VARS)}\n}`;

const cssOut = `${header}\n\n${darkBlock}\n\n${hostThemeTokens}\n`;

fs.writeFileSync(cssOutPath, cssOut);
console.log('[generate-w3a-components-css] Wrote', path.relative(process.cwd(), cssOutPath));
