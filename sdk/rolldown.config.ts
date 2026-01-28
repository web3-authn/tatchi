// Rolldown config exporting an array of build entries.
import { BUILD_PATHS } from './build-paths.ts';
import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';

// Lightweight define plugin to replace process.env.NODE_ENV with 'production' for
// browser/embedded bundles so React and others use prod paths and treeshake well.
const defineNodeEnvPlugin = {
  name: 'define-node-env',
  transform(code: string) {
    if (code && code.includes('process.env.NODE_ENV')) {
      return {
        code: code.replace(/process\.env\.NODE_ENV/g, '"production"'),
        map: null as any,
      };
    }
    return null as any;
  },
};

// Toggle production transforms based on environment
const isProd = process.env.NODE_ENV === 'production';
const prodPlugins = isProd ? [defineNodeEnvPlugin] : [];

// Rolldown embedded bundles should not inline React CSS imports; styles are shipped as a separate CSS file.
// This keeps embedded JS bundles CSP-friendly and avoids requiring CSS bundling support in Rolldown.
const ignoreCssImportsPlugin = {
  name: 'ignore-css-imports',
  resolveId(source: string) {
    if (source && source.endsWith('.css')) {
      return `\0css:${source}`;
    }
    return null as any;
  },
  load(id: string) {
    if (id && id.startsWith('\0css:')) {
      return {
        code: 'export default "";',
        map: null as any,
      };
    }
    return null as any;
  },
};

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

  // Optional heavy deps – only used via dynamic imports in chainsigs helper
  'viem',
  'chainsig.js',

  // Other common packages
  'tslib',
  // UI libs used by React components should be provided by the app bundler

  // WASM modules - externalize so bundlers handle them correctly
  /\.wasm$/,
  // Externalize WASM glue code so Rolldown doesn't wrap it in __esm and break exports
  /wasm_signer_worker\.js$/,
  /wasm_vrf_worker\.js$/,
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
const WALLET_SHIM_SOURCE = [
  // Minimal globals used by some deps in browser context
  "window.global ||= window; window.process ||= { env: {} };",
  // Infer absolute SDK base from this script's src and set it for embedded iframes (about:srcdoc)
  "(function(){try{",
  "  var s = (typeof document !== 'undefined' && document.currentScript) ? document.currentScript.src : '';",
  "  if(!s) return;",
  "  var u = new URL(s, (typeof location !== 'undefined' ? location.href : ''));",
  "  var href = u.href;",
  "  var base = href.slice(0, href.lastIndexOf('/') + 1);",
  "  if (typeof window !== 'undefined' && !window.__W3A_WALLET_SDK_BASE__) { window.__W3A_WALLET_SDK_BASE__ = base; }",
  "}catch(e){}})();\n",
].join('\n');
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

const W3A_COMPONENT_HOSTS = [
  'w3a-tx-tree',
  'w3a-drawer',
  'w3a-modal-tx-confirmer',
  'w3a-drawer-tx-confirmer',
  'w3a-tx-confirm-content',
  'w3a-halo-border',
  'w3a-passkey-halo-loading',
] as const;

const emitW3AThemeAliases = (vars: any, indent = '  '): string[] => [
  `${indent}--w3a-colors-textPrimary: ${vars.textPrimary};`,
  `${indent}--w3a-colors-textSecondary: ${vars.textSecondary};`,
  `${indent}--w3a-colors-textMuted: ${vars.textMuted};`,
  `${indent}--w3a-colors-textButton: ${vars.textButton};`,
  `${indent}--w3a-colors-colorBackground: ${vars.colorBackground};`,
  `${indent}--w3a-colors-surface: ${vars.surface};`,
  `${indent}--w3a-colors-surface2: ${vars.surface2};`,
  `${indent}--w3a-colors-surface3: ${vars.surface3};`,
  `${indent}--w3a-colors-surface4: ${vars.surface4};`,
  `${indent}--w3a-colors-primary: ${vars.primary};`,
  `${indent}--w3a-colors-primaryHover: ${vars.primaryHover};`,
  `${indent}--w3a-colors-secondary: ${vars.secondary};`,
  `${indent}--w3a-colors-secondaryHover: ${vars.secondaryHover};`,
  `${indent}--w3a-colors-accent: ${vars.accent};`,
  `${indent}--w3a-colors-buttonBackground: ${vars.buttonBackground};`,
  `${indent}--w3a-colors-buttonHoverBackground: ${vars.buttonHoverBackground};`,
  `${indent}--w3a-colors-hover: ${vars.hover};`,
  `${indent}--w3a-colors-active: ${vars.active};`,
  `${indent}--w3a-colors-focus: ${vars.focus};`,
  `${indent}--w3a-colors-success: ${vars.success};`,
  `${indent}--w3a-colors-warning: ${vars.warning};`,
  `${indent}--w3a-colors-error: ${vars.error};`,
  `${indent}--w3a-colors-info: ${vars.info};`,
  `${indent}--w3a-colors-borderPrimary: ${vars.borderPrimary};`,
  `${indent}--w3a-colors-borderSecondary: ${vars.borderSecondary};`,
  `${indent}--w3a-colors-borderHover: ${vars.borderHover};`,
  `${indent}--w3a-colors-backgroundGradientPrimary: ${vars.backgroundGradientPrimary};`,
  `${indent}--w3a-colors-backgroundGradientSecondary: ${vars.backgroundGradientSecondary};`,
  `${indent}--w3a-colors-backgroundGradient4: ${vars.backgroundGradient4};`,
  `${indent}--w3a-colors-highlightReceiverId: ${vars.highlightReceiverId};`,
  `${indent}--w3a-colors-highlightMethodName: ${vars.highlightMethodName};`,
  `${indent}--w3a-colors-highlightAmount: ${vars.highlightAmount};`,
];

