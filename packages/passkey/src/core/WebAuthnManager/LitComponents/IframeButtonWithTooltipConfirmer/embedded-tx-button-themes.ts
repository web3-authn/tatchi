import type { ComponentStyles } from '../LitElementWithProps';
import { DARK_THEME_COLORS, LIGHT_THEME_COLORS } from '../base-styles';

export type EmbeddedTxButtonTheme = 'dark' | 'light';

export interface EmbeddedTxButtonStyles extends ComponentStyles {

  // Component-specific tooltip container variables
  tooltipContainer?: Record<string, string>;
  gradientBorder?: Record<string, string>;

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

    // Base design system variables
    host: {},

    // Button styling
    btn: {},
    btnHover: {},
    btnActive: {},

    // Embedded button container
    embeddedBtn: {},

    // Tooltip content container
    tooltipContent: {},

    dataTooltipContentRoot: {
      background: DARK_THEME_COLORS.colorDotPattern,
      blur: '12px',
      borderColor: DARK_THEME_COLORS.darkBorder,
      borderRadius: '24px'
    },

    // Main tooltip container - the glass-like container around the content
    tooltipBorderInner: {
      background: DARK_THEME_COLORS.colorSurface,
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: "none",
      // background: var(--btn-background, var(--btn-color, #222));
      // border-radius: var(--btn-border-radius, 8px);
      // border: var(--btn-border, none);
    },

    // Animated gradient border
    gradientBorder: {}
  },

  light: {
    // Spread base colors from shared palette
    ...LIGHT_THEME_COLORS,

    // Base design system variables
    host: {},

    // Button styling
    btn: {},
    btnHover: {},
    btnActive: {},

    // Embedded button container
    embeddedBtn: {},

    // Tooltip content container
    tooltipContent: {},

    dataTooltipContentRoot: {
      background: LIGHT_THEME_COLORS.colorDotPattern,
      blur: '12px',
      borderColor: LIGHT_THEME_COLORS.lightBorder,
      borderRadius: '24px'
    },

    // Main tooltip container - the glass-like container around the content
    tooltipBorderInner: {
      background: LIGHT_THEME_COLORS.colorSurface,
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: "none",
    },

    // Animated gradient border
    gradientBorder: {}
  }
};
