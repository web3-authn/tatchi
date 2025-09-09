import {
  ActionResult,
  EventCallback,
  OperationHooks,
  DeviceLinkingPhase,
  DeviceLinkingSSEEvent
} from './passkeyManager';
import { VRFChallenge } from './vrf-worker';
import { AccountId } from './accountIds';
import { SignedTransaction } from '../NearClient';

// Re-export DeviceLinkingPhase from passkeyManager
export { DeviceLinkingPhase } from './passkeyManager';

// === DEVICE LINKING TYPES ===
export interface DeviceLinkingQRData {
  accountId?: AccountId; // Optional - Device2 discovers this from contract polling
  device2PublicKey: string; // Device2 initiates and creates the QR code containing this public key
                            // for Device1 to scan and add it to their account.
  timestamp: number;
  version: string; // For future compatibility
}

export interface DeviceLinkingSession {
  accountId: AccountId | null; // Null until discovered from contract logs (Option F) or provided upfront (Option E)
  deviceNumber?: number; // Device number assigned by Device1 for device linking
  nearPublicKey: string;
  credential: PublicKeyCredential | null; // Null for Option F until real account discovered
  vrfChallenge: VRFChallenge | null; // Null for Option F until real account discovered
  phase: DeviceLinkingPhase;
  createdAt: number;
  expiresAt: number;
  tempPrivateKey?: string; // For Option F flow - temporary private key before replacement
}

export interface LinkDeviceResult extends ActionResult {
  device2PublicKey: string;
  transactionId?: string;
  fundingAmount: string;
  linkedToAccount?: string; // The account ID that the device key was added to
  signedDeleteKeyTransaction?: SignedTransaction;
}

export class DeviceLinkingError extends Error {
  constructor(
    message: string,
    public code: DeviceLinkingErrorCode,
    public phase: 'generation' | 'authorization' | 'registration'
  ) {
    super(message);
  }
}

export enum DeviceLinkingErrorCode {
  INVALID_QR_DATA = 'INVALID_QR_DATA',
  ACCOUNT_NOT_OWNED = 'ACCOUNT_NOT_OWNED',
  AUTHORIZATION_TIMEOUT = 'AUTHORIZATION_TIMEOUT',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  REGISTRATION_FAILED = 'REGISTRATION_FAILED',
  SESSION_EXPIRED = 'SESSION_EXPIRED'
}

export interface StartDeviceLinkingOptionsDevice2 {
  cameraId?: string;
  onEvent?: EventCallback<DeviceLinkingSSEEvent>;
  onError?: (error: Error) => void;
  hooks?: OperationHooks;
}

export interface ScanAndLinkDeviceOptionsDevice1 {
  fundingAmount: string;
  onEvent?: EventCallback<DeviceLinkingSSEEvent>;
  onError?: (error: Error) => void;
  hooks?: OperationHooks;
}