const buildW3AComponentsCss = async (sdkRoot: string): Promise<string> => {
  const palettePath = path.join(sdkRoot, 'src/theme/palette.json');
  const paletteRaw = fs.readFileSync(palettePath, 'utf-8');
  const palette = JSON.parse(paletteRaw) as any;

  const baseStylesPath = path.join(sdkRoot, 'src/theme/base-styles.js');
  const base = await import(pathToFileURL(baseStylesPath).href);
  const { createThemeTokens } = base as any;
  const { DARK_THEME: darkVars, LIGHT_THEME: lightVars, CREAM_THEME: creamVars } = createThemeTokens(palette);

  const hostSelector = W3A_COMPONENT_HOSTS.join(',\n');
  const lines: string[] = [];

  lines.push('/* Generated from src/theme/palette.json + src/theme/base-styles.js. Do not edit by hand. */');
  lines.push(`${hostSelector} {`);
  lines.push(`  --w3a-modal__btn__focus-outline-color: ${darkVars?.focus || '#3b82f6'};`);
  lines.push('  --w3a-tree__file-content__scrollbar-track__background: rgba(255, 255, 255, 0.06);');
  lines.push('  --w3a-tree__file-content__scrollbar-thumb__background: rgba(255, 255, 255, 0.22);');

  const pushScale = (name: string, scale: Record<string, string>) => {
    Object.keys(scale || {}).forEach((k) => {
      lines.push(`  --w3a-${name}${k}: ${scale[k]};`);
    });
  };

  pushScale('grey', palette.grey || {});
  pushScale('slate', palette.slate || {});
  pushScale('cream', palette.cream || {});

  const exclude = new Set(['grey', 'slate', 'cream', 'gradients', 'tokens', 'themes']);
  Object.keys(palette)
    .filter((k) => !exclude.has(k))
    .forEach((fam) => {
      if (palette[fam] && typeof palette[fam] === 'object') pushScale(fam, palette[fam]);
    });

  Object.keys(palette.gradients || {}).forEach((name) => {
    lines.push(`  --w3a-gradient-${name}: ${palette.gradients[name]};`);
  });

  lines.push('');
  lines.push('  /* Default token aliases (dark) for hosts */');
  lines.push(...emitW3AThemeAliases(darkVars));
  lines.push('}');

  lines.push('');
  lines.push(':root {');
  lines.push(...emitW3AThemeAliases(darkVars, '  '));
  lines.push('}');
  lines.push('');
  lines.push(':root[data-w3a-theme="light"] {');
  lines.push(...emitW3AThemeAliases(lightVars, '  '));
  lines.push('}');
  lines.push('');
  lines.push(':root[data-w3a-theme="cream"] {');
  lines.push(...emitW3AThemeAliases(creamVars, '  '));
  lines.push('}');

  const themedSelLight = W3A_COMPONENT_HOSTS.map((s) => `:root[data-w3a-theme="light"] ${s}`).join(',\n');
  const themedSelCream = W3A_COMPONENT_HOSTS.map((s) => `:root[data-w3a-theme="cream"] ${s}`).join(',\n');

  lines.push('');
  lines.push(`${themedSelLight} {`);
  lines.push(...emitW3AThemeAliases(lightVars, '  '));
  lines.push('}');
  lines.push('');
  lines.push(`${themedSelCream} {`);
  lines.push(...emitW3AThemeAliases(creamVars, '  '));
  lines.push('}');

  return `${lines.join('\n')}\n`;
};

