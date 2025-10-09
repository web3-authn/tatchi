import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

const IMPORT_PATHS = {
  confirmUi: '/sdk/esm/core/WebAuthnManager/LitComponents/confirm-ui.js'
} as const;

test.describe('confirm-ui mountConfirmUI handle', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('host modal: handle.update and handle.close work', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.confirmUi);
      const { mountConfirmUI } = mod as typeof import('../../core/WebAuthnManager/LitComponents/confirm-ui');

      const ctx: any = {
        userPreferencesManager: {
          getCurrentUserAccountId: () => 'alice.testnet'
        },
      };

      const handle = await mountConfirmUI({
        ctx,
        summary: { intentDigest: 'digest' } as any,
        txSigningRequests: [],
        vrfChallenge: {
          vrfOutput: 'o',
          vrfProof: 'p',
          blockHeight: '1',
          blockHash: 'h'
        } as any,
        loading: true,
        theme: 'dark',
        uiMode: 'modal',
        nearAccountIdOverride: 'alice.testnet',
      });

      const portal = document.getElementById('w3a-confirm-portal');
      const initialEl = portal?.firstElementChild as HTMLElement | null;
      const initial = !!initialEl && (getComputedStyle(initialEl).display !== 'none');

      // Update loading to false and set error message
      handle.update({ loading: false, errorMessage: 'Oops' });
      const el = document.getElementById('w3a-confirm-portal')?.firstElementChild as HTMLElement | null;
      const updated = {
        hasPortal: !!portal,
        hasChild: !!el,
        loading: el ? (el as any).loading : undefined,
        errorMessage: el ? (el as any).errorMessage : undefined,
        dataError: el ? el.getAttribute('data-error-message') : undefined,
      };

      // Close should remove the element
      handle.close(true);
      const afterClose = {
        portalExists: !!document.getElementById('w3a-confirm-portal'),
        childCount: (document.getElementById('w3a-confirm-portal')?.childElementCount) || 0
      };

      return { initial, updated, afterClose };
    }, { paths: IMPORT_PATHS });

    expect(result.initial).toBe(true);
    expect(result.updated.hasPortal).toBe(true);
    expect(result.updated.hasChild).toBe(true);
    expect(result.updated.loading).toBe(false);
    expect(result.updated.errorMessage).toBe('Oops');
    expect(result.updated.dataError).toBe('Oops');
    expect(result.afterClose.portalExists).toBe(true);
    expect(result.afterClose.childCount).toBe(0);
  });

  test('host drawer: mount + update theme and loading', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.confirmUi);
      const { mountConfirmUI } = mod as typeof import('../../core/WebAuthnManager/LitComponents/confirm-ui');

      const ctx: any = {
        userPreferencesManager: {
          getCurrentUserAccountId: () => 'bob.testnet'
        },
      };

      const handle = await mountConfirmUI({
        ctx,
        summary: { intentDigest: 'digest' } as any,
        txSigningRequests: [],
        vrfChallenge: {
          vrfOutput: 'o',
          vrfProof: 'p',
          blockHeight: '1',
          blockHash: 'h'
        } as any,
        loading: true,
        theme: 'light',
        uiMode: 'drawer',
        nearAccountIdOverride: 'bob.testnet',
      });

      const portal = document.getElementById('w3a-confirm-portal');
      const initialEl = portal?.firstElementChild as any;
      const exists = !!initialEl;
      handle.update({ loading: false, theme: 'dark' });
      const el = document.getElementById('w3a-confirm-portal')?.firstElementChild as any;
      const stillThere = !!el;
      const afterUpdate = {
        loading: el ? el.loading : undefined,
        theme: el ? el.theme : undefined,
      };
      handle.close(false);
      const gone = (document.getElementById('w3a-confirm-portal')?.childElementCount || 0) === 0;
      return { exists, stillThere, gone, afterUpdate };
    }, { paths: IMPORT_PATHS });

    expect(result.exists).toBe(true);
    expect(result.stillThere).toBe(true);
    expect(result.gone).toBe(true);
    expect(result.afterUpdate.loading).toBe(false);
    expect(result.afterUpdate.theme).toBe('dark');
  });

  test('inline drawer: handle.update reflects loading, theme, error message', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.confirmUi);
      const { mountConfirmUI } = mod as typeof import('../../core/WebAuthnManager/LitComponents/confirm-ui');

      const ctx: any = {
        userPreferencesManager: {
          getCurrentUserAccountId: () => 'carol.testnet'
        },
      };

      const handle = await mountConfirmUI({
        ctx,
        summary: { intentDigest: 'digest' } as any,
        txSigningRequests: [],
        vrfChallenge: {
          vrfOutput: 'o',
          vrfProof: 'p',
          blockHeight: '1',
          blockHash: 'h'
        } as any,
        loading: true,
        theme: 'light',
        uiMode: 'drawer',
        nearAccountIdOverride: 'carol.testnet',
      });

      const portal = document.getElementById('w3a-confirm-portal');
      const initialEl = portal?.firstElementChild as any;
      const exists = !!initialEl;
      handle.update({ loading: false, theme: 'dark', errorMessage: 'Denied' });
      const el = document.getElementById('w3a-confirm-portal')?.firstElementChild as any;
      (el as any)?.requestUpdate?.();
      await new Promise((resolve) => setTimeout(resolve, 20));
      const portalChild = document.getElementById('w3a-confirm-portal')?.firstElementChild as any;
      const variantEl = portalChild && portalChild.tagName?.toLowerCase() === 'w3a-drawer-tx-confirmer'
        ? portalChild
        : portalChild?.querySelector?.('w3a-drawer-tx-confirmer');
      const afterUpdate = {
        dataError: portalChild ? portalChild.getAttribute?.('data-error-message') : undefined,
      };
      handle.close(true);
      const gone = (document.getElementById('w3a-confirm-portal')?.childElementCount || 0) === 0;
      return { exists, afterUpdate, gone };
    }, { paths: IMPORT_PATHS });

    expect(result.exists).toBe(true);
    expect(result.afterUpdate.dataError).toBe('Denied');
    expect(result.gone).toBe(true);
  });
});
