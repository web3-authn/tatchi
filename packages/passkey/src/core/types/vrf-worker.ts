/**
 * VRF Types for Web Worker Communication
 */

import * as wasmModule from '../../wasm_vrf_worker/wasm_vrf_worker.js';
import { StripFree } from ".";

export type WasmGenerateVrfKeypairBootstrapRequest = StripFree<wasmModule.GenerateVrfKeypairBootstrapRequest>;
export type WasmGenerateVrfChallengeRequest = StripFree<wasmModule.GenerateVrfChallengeRequest>;
export type WasmUnlockVrfKeypairRequest = StripFree<wasmModule.UnlockVrfKeypairRequest>;
export type WasmDeriveVrfKeypairFromPrfRequest = StripFree<wasmModule.DeriveVrfKeypairFromPrfRequest>;

export type WasmShamir3PassConfigPRequest = StripFree<wasmModule.Shamir3PassConfigPRequest>;
export type WasmShamir3PassConfigServerUrlsRequest = StripFree<wasmModule.Shamir3PassConfigServerUrlsRequest>;
export type WasmShamir3PassClientDecryptVrfKeypairRequest = StripFree<wasmModule.Shamir3PassClientDecryptVrfKeypairRequest>;

export type WasmVrfWorkerRequestType = WasmGenerateVrfKeypairBootstrapRequest
  | WasmGenerateVrfChallengeRequest
  | WasmUnlockVrfKeypairRequest
  | WasmDeriveVrfKeypairFromPrfRequest
  | WasmShamir3PassConfigPRequest
  | WasmShamir3PassConfigServerUrlsRequest
  | WasmShamir3PassClientDecryptVrfKeypairRequest;

import { AccountId } from "./accountIds";
import { base64UrlDecode } from "../../utils/encoders";

export class VRFChallenge {
  vrfInput: string;
  vrfOutput: string;
  vrfProof: string;
  vrfPublicKey: string;
  userId: string;
  rpId: string;
  blockHeight: number;
  blockHash: string;

  constructor(vrfChallengeData: {
    vrfInput: string;
    vrfOutput: string;
    vrfProof: string;
    vrfPublicKey: string;
    userId: string;
    rpId: string;
    blockHeight: number;
    blockHash: string;
  }) {
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
    if (typeof vrfChallengeData.blockHeight !== 'number' || vrfChallengeData.blockHeight < 0) {
      throw new Error('blockHeight must be a non-negative number');
    }
    if (!vrfChallengeData.blockHash || typeof vrfChallengeData.blockHash !== 'string') {
      throw new Error('blockHash must be a non-empty string');
    }

    this.vrfInput = vrfChallengeData.vrfInput;
    this.vrfOutput = vrfChallengeData.vrfOutput;
    this.vrfProof = vrfChallengeData.vrfProof;
    this.vrfPublicKey = vrfChallengeData.vrfPublicKey;
    this.userId = vrfChallengeData.userId;
    this.rpId = vrfChallengeData.rpId;
    this.blockHeight = vrfChallengeData.blockHeight;
    this.blockHash = vrfChallengeData.blockHash;
  }

  /**
   * Decode VRF output and use first 32 bytes as WebAuthn challenge
   * @returns 32-byte Uint8Array
   */
  outputAs32Bytes(): Uint8Array {
    let vrfOutputBytes = base64UrlDecode(this.vrfOutput);
    return vrfOutputBytes.slice(0, 32);
  }
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
  blockHeight: number;
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
      | 'SHAMIR3PASS_CLIENT_ENCRYPT_CURRENT_VRF_KEYPAIR' // client only
      | 'SHAMIR3PASS_CLIENT_DECRYPT_VRF_KEYPAIR' // client only
      | 'SHAMIR3PASS_APPLY_SERVER_LOCK_KEK' // server only
      | 'SHAMIR3PASS_REMOVE_SERVER_LOCK_KEK' // server only
      | 'SHAMIR3PASS_CONFIG_P'
      | 'SHAMIR3PASS_CONFIG_SERVER_URLS'
  id?: string;
  payload?: T;
}

export interface VRFWorkerResponse {
  id?: string;
  success: boolean;
  data?: any;
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

