// Consolidate color sources to base-styles
import {
  CHROMA_COLORS,
  GREY_COLORS,
  GRADIENTS,
  LIGHT_THEME,
  DARK_THEME
} from '@/base-styles';

/**
 * About these tokens and CSS variables
 *
 * DesignTokens is a JS/TS representation of theming primitives. We expose these
 * runtime tokens to CSS via custom properties (aka CSS variables) so both Lit
 * components and React styles can read the same values.
 *
 * Mapping rules (applied by Theme via createCSSVariables):
 * - colors:   --w3a-colors-<key>
 *   e.g. tokens.colors.primary → --w3a-colors-primary
 * - spacing:  --w3a-spacing-<key>
 *   e.g. tokens.spacing.md     → --w3a-spacing-md
 * - borderRadius:   --w3a-border-radius-<key>
 *   e.g. tokens.borderRadius.lg→ --w3a-border-radius-lg
 * - shadows:  --w3a-shadows-<key>
 *   e.g. tokens.shadows.sm     → --w3a-shadow-sm
 *
 * Where they’re used:
 * - Theme injects variables inline on a boundary element; components
 *   reference them with var(--w3a-colors-primary), etc.
 * - Component-specific helpers (e.g., PROFILE_BUTTON_TOKENS, PROFILE_TOGGLE_TOKENS)
 *   derive from LIGHT_TOKENS/DARK_TOKENS and are read by components directly
 *   or mapped to CSS vars via their own applyStyles helpers.
 */

// ============================================================================
// DESIGN TOKENS TYPES
// ============================================================================

export interface DesignTokens {
  colors: {
    // Primary brand colors
    primary: string;
    primaryHover: string;
    secondary: string;
    secondaryHover: string;
    accent: string;

    // Text hierarchy
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    // Button text (explicit light text for buttons)
    textButton: string;

    // Button backgrounds (primary action buttons)
    buttonBackground: string;
    buttonHoverBackground: string;

    // Surface layers
    colorBackground: string;
    surface: string;
    surface2: string;
    surface3: string;
    surface4: string;

    // Interactive states
    hover: string;
    active: string;
    focus: string;

    // Status colors
    success: string;
    warning: string;
    error: string;
    info: string;

    // Border colors
    // removed: use borderPrimary/border* keys
    borderPrimary: string;
    borderSecondary: string;
    borderHover: string;

    // Background Gradients
    backgroundGradientPrimary: string;
    backgroundGradientSecondary: string;
    backgroundGradient3: string;
    backgroundGradient4: string;

    // Grey variations
    grey25: string;
    grey50: string;
    grey75: string;
    grey100: string;
    grey200: string;
    grey300: string;
    grey400: string;
    grey500: string;
    grey600: string;
    grey650: string;
    grey700: string;
    grey750: string;
    grey800: string;
    grey850: string;
    grey900: string;
    grey950: string;

    // Slate variations
    slate25: string;
    slate50: string;
    slate75: string;
    slate100: string;
    slate150: string;
    slate200: string;
    slate300: string;
    slate400: string;
    slate500: string;
    slate600: string;
    slate700: string;
    slate800: string;
    slate900: string;

    // Highlights
    highlightReceiverId: string;
    highlightMethodName: string;
    highlightAmount: string;
  };

  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };

  borderRadius: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };

  shadows: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
}

export interface UseThemeReturn {
  theme: 'light' | 'dark';
  tokens: DesignTokens;
  isDark: boolean;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
}

