import type { ConfirmationConfig } from '../../../types/signer-worker';
import type { SignerWorkerManagerContext } from '../index';
import type { SecureConfirmRequest } from './types';

/**
 * determineConfirmationConfig
 *
 * helper to compute the confirmation UI behavior used by the
 * secure-confirmation flow. It takes the caller/user-provided
 * ConfirmationConfig, examines the current runtime, and returns a safe,
 * effective configuration to use.
 *
 * Behavior summary
 * - Wallet-iframe mode (aka wallet host running inside an iframe): force the
 *   modal confirmer and require an explicit user click. This guarantees
 *   WebAuthn user-activation happens in the correct browsing context and avoids
 *   brittle autoProceed flows across frames.
 * - Non-iframe / nested-iframe mode (SDK embedded in the dApp with its own
 *   nested iframe modal): keep the provided configuration unchanged.
 * - Theme and unrelated visual options are preserved in all cases.
 *
 * Wallet-iframe mode detection
 * - We consider the app to be in wallet-iframe mode when:
 *   1) We are running in an iframe: window.self !== window.top
 *   2) The SignerWorkerManagerContext indicates that the default UI does not
 *      rely on a nested iframe modal (ctx.iframeModeDefault is falsy). In this
 *      configuration the wallet host itself renders the modal directly.
 *
 * Notes
 * - The function is pure (does not mutate the input object) and safe to call
 *   multiple times; callers may “re-check” at render-time.
 * - A warning is logged when forcing overrides so developers understand why
 *   user-provided options were ignored in wallet-iframe mode.
 *
 * @param ctx     Signer flow context containing runtime flags and preferences
 * @param request The current secure-confirm request (used only for diagnostic log)
 * @param input   The base user/caller-provided ConfirmationConfig
 * @returns       A new, effective ConfirmationConfig (input is not mutated)
 */
export function determineConfirmationConfig(
  ctx: SignerWorkerManagerContext,
  request: SecureConfirmRequest | undefined,
): ConfirmationConfig {
  let cfg: ConfirmationConfig = {
    ...request?.confirmationConfig,
    ...ctx.userPreferencesManager.getConfirmationConfig()
  };
  // Detect if running inside an iframe (wallet host context)
  const inIframe = (() => {
    try { return window.self !== window.top; } catch { return true; }
  })();

  // In wallet-iframe host context, require an explicit user click for
  // registration/link-device to ensure a user activation before WebAuthn
  // create(). Keep theme from user prefs, ignore autoProceed for these flows.
  if (inIframe && request?.type && (request.type === 'registerAccount' || request.type === 'linkDevice')) {
    return {
      uiMode: 'modal',
      behavior: 'requireClick',
      autoProceedDelay: undefined,
      theme: cfg.theme || 'dark',
    } as ConfirmationConfig;
  }

  // Otherwise honor caller/user configuration
  return cfg;
}
