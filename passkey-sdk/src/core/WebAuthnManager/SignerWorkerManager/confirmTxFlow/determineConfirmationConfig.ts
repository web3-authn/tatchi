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

  // Helper: detect if this browsing context is cross‑origin with its parent
  const isCrossOriginWithTop = (() => {
    try {
      // Accessing top.document will throw on cross‑origin; same‑origin is readable
      // eslint-disable-next-line no-unused-expressions
      (window.top as any)?.document; // probe
      // Additionally, confirm origins differ if accessible (defensive)
      try {
        const same = (window.top as Window).location.origin === window.location.origin;
        return !same && window.self !== window.top;
      } catch {
        return window.self !== window.top ? false : false;
      }
    } catch {
      return true;
    }
  })();

  try {
    if (isCrossOriginWithTop) {
      const before = { uiMode: cfg.uiMode, behavior: cfg.behavior };
      cfg = { ...cfg, uiMode: 'modal', behavior: 'requireClick' } as ConfirmationConfig;
      try {
        const flow = request?.type || 'UNKNOWN';
        const invokedFrom = request?.invokedFrom || 'parent';
        console.warn('[SecureConfirm] Cross‑origin detected: forcing modal+requireClick', { flow, invokedFrom, before });
      } catch {}
      return cfg;
    }
  } catch {}

  // Same‑origin: honor caller/user configuration
  return cfg;
}