const emitWalletServiceStaticAssets = async (sdkRoot = process.cwd()): Promise<void> => {
  const sdkDir = path.join(sdkRoot, `${BUILD_PATHS.BUILD.ESM}/sdk`);
  fs.mkdirSync(sdkDir, { recursive: true });

  const writeFileIfMissing = (filePath: string, contents: string) => {
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, contents, 'utf-8');
  };

  const copyIfMissing = (src: string, dest: string) => {
    if (fs.existsSync(src) && !fs.existsSync(dest)) fs.copyFileSync(src, dest);
  };

  writeFileIfMissing(path.join(sdkDir, 'wallet-shims.js'), WALLET_SHIM_SOURCE);
  writeFileIfMissing(path.join(sdkDir, 'wallet-service.css'), WALLET_SURFACE_CSS);

  try {
    const w3aComponentsCss = await buildW3AComponentsCss(sdkRoot);
    fs.writeFileSync(path.join(sdkDir, 'w3a-components.css'), w3aComponentsCss, 'utf-8');
  } catch (e) {
    console.warn('⚠️  Failed to generate w3a-components.css from palette:', e);
    const src = path.join(sdkRoot, 'src/core/WebAuthnManager/LitComponents/css/w3a-components.css');
    const dest = path.join(sdkDir, 'w3a-components.css');
    if (fs.existsSync(src)) fs.copyFileSync(src, dest);
  }

  copyIfMissing(
    path.join(sdkRoot, 'src/core/WebAuthnManager/LitComponents/css/tx-tree.css'),
    path.join(sdkDir, 'tx-tree.css')
  );
  copyIfMissing(
    path.join(sdkRoot, 'src/core/WebAuthnManager/LitComponents/css/tx-confirmer.css'),
    path.join(sdkDir, 'tx-confirmer.css')
  );
  copyIfMissing(
    path.join(sdkRoot, 'src/core/WebAuthnManager/LitComponents/css/drawer.css'),
    path.join(sdkDir, 'drawer.css')
  );
  copyIfMissing(
    path.join(sdkRoot, 'src/core/WebAuthnManager/LitComponents/css/halo-border.css'),
    path.join(sdkDir, 'halo-border.css')
  );
  copyIfMissing(
    path.join(sdkRoot, 'src/core/WebAuthnManager/LitComponents/css/passkey-halo-loading.css'),
    path.join(sdkDir, 'passkey-halo-loading.css')
  );
  copyIfMissing(
    path.join(sdkRoot, 'src/core/WebAuthnManager/LitComponents/css/padlock-icon.css'),
    path.join(sdkDir, 'padlock-icon.css')
  );
  copyIfMissing(
    path.join(sdkRoot, 'src/core/WebAuthnManager/LitComponents/css/export-viewer.css'),
    path.join(sdkDir, 'export-viewer.css')
  );
  copyIfMissing(
    path.join(sdkRoot, 'src/core/WebAuthnManager/LitComponents/css/export-iframe.css'),
    path.join(sdkDir, 'export-iframe.css')
  );
  copyIfMissing(path.join(sdkRoot, 'src/core/WalletIframe/client/overlay.css'), path.join(sdkDir, 'overlay.css'));
  copyIfMissing(
    path.join(sdkRoot, 'src/core/OfflineExport/offline-export.css'),
    path.join(sdkDir, 'offline-export.css')
  );

  console.log('✅ Emitted /sdk wallet-shims.js and wallet-service.css');
};

const emitWalletServiceStaticPlugin = {
  name: 'emit-wallet-service-static',
  async generateBundle() {
    try {
      await emitWalletServiceStaticAssets();
    } catch (err) {
      console.warn('⚠️  Unable to emit wallet static assets:', err);
    }
  },
};

