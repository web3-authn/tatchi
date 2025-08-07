import type { PasskeyManagerContext } from './index';
import type { BaseHooksOptions } from '../types/passkeyManager';
import { ActionPhase, ActionStatus } from '../types/passkeyManager';
import type { AccountId } from '../types/accountIds';
import { getNonceBlockHashAndHeight } from './actions';

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
 * @param context - PasskeyManager context
 * @param nearAccountId - NEAR account ID to sign with
 * @param params - NEP-413 signing parameters
 * @param options - Action options for event handling
 * @returns Promise resolving to signing result
 */
export async function signNEP413Message(
  context: PasskeyManagerContext,
  nearAccountId: AccountId,
  params: SignNEP413MessageParams,
  options?: BaseHooksOptions
): Promise<SignNEP413MessageResult> {

  const { nearClient, webAuthnManager } = context;

  try {
    // Emit preparation event
    options?.onEvent?.({
      step: 1,
      phase: ActionPhase.STEP_1_PREPARATION,
      status: ActionStatus.PROGRESS,
      message: 'Preparing NEP-413 message signing'
    });

    // Get user data and authenticators for NEP-413 signing
    const [vrfStatus, userData, authenticators] = await Promise.all([
      webAuthnManager.checkVrfStatus(),
      webAuthnManager.getUser(nearAccountId),
      webAuthnManager.getAuthenticatorsByUser(nearAccountId),
    ]);
    // Check VRF status to ensure user is authenticated
    if (!vrfStatus.active) {
      throw new Error('User not authenticated. Please login first.');
    }
    if (!userData || !userData.clientNearPublicKey) {
      throw new Error(`User data not found for ${nearAccountId}`);
    }

    // Generate a random 32-byte nonce for NEP-413 signing
    const { nextNonce, txBlockHash, txBlockHeight } = await getNonceBlockHashAndHeight({
      nearClient: nearClient,
      nearAccountId: nearAccountId,
      nearPublicKeyStr: userData.clientNearPublicKey
    });

    // Get credential for NEP-413 signing
    const vrfChallenge = await webAuthnManager.generateVrfChallenge({
      userId: nearAccountId,
      rpId: window.location.hostname,
      blockHash: txBlockHash,
      blockHeight: txBlockHeight,
    });
    const credential = await context.webAuthnManager.touchIdPrompt.getCredentials({
      nearAccountId,
      challenge: vrfChallenge.outputAs32Bytes(),
      authenticators,
    });

    // Emit signing progress event
    options?.onEvent?.({
      step: 5,
      phase: ActionPhase.STEP_5_TRANSACTION_SIGNING_PROGRESS,
      status: ActionStatus.PROGRESS,
      message: 'Signing NEP-413 message'
    });

    // Send to WebAuthnManager for signing
    const result = await context.webAuthnManager.signNEP413Message({
      message: params.message,
      recipient: params.recipient,
      nonce: nextNonce,
      state: params.state || null,
      accountId: nearAccountId,
      credential
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
