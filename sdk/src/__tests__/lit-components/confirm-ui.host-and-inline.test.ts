import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';
import { waitFor as harnessWaitFor } from '../wallet-iframe/harness';

const VRF = {
  vrfOutput: 'out',
  vrfProof: 'proof',
  blockHeight: '1',
  blockHash: 'h'
};

const SUMMARY = { intentDigest: 'intent-xyz' } as any;
const WAIT_FOR_SOURCE = `(${harnessWaitFor.toString()})`;
const IMPORT_PATHS = {
  confirmUi: '/sdk/esm/core/WebAuthnManager/LitComponents/confirm-ui.js',
  events: '/sdk/esm/core/WalletIframe/events.js'
} as const;

function buildCtxStub(overrides: Record<string, unknown> = {}) {
  return {
    userPreferencesManager: {
      getCurrentUserAccountId: () => 'alice.testnet',
      getConfirmationConfig: () => ({
        uiMode: 'modal',
        behavior: 'requireClick',
        autoProceedDelay: 0,
        theme: 'dark'
      })
    },
    ...overrides,
  } as any;
}

test.describe('confirm-ui inline confirmer', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('modal confirm resolves with confirmed=true', async ({ page }) => {
    const result = await page.evaluate(async ({ vrf, summary, waitForSource, paths }) => {
      const waitFor = eval(waitForSource) as typeof harnessWaitFor;
      const mod = await import(paths.confirmUi);
      const events = await import(paths.events);
      const { awaitConfirmUIDecision } = mod as typeof import('../../core/WebAuthnManager/LitComponents/confirm-ui');
      const buildCtxStub = (overrides: Record<string, unknown> = {}) => ({
        userPreferencesManager: {
          getCurrentUserAccountId: () => 'alice.testnet',
          getConfirmationConfig: () => ({
            uiMode: 'modal',
            behavior: 'requireClick',
            autoProceedDelay: 0,
            theme: 'dark'
          })
        },
        ...overrides,
      });
      const ctx = (window as any).ctxStub || ((window as any).ctxStub = buildCtxStub());

      const decisionPromise = awaitConfirmUIDecision({
        ctx: ctx as any,
        summary,
        txSigningRequests: [],
        vrfChallenge: vrf as any,
        theme: 'dark',
        uiMode: 'modal',
        nearAccountIdOverride: 'alice.testnet',
      });

      await waitFor(() => !!document.getElementById('w3a-confirm-portal')?.firstElementChild);
      const portalChild = document.getElementById('w3a-confirm-portal')?.firstElementChild as HTMLElement | null;
      await waitFor(() => !!portalChild?.querySelector?.('w3a-drawer-tx-confirmer'));
      portalChild?.dispatchEvent(new CustomEvent(
        events.WalletIframeDomEvents.TX_CONFIRMER_CONFIRM,
        { detail: { confirmed: true }, bubbles: true, composed: true } as any
      ));

      const { confirmed } = await decisionPromise;
      return { confirmed };
    }, { vrf: VRF, summary: SUMMARY, waitForSource: WAIT_FOR_SOURCE, paths: IMPORT_PATHS });

    expect(result.confirmed).toBe(true);
  });

  test('drawer cancel resolves with confirmed=false', async ({ page }) => {
    const result = await page.evaluate(async ({ vrf, summary, waitForSource, paths }) => {
      const waitFor = eval(waitForSource) as typeof harnessWaitFor;
      const mod = await import(paths.confirmUi);
      const events = await import(paths.events);
      const { awaitConfirmUIDecision } = mod as typeof import('../../core/WebAuthnManager/LitComponents/confirm-ui');
      const buildCtxStub = (overrides: Record<string, unknown> = {}) => ({
        userPreferencesManager: {
          getCurrentUserAccountId: () => 'alice.testnet',
          getConfirmationConfig: () => ({
            uiMode: 'modal',
            behavior: 'requireClick',
            autoProceedDelay: 0,
            theme: 'dark'
          }),
        },
        ...overrides,
      });
      const ctx = (window as any).ctxStub || ((window as any).ctxStub = buildCtxStub({
        userPreferencesManager: {
          getCurrentUserAccountId: () => 'alice.testnet',
          getConfirmationConfig: () => ({
            uiMode: 'drawer',
            behavior: 'requireClick',
            autoProceedDelay: 0,
            theme: 'dark'
          })
        }
      }));

      const decisionPromise = awaitConfirmUIDecision({
        ctx: ctx as any,
        summary,
        txSigningRequests: [],
        vrfChallenge: vrf as any,
        theme: 'dark',
        uiMode: 'drawer',
        nearAccountIdOverride: 'alice.testnet',
      });

      await waitFor(() => !!document.getElementById('w3a-confirm-portal')?.firstElementChild);
      const portalChild = document.getElementById('w3a-confirm-portal')?.firstElementChild as HTMLElement | null;
      portalChild?.dispatchEvent(new CustomEvent(
        events.WalletIframeDomEvents.TX_CONFIRMER_CANCEL,
        { bubbles: true, composed: true } as any
      ));

      const { confirmed } = await decisionPromise;
      return { confirmed };
    }, { vrf: VRF, summary: SUMMARY, waitForSource: WAIT_FOR_SOURCE, paths: IMPORT_PATHS });

    expect(result.confirmed).toBe(false);
  });

  test('drawer confirm renders inline wrapper (no iframe fallback)', async ({ page }) => {
    const result = await page.evaluate(async ({ vrf, summary, waitForSource, paths }) => {
      const waitFor = eval(waitForSource) as typeof harnessWaitFor;
      const mod = await import(paths.confirmUi);
      const events = await import(paths.events);
      const { awaitConfirmUIDecision } = mod as typeof import('../../core/WebAuthnManager/LitComponents/confirm-ui');
      const buildCtxStub = (overrides: Record<string, unknown> = {}) => ({
        userPreferencesManager: {
          getCurrentUserAccountId: () => 'alice.testnet',
          getConfirmationConfig: () => ({
            uiMode: 'modal',
            behavior: 'requireClick',
            autoProceedDelay: 0,
            theme: 'dark'
          }),
        },
        ...overrides,
      });
      const ctx = (window as any).ctxStub || ((window as any).ctxStub = buildCtxStub());

      const decisionPromise = awaitConfirmUIDecision({
        ctx: ctx as any,
        summary,
        txSigningRequests: [],
        vrfChallenge: vrf as any,
        theme: 'light',
        uiMode: 'drawer',
        nearAccountIdOverride: 'alice.testnet',
      });

      await waitFor(() => !!document.getElementById('w3a-confirm-portal')?.firstElementChild);
      const portalChild = document.getElementById('w3a-confirm-portal')?.firstElementChild as HTMLElement | null;
      portalChild?.dispatchEvent(new CustomEvent(
        events.WalletIframeDomEvents.TX_CONFIRMER_CONFIRM,
        { detail: { confirmed: true }, bubbles: true, composed: true } as any
      ));

      const { confirmed } = await decisionPromise;
      const tagName = portalChild?.tagName;
      const variantAttr = portalChild?.getAttribute?.('variant');
      const hasIframe = !!document.querySelector('iframe');
      return { confirmed, tagName, variantAttr, hasIframe };
    }, { vrf: VRF, summary: SUMMARY, waitForSource: WAIT_FOR_SOURCE, paths: IMPORT_PATHS });

    expect(result.confirmed).toBe(true);
    expect(result.tagName).toBe('W3A-TX-CONFIRMER');
    expect(result.variantAttr ?? 'drawer').toBe('drawer');
    expect(result.hasIframe).toBe(false);
  });
});