// ============================================================================
// LIGHT THEME TOKENS
// ============================================================================
export const LIGHT_TOKENS: DesignTokens = {
  colors: {
    // ...CHROMA_COLORS,

    // Primary brand colors
    primary: LIGHT_THEME.primary,
    primaryHover: LIGHT_THEME.primaryHover,
    secondary: LIGHT_THEME.secondary ?? CHROMA_COLORS.violet600,
    secondaryHover: LIGHT_THEME.secondaryHover ?? CHROMA_COLORS.violet500,
    accent: LIGHT_THEME.accent,

    // Text hierarchy
    textPrimary: LIGHT_THEME.textPrimary,
    textSecondary: LIGHT_THEME.textSecondary,
    textMuted: LIGHT_THEME.textMuted,
    // Button text
    textButton: LIGHT_THEME.textButton,
    // Button background
    buttonBackground: LIGHT_THEME.buttonBackground,
    buttonHoverBackground: LIGHT_THEME.buttonHoverBackground,

    // Core colors
    colorBackground: LIGHT_THEME.colorBackground,
    surface: LIGHT_THEME.surface,
    surface2: LIGHT_THEME.surface2,
    surface3: LIGHT_THEME.surface3,
    surface4: LIGHT_THEME.surface4,

    // Interactive states
    hover: LIGHT_THEME.hover,
    active: LIGHT_THEME.active,
    focus: LIGHT_THEME.focus,

    // Status colors
    success: LIGHT_THEME.success,
    warning: LIGHT_THEME.warning,
    error: LIGHT_THEME.error,
    info: LIGHT_THEME.info,

    // Border colors
    // borderPrimary is the canonical border color
    borderPrimary: LIGHT_THEME.borderPrimary,
    borderSecondary: LIGHT_THEME.borderSecondary,
    borderHover: LIGHT_THEME.borderHover,

    // Background Gradients
    backgroundGradientPrimary: LIGHT_THEME.backgroundGradientPrimary,
    backgroundGradientSecondary: LIGHT_THEME.backgroundGradientSecondary,
    backgroundGradient3: LIGHT_THEME.backgroundGradient3,
    backgroundGradient4: LIGHT_THEME.backgroundGradient4,

    // Grey variations
    grey25: LIGHT_THEME.grey25,
    grey50: LIGHT_THEME.grey50,
    grey75: LIGHT_THEME.grey75,
    grey100: LIGHT_THEME.grey100,
    grey200: LIGHT_THEME.grey200,
    grey300: LIGHT_THEME.grey300,
    grey400: LIGHT_THEME.grey400,
    grey500: LIGHT_THEME.grey500,
    grey600: LIGHT_THEME.grey600,
    grey650: LIGHT_THEME.grey650,
    grey700: LIGHT_THEME.grey700,
    grey750: LIGHT_THEME.grey750,
    grey800: DARK_THEME.grey800,
    grey850: DARK_THEME.grey850,
    grey900: DARK_THEME.grey900,
    grey950: DARK_THEME.grey950,

    // Slate variations
    slate25: LIGHT_THEME.slate25,
    slate50: LIGHT_THEME.slate50,
    slate75: LIGHT_THEME.slate75,
    slate100: LIGHT_THEME.slate100,
    slate150: LIGHT_THEME.slate150,
    slate200: LIGHT_THEME.slate200,
    slate300: LIGHT_THEME.slate300,
    slate400: LIGHT_THEME.slate400,
    slate500: LIGHT_THEME.slate500,
    slate600: LIGHT_THEME.slate600,
    slate700: LIGHT_THEME.slate700,
    slate800: LIGHT_THEME.slate800,
    slate900: LIGHT_THEME.slate900,

    // Highlights
    highlightReceiverId: LIGHT_THEME.highlightReceiverId,
    highlightMethodName: LIGHT_THEME.highlightMethodName,
    highlightAmount: LIGHT_THEME.highlightAmount,
  },

  spacing: {
    xs: '0.25rem',   // 4px
    sm: '0.5rem',    // 8px
    md: '1rem',      // 16px
    lg: '1.5rem',    // 24px
    xl: '2rem',      // 32px
  },

  borderRadius: {
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
  },

  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  },
};

