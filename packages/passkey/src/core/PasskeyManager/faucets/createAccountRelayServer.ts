import { VRFChallenge } from '../../../core/types/vrf-worker';
import { RegistrationSSEEvent, RegistrationPhase, RegistrationStatus } from '../../types/passkeyManager';
import { PasskeyManagerContext } from '..';
import { base64UrlDecode } from '../../../utils/encoders';
import { removePrfOutputGuard, serializeCredential } from '../../WebAuthnManager/credentialsHelpers';
import { WebAuthnRegistrationCredential } from '../../types/webauthn';
import type { AuthenticatorOptions } from '../../types/authenticatorOptions';

/**
 * Request data interface for the relay server's atomic account creation endpoint
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
  // authenticator options
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
  credential: PublicKeyCredential,
  vrfChallenge: VRFChallenge,
  deterministicVrfPublicKey: string,
  authenticatorOptions?: AuthenticatorOptions,
  onEvent?: (event: RegistrationSSEEvent) => void,
): Promise<{
  success: boolean;
  transactionId?: string;
  error?: string;
  preSignedDeleteTransaction: null; // not used for relay server
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

    // Serialize the WebAuthn credential properly for the contract
    const serializedCredential = removePrfOutputGuard<WebAuthnRegistrationCredential>(serializeCredential(credential));

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
        block_height: vrfChallenge.blockHeight,
        block_hash: Array.from(base64UrlDecode(vrfChallenge.blockHash)),
      },
      webauthn_registration: serializedCredential,
      deterministic_vrf_public_key: Array.from(base64UrlDecode(deterministicVrfPublicKey)),
      authenticator_options: authenticatorOptions || context.configs.authenticatorOptions,
      // Use config-based authenticator options
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
    const result = await response.json();

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
      // No preSignedDeleteTransaction needed for atomic transactions
      preSignedDeleteTransaction: null
    };

  } catch (error: any) {
    console.error('Atomic registration failed:', error);

    onEvent?.({
      step: 0,
      phase: RegistrationPhase.REGISTRATION_ERROR,
      status: RegistrationStatus.ERROR,
      message: 'Registration failed',
      error: error.message,
    });

    return {
      success: false,
      error: error.message,
      preSignedDeleteTransaction: null
    };
  }
}
