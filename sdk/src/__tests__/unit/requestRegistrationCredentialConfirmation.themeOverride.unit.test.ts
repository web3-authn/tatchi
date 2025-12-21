import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest, handleInfrastructureErrors } from '../setup';

const IMPORT_PATHS = {
  handler: '/sdk/esm/core/WebAuthnManager/VrfWorkerManager/handlers/requestRegistrationCredentialConfirmation.js',
} as const;

test.describe('requestRegistrationCredentialConfirmation – theme override', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('forwards confirmationConfigOverride.theme to the modal confirmer', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      try {
        const mod = await import(paths.handler);
        const requestRegistrationCredentialConfirmation = mod.requestRegistrationCredentialConfirmation as Function;

        let reserved: string[] = [];
        let bootstrapCount = 0;

        const hostCtx: any = {
          userPreferencesManager: {
            getConfirmationConfig: () => ({
              uiMode: 'modal',
              behavior: 'autoProceed',
              autoProceedDelay: 250,
              theme: 'light',
            }),
            // Used defensively by some helpers; keep minimal
            getCurrentUserAccountId: () => '',
          },
          nonceManager: {
            async getNonceBlockHashAndHeight(_nearClient: any, opts?: any) {
              const force = !!opts?.force;
              return {
                nearPublicKeyStr: 'pk',
                accessKeyInfo: { nonce: 100 },
                nextNonce: force ? '201' : '101',
                txBlockHeight: force ? '2000' : '1000',
                txBlockHash: force ? 'hash1' : 'hash0',
              };
            },
            reserveNonces(n: number) {
              reserved = Array.from({ length: n }, (_, i) => String(101 + i));
              return reserved;
            },
            releaseNonce(_n: string) { },
          },
          nearClient: {
            async viewBlock() {
              return { header: { height: 1001, hash: 'hash-fallback' } };
            },
          },
          vrfWorkerManager: {
            async generateVrfKeypairBootstrap({ vrfInputData }: any) {
              bootstrapCount++;
              return {
                vrfChallenge: {
                  vrfInput: `input-${bootstrapCount}`,
                  vrfOutput: `out-${bootstrapCount}`,
                  vrfProof: `proof-${bootstrapCount}`,
                  vrfPublicKey: `vpk-${bootstrapCount}`,
                  userId: String(vrfInputData.userId || ''),
                  rpId: String(vrfInputData.rpId || ''),
                  blockHeight: String(vrfInputData.blockHeight || ''),
                  blockHash: String(vrfInputData.blockHash || ''),
                },
                vrfPublicKey: `vpk-${bootstrapCount}`,
              };
            },
          },
          touchIdPrompt: {
            getRpId: () => 'example.localhost',
            generateRegistrationCredentialsInternal: async () => ({
              id: 'reg-cred',
              type: 'public-key',
              rawId: new Uint8Array([1, 2, 3]).buffer,
              response: {
                clientDataJSON: new Uint8Array([1]).buffer,
                attestationObject: new Uint8Array([4]).buffer,
                getTransports: () => ['internal'],
              },
              getClientExtensionResults: () => ({
                prf: {
                  results: {
                    first: new Uint8Array(32).fill(8),
                    second: new Uint8Array(32).fill(9),
                  },
                },
              }),
            }) as any,
          },
          indexedDB: { clientDB: { getAuthenticatorsByUser: async () => [] } },
        };

        const handlerCtx: any = { getContext: () => hostCtx };

        const promise = requestRegistrationCredentialConfirmation(handlerCtx, {
          nearAccountId: 'bob.testnet',
          deviceNumber: 1,
          confirmationConfigOverride: { theme: 'dark' },
          contractId: 'web3-authn.testnet',
          nearRpcUrl: 'https://rpc.testnet.near.org',
        });

        // Wait for the confirmer wrapper element to mount; its `.theme` prop is set
        // synchronously by mountConfirmUI before insertion.
        let wrapper: HTMLElement | null = null;
        for (let i = 0; i < 100; i++) {
          wrapper = document.querySelector('w3a-tx-confirmer') as HTMLElement | null;
          if (wrapper) break;
          await new Promise((r) => setTimeout(r, 20));
        }
        const wrapperTheme = wrapper ? ((wrapper as any).theme ?? null) : null;

        const variantProp = wrapper ? ((wrapper as any).variant ?? null) : null;

        // Wait for the concrete modal/drawer element to render and reflect its theme attribute.
        let variantEl: HTMLElement | null = null;
        let variantTag: string | null = null;
        for (let i = 0; i < 100; i++) {
          const modal = document.querySelector('w3a-modal-tx-confirmer') as HTMLElement | null;
          const drawer = document.querySelector('w3a-drawer-tx-confirmer') as HTMLElement | null;
          variantEl = modal || drawer;
          variantTag = modal ? 'w3a-modal-tx-confirmer' : drawer ? 'w3a-drawer-tx-confirmer' : null;
          if (variantEl) break;
          await new Promise((r) => setTimeout(r, 20));
        }
        const variantThemeAttr = variantEl?.getAttribute('theme') || null;
        const variantThemeProp = variantEl ? ((variantEl as any).theme ?? null) : null;

        const payload = await promise;

        return {
          success: true,
          wrapperTheme,
          variantProp,
          variantTag,
          variantThemeAttr,
          variantThemeProp,
          reserved,
          hasCredential: !!payload?.credential,
          hasVrfChallenge: !!payload?.vrfChallenge,
          hasTxContext: !!payload?.transactionContext,
        };
      } catch (error: any) {
        return { success: false, error: error?.message, stack: error?.stack };
      }
    }, { paths: IMPORT_PATHS });

    if (!result.success) {
      if (handleInfrastructureErrors(result)) return;
      throw new Error(result.error || 'page.evaluate failed');
    }

    expect(result.wrapperTheme).toBe('dark');
    expect(result.variantProp === 'modal' || result.variantProp === 'drawer').toBe(true);
    // The rendered modal/drawer element should reflect the same theme attribute.
    expect(result.variantTag === 'w3a-modal-tx-confirmer' || result.variantTag === 'w3a-drawer-tx-confirmer').toBe(true);
    expect(result.variantThemeProp).toBe('dark');
    expect(result.reserved).toEqual(['101']);
    expect(result.hasCredential).toBe(true);
    expect(result.hasVrfChallenge).toBe(true);
    expect(result.hasTxContext).toBe(true);
  });
});