// ============================================================================
// DARK THEME TOKENS
// ============================================================================
export const DARK_TOKENS: DesignTokens = {
  colors: {
    // ...CHROMA_COLORS,

    // Primary brand colors (keep consistent with light)
    primary: DARK_THEME.primary,
    primaryHover: DARK_THEME.primaryHover,
    secondary: DARK_THEME.secondary ?? CHROMA_COLORS.violet600,
    secondaryHover: DARK_THEME.secondaryHover ?? CHROMA_COLORS.violet500,
    accent: DARK_THEME.accent,

    // Text hierarchy (dark palette)
    textPrimary: DARK_THEME.textPrimary,
    textSecondary: DARK_THEME.textSecondary,
    textMuted: DARK_THEME.textMuted,
    // Button text
    textButton: DARK_THEME.textButton,
    // Button background
    buttonBackground: DARK_THEME.buttonBackground,
    buttonHoverBackground: DARK_THEME.buttonHoverBackground,

    colorBackground: DARK_THEME.colorBackground,
    surface: DARK_THEME.surface,
    surface2: DARK_THEME.surface2,
    surface3: DARK_THEME.surface3,
    surface4: DARK_THEME.surface4,

    // Interactive states
    hover: DARK_THEME.hover,
    active: DARK_THEME.active,
    focus: DARK_THEME.focus,

    // Status colors (unchanged)
    success: DARK_THEME.success,
    warning: DARK_THEME.warning,
    error: DARK_THEME.error,
    info: DARK_THEME.info,

    // Border colors (dark palette)
    // borderPrimary is the canonical border color
    borderPrimary: DARK_THEME.borderPrimary,
    borderSecondary: DARK_THEME.borderSecondary,
    borderHover: DARK_THEME.borderHover,

    // Background Gradients
    backgroundGradientPrimary: DARK_THEME.backgroundGradientPrimary,
    backgroundGradientSecondary: DARK_THEME.backgroundGradientSecondary,
    backgroundGradient3: DARK_THEME.backgroundGradient3,
    backgroundGradient4: DARK_THEME.backgroundGradient4,

    // Grey variations
    grey25: DARK_THEME.grey25,
    grey50: DARK_THEME.grey50,
    grey75: DARK_THEME.grey75,
    grey100: DARK_THEME.grey100,
    grey200: DARK_THEME.grey200,
    grey300: DARK_THEME.grey300,
    grey400: DARK_THEME.grey400,
    grey500: DARK_THEME.grey500,
    grey600: DARK_THEME.grey600,
    grey650: DARK_THEME.grey650,
    grey700: DARK_THEME.grey700,
    grey750: DARK_THEME.grey750,
    grey800: DARK_THEME.grey800,
    grey850: DARK_THEME.grey850,
    grey900: DARK_THEME.grey900,
    grey950: DARK_THEME.grey950,

    // Slate variations
    slate25: DARK_THEME.slate25,
    slate50: DARK_THEME.slate50,
    slate75: DARK_THEME.slate75,
    slate100: DARK_THEME.slate100,
    slate150: DARK_THEME.slate150,
    slate200: DARK_THEME.slate200,
    slate300: DARK_THEME.slate300,
    slate400: DARK_THEME.slate400,
    slate500: DARK_THEME.slate500,
    slate600: DARK_THEME.slate600,
    slate700: DARK_THEME.slate700,
    slate800: DARK_THEME.slate800,
    slate900: DARK_THEME.slate900,

    // Highlights
    highlightReceiverId: DARK_THEME.highlightReceiverId,
    highlightMethodName: DARK_THEME.highlightMethodName,
    highlightAmount: DARK_THEME.highlightAmount,
  },

  // Same spacing, border radius, and shadows for consistency
  spacing: LIGHT_TOKENS.spacing,
  borderRadius: LIGHT_TOKENS.borderRadius,
  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.3)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -2px rgba(0, 0, 0, 0.3)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 10px 10px -5px rgba(0, 0, 0, 0.3)',
  },
};

