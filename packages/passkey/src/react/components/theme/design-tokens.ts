// Consolidate color sources to base-styles
import {
  CHROMA_COLORS,
  GREY_COLORS,
  GRADIENTS,
  LIGHT_THEME_COLORS,
  DARK_THEME_COLORS
} from '@/base-styles';

/**
 * About these tokens and CSS variables
 *
 * DesignTokens is a JS/TS representation of theming primitives. We expose these
 * runtime tokens to CSS via custom properties (aka CSS variables) so both Lit
 * components and React styles can read the same values.
 *
 * Mapping rules (applied by ThemeProvider/ThemeScope via createCSSVariables):
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
 * - ThemeScope injects variables inline on a boundary element; components
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
    accent: string;

    // Text hierarchy
    textPrimary: string;
    textSecondary: string;
    textMuted: string;

    // Surface layers
    surfacePrimary: string;
    surfaceSecondary: string;
    surfaceTertiary: string;

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
    borderPrimary: string;
    borderSecondary: string;
    borderHover: string;

    // Background Gradients
    backgroundGradientPrimary: string;
    backgroundGradientSecondary: string;
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
    ...CHROMA_COLORS,

    // Primary brand colors
    primary: CHROMA_COLORS.blue400,
    primaryHover: CHROMA_COLORS.blue500,
    secondary: GREY_COLORS.grey600,
    accent: CHROMA_COLORS.blue300,

    // Text hierarchy
    textPrimary: LIGHT_THEME_COLORS.colorText,
    textSecondary: LIGHT_THEME_COLORS.colorTextSecondary,
    textMuted: LIGHT_THEME_COLORS.colorTextMuted,

    // Surface layers
    surfacePrimary: LIGHT_THEME_COLORS.colorBackground,
    surfaceSecondary: LIGHT_THEME_COLORS.colorSurface,
    surfaceTertiary: LIGHT_THEME_COLORS.slate200,

    // Interactive states
    hover: GREY_COLORS.grey100,
    active: GREY_COLORS.grey200,
    focus: CHROMA_COLORS.blue400,

    // Status colors
    success: CHROMA_COLORS.blue300, // using blue as consolidated success tint
    warning: CHROMA_COLORS.yellow400,
    error: CHROMA_COLORS.red400,
    info: CHROMA_COLORS.blue400,

    // Border colors
    borderPrimary: LIGHT_THEME_COLORS.slate300,
    borderSecondary: GREY_COLORS.grey300,
    borderHover: GREY_COLORS.slate350,

    // Background Gradients
    backgroundGradientPrimary: GRADIENTS.blue,
    backgroundGradientSecondary: GRADIENTS.blueWhite,
  },

  spacing: {
    xs: '0.25rem',   // 4px
    sm: '0.5rem',    // 8px
    md: '1rem',      // 16px
    lg: '1.5rem',    // 24px
    xl: '2rem',      // 32px
  },

  borderRadius: {
    sm: '0.375rem',  // 6px
    md: '0.5rem',    // 8px
    lg: '0.75rem',   // 12px
    xl: '1rem',      // 16px
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
    ...CHROMA_COLORS,

    // Primary brand colors (keep consistent with light)
    primary: CHROMA_COLORS.blue400,
    primaryHover: CHROMA_COLORS.blue500,
    secondary: GREY_COLORS.grey400,
    accent: CHROMA_COLORS.blue300,

    // Text hierarchy (dark palette)
    textPrimary: DARK_THEME_COLORS.colorText,
    textSecondary: DARK_THEME_COLORS.colorTextSecondary,
    textMuted: LIGHT_THEME_COLORS.colorTextMuted,

    // Surface layers (dark palette)
    surfacePrimary: DARK_THEME_COLORS.grey750,  // base-styles mapped value
    surfaceSecondary: DARK_THEME_COLORS.grey650,
    surfaceTertiary: DARK_THEME_COLORS.grey850,

    // Interactive states
    hover: DARK_THEME_COLORS.grey850,
    active: DARK_THEME_COLORS.grey650,
    focus: CHROMA_COLORS.blue400,

    // Status colors (unchanged)
    success: CHROMA_COLORS.blue300,
    warning: CHROMA_COLORS.yellow400,
    error: CHROMA_COLORS.red400,
    info: CHROMA_COLORS.blue400,

    // Border colors (dark palette)
    borderPrimary: DARK_THEME_COLORS.grey650,
    borderSecondary: DARK_THEME_COLORS.grey750,
    borderHover: DARK_THEME_COLORS.grey750,

    // Background Gradients
    backgroundGradientPrimary: GRADIENTS.blue,
    backgroundGradientSecondary: GRADIENTS.blueWhite,
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


// (Archived) Alternative theme sketches removed for clarity; LIGHT_TOKENS and
// DARK_TOKENS plus component-specific overrides are the single source of truth.

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
      surfacePrimary: GREY_COLORS.grey50,
      borderPrimary: GREY_COLORS.grey200,
    }
  },
  dark: {
    ...DARK_TOKENS,
    colors: {
      ...DARK_TOKENS.colors,
      // Profile button specific overrides
      surfacePrimary: GREY_COLORS.grey750,  // Charcoal
      borderPrimary: GREY_COLORS.grey650,
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
    circleColor: DARK_TOKENS.colors.surfaceSecondary,
  }
};
