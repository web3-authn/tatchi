import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import React from 'react';
import { renderToString } from 'react-dom/server';

test.describe('SSR sanity: PasskeyAuthMenuSkeleton', () => {
  test('imports public subpath and renders without window', async () => {
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const distMarkerCandidates = [
      path.resolve(here, '../../../dist/esm/react/components/PasskeyAuthMenu/passkeyAuthMenuCompat.js'),
      path.resolve(here, '../../../dist/cjs/react/components/PasskeyAuthMenu/passkeyAuthMenuCompat.js'),
    ];
    test.skip(
      distMarkerCandidates.every((p) => !fs.existsSync(p)),
      `SDK dist not found at ${distMarkerCandidates[0]}; run pnpm -C sdk build`
    );

    expect(typeof (globalThis as any).window).toBe('undefined');

    // Use a non-literal dynamic import to avoid TypeScript self-reference resolution
    // (which requires rootDir disambiguation for this package).
    const subpath: string = '@tatchi-xyz/sdk/react/passkey-auth-menu';
    const mod: any = await import(subpath);
    expect(mod).toHaveProperty('PasskeyAuthMenuSkeleton');
    expect(typeof mod.PasskeyAuthMenuSkeleton).toBe('function');

    const html = renderToString(React.createElement(mod.PasskeyAuthMenuSkeleton));
    expect(html).toContain('w3a-signup-menu-root');

    expect(typeof (globalThis as any).window).toBe('undefined');
  });
});