const copyWasmAsset = (source: string, destination: string, label: string): void => {
  if (!fs.existsSync(source)) {
    throw new Error(`Missing WASM source at ${source}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  console.log(label);
};

const configs = [
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
  // Plugins: headers helper ESM
  {
    input: 'src/plugins/headers.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.ESM}/plugins`,
      format: 'esm',
      entryFileNames: 'headers.js',
      sourcemap: true,
    },
    external,
    resolve: {
      alias: aliasConfig,
    },
  },
  // Plugins: headers helper CJS
  {
    input: 'src/plugins/headers.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.CJS}/plugins`,
      format: 'cjs',
      entryFileNames: 'headers.js',
      sourcemap: true,
      exports: 'named',
    },
    external,
    resolve: {
      alias: aliasConfig,
    },
  },
  // Plugins: Next helper ESM
  {
    input: 'src/plugins/next.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.ESM}/plugins`,
      format: 'esm',
      entryFileNames: 'next.js',
      sourcemap: true,
    },
    external,
    resolve: {
      alias: aliasConfig,
    },
  },
  // Plugins: Next helper CJS
  {
    input: 'src/plugins/next.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.CJS}/plugins`,
      format: 'cjs',
      entryFileNames: 'next.js',
      sourcemap: true,
      exports: 'named',
    },
    external,
    resolve: {
      alias: aliasConfig,
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
    input: [
      'src/react/index.ts',
      // Ensure public subpath entrypoints exist in dist even when re-exports are flattened.
      'src/react/components/PasskeyAuthMenu/passkeyAuthMenuCompat.ts',
      // Public subpath entrypoints (avoid treeshaking away default exports).
      'src/react/components/PasskeyAuthMenu/preload.ts',
      'src/react/components/PasskeyAuthMenu/shell.tsx',
      'src/react/components/PasskeyAuthMenu/skeleton.tsx',
      'src/react/components/PasskeyAuthMenu/client.tsx',
    ],
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
    input: [
      'src/react/index.ts',
      // Ensure public subpath entrypoints exist in dist even when re-exports are flattened.
      'src/react/components/PasskeyAuthMenu/passkeyAuthMenuCompat.ts',
      // Public subpath entrypoints (avoid treeshaking away default exports).
      'src/react/components/PasskeyAuthMenu/preload.ts',
      'src/react/components/PasskeyAuthMenu/shell.tsx',
      'src/react/components/PasskeyAuthMenu/skeleton.tsx',
      'src/react/components/PasskeyAuthMenu/client.tsx',
    ],
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
  // Chainsigs helper ESM build
  {
    input: 'src/chainsigs/index.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.ESM}/chainsigs`,
      format: 'esm',
      preserveModules: true,
      preserveModulesRoot: 'src/chainsigs',
      sourcemap: true,
    },
    external,
    resolve: {
      alias: aliasConfig,
    },
  },
  // Chainsigs helper CJS build
  {
    input: 'src/chainsigs/index.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.CJS}/chainsigs`,
      format: 'cjs',
      preserveModules: true,
      preserveModulesRoot: 'src/chainsigs',
      sourcemap: true,
      exports: 'named',
    },
    external,
    resolve: {
      alias: aliasConfig,
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
    // Minification is controlled via CLI flags; no config option in current Rolldown types
    plugins: prodPlugins,
  },
  // Wallet iframe host + confirmer bundles
  {
    input: {
      // Tx Confirmer component
      'w3a-tx-confirmer': 'src/core/WebAuthnManager/LitComponents/IframeTxConfirmer/tx-confirmer-wrapper.ts',
      // Wallet service host (headless)
      'wallet-iframe-host': 'src/core/WalletIframe/host/wallet-iframe-host.ts',
      // Extension popup host (top-level WebAuthn ceremony for chrome-extension:// iframe limitations)
      'wallet-popup-host': 'src/core/WalletIframe/host/chromeExtension/popup-host.ts',
      // Extension confirm popup host (TxConfirmer UI rendered in a top-level extension surface)
      'wallet-confirm-host': 'src/core/WalletIframe/host/chromeExtension/confirm-popup-host.ts',
      // Extension side panel host (React settings UI)
      'extension-sidepanel-host': 'src/core/WalletIframe/host/chromeExtension/extension-sidepanel-host.tsx',
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
    // Minification is controlled via CLI flags; no config option in current Rolldown types
    plugins: [
      ignoreCssImportsPlugin,
      ...prodPlugins,
      emitWalletServiceStaticPlugin,
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
    // Minification is controlled via CLI flags; no config option in current Rolldown types
    plugins: prodPlugins,
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
    // Minification is controlled via CLI flags; no config option in current Rolldown types
    plugins: prodPlugins,
  }
  ,
  // Offline Export App (minimal PWA route bootstrap)
  {
    input: 'src/core/OfflineExport/offline-export-app.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.ESM}/sdk`,
      format: 'esm',
      entryFileNames: 'offline-export-app.js',
      sourcemap: true,
    },
    external: embeddedExternal,
    resolve: {
      alias: aliasConfig,
    },
    plugins: prodPlugins,
  },
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
] satisfies import('rolldown').RolldownOptions[];

export default configs;
