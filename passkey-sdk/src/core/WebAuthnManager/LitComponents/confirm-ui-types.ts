export interface ConfirmUIElement {
  /** When true, host controls element removal (two-phase close). */
  deferClose?: boolean;
  /** Optional close API for programmatic removal with a final decision state. */
  close?(confirmed: boolean): void;
}

