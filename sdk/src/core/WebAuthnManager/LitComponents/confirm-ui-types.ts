import { TransactionInputWasm, VRFChallenge } from '../../types';

export interface ConfirmUIElement {
  /** When true, host controls element removal (two-phase close). */
  deferClose?: boolean;
  /** Optional close API for programmatic removal with a final decision state. */
  close?(confirmed: boolean): void;
}

export type ConfirmationUIMode = 'skip' | 'modal' | 'drawer';
// Public handle returned by mount/await helpers

export type ConfirmUIUpdate = {
  nearAccountId?: string;
  txSigningRequests?: TransactionInputWasm[];
  vrfChallenge?: VRFChallenge;
  theme?: 'dark' | 'light';
  loading?: boolean;
  errorMessage?: string;
};

export interface ConfirmUIHandle {
  close(confirmed: boolean): void;
  update(props: ConfirmUIUpdate): void;
}
