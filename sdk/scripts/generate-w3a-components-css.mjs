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

const { grey = {}, slate = {}, cream = {}, chroma = {}, gradients = {}, tokens = {} } = palette;

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

// Mappings that mirror base-styles DARK_THEME / LIGHT_THEME (classic) / CREAM (warm light)
// Keep in sync with sdk/src/core/WebAuthnManager/LitComponents/base-styles.ts
const buttonBg = tokens.buttonBackground || (chroma?.blue?.['500'] || '#3b82f6');

const DARK_VARS = {
  // Text
  textPrimary: grey['75'],
  textSecondary: grey['500'],
  textMuted: grey['650'],
  textButton: grey['75'],
  // Surfaces
  colorBackground: grey['800'],
  surface: slate['700'],
  surface2: slate['750'],
  surface3: slate['800'],
  surface4: slate['825'],
  // Brand/accents
  primary: chroma?.blue?.['600'] || '#2563eb',
  primaryHover: chroma?.blue?.['500'] || '#3b82f6',
  secondary: chroma?.red?.['500'] || '#ef4444',
  secondaryHover: chroma?.red?.['400'] || '#f87171',
  accent: chroma?.blue?.['400'] || '#60a5fa',
  buttonBackground: buttonBg,
  // Interactive states
  hover: grey['850'],
  active: grey['650'],
  focus: chroma?.blue?.['400'] || '#60a5fa',
  // Status
  success: chroma?.blue?.['400'] || '#60a5fa',
  warning: chroma?.yellow?.['400'] || '#facc15',
  error: chroma?.red?.['400'] || '#f87171',
  info: chroma?.blue?.['400'] || '#60a5fa',
  // Borders
  borderPrimary: grey['650'],
  borderSecondary: slate['650'],
  borderHover: grey['600'],
  // Background Gradients
  backgroundGradientPrimary: gradients?.blue || 'linear-gradient(45deg, #60a5fa 0%, #60a5fa 50%)',
  backgroundGradientSecondary: gradients?.blueWhite || 'linear-gradient(90deg, #2563eb 0%, #93c5fd 50%, #f5f5f5 100%)',
  // Additional gradient slot for app usage
  backgroundGradient4: gradients?.black || 'linear-gradient(45deg, oklch(0.53 0.03 240) 0%, oklch(0.2 0.015 240) 50%)',
  // Highlights
  highlightReceiverId: chroma?.blue?.['400'] || '#60a5fa',
  highlightMethodName: chroma?.blue?.['400'] || '#60a5fa',
  highlightAmount: chroma?.blue?.['400'] || '#60a5fa',
};

const LIGHT_VARS = {
  // Text
  textPrimary: grey['975'],
  textSecondary: grey['500'],
  textMuted: grey['350'],
  textButton: grey['75'],
  // Surfaces
  colorBackground: grey['50'],
  surface: slate['100'],
  surface2: slate['150'],
  surface3: slate['200'],
  surface4: slate['250'],
  // Brand/accents
  primary: chroma?.blue?.['600'] || '#2563eb',
  primaryHover: chroma?.blue?.['500'] || '#3b82f6',
  secondary: chroma?.red?.['500'] || '#ef4444',
  secondaryHover: chroma?.red?.['400'] || '#f87171',
  accent: chroma?.blue?.['400'] || '#60a5fa',
  buttonBackground: buttonBg,
  // Interactive states
  hover: grey['100'],
  active: grey['200'],
  focus: chroma?.blue?.['400'] || '#60a5fa',
  // Status
  success: chroma?.blue?.['500'] || '#3b82f6',
  warning: chroma?.yellow?.['500'] || '#f59e0b',
  error: chroma?.red?.['500'] || '#ef4444',
  info: chroma?.blue?.['500'] || '#3b82f6',
  // Borders
  borderPrimary: slate['300'],
  borderSecondary: grey['300'],
  borderHover: slate['350'],
  // Background Gradients
  backgroundGradientPrimary: gradients?.blue || 'linear-gradient(45deg, #60a5fa 0%, #60a5fa 50%)',
  backgroundGradientSecondary: gradients?.blueWhite || 'linear-gradient(90deg, #2563eb 0%, #93c5fd 50%, #f5f5f5 100%)',
  // Additional gradient slot for app usage
  backgroundGradient4: gradients?.black || 'linear-gradient(45deg, oklch(0.53 0.03 240) 0%, oklch(0.2 0.015 240) 50%)',
  // Highlights
  highlightReceiverId: chroma?.blue?.['500'] || '#3b82f6',
  highlightMethodName: chroma?.blue?.['500'] || '#3b82f6',
  highlightAmount: chroma?.blue?.['500'] || '#3b82f6',
};

const CREAM_VARS = {
  // Text
  textPrimary: grey['900'],
  textSecondary: grey['600'],
  textMuted: grey['450'],
  textButton: grey['75'],
  // Surfaces (warm neutrals)
  colorBackground: cream['50'],
  surface: cream['100'],
  surface2: cream['150'],
  surface3: cream['200'],
  surface4: cream['250'],
  // Brand/accents (neutral primary, warm accent)
  primary: grey['700'],
  primaryHover: grey['650'],
  secondary: chroma?.red?.['500'] || '#ef4444',
  secondaryHover: chroma?.red?.['400'] || '#f87171',
  accent: chroma?.yellow?.['550'] || '#eab308',
  buttonBackground: buttonBg,
  // Interactive states (warm neutrals)
  hover: cream['75'],
  active: cream['200'],
  focus: chroma?.yellow?.['500'] || '#eab308',
  // Status
  success: chroma?.yellow?.['400'] || '#facc15',
  warning: chroma?.yellow?.['600'] || '#d97706',
  error: chroma?.red?.['500'] || '#ef4444',
  info: chroma?.blue?.['500'] || '#3b82f6',
  // Borders
  borderPrimary: cream['300'],
  borderSecondary: cream['200'],
  borderHover: cream['350'],
  // Background Gradients (neutrals)
  backgroundGradientPrimary: gradients?.black || 'linear-gradient(45deg, oklch(0.53 0.03 240) 0%, oklch(0.2 0.015 240) 50%)',
  backgroundGradientSecondary: gradients?.blackWhite || 'linear-gradient(90deg, oklch(0.20 0.010 240) 0%, oklch(0.95 0.005 240) 100%)',
  // Additional gradient slot for app usage
  backgroundGradient4: gradients?.black || 'linear-gradient(45deg, oklch(0.53 0.03 240) 0%, oklch(0.2 0.015 240) 50%)',
  // Highlights
  highlightReceiverId: chroma?.yellow?.['400'] || '#facc15',
  highlightMethodName: chroma?.yellow?.['400'] || '#facc15',
  highlightAmount: chroma?.yellow?.['400'] || '#facc15',
};

const header = `/*
  AUTO-GENERATED FILE – DO NOT EDIT.
  Source: sdk/src/theme/palette.json + mappings from base-styles.ts
  Run: node sdk/scripts/generate-w3a-components-css.mjs
*/`;

const hostSelectorsArr = [
  'w3a-tx-tree',
  'w3a-drawer',
  'w3a-modal-tx-confirmer',
  'w3a-drawer-tx-confirmer',
  'w3a-button-with-tooltip',
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
