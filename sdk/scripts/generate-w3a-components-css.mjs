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

const { grey = {}, slate = {}, cream = {}, chroma = {}, gradients = {} } = palette;

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

// Mappings that mirror base-styles DARK_THEME / LIGHT_THEME
const darkVars = {
  textPrimary: grey['75'],
  textSecondary: grey['500'],
  surface: slate['700'],
  surface2: slate['750'],
  surface3: slate['800'],
  borderPrimary: grey['650'],
  borderSecondary: slate['650'],
  colorBackground: grey['800'],
};

const lightVars = {
  textPrimary: grey['975'],
  textSecondary: grey['500'],
  surface: slate['100'],
  surface2: slate['150'],
  surface3: slate['200'],
  borderPrimary: slate['300'],
  borderSecondary: grey['300'],
  colorBackground: grey['50'],
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
];
const hostSelectors = hostSelectorsArr.join(',\n');

const darkBlock = `/* Base CSS variables for W3A custom elements (applied on hosts) */
${hostSelectors} {
  /* Text + surfaces (dark defaults) */
  --w3a-colors-textPrimary: ${darkVars.textPrimary};
  --w3a-colors-textSecondary: ${darkVars.textSecondary};
  --w3a-colors-surface: ${darkVars.surface};
  --w3a-colors-surface2: ${darkVars.surface2};
  --w3a-colors-surface3: ${darkVars.surface3};
  --w3a-colors-borderPrimary: ${darkVars.borderPrimary};
  --w3a-colors-borderSecondary: ${darkVars.borderSecondary};
  --w3a-colors-colorBackground: ${darkVars.colorBackground};

  /* Component defaults */
  --w3a-modal__btn__focus-outline-color: ${chroma?.blue?.['400'] || '#3b82f6'};
  --w3a-tree__file-content__scrollbar-track__background: rgba(255,255,255,0.06);
  --w3a-tree__file-content__scrollbar-thumb__background: rgba(255,255,255,0.22);

  /* === Base palette variables (from palette.json) === */
${emitScale('grey', grey)}

  /* Slate variations */
${emitScale('slate', slate)}

  /* Cream variations */
${emitScale('cream', cream)}

  /* === Chroma families === */
${emitChroma()}

  /* Gradients */
${emitGradients()}

  /* Neutral defaults for PasskeyHaloLoading (baseline outside confirmer context) */
  --w3a-modal__passkey-halo-loading__ring-background: transparent 0%, var(--w3a-blue500) 10%, var(--w3a-blue500) 25%, transparent 35%;
  --w3a-modal__passkey-halo-loading__inner-background: transparent;
  --w3a-modal__passkey-halo-loading__inner-padding: 3px;
  --w3a-modal__passkey-halo-loading-icon-container__background-color: var(--w3a-colors-surface);
  --w3a-modal__passkey-halo-loading-touch-icon__color: var(--w3a-colors-textPrimary);
  --w3a-modal__passkey-halo-loading-touch-icon__margin: 0.75rem;
  --w3a-modal__passkey-halo-loading-touch-icon__stroke-width: 3;
}`;

const lightBlock = `/* Light theme overrides for hosts that set [theme=\"light\"] */
${hostSelectorsArr.map((s) => `${s}[theme=\"light\"]`).join(',\n')} {
  --w3a-colors-textPrimary: ${lightVars.textPrimary};
  --w3a-colors-textSecondary: ${lightVars.textSecondary};
  --w3a-colors-surface: ${lightVars.surface};
  --w3a-colors-surface2: ${lightVars.surface2};
  --w3a-colors-surface3: ${lightVars.surface3};
  --w3a-colors-borderPrimary: ${lightVars.borderPrimary};
  --w3a-colors-borderSecondary: ${lightVars.borderSecondary};
  --w3a-colors-colorBackground: ${lightVars.colorBackground};
}`;

const cssOut = `${header}\n\n${darkBlock}\n\n${lightBlock}\n`;

fs.writeFileSync(cssOutPath, cssOut);
console.log('[generate-w3a-components-css] Wrote', path.relative(process.cwd(), cssOutPath));
