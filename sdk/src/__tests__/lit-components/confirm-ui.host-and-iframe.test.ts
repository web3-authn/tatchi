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

function buildCtxStub() {
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
    iframeModeDefault: false,
  } as any;
}

test.describe('confirm-ui host vs iframe', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('host modal: confirm resolves with confirmed=true', async ({ page }) => {
    const result = await page.evaluate(async ({ vrf, summary, waitForSource, paths }) => {
      const waitFor = eval(waitForSource) as typeof harnessWaitFor;
      const mod = await import(paths.confirmUi);
      const events = await import(paths.events);
      const { awaitConfirmUIDecision } = mod as typeof import('../../core/WebAuthnManager/LitComponents/confirm-ui');
      const ctx = (window as any).ctxStub || ((window as any).ctxStub = ({}));
      Object.assign(ctx, {
        userPreferencesManager: {
          getCurrentUserAccountId: () => 'alice.testnet',
          getConfirmationConfig: () => ({
            uiMode: 'modal',
            behavior: 'requireClick',
            autoProceedDelay: 0,
            theme: 'dark'
          })
        },
        iframeModeDefault: false,
      });

      const decision = awaitConfirmUIDecision({
        ctx: ctx as any,
        summary,
        txSigningRequests: [],
        vrfChallenge: vrf as any,
        theme: 'dark',
        uiMode: 'modal',
        nearAccountIdOverride: 'alice.testnet',
        useIframe: false,
      });

      await waitFor(() => !!document.getElementById('w3a-confirm-portal')?.firstElementChild);
      const el = document.getElementById('w3a-confirm-portal')?.firstElementChild as HTMLElement | null;
      el?.dispatchEvent(new CustomEvent(
        events.WalletIframeDomEvents.TX_CONFIRMER_CONFIRM,
        { bubbles: true, composed: true } as any
      ));

      const { confirmed } = await decision;
      return { confirmed };
    }, { vrf: VRF, summary: SUMMARY, waitForSource: WAIT_FOR_SOURCE, paths: IMPORT_PATHS });

    expect(result.confirmed).toBe(true);
  });

  test('host drawer: cancel resolves with confirmed=false', async ({ page }) => {
    const result = await page.evaluate(async ({ vrf, summary, waitForSource, paths }) => {
      const waitFor = eval(waitForSource) as typeof harnessWaitFor;
      const mod = await import(paths.confirmUi);
      const events = await import(paths.events);
      const { awaitConfirmUIDecision } = mod as typeof import('../../core/WebAuthnManager/LitComponents/confirm-ui');
      const ctx = (window as any).ctxStub || ((window as any).ctxStub = ({}));
      Object.assign(ctx, {
        userPreferencesManager: {
          getCurrentUserAccountId: () => 'alice.testnet',
          getConfirmationConfig: () => ({
            uiMode: 'drawer',
            behavior: 'requireClick',
            autoProceedDelay: 0,
            theme: 'dark'
          })
        },
        iframeModeDefault: false,
      });

      const decision = awaitConfirmUIDecision({
        ctx: ctx as any,
        summary,
        txSigningRequests: [],
        vrfChallenge: vrf as any,
        theme: 'dark',
        uiMode: 'drawer',
        nearAccountIdOverride: 'alice.testnet',
        useIframe: false,
      });

      await waitFor(() => !!document.getElementById('w3a-confirm-portal')?.firstElementChild);
      const el = document.getElementById('w3a-confirm-portal')?.firstElementChild as HTMLElement | null;
      el?.dispatchEvent(new CustomEvent(
        events.WalletIframeDomEvents.TX_CONFIRMER_CANCEL,
        { bubbles: true, composed: true } as any
      ));

      const { confirmed } = await decision;
      return { confirmed };
    }, { vrf: VRF, summary: SUMMARY, waitForSource: WAIT_FOR_SOURCE, paths: IMPORT_PATHS });

    expect(result.confirmed).toBe(false);
  });

  test('iframe modal: confirm resolves with confirmed=true', async ({ page }) => {
    const result = await page.evaluate(async ({ vrf, summary, waitForSource, paths }) => {
      const waitFor = eval(waitForSource) as typeof harnessWaitFor;
      const mod = await import(paths.confirmUi);
      const events = await import(paths.events);
      const { awaitConfirmUIDecision } = mod as typeof import('../../core/WebAuthnManager/LitComponents/confirm-ui');
      const ctx = (window as any).ctxStub || ((window as any).ctxStub = ({}));
      Object.assign(ctx, {
        userPreferencesManager: {
          getCurrentUserAccountId: () => 'alice.testnet',
        },
        iframeModeDefault: true,
      });

      const decision = awaitConfirmUIDecision({
        ctx: ctx as any,
        summary,
        txSigningRequests: [],
        vrfChallenge: vrf as any,
        theme: 'dark',
        uiMode: 'modal',
        nearAccountIdOverride: 'alice.testnet',
        useIframe: true,
      });

      await waitFor(() => !!document.getElementById('w3a-confirm-portal')?.firstElementChild);
      const el = document.getElementById('w3a-confirm-portal')?.firstElementChild as HTMLElement | null;
      el?.dispatchEvent(new CustomEvent(
        events.WalletIframeDomEvents.TX_CONFIRMER_CONFIRM,
        { detail: { confirmed: true }, bubbles: true, composed: true } as any
      ));

      const { confirmed } = await decision;
      return { confirmed };
    }, { vrf: VRF, summary: SUMMARY, waitForSource: WAIT_FOR_SOURCE, paths: IMPORT_PATHS });

    expect(result.confirmed).toBe(true);
  });

  test('iframe drawer: confirm resolves with confirmed=true', async ({ page }) => {
    const result = await page.evaluate(async ({ vrf, summary, waitForSource, paths }) => {
      const waitFor = eval(waitForSource) as typeof harnessWaitFor;
      const mod = await import(paths.confirmUi);
      const events = await import(paths.events);
      const { awaitConfirmUIDecision } = mod as typeof import('../../core/WebAuthnManager/LitComponents/confirm-ui');
      const ctx = (window as any).ctxStub || ((window as any).ctxStub = ({}));
      Object.assign(ctx, {
        userPreferencesManager: {
          getCurrentUserAccountId: () => 'alice.testnet',
        },
        iframeModeDefault: true,
      });

      const decision = awaitConfirmUIDecision({
        ctx: ctx as any,
        summary,
        txSigningRequests: [],
        vrfChallenge: vrf as any,
        theme: 'light',
        uiMode: 'drawer',
        nearAccountIdOverride: 'alice.testnet',
        useIframe: true,
      });

      await waitFor(() => !!document.getElementById('w3a-confirm-portal')?.firstElementChild);
      const host = document.getElementById('w3a-confirm-portal')?.firstElementChild as HTMLElement | null;
      host?.dispatchEvent(new CustomEvent(
        events.WalletIframeDomEvents.TX_CONFIRMER_CONFIRM,
        { detail: { confirmed: true }, bubbles: true, composed: true } as any
      ));

      const { confirmed } = await decision;
      const el = document.getElementById('w3a-confirm-portal')?.firstElementChild as HTMLElement | null;
      const variant = el ? (el as any).variant || el.getAttribute('variant') : null;
      return { confirmed, variant };
    }, { vrf: VRF, summary: SUMMARY, waitForSource: WAIT_FOR_SOURCE, paths: IMPORT_PATHS });

    expect(result.confirmed).toBe(true);
    expect(result.variant).toBe('drawer');
  });

  test('iframe drawer: cancel resolves with confirmed=false', async ({ page }) => {
    const result = await page.evaluate(async ({ vrf, summary, waitForSource, paths }) => {
      const waitFor = eval(waitForSource) as typeof harnessWaitFor;
      const mod = await import(paths.confirmUi);
      const events = await import(paths.events);
      const { awaitConfirmUIDecision } = mod as typeof import('../../core/WebAuthnManager/LitComponents/confirm-ui');
      const ctx = (window as any).ctxStub || ((window as any).ctxStub = ({}));
      Object.assign(ctx, {
        userPreferencesManager: {
          getCurrentUserAccountId: () => 'alice.testnet',
        },
        iframeModeDefault: true,
      });

      const decision = awaitConfirmUIDecision({
        ctx: ctx as any,
        summary,
        txSigningRequests: [],
        vrfChallenge: vrf as any,
        theme: 'light',
        uiMode: 'drawer',
        nearAccountIdOverride: 'alice.testnet',
        useIframe: true,
      });

      await waitFor(() => !!document.getElementById('w3a-confirm-portal')?.firstElementChild);
      const el = document.getElementById('w3a-confirm-portal')?.firstElementChild as HTMLElement | null;
      el?.dispatchEvent(new CustomEvent(
        events.WalletIframeDomEvents.TX_CONFIRMER_CANCEL,
        { bubbles: true, composed: true } as any
      ));

      const { confirmed } = await decision;
      return { confirmed };
    }, { vrf: VRF, summary: SUMMARY, waitForSource: WAIT_FOR_SOURCE, paths: IMPORT_PATHS });

    expect(result.confirmed).toBe(false);
  });
});
