/**
 * Deprecated: runtime theme injection has been removed.
 *
 * The modal and drawer confirmers now read their tokens from static CSS
 * stylesheets (see src/core/WebAuthnManager/LitComponents/css/modal-confirmer.css). This file remains only
 * for backwards-compatibility of the public API surface.
*/
import type { ComponentStyles } from '../LitElementWithProps';

export type ModalConfirmerTheme = 'dark' | 'light';

export interface ModalTxConfirmerStyles extends ComponentStyles {}

// Kept for API compatibility; values are no-ops now.
export const MODAL_CONFIRMER_THEMES: Record<ModalConfirmerTheme, ModalTxConfirmerStyles> = {
  dark: {},
  light: {},
};
