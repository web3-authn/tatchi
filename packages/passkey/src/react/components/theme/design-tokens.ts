// ============================================================================
// UNIFIED DESIGN SYSTEM
// ============================================================================

import type { DesignTokens } from '../ProfileSettingsButton/types';

// ============================================================================
// BASE COLOR PALETTE
// ============================================================================
const COLORS = {
  // Core brand colors
  blue: {
    primary: 'oklch(0.536 0.214 260.0)',  // Updated cobalt blue
    hover: 'oklch(0.464 0.185 260.0)',    // Darker blue for hover
    light: 'oklch(0.7 0.15 260)',         // Lighter blue for accents
  },

  // Neutral grays (OKLCH for better perceptual uniformity)
  gray: {
    50:  'oklch(0.98 0.005 240)',   // Very light gray
    100: 'oklch(0.95 0.01 240)',    // Light gray
    200: 'oklch(0.9 0.015 240)',    // Lighter gray
    300: 'oklch(0.8 0.02 240)',     // Light medium gray
    400: 'oklch(0.7 0.025 240)',    // Medium gray
    500: 'oklch(0.6 0.03 240)',     // Base gray
    600: 'oklch(0.5 0.035 240)',    // Dark medium gray
    650: 'oklch(0.45 0.0375 240)',  // Custom charcoal gray
    700: 'oklch(0.4 0.04 240)',     // Darker gray
    750: 'oklch(0.35 0.0425 240)',  // Custom charcoal gray
    800: 'oklch(0.3 0.045 240)',    // Very dark gray
    900: 'oklch(0.2 0.05 240)',     // Almost black
  },

  // Semantic colors
  status: {
    success: 'oklch(0.6 0.15 140)',   // Green
    warning: 'oklch(0.7 0.12 85)',    // Orange
    error: 'oklch(0.55 0.18 25)',     // Red
    info: 'oklch(0.6 0.15 240)',      // Blue
  }
};

