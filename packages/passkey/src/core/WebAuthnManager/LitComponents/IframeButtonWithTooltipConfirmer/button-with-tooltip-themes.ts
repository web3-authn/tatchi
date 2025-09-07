import type { ComponentStyles } from '../LitElementWithProps';

export type EmbeddedTxButtonTheme = 'dark' | 'light';

export interface EmbeddedTxButtonStyles extends ComponentStyles {}

// Preset theme definitions for embedded transaction button styling
export const EMBEDDED_TX_BUTTON_THEMES: Record<EmbeddedTxButtonTheme, EmbeddedTxButtonStyles> = {
  dark: {
    // intentionally empty; embedded element uses inline CSS variables from buttonStyle
  },
  light: {
    // intentionally empty; embedded element uses inline CSS variables from buttonStyle
  }
};
