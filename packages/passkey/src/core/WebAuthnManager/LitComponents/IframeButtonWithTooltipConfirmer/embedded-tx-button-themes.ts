import type { ComponentStyles } from '../LitElementWithProps';
import { DARK_THEME_COLORS, LIGHT_THEME_COLORS } from '../base-styles';

export type EmbeddedTxButtonTheme = 'dark' | 'light';

export interface EmbeddedTxButtonStyles extends ComponentStyles {

  // Button styling variables
  btn?: Record<string, string>;
  btnHover?: Record<string, string>;
  btnActive?: Record<string, string>;

  // Host container variables
  host?: Record<string, string>;
  embeddedBtn?: Record<string, string>;
  tooltipContent?: Record<string, string>;
}

// Preset theme definitions for embedded transaction button styling
export const EMBEDDED_TX_BUTTON_THEMES: Record<EmbeddedTxButtonTheme, EmbeddedTxButtonStyles> = {
  dark: {
    // Spread base colors from shared palette
    ...DARK_THEME_COLORS,
  },
  light: {
    // Spread base colors from shared palette
    ...LIGHT_THEME_COLORS,
  }
};