// Optional alias exposing the warm light palette explicitly as a "cream" token set.
// It matches LIGHT_TOKENS values but provides a clearer name for consumers.
export const CREAM_TOKENS: DesignTokens = LIGHT_TOKENS;

// ============================================================================
// CSS CUSTOM PROPERTY GENERATOR
// ============================================================================
/**
 * Generates CSS custom properties from design tokens
 * This would replace all the manual CSS variable definitions
 */
export function generateThemeCSS(tokens: DesignTokens, prefix = '--w3a'): string {
  const cssVars: string[] = [];

  // Colors
  Object.entries(tokens.colors).forEach(([key, value]) => {
    // Naming (plural): --w3a-colors-<key>
    cssVars.push(`${prefix}-colors-${key}: ${value};`);
  });

  // Spacing
  Object.entries(tokens.spacing).forEach(([key, value]) => {
    cssVars.push(`${prefix}-spacing-${key}: ${value};`);
  });

  // Border radius
  Object.entries(tokens.borderRadius).forEach(([key, value]) => {
    // Naming (hyphenated): --w3a-border-radius-<key>
    cssVars.push(`${prefix}-border-radius-${key}: ${value};`);
  });

  // Shadows
  Object.entries(tokens.shadows).forEach(([key, value]) => {
    // Naming (plural): --w3a-shadows-<key>
    cssVars.push(`${prefix}-shadows-${key}: ${value};`);
  });

  return `:root {\n  ${cssVars.join('\n  ')}\n}`;
}

// ============================================================================
// COMPONENT-SPECIFIC THEME HELPERS
// ============================================================================
/**
 * Profile Button specific tokens (extends base with component-specific overrides)
 */
export const PROFILE_BUTTON_TOKENS = {
  light: {
    ...LIGHT_TOKENS,
    colors: {
      ...LIGHT_TOKENS.colors,
      // Profile button specific overrides
    }
  },
  dark: {
    ...DARK_TOKENS,
    colors: {
      ...DARK_TOKENS.colors,
    }
  }
};

// ============================================================================
// PROFILE TOGGLE TOKENS
// ============================================================================
export interface ToggleColorTokens {
  activeBackground: string;
  activeShadow: string;
  inactiveBackground: string;
  inactiveShadow: string;
  disabledBackground: string;
  disabledCircle: string;
  textColor: string;
  disabledTextColor: string;
  circleColor: string;
}

export const PROFILE_TOGGLE_TOKENS: { light: ToggleColorTokens; dark: ToggleColorTokens } = {
  light: {
    activeBackground: GRADIENTS.blue,
    activeShadow: LIGHT_TOKENS.shadows.md,
    // Slightly darker off state in light mode
    inactiveBackground: LIGHT_TOKENS.colors.borderHover,
    inactiveShadow: LIGHT_TOKENS.shadows.sm,
    disabledBackground: LIGHT_TOKENS.colors.borderSecondary,
    disabledCircle: 'transparent', // Transparent knob when disabled
    textColor: LIGHT_TOKENS.colors.textPrimary,
    disabledTextColor: LIGHT_TOKENS.colors.textMuted,
    // Slightly greyer knob in light mode (instead of pure white)
    circleColor: GREY_COLORS.grey100,
  },
  dark: {
    activeBackground: GRADIENTS.blue,
    activeShadow: DARK_TOKENS.shadows.md,
    inactiveBackground: DARK_TOKENS.colors.borderHover,
    inactiveShadow: DARK_TOKENS.shadows.sm,
    disabledBackground: DARK_TOKENS.colors.borderSecondary,
    disabledCircle: 'transparent', // Transparent knob when disabled
    textColor: DARK_TOKENS.colors.textPrimary,
    disabledTextColor: DARK_TOKENS.colors.textSecondary,
    // Slightly lighter knob in dark mode for better visibility
    circleColor: DARK_TOKENS.colors.grey800,
  }
};
