import { TransactionInputWasm, VRFChallenge } from '../../types';

export interface ConfirmUIElement {
  /** When true, host controls element removal (two-phase close). */
  deferClose?: boolean;
  /** Optional close API for programmatic removal with a final decision state. */
  close?(confirmed: boolean): void;
}

export type ConfirmationUIMode = 'skip' | 'modal' | 'drawer';

// Theme name used across confirm UI
export type ThemeName = 'dark' | 'light';
// Optional enum-style helper to avoid magic strings at callsites
export enum Theme {
  Dark = 'dark',
  Light = 'light',
}

export function validateTheme(s?: string): ThemeName | undefined {
  return s === 'dark' || s === 'light' ? (s as ThemeName) : undefined;
}
// Public handle returned by mount/await helpers

export type ConfirmUIUpdate = {
  nearAccountId?: string;
  txSigningRequests?: TransactionInputWasm[];
  vrfChallenge?: Partial<VRFChallenge>;
  theme?: ThemeName;
  loading?: boolean;
  errorMessage?: string;
  title?: string;
  body?: string;
};

export interface ConfirmUIHandle {
  close(confirmed: boolean): void;
  update(props: ConfirmUIUpdate): void;
}
