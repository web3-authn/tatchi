import type { ConfirmationConfig } from '../../../types/signer-worker';
import type { SignerWorkerManagerContext } from '../index';
import type { SecureConfirmRequest } from './types';

/**
 * determineConfirmationConfig
 *
 * Computes the effective confirmation UI behavior used by the secure‑confirmation
 * flow by merging inputs and applying safe runtime rules.
 *
 * Order of precedence (highest → lowest):
 * 1) Request‑level override (request.confirmationConfig), when explicitly set.
 * 2) User preferences stored in the wallet host (from IndexedDB via ctx.userPreferencesManager).
 * 3) Runtime safety rules (wallet‑iframe registration/link flows) that may clamp behavior.
 *
 * Wallet‑iframe registration/link safety rule:
 * - We allow callers to explicitly opt‑in to auto‑proceed (or skip) for these flows
 *   when they already captured a fresh activation inside the wallet iframe (e.g., via a
 *   host-rendered embedded control). This keeps the default safe, while
 *   enabling a one‑click UX for trusted entry points.
 *   Concretely: if the effective config resolves to { uiMode: 'skip' } or
 *   { uiMode: 'modal', behavior: 'autoProceed' }, we honor it; otherwise we clamp to
 *   { uiMode: 'modal', behavior: 'requireClick' } for registration/link flows.
 *
 * Notes
 * - The function is pure (does not mutate the input object) and safe to call multiple times.
 * - Theme and unrelated visual options are preserved in all cases.
 */
export function determineConfirmationConfig(
  ctx: SignerWorkerManagerContext,
  request: SecureConfirmRequest | undefined,
): ConfirmationConfig {
  // Merge request‑level override over user preferences
  let cfg: ConfirmationConfig = {
    ...ctx.userPreferencesManager.getConfirmationConfig(),
    ...request?.confirmationConfig,
  };
  // Default decrypt-private-key confirmations to 'skip' UI. The flow collects
  // WebAuthn credentials silently and the worker may follow up with a
  // SHOW_SECURE_PRIVATE_KEY_UI request to display the key.
  if (request?.type === 'decryptPrivateKeyWithPrf') {
    return {
      uiMode: 'skip',
      behavior: cfg.behavior,
      autoProceedDelay: cfg.autoProceedDelay,
      theme: cfg.theme || 'dark',
    } as ConfirmationConfig;
  }
  // Detect if running inside an iframe (wallet host context)
  const inIframe = (() => {
    try { return window.self !== window.top; } catch { return true; }
  })();

  // In wallet‑iframe host context: registration/link flows default to an explicit click.
  // However, if the effective config explicitly opts into auto‑proceed (or skip), honor it.
  if (inIframe && request?.type && (request.type === 'registerAccount' || request.type === 'linkDevice')) {
    const wantsSkip = cfg.uiMode === 'skip';
    const wantsAutoProceed = (cfg.uiMode === 'modal' && cfg.behavior === 'autoProceed');
    if (!(wantsSkip || wantsAutoProceed)) {
      return {
        uiMode: 'modal',
        behavior: 'requireClick',
        autoProceedDelay: undefined,
        theme: cfg.theme || 'dark',
      } as ConfirmationConfig;
    }
    // Otherwise, caller explicitly requested auto‑proceed/skip; return cfg as is.
    return cfg;
  }

  // Otherwise honor caller/user configuration
  return cfg;
}
