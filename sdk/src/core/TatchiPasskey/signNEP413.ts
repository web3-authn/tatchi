import type { PasskeyManagerContext } from './index';
import type { SignNEP413HooksOptions } from '../types/sdkSentEvents';
import { ActionPhase, ActionStatus } from '../types/sdkSentEvents';
import type { AccountId } from '../types/accountIds';
import { mergeSignerMode } from '../types/signer-worker';
import { base64Encode } from '../../utils/encoders';

/**
 * NEP-413 message signing parameters
 */
export interface SignNEP413MessageParams {
  /** The message to sign */
  message: string;
  /** The recipient identifier */
  recipient: string;
  /** Optional state parameter */
  state?: string;
}

/**
 * NEP-413 message signing result
 */
export interface SignNEP413MessageResult {
  /** Success status */
  success: boolean;
  /** NEAR account ID that signed the message */
  accountId?: string;
  /** Base58-encoded public key */
  publicKey?: string;
  /** Base64-encoded signature */
  signature?: string;
  /** Base64-encoded 32-byte nonce used for signing */
  nonce?: string;
  /** Optional state parameter */
  state?: string;
  /** Error message if signing failed */
  error?: string;
}

/**
 * Sign a NEP-413 message using the user's passkey-derived private key
 *
 * This function implements the NEP-413 standard for off-chain message signing:
 * - Creates a payload with message, recipient, nonce, and state
 * - Serializes using Borsh
 * - Adds NEP-413 prefix (2^31 + 413)
 * - Hashes with SHA-256
 * - Signs with Ed25519
 * - Returns base64-encoded signature
 *
 * @param context - TatchiPasskey context
 * @param nearAccountId - NEAR account ID to sign with
 * @param params - NEP-413 signing parameters
 * @param options - Action options for event handling
 * @returns Promise resolving to signing result
 */
export async function signNEP413Message(args: {
  context: PasskeyManagerContext,
  nearAccountId: AccountId,
  params: SignNEP413MessageParams,
  options: SignNEP413HooksOptions
}): Promise<SignNEP413MessageResult> {

  const { context, nearAccountId, params, options } = args;
  const confirmerText = options?.confirmerText;
  const confirmationConfigOverride = options?.confirmationConfig;
  const { webAuthnManager } = context;
  const baseSignerMode = webAuthnManager.getUserPreferences().getSignerMode();
  const signerMode = mergeSignerMode(baseSignerMode, options.signerMode);

  try {
    // Emit preparation event
    options?.onEvent?.({
      step: 1,
      phase: ActionPhase.STEP_1_PREPARATION,
      status: ActionStatus.PROGRESS,
      message: 'Preparing NEP-413 message signing'
    });

    // Get user data and VRF status for NEP-413 signing
    const [vrfStatus, userData] = await Promise.all([
      webAuthnManager.checkVrfStatus(),
      webAuthnManager.getLastUser(),
    ]);
    // Check VRF status to ensure user is authenticated
    if (!vrfStatus.active) {
      throw new Error('User not authenticated. Please login first.');
    }
    if (!userData || !userData.clientNearPublicKey) {
      throw new Error(`User data not found for ${nearAccountId}`);
    }

    // Generate a random 32-byte nonce (NEP-413 expects base64-encoded nonce bytes).
    const nonceBytes = new Uint8Array(32);
    if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
      throw new Error('Secure random not available to generate NEP-413 nonce');
    }
    crypto.getRandomValues(nonceBytes);
    const nonce = base64Encode(nonceBytes);

    // Emit signing progress event
    options?.onEvent?.({
      step: 5,
      phase: ActionPhase.STEP_5_TRANSACTION_SIGNING_PROGRESS,
      status: ActionStatus.PROGRESS,
      message: 'Signing NEP-413 message'
    });

    // Send to WebAuthnManager for signing.
    // Note: NEP-413 now uses VRF-driven confirmTxFlow inside WebAuthnManager/SignerWorkerManager;
    // this call will trigger its own confirmation + WebAuthn authentication as needed.
    const result = await context.webAuthnManager.signNEP413Message({
      message: params.message,
      recipient: params.recipient,
      nonce,
      state: params.state || null,
      accountId: nearAccountId,
      signerMode,
      title: confirmerText?.title,
      body: confirmerText?.body,
      confirmationConfigOverride,
    });

    if (result.success) {
      // Emit completion event
      options?.onEvent?.({
        step: 8,
        phase: ActionPhase.STEP_8_ACTION_COMPLETE,
        status: ActionStatus.SUCCESS,
        message: 'NEP-413 message signed successfully'
      });

      return {
        success: true,
        accountId: result.accountId,
        publicKey: result.publicKey,
        signature: result.signature,
        nonce,
        state: result.state
      };
    } else {
      throw new Error(`NEP-413 signing failed: ${result.error || 'Unknown error'}`);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Emit error event
    options?.onEvent?.({
      step: 0,
      phase: 'action-error' as any,
      status: 'error' as any,
      message: `NEP-413 signing failed: ${errorMessage}`,
      error: errorMessage
    });

    options?.onError?.(error instanceof Error ? error : new Error(errorMessage));

    return {
      success: false,
      error: errorMessage
    };
  }
}
