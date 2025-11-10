// Shared facade for base theme tokens
// Build tokens from palette.json using the pure factory in theme/base-styles.js
import palette from '@/theme/palette.json';
import { createThemeTokens } from '@/theme/base-styles.js';

const built = createThemeTokens(palette);

export const CHROMA_COLORS: Record<string, string> = built.CHROMA_COLORS;
export const GREY_COLORS: Record<string, string> = built.GREY_COLORS;
export const CREAM_COLORS: Record<string, string> = built.CREAM_COLORS;
export const GRADIENTS: Record<string, string> = built.GRADIENTS;

type ThemeAliases = {
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textButton: string;
  colorBackground: string;
  surface: string;
  surface2: string;
  surface3: string;
  surface4: string;
  primary: string;
  primaryHover: string;
  secondary: string;
  secondaryHover: string;
  accent: string;
  buttonBackground: string;
  buttonHoverBackground: string;
  hover: string;
  active: string;
  focus: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  borderPrimary: string;
  borderSecondary: string;
  borderHover: string;
  backgroundGradientPrimary: string;
  backgroundGradientSecondary: string;
  backgroundGradient3: string;
  backgroundGradient4: string;
  highlightReceiverId: string;
  highlightMethodName: string;
  highlightAmount: string;
} & Record<string, string>;

export const DARK_THEME: ThemeAliases = built.DARK_THEME;
export const LIGHT_THEME: ThemeAliases = built.LIGHT_THEME;
export const CREAM_THEME: ThemeAliases = built.CREAM_THEME;

export default built;
