import type { ConfirmationConfig } from '../../../../types/signer-worker';
import type { TransactionContext, VRFChallenge } from '../../../../types';
import type { ConfirmUIHandle } from '../../../LitComponents/confirm-ui';
import type { ClientAuthenticatorData } from '../../../../IndexedDBManager';
import type { SessionVrfWorkerManager } from '../../';
import type { SerializableCredential, SecureConfirmRequest, TransactionSummary } from '../types';

export type NearContextResult = {
  transactionContext: TransactionContext | null;
  error?: string;
  details?: string;
  reservedNonces?: string[];
};

export interface NearContextProvider {
  fetchNearContext(opts: { nearAccountId: string; txCount: number; reserveNonces: boolean }): Promise<NearContextResult>;
  releaseReservedNonces(nonces?: string[]): void;
}

export interface VrfProvider extends SessionVrfWorkerManager {
  getRpId(): string;
  maybeRefreshVrfChallenge(
    request: SecureConfirmRequest,
    nearAccountId: string,
  ): Promise<{ vrfChallenge: VRFChallenge; transactionContext: TransactionContext }>;
}

export interface WebAuthnCollector {
  collectAuthenticationCredentialWithPRF(args: {
    nearAccountId: string;
    vrfChallenge: VRFChallenge;
    onBeforePrompt?: (info: {
      authenticators: ClientAuthenticatorData[];
      authenticatorsForPrompt: ClientAuthenticatorData[];
      vrfChallenge: VRFChallenge;
    }) => void;
    includeSecondPrfOutput?: boolean;
  }): Promise<SerializableCredential>;

  createRegistrationCredential(args: {
    nearAccountId: string;
    challenge: VRFChallenge;
    deviceNumber?: number;
  }): Promise<PublicKeyCredential>;
}

export interface ConfirmUiRenderer {
  renderConfirmUI(args: {
    request: SecureConfirmRequest;
    confirmationConfig: ConfirmationConfig;
    transactionSummary: TransactionSummary;
    vrfChallenge?: Partial<VRFChallenge>;
  }): Promise<{ confirmed: boolean; confirmHandle?: ConfirmUIHandle; error?: string }>;

  closeModalSafely(confirmed: boolean, handle?: ConfirmUIHandle): void;
}

export interface ConfirmTxFlowAdapters {
  near: NearContextProvider;
  vrf: VrfProvider;
  webauthn: WebAuthnCollector;
  ui: ConfirmUiRenderer;
}

