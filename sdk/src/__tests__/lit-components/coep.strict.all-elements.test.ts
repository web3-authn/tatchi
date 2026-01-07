import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { setupBasicPasskeyTest } from '../setup';
import { ensureComponentModule, mountComponent } from './harness';

type ElementCase = {
  name: string;
  modulePath: string;
  tagName: string;
  mount?: {
    attributes?: Record<string, string>;
    props?: Record<string, unknown>;
  };
};

function findExportIframeHostBundleFromDistRoot(distRoot: string): string | null {
  const distSdkDir = path.join(distRoot, 'esm', 'sdk');
  const files = fs.readdirSync(distSdkDir).filter((f) => f.endsWith('.js'));
  const matches: Array<{ file: string; content: string }> = [];
  for (const file of files) {
    // Avoid scanning huge bundles unless necessary
    if (!file.startsWith('iframe-host-')) continue;
    const full = path.join(distSdkDir, file);
    try {
      const content = fs.readFileSync(full, 'utf8');
      if (content.includes('W3A_EXPORT_VIEWER_IFRAME_ID')) {
        matches.push({ file, content });
      }
    } catch {}
  }
  if (!matches.length) return null;
  // Prefer the variant that reuses the shared tags chunk (more likely to exist across builds).
  const preferred = matches.find((m) => /from\s+["']\.\/tags-/.test(m.content));
  return `/sdk/${(preferred ?? matches[0]).file}`;
}

test('COEP strict: all Lit elements define + upgrade without COEP/CORP violations', async ({ page }) => {
  test.setTimeout(120_000);
  if (process.env.VITE_COEP_MODE !== 'strict') {
    test.skip(true, 'VITE_COEP_MODE is not strict');
  }

  const coepConsoleErrors: string[] = [];
  const coepPageErrors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text() || '';
    if (/Cross-Origin-(Embedder|Resource)-Policy|COEP|CORP|blocked\b/i.test(text)) {
      coepConsoleErrors.push(text);
    }
  });
  page.on('pageerror', (err) => {
    const text = String((err as any)?.message || err || '');
    if (/Cross-Origin-(Embedder|Resource)-Policy|COEP|CORP|blocked\b/i.test(text)) {
      coepPageErrors.push(text);
    }
  });

  // Keep this lightweight: we only need the app page loaded under the correct headers.
  await setupBasicPasskeyTest(page, { skipPasskeyManagerInit: true });

  const origin = (() => {
    try { return new URL(page.url()).origin; } catch { return ''; }
  })();
  expect(origin).not.toBe('');

  const docResp = await page.request.get(`${origin}/`);
  expect(docResp.ok()).toBeTruthy();
  const headers = docResp.headers();
  expect(headers['cross-origin-embedder-policy']).toBe('require-corp');
  expect(headers['cross-origin-opener-policy']).toBe('same-origin');

  const isolated = await page.evaluate(() => window.crossOriginIsolated);
  expect(isolated).toBe(true);

  // Discover the actual SDK dist root served by the dev server (debug route),
  // then pick the export-iframe-host chunk from that folder. This avoids
  // mismatches when pnpm links the SDK into multiple locations.
  const sdkRootResp = await page.request.get(`${origin}/__sdk-root`);
  expect(sdkRootResp.ok(), `expected /__sdk-root debug route to exist at ${origin} (${sdkRootResp.status()})`).toBeTruthy();
  const sdkDistRoot = (await sdkRootResp.text()).trim();
  expect(sdkDistRoot, 'expected /__sdk-root to return a dist root path').not.toBe('');

  const exportIframeHostBundle = findExportIframeHostBundleFromDistRoot(sdkDistRoot);
  expect(exportIframeHostBundle, `export iframe host bundle not found in ${path.join(sdkDistRoot, 'esm', 'sdk')}`).not.toBeNull();
  {
    const resp = await page.request.get(`${origin}${exportIframeHostBundle}`);
    expect(resp.ok(), `export iframe host bundle not reachable: ${origin}${exportIframeHostBundle} (${resp.status()})`).toBeTruthy();
    const ct = resp.headers()['content-type'] || '';
    expect(ct.toLowerCase(), `export iframe host bundle has unexpected content-type: ${ct}`).toContain('javascript');
  }

  // Prefer public/stable SDK bundles under `/sdk/*` (these are what integrators load).
  // - `w3a-tx-confirmer.js` pulls in confirmer variants + their internal Lit elements.
  // - `export-private-key-viewer.js` defines the export viewer element.
  const CASES: ElementCase[] = [
    // This wrapper bundle is what integrators typically load; it pulls in the confirmer variants
    // and their internal Lit element definitions (drawer/tree/halo/loading/etc).
    { name: 'TxConfirmerWrapper', modulePath: '/sdk/w3a-tx-confirmer.js', tagName: 'w3a-tx-confirmer' },
    { name: 'Drawer', modulePath: '/sdk/w3a-tx-confirmer.js', tagName: 'w3a-drawer' },
    { name: 'TxTree', modulePath: '/sdk/w3a-tx-confirmer.js', tagName: 'w3a-tx-tree' },
    { name: 'TxConfirmContent', modulePath: '/sdk/w3a-tx-confirmer.js', tagName: 'w3a-tx-confirm-content' },
    { name: 'ModalTxConfirmer', modulePath: '/sdk/w3a-tx-confirmer.js', tagName: 'w3a-modal-tx-confirmer' },
    { name: 'DrawerTxConfirmer', modulePath: '/sdk/w3a-tx-confirmer.js', tagName: 'w3a-drawer-tx-confirmer' },
    { name: 'HaloBorder', modulePath: '/sdk/w3a-tx-confirmer.js', tagName: 'w3a-halo-border' },
    { name: 'PasskeyHaloLoading', modulePath: '/sdk/w3a-tx-confirmer.js', tagName: 'w3a-passkey-halo-loading' },
    { name: 'PadlockIcon', modulePath: '/sdk/w3a-tx-confirmer.js', tagName: 'w3a-padlock-icon' },
    { name: 'ExportPrivateKeyViewer', modulePath: '/sdk/export-private-key-viewer.js', tagName: 'w3a-export-key-viewer' },
    {
      name: 'ExportViewerIframeHost',
      modulePath: exportIframeHostBundle as string,
      tagName: 'w3a-export-viewer-iframe',
      mount: { props: { theme: 'dark', variant: 'drawer', accountId: 'demo.testnet', publicKey: 'ed25519:demo' } },
    },
  ];

  for (const c of CASES) {
    await ensureComponentModule(page, { modulePath: c.modulePath, tagName: c.tagName });

    await mountComponent(page, {
      tagName: c.tagName,
      attributes: c.mount?.attributes,
      props: c.mount?.props,
      containerId: 'coep-all-lit-elements',
    });

    // Assert the custom element upgrades (constructor isn't plain HTMLElement).
    await page.waitForFunction((tag) => {
      const el = document.querySelector(tag) as any;
      return !!el && el.constructor !== HTMLElement;
    }, c.tagName);

    // If this is a Lit element, wait for its first render cycle.
    await page.evaluate(async (tag) => {
      const el = document.querySelector(tag) as any;
      const p = el?.updateComplete;
      if (p && typeof p.then === 'function') {
        await p;
      } else {
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
      }
    }, c.tagName);
  }

  expect(coepConsoleErrors, 'COEP/CORP-related console errors').toEqual([]);
  expect(coepPageErrors, 'COEP/CORP-related page errors').toEqual([]);
});
