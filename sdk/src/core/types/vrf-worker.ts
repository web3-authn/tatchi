/**
 * VRF Types for Web Worker Communication
 */
import * as wasmModule from '../../wasm_vrf_worker/pkg/wasm_vrf_worker.js';
import { StripFree } from "./index.js";

import { WebAuthnAuthenticationCredential, WebAuthnRegistrationCredential } from "./webauthn";
import { ConfirmationConfig } from './signer-worker';
import { AccountId } from "./accountIds.js";
import { base64UrlDecode, base64UrlEncode } from "../../utils/encoders.js";

export type WasmGenerateVrfKeypairBootstrapRequest = StripFree<wasmModule.GenerateVrfKeypairBootstrapRequest>;
export type WasmGenerateVrfChallengeRequest = StripFree<wasmModule.GenerateVrfChallengeRequest>;
export type WasmUnlockVrfKeypairRequest = StripFree<wasmModule.UnlockVrfKeypairRequest>;
export type WasmDeriveVrfKeypairFromPrfRequest = StripFree<wasmModule.DeriveVrfKeypairFromPrfRequest>;
export type WasmDeriveWrapKeySeedAndSessionRequest = StripFree<wasmModule.DeriveWrapKeySeedAndSessionRequest> & {
  // Optional contract verification context; when provided, VRF worker will
  // call verify_authentication_response before deriving WrapKeySeed.
  vrfChallenge?: VRFChallenge;
  // Optional credential for PRF.second extraction (registration or authentication)
  credential?: WebAuthnRegistrationCredential | WebAuthnAuthenticationCredential;
};
export type WasmDecryptSessionRequest = StripFree<wasmModule.DecryptSessionRequest>;
export type WasmRegistrationCredentialConfirmationRequest = StripFree<wasmModule.RegistrationCredentialConfirmationRequest> & {
  confirmationConfig?: ConfirmationConfig;
};
export type WasmDevice2RegistrationSessionRequest = StripFree<wasmModule.Device2RegistrationSessionRequest> & {
  confirmationConfig?: ConfirmationConfig;
};

export type WasmShamir3PassConfigPRequest = StripFree<wasmModule.Shamir3PassConfigPRequest>;
export type WasmShamir3PassConfigServerUrlsRequest = StripFree<wasmModule.Shamir3PassConfigServerUrlsRequest>;
export type WasmShamir3PassClientEncryptCurrentVrfKeypairRequest = StripFree<wasmModule.Shamir3PassClientEncryptCurrentVrfKeypairRequest>;
export type WasmShamir3PassClientDecryptVrfKeypairRequest = StripFree<wasmModule.Shamir3PassClientDecryptVrfKeypairRequest>;

export type WasmVrfWorkerRequestType = WasmGenerateVrfKeypairBootstrapRequest
  | WasmGenerateVrfChallengeRequest
  | WasmUnlockVrfKeypairRequest
  | WasmDeriveVrfKeypairFromPrfRequest
  | WasmDeriveWrapKeySeedAndSessionRequest
  | WasmDecryptSessionRequest
  | WasmRegistrationCredentialConfirmationRequest
  | WasmDevice2RegistrationSessionRequest
  | WasmShamir3PassConfigPRequest
  | WasmShamir3PassConfigServerUrlsRequest
  | WasmShamir3PassClientEncryptCurrentVrfKeypairRequest
  | WasmShamir3PassClientDecryptVrfKeypairRequest;

export interface VRFChallenge {
  vrfInput: string;
  vrfOutput: string;
  vrfProof: string;
  vrfPublicKey: string;
  userId: string;
  rpId: string;
  blockHeight: string;
  blockHash: string;
}

/**
 * Decode VRF output and use first 32 bytes as WebAuthn challenge
 * @param vrfChallenge - VRF challenge object
 * @returns 32-byte Uint8Array
 */
export function outputAs32Bytes(vrfChallenge: VRFChallenge): Uint8Array {
  let vrfOutputBytes = base64UrlDecode(vrfChallenge.vrfOutput);
  return vrfOutputBytes.slice(0, 32);
}

/**
 * Validate and create a VRFChallenge object
 * @param vrfChallengeData - The challenge data to validate
 * @returns VRFChallenge object
 */
export function validateVRFChallenge(vrfChallengeData: {
  vrfInput: string;
  vrfOutput: string;
  vrfProof: string;
  vrfPublicKey: string;
  userId: string;
  rpId: string;
  blockHeight: string;
  blockHash: string;
}): VRFChallenge {
  if (!vrfChallengeData.vrfInput || typeof vrfChallengeData.vrfInput !== 'string') {
    throw new Error('vrfInput must be a non-empty string');
  }
  if (!vrfChallengeData.vrfOutput || typeof vrfChallengeData.vrfOutput !== 'string') {
    throw new Error('vrfOutput must be a non-empty string');
  }
  if (!vrfChallengeData.vrfProof || typeof vrfChallengeData.vrfProof !== 'string') {
    throw new Error('vrfProof must be a non-empty string');
  }
  if (!vrfChallengeData.vrfPublicKey || typeof vrfChallengeData.vrfPublicKey !== 'string') {
    throw new Error('vrfPublicKey must be a non-empty string');
  }
  if (!vrfChallengeData.userId || typeof vrfChallengeData.userId !== 'string') {
    throw new Error('userId must be a non-empty string');
  }
  if (!vrfChallengeData.rpId || typeof vrfChallengeData.rpId !== 'string') {
    throw new Error('rpId must be a non-empty string');
  }
  if (!vrfChallengeData.blockHeight || typeof vrfChallengeData.blockHeight !== 'string') {
    throw new Error('blockHeight must be a non-empty string');
  }
  if (!vrfChallengeData.blockHash || typeof vrfChallengeData.blockHash !== 'string') {
    throw new Error('blockHash must be a non-empty string');
  }

  return {
    vrfInput: vrfChallengeData.vrfInput,
    vrfOutput: vrfChallengeData.vrfOutput,
    vrfProof: vrfChallengeData.vrfProof,
    vrfPublicKey: vrfChallengeData.vrfPublicKey,
    userId: vrfChallengeData.userId,
    rpId: vrfChallengeData.rpId,
    blockHeight: vrfChallengeData.blockHeight,
    blockHash: vrfChallengeData.blockHash,
  };
}

