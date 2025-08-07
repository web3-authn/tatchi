/**
 * VRF Types for Web Worker Communication
 */

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
}

// Define interfaces that are missing
export interface VRFWorkerStatus {
  active: boolean;
  nearAccountId: AccountId | null;
  sessionDuration?: number;
}

export interface EncryptedVRFKeypair {
  encrypted_vrf_data_b64u: string;
  chacha20_nonce_b64u: string;
}

export interface VRFInputData {
  userId: string;
  rpId: string;
  blockHeight: number;
  blockHash: string;
}

export interface VRFWorkerMessage {
  type: 'PING'
      | 'UNLOCK_VRF_KEYPAIR'
      | 'GENERATE_VRF_CHALLENGE'
      | 'GENERATE_VRF_KEYPAIR_BOOTSTRAP'
      | 'ENCRYPT_VRF_KEYPAIR_WITH_PRF'
      | 'DERIVE_VRF_KEYPAIR_FROM_PRF'
      | 'CHECK_VRF_STATUS'
      | 'LOGOUT';
  id?: string;
  data?: any;
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