// ============================================================================
// LIGHT THEME TOKENS
// ============================================================================
export const LIGHT_TOKENS: DesignTokens = {
  colors: {
    // Primary brand colors
    primary: COLORS.blue.primary,
    primaryHover: COLORS.blue.hover,
    secondary: COLORS.gray[600],
    accent: COLORS.blue.light,

    // Text hierarchy
    textPrimary: COLORS.gray[900],
    textSecondary: COLORS.gray[700],
    textMuted: COLORS.gray[500],

    // Surface layers
    surfacePrimary: COLORS.gray[50],
    surfaceSecondary: COLORS.gray[100],
    surfaceTertiary: COLORS.gray[200],

    // Interactive states
    hover: COLORS.gray[100],
    active: COLORS.gray[200],
    focus: COLORS.blue.primary,

    // Status colors
    success: COLORS.status.success,
    warning: COLORS.status.warning,
    error: COLORS.status.error,
    info: COLORS.status.info,

    // Border colors
    borderPrimary: COLORS.gray[300],
    borderSecondary: COLORS.gray[200],
    borderHover: COLORS.gray[400],
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
    // Primary brand colors (keep consistent with light)
    primary: COLORS.blue.primary,
    primaryHover: COLORS.blue.hover,
    secondary: COLORS.gray[400],
    accent: COLORS.blue.light,

    // Text hierarchy (dark palette)
    textPrimary: 'oklch(0.95 0 0)',             // --w3a-profile-dark-text-primary
    textSecondary: 'oklch(0.55 0 0)',           // --w3a-profile-dark-text-secondary
    textMuted: 'oklch(0.55 0 0)',               // align with secondary in legacy vars

    // Surface layers (dark palette)
    surfacePrimary: 'oklch(0.25 0.012 240)',    // --w3a-profile-dark-bg-primary (grey750)
    surfaceSecondary: 'oklch(0.35 0.018 240)',  // tx expanded / general secondary (grey650)
    surfaceTertiary: 'oklch(0.15 0.008 240)',   // menu hover (grey850)

    // Interactive states
    hover: 'oklch(0.15 0.008 240)',             // --w3a-menu-dark-bg-hover
    active: 'oklch(0.35 0.018 240)',            // slightly elevated/darker surface
    focus: COLORS.blue.primary,

    // Status colors (unchanged)
    success: COLORS.status.success,
    warning: COLORS.status.warning,
    error: COLORS.status.error,
    info: COLORS.status.info,

    // Border colors (dark palette)
    borderPrimary: 'oklch(0.35 0.018 240)',     // --w3a-profile-dark-border-primary (grey650)
    borderSecondary: 'oklch(0.25 0.012 240)',   // grey750
    borderHover: 'oklch(0.25 0.012 240)',       // --w3a-profile-dark-border-hover
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

// ============================================================================
// SOLARIZED DARK THEME TOKENS
// ============================================================================
export const SOLARIZED_DARK_TOKENS: DesignTokens = {
  colors: {
    // Primary brand colors (same as light for consistency)
    primary: COLORS.blue.primary,
    primaryHover: COLORS.blue.hover,
    secondary: COLORS.gray[400],
    accent: COLORS.blue.light,

    // Text hierarchy (inverted)
    textPrimary: 'oklch(1 0 0)',        // Pure white
    textSecondary: COLORS.gray[300],     // Light gray
    textMuted: COLORS.gray[500],         // Medium gray

    // Surface layers (charcoal theme)
    surfacePrimary: COLORS.gray[800],    // Dark charcoal
    surfaceSecondary: COLORS.gray[750],  // Medium charcoal
    surfaceTertiary: COLORS.gray[700],   // Light charcoal

    // Interactive states
    hover: COLORS.gray[700],
    active: COLORS.gray[600],
    focus: COLORS.blue.primary,

    // Status colors (slightly adjusted for dark backgrounds)
    success: COLORS.status.success,
    warning: COLORS.status.warning,
    error: COLORS.status.error,
    info: COLORS.status.info,

    // Border colors
    borderPrimary: COLORS.gray[600],
    borderSecondary: COLORS.gray[700],
    borderHover: COLORS.gray[500],
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
    cssVars.push(`${prefix}-color-${key}: ${value};`);
  });

  // Spacing
  Object.entries(tokens.spacing).forEach(([key, value]) => {
    cssVars.push(`${prefix}-spacing-${key}: ${value};`);
  });

  // Border radius
  Object.entries(tokens.borderRadius).forEach(([key, value]) => {
    cssVars.push(`${prefix}-radius-${key}: ${value};`);
  });

  // Shadows
  Object.entries(tokens.shadows).forEach(([key, value]) => {
    cssVars.push(`${prefix}-shadow-${key}: ${value};`);
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
      surfacePrimary: COLORS.gray[50],
      borderPrimary: COLORS.gray[200],
    }
  },
  dark: {
    ...DARK_TOKENS,
    colors: {
      ...DARK_TOKENS.colors,
      // Profile button specific overrides
      surfacePrimary: COLORS.gray[750],  // Charcoal
      borderPrimary: COLORS.gray[650],
    }
  }
};

/**
 * Modal specific tokens
 */
export const MODAL_TOKENS = {
  light: {
    ...LIGHT_TOKENS,
    colors: {
      ...LIGHT_TOKENS.colors,
      // Glass effect for modals
      surfacePrimary: 'rgba(255, 255, 255, 0.95)',
      surfaceSecondary: 'rgba(255, 255, 255, 0.9)',
    }
  },
  dark: {
    ...DARK_TOKENS,
    colors: {
      ...DARK_TOKENS.colors,
      // Glass effect for dark modals
      surfacePrimary: COLORS.gray[750],
      surfaceSecondary: COLORS.gray[700],
    }
  }
};