/**
 * Create a random VRF challenge
 * @returns Partial<VRFChallenge> with vrfOutput set, but other fields are undefined
 * This is used for local operations that don't require a VRF verification
 */
export function createRandomVRFChallenge(): Partial<VRFChallenge> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const vrfOutput = base64UrlEncode(challenge.buffer);
  return {
    vrfOutput: vrfOutput,
    vrfInput: undefined,
    vrfProof: undefined,
    vrfPublicKey: undefined,
    userId: undefined,
    rpId: undefined,
    blockHeight: undefined,
    blockHash: undefined,
  };
}

export interface VrfWorkerManagerConfig {
  vrfWorkerUrl?: string;
  workerTimeout?: number;
  debug?: boolean;
  // Optional Shamir 3-pass configuration passed to the VRF WASM worker at init
  shamirPB64u?: string; // base64url prime p
  relayServerUrl?: string;
  applyServerLockRoute?: string;
  removeServerLockRoute?: string;
}

// Define interfaces that are missing
export interface VRFWorkerStatus {
  active: boolean;
  nearAccountId: AccountId | null;
  sessionDuration?: number;
}

export interface EncryptedVRFKeypair {
  encryptedVrfDataB64u: string;
  chacha20NonceB64u: string;
}

export interface VRFInputData {
  userId: string;
  rpId: string;
  blockHeight: string;
  blockHash: string;
}

export interface VRFWorkerMessage<T extends WasmVrfWorkerRequestType> {
  // type: wasmModule.WorkerRequestType
  type: 'PING'
  | 'GENERATE_VRF_CHALLENGE'
  | 'GENERATE_VRF_KEYPAIR_BOOTSTRAP'
  | 'UNLOCK_VRF_KEYPAIR'
  | 'CHECK_VRF_STATUS'
  | 'LOGOUT'
  | 'DERIVE_VRF_KEYPAIR_FROM_PRF'
  | 'DERIVE_WRAP_KEY_SEED_AND_SESSION'
  | 'DECRYPT_SESSION'
  | 'REGISTRATION_CREDENTIAL_CONFIRMATION'
  | 'DEVICE2_REGISTRATION_SESSION'
  | 'SHAMIR3PASS_CLIENT_ENCRYPT_CURRENT_VRF_KEYPAIR' // client only
  | 'SHAMIR3PASS_CLIENT_DECRYPT_VRF_KEYPAIR' // client only
  | 'SHAMIR3PASS_APPLY_SERVER_LOCK_KEK' // server only
  | 'SHAMIR3PASS_REMOVE_SERVER_LOCK_KEK' // server only
  | 'SHAMIR3PASS_CONFIG_P'
  | 'SHAMIR3PASS_CONFIG_SERVER_URLS'
  id?: string;
  payload?: T;
}

export interface VRFWorkerResponse<TData = Record<string, unknown>> {
  id?: string;
  success: boolean;
  data?: TData;
  error?: string;
}

export interface VRFKeypairBootstrapResponse {
  vrfPublicKey: string;
  vrfChallengeData?: VRFChallenge;
}

export interface EncryptedVRFKeypairResponse {
  vrfPublicKey: string;
  encryptedVrfKeypair: EncryptedVRFKeypair;
}

/**
 * Server-encrypted VRF keypair for commutative encryption scheme
 * This allows server-assisted VRF key recovery without the server seeing the plaintext
 */
export interface ServerEncryptedVrfKeypair {
  /** Base64url-encoded VRF ciphertext (AEAD over VRF keypair bytes) */
  ciphertextVrfB64u: string;
  /** Base64url-encoded KEK with server lock applied (KEK_s) */
  kek_s_b64u: string;
  /** Server key identifier for proactive refresh/versioning */
  serverKeyId: string;
}

/**
 * Plaintext VRF keypair data structure
 * Used for loading decrypted VRF keypairs directly into memory
 */
export interface VRFKeypairData {
  /** Bincode-serialized ECVRFKeyPair bytes (includes both private and public key) */
  keypairBytes: number[];
  /** Base64url-encoded public key for convenience and verification */
  publicKeyBase64: string;
}

// Shamir 3-pass registration wrap result
export interface Shamir3PassRegisterWrapResult {
  ciphertextVrfB64u: string;
  enc_s_k_b64u: string;
  vrfPublicKey: string;
}
