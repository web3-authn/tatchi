import type { ComponentStyles } from '../LitElementWithProps';
import { DARK_THEME, LIGHT_THEME } from '../base-styles';

export type ArrowButtonThemeName = 'light' | 'dark';

export const ARROW_BUTTON_THEMES: Record<ArrowButtonThemeName, ComponentStyles> = {
  light: {
    ...LIGHT_THEME,
    button: {
      background: LIGHT_THEME.primary,
      hoverBackground: LIGHT_THEME.primaryHover,
      borderColor: LIGHT_THEME.colorBackground,
      disabledBackground: LIGHT_THEME.borderSecondary,
    },
    icon: { color: LIGHT_THEME.textPrimary },
    label: { color: LIGHT_THEME.textPrimary },
  },
  dark: {
    ...DARK_THEME,
    button: {
      background: DARK_THEME.primary,
      hoverBackground: DARK_THEME.primaryHover,
      borderColor: DARK_THEME.colorBackground,
      disabledBackground: DARK_THEME.borderSecondary,
    },
    icon: { color: DARK_THEME.textPrimary },
    label: { color: DARK_THEME.textPrimary },
  }
};
