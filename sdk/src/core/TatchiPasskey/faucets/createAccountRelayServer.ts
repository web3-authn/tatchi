import { VRFChallenge } from '../../types/vrf-worker';
import { RegistrationSSEEvent, RegistrationPhase, RegistrationStatus } from '../../types/sdkSentEvents';
import { PasskeyManagerContext } from '..';
import { base64UrlDecode } from '../../../utils/encoders';
import { removePrfOutputGuard, serializeRegistrationCredential, normalizeRegistrationCredential } from '../../WebAuthnManager/credentialsHelpers';
import type { WebAuthnRegistrationCredential } from '../../types/webauthn';
import type { AuthenticatorOptions } from '../../types/authenticatorOptions';
import type { CreateAccountAndRegisterResult } from '../../../server/core/types';
import { isObject } from '@/utils/validation';
import { errorMessage } from '../../../utils/errors';

function isSerializedRegistrationCredential(
  credential: WebAuthnRegistrationCredential | PublicKeyCredential,
): credential is WebAuthnRegistrationCredential {
  if (!isObject(credential)) return false;
  const resp = (credential as { response?: unknown }).response;
  if (!isObject(resp)) return false;
  return typeof (resp as { attestationObject?: unknown }).attestationObject === 'string';
}

/**
 * HTTP Request body for the relay server's /create_account_and_register_user endpoint
 */
export interface CreateAccountAndRegisterUserRequest {
  new_account_id: string;
  new_public_key: string;
  device_number: number;
  threshold_ed25519?: {
    client_verifying_share_b64u: string;
  };
  vrf_data: {
    vrf_input_data: number[];
    vrf_output: number[];
    vrf_proof: number[];
    public_key: number[];
    user_id: string;
    rp_id: string;
    block_height: number;
    block_hash: number[];
    intent_digest_32: number[];
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
  opts?: {
    thresholdEd25519?: {
      clientVerifyingShareB64u: string;
    };
  },
): Promise<{
  success: boolean;
  transactionId?: string;
  thresholdEd25519?: {
    publicKey: string;
    relayerKeyId: string;
    relayerVerifyingShareB64u?: string;
    clientParticipantId?: number;
    relayerParticipantId?: number;
    participantIds?: number[];
  };
  error?: string;
}> {
  const { configs } = context;

  if (!configs.relayer.url) {
    throw new Error('Relay server URL is required for atomic registration');
  }

  try {
    onEvent?.({
      step: 4,
      phase: RegistrationPhase.STEP_4_ACCESS_KEY_ADDITION,
      status: RegistrationStatus.PROGRESS,
      message: 'Creating account and adding access key...',
    });

    // Serialize the WebAuthn credential properly for the contract.
    // Accept both live PublicKeyCredential and already-serialized credentials from secureConfirm.
    const isSerialized = isSerializedRegistrationCredential(credential);

    // Ensure proper serialization + normalization regardless of source
    const serialized: WebAuthnRegistrationCredential = isSerialized
      ? normalizeRegistrationCredential(credential)
      : serializeRegistrationCredential(credential);

    // Strip PRF outputs before sending to relay/contract
    const serializedCredential = removePrfOutputGuard<WebAuthnRegistrationCredential>(serialized);
    // Normalize transports to an array (avoid null)
    if (!Array.isArray(serializedCredential?.response?.transports)) {
      serializedCredential.response.transports = [];
    }

    // Prepare data for atomic endpoint
    const intent_digest_32 = Array.from(base64UrlDecode(vrfChallenge.intentDigest || ''));
    if (intent_digest_32.length !== 32) {
      throw new Error('Missing or invalid vrfChallenge.intentDigest (expected base64url-encoded 32 bytes)');
    }
    const requestData: CreateAccountAndRegisterUserRequest = {
      new_account_id: nearAccountId,
      new_public_key: publicKey,
      device_number: 1, // First device gets device number 1 (1-indexed)
      ...(opts?.thresholdEd25519?.clientVerifyingShareB64u
        ? {
          threshold_ed25519: {
            client_verifying_share_b64u: opts.thresholdEd25519.clientVerifyingShareB64u,
          },
        }
        : {}),
      vrf_data: {
        vrf_input_data: Array.from(base64UrlDecode(vrfChallenge.vrfInput)),
        vrf_output: Array.from(base64UrlDecode(vrfChallenge.vrfOutput)),
        vrf_proof: Array.from(base64UrlDecode(vrfChallenge.vrfProof)),
        public_key: Array.from(base64UrlDecode(vrfChallenge.vrfPublicKey)),
        user_id: vrfChallenge.userId,
        rp_id: vrfChallenge.rpId,
        block_height: Number(vrfChallenge.blockHeight),
        block_hash: Array.from(base64UrlDecode(vrfChallenge.blockHash)),
        intent_digest_32,
      },
      webauthn_registration: serializedCredential,
      deterministic_vrf_public_key: Array.from(base64UrlDecode(deterministicVrfPublicKey)),
      authenticator_options: authenticatorOptions || context.configs.authenticatorOptions,
    };

    onEvent?.({
      step: 5,
      phase: RegistrationPhase.STEP_5_CONTRACT_REGISTRATION,
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
      step: 5,
      phase: RegistrationPhase.STEP_5_CONTRACT_REGISTRATION,
      status: RegistrationStatus.SUCCESS,
      message: 'User registered with Web3Authn contract successfully',
    });

    return {
      success: true,
      transactionId: result.transactionHash,
      thresholdEd25519: result.thresholdEd25519
        ? {
          publicKey: result.thresholdEd25519.publicKey,
          relayerKeyId: result.thresholdEd25519.relayerKeyId,
          relayerVerifyingShareB64u: result.thresholdEd25519.relayerVerifyingShareB64u,
          clientParticipantId: result.thresholdEd25519.clientParticipantId,
          relayerParticipantId: result.thresholdEd25519.relayerParticipantId,
          participantIds: result.thresholdEd25519.participantIds,
        }
        : undefined,
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
