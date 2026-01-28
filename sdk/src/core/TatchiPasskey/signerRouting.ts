import type { LoginSession } from '../types/tatchi';
import type { SignerMode } from '../types/signer-worker';
import type { WalletIframeRouter } from '../WalletIframe/client/router';

export type WalletSigningTarget = 'web' | 'extension';

export async function isExtensionReadyForLocalSigning(args: {
  router: WalletIframeRouter;
  /** When provided, require the extension to be logged into this specific accountId. */
  nearAccountId?: string;
  pingTimeoutMs?: number;
}): Promise<boolean> {
  const { router, nearAccountId, pingTimeoutMs = 750 } = args;
  try {
    await router.ping({ timeoutMs: pingTimeoutMs });
  } catch {
    return false;
  }

  // "Has an account" should not require an active VRF session; local signing can still
  // proceed by prompting WebAuthn/PRF inside the extension.
  if (nearAccountId) {
    try {
      const has = await router.hasPasskeyCredential(nearAccountId);
      if (has) return true;
    } catch {
      // fall through to legacy heuristic below
    }
  }

  let session: LoginSession;
  try {
    session = await router.getLoginSession(nearAccountId);
  } catch {
    return false;
  }

  const activeAccountId = session?.login?.nearAccountId ? String(session.login.nearAccountId) : '';
  if (!activeAccountId) return false;
  if (nearAccountId && activeAccountId !== nearAccountId) return false;
  return !!session?.login?.userData;
}

/**
 * Resolves which wallet origin should handle the request.
 *
 * Policy:
 * - Threshold signer: always use web wallet when available (embedded in app).
 * - Local signer: prefer extension when it is ready (reachable + logged in),
 *   regardless of `useExtensionWallet` opt-in; otherwise fall back to web.
 */
export async function resolveSigningWalletTarget(args: {
  signerMode: SignerMode;
  nearAccountId?: string;
  webAvailable: boolean;
  extensionAvailable: boolean;
  getExtensionRouter?: () => Promise<WalletIframeRouter>;
}): Promise<WalletSigningTarget> {
  const { signerMode, nearAccountId, webAvailable, extensionAvailable, getExtensionRouter } = args;

  // Threshold signing must remain embedded in the app (web wallet).
  if (signerMode.mode === 'threshold-signer') {
    if (webAvailable) return 'web';
    return 'extension';
  }

  // Local signing: default to extension if it is ready.
  if (extensionAvailable && getExtensionRouter) {
    try {
      const extensionRouter = await getExtensionRouter();
      const ready = await isExtensionReadyForLocalSigning({ router: extensionRouter, nearAccountId });
      if (ready) return 'extension';
    } catch {
      // fall through to web
    }
  }

  if (webAvailable) return 'web';
  return 'extension';
}
