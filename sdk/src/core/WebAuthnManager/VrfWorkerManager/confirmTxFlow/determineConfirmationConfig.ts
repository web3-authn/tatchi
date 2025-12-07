import type { ConfirmationConfig } from '../../../types/signer-worker';
import type { VrfWorkerManagerContext } from '../';
import type { SecureConfirmRequest } from './types';
import { SecureConfirmationType } from './types';
import { isIOS, isMobileDevice, needsExplicitActivation } from '@/utils';

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
  ctx: VrfWorkerManagerContext,
  request: SecureConfirmRequest | undefined,
): ConfirmationConfig {

  // Merge request‑level override over user preferences
  // Important: drop undefined/null fields from the override so they don't clobber
  // persisted preferences (e.g., behavior) with an undefined value.
  const configBase = ctx.userPreferencesManager.getConfirmationConfig();
  const rawOverride = (request?.confirmationConfig || {}) as Partial<ConfirmationConfig>;
  const cleanedOverride = Object.fromEntries(
    Object.entries(rawOverride).filter(([, v]) => v !== undefined && v !== null)
  ) as Partial<ConfirmationConfig>;
  let cfg: ConfirmationConfig = { ...configBase, ...cleanedOverride } as ConfirmationConfig;

  // Normalize theme default
  cfg = { ...cfg, theme: cfg.theme || 'dark' } as ConfirmationConfig;
  // Default decrypt-private-key confirmations to 'skip' UI. The flow collects
  // WebAuthn credentials silently and the worker may follow up with a
  // SHOW_SECURE_PRIVATE_KEY_UI request to display the key.
  if (request?.type === 'decryptPrivateKeyWithPrf') {
    return {
      uiMode: 'skip',
      behavior: cfg.behavior,
      autoProceedDelay: cfg.autoProceedDelay,
      theme: cfg.theme || 'dark',
      // container selection handled by uiMode only
    } as ConfirmationConfig;
  }
  // Detect if running inside an iframe (wallet host context)
  const inIframe = (() => window.self !== window.top)();

  // On Safari/iOS or mobile devices without a fresh user activation,
  // clamp to a clickable UI to reliably satisfy WebAuthn requirements.
  // - If caller/user set uiMode: 'skip', promote to 'modal' + requireClick
  // - If behavior is 'autoProceed', upgrade to 'requireClick'
  // Use shared heuristic to decide if explicit activation is necessary
  if (needsExplicitActivation()) {
    const newUiMode: ConfirmationConfig['uiMode'] = (cfg.uiMode === 'skip') ? 'drawer' : cfg.uiMode;
    cfg = {
      ...cfg,
      uiMode: newUiMode,
      behavior: 'requireClick',
    } as ConfirmationConfig;
  }

  // In wallet‑iframe host context: registration/link flows default to an explicit click.
  // However, if the effective config explicitly opts into auto‑proceed (or skip), honor it.
  if (
    inIframe &&
    request?.type &&
    (request.type === SecureConfirmationType.REGISTER_ACCOUNT || request.type === SecureConfirmationType.LINK_DEVICE)
  ) {
    // Cross‑origin registration/link flows: always require a visible, clickable confirmation
    // so the click lands inside the wallet iframe and satisfies WebAuthn activation.
    return {
      uiMode: 'modal',
      behavior: 'requireClick',
      autoProceedDelay: cfg.autoProceedDelay,
      theme: cfg.theme || 'dark',
    } as ConfirmationConfig;
  }

  // Otherwise honor caller/user configuration
  return cfg;
}
