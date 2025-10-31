import { VRFChallenge } from '../../types/vrf-worker';
import { RegistrationSSEEvent, RegistrationPhase, RegistrationStatus } from '../../types/passkeyManager';
import { PasskeyManagerContext } from '..';
import { base64UrlDecode, base64UrlEncode } from '../../../utils/encoders';
import type { SignedTransaction } from '../../NearClient';
import { removePrfOutputGuard, serializeRegistrationCredential, normalizeRegistrationCredential } from '../../WebAuthnManager/credentialsHelpers';
import type { WebAuthnRegistrationCredential } from '../../types/webauthn';
import type { AuthenticatorOptions } from '../../types/authenticatorOptions';
import type { CreateAccountAndRegisterResult } from '../../../server/core/types';

/**
 * HTTP Request body for the relay server's /create_account_and_register_user endpoint
 */
export interface CreateAccountAndRegisterUserRequest {
  new_account_id: string;
  new_public_key: string;
  device_number: number;
  vrf_data: {
    vrf_input_data: number[];
    vrf_output: number[];
    vrf_proof: number[];
    public_key: number[];
    user_id: string;
    rp_id: string;
    block_height: number;
    block_hash: number[];
  };
  webauthn_registration: WebAuthnRegistrationCredential;
  deterministic_vrf_public_key: number[];
  authenticator_options?: AuthenticatorOptions;
}

/**
 * Create account and register user using relay-server atomic endpoint
 * Makes a single call to the relay-server's /create_account_and_register_user endpoint
 * which calls the contract's atomic create_account_and_register_user function
 */
export async function createAccountAndRegisterWithRelayServer(
  context: PasskeyManagerContext,
  nearAccountId: string,
  publicKey: string,
  credential: WebAuthnRegistrationCredential | PublicKeyCredential,
  vrfChallenge: VRFChallenge,
  deterministicVrfPublicKey: string,
  authenticatorOptions?: AuthenticatorOptions,
  onEvent?: (event: RegistrationSSEEvent) => void,
): Promise<{
  success: boolean;
  transactionId?: string;
  error?: string;
}> {
  const { configs } = context;

  if (!configs.relayer.url) {
    throw new Error('Relay server URL is required for atomic registration');
  }

  try {
    onEvent?.({
      step: 3,
      phase: RegistrationPhase.STEP_3_ACCESS_KEY_ADDITION,
      status: RegistrationStatus.PROGRESS,
      message: 'Adding access key to account...',
    });

    // Serialize the WebAuthn credential properly for the contract.
    // Accept both live PublicKeyCredential and already-serialized credentials from secureConfirm.
    const isSerialized = isObject(credential)
      && typeof (credential as any)?.response?.attestationObject === 'string';

    // Ensure proper serialization + normalization regardless of source
    const serialized: WebAuthnRegistrationCredential = isSerialized
      ? normalizeRegistrationCredential(credential as WebAuthnRegistrationCredential)
      : serializeRegistrationCredential(credential as PublicKeyCredential);

    // Strip PRF outputs before sending to relay/contract
    const serializedCredential = removePrfOutputGuard<WebAuthnRegistrationCredential>(serialized);
    // Normalize transports to an array (avoid null)
    if (!Array.isArray(serializedCredential?.response?.transports)) {
      serializedCredential.response.transports = [];
    }

    // Prepare data for atomic endpoint
    const requestData: CreateAccountAndRegisterUserRequest = {
      new_account_id: nearAccountId,
      new_public_key: publicKey,
      device_number: 1, // First device gets device number 1 (1-indexed)
      vrf_data: {
        vrf_input_data: Array.from(base64UrlDecode(vrfChallenge.vrfInput)),
        vrf_output: Array.from(base64UrlDecode(vrfChallenge.vrfOutput)),
        vrf_proof: Array.from(base64UrlDecode(vrfChallenge.vrfProof)),
        public_key: Array.from(base64UrlDecode(vrfChallenge.vrfPublicKey)),
        user_id: vrfChallenge.userId,
        rp_id: vrfChallenge.rpId,
        block_height: Number(vrfChallenge.blockHeight),
        block_hash: Array.from(base64UrlDecode(vrfChallenge.blockHash)),
      },
      webauthn_registration: serializedCredential,
      deterministic_vrf_public_key: Array.from(base64UrlDecode(deterministicVrfPublicKey)),
      authenticator_options: authenticatorOptions || context.configs.authenticatorOptions,
    };

    onEvent?.({
      step: 6,
      phase: RegistrationPhase.STEP_6_CONTRACT_REGISTRATION,
      status: RegistrationStatus.PROGRESS,
      message: 'Registering user with Web3Authn contract...',
    });

    // Call the atomic endpoint
    const response = await fetch(`${configs.relayer.url}/create_account_and_register_user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData)
    });

    // Handle both successful and failed responses
    const result: CreateAccountAndRegisterResult = await response.json();

    if (!response.ok) {
      // Extract specific error message from relay server response
      const errorMessage = result.error || result.message || `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(errorMessage);
    }

    if (!result.success) {
      throw new Error(result.error || 'Atomic registration failed');
    }

    onEvent?.({
      step: 6,
      phase: RegistrationPhase.STEP_6_CONTRACT_REGISTRATION,
      status: RegistrationStatus.SUCCESS,
      message: 'User registered with Web3Authn contract successfully',
    });

    return {
      success: true,
      transactionId: result.transactionHash,
    };

  } catch (error: unknown) {
    console.error('Atomic registration failed:', error);

    onEvent?.({
      step: 0,
      phase: RegistrationPhase.REGISTRATION_ERROR,
      status: RegistrationStatus.ERROR,
      message: 'Registration failed',
      error: errorMessage(error),
    });

    return {
      success: false,
      error: errorMessage(error),
    };
  }
}

/**
 * Generate a hash of a signed transaction for verification purposes
 * Uses the borsh bytes of the transaction to create a consistent hash
 */
function generateTransactionHash(signedTransaction: SignedTransaction): string {
  try {
    // Use the borsh_bytes which contain the serialized transaction data
    const transactionBytes = new Uint8Array(signedTransaction.borsh_bytes);

    // Create a simple hash using crypto.subtle (available in secure contexts)
    // For testing purposes, we'll use a truncated hash of the borsh bytes
    const hashInput = Array.from(transactionBytes).join(',');

    // Create a deterministic hash by taking first 16 chars of base64 encoding
    const hash = base64UrlEncode(new TextEncoder().encode(hashInput).buffer).substring(0, 16);

    return hash;
  } catch (error) {
    console.warn('Failed to generate transaction hash:', error);
    return 'hash-generation-failed';
  }
}
import { isObject } from '../../WalletIframe/validation';
import { errorMessage } from '../../../utils/errors';
