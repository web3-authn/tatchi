/**
 * Base color palette for Web3Auth Lit components
 * Using ONLY colors from Guidelines.md for consistency
 */

// Core color palette from Guidelines.md
export const GUIDELINES_COLORS = {
  // Light mode colors
  lightBackground: 'oklch(0.88 0 0)',        // Primary background - light gray
  lightText: 'oklch(0 0 0)',                 // Primary text - black
  lightTextSecondary: 'oklch(0.5 0.02 240)', // Secondary text - gray
  lightButtonText: 'oklch(0.4 0.02 220)',    // Button text - dark gray
  lightBorder: 'oklch(0.8 0 0)',             // Button border - light gray

  // Dark mode colors
  darkBackground: 'oklch(0.1 0 0)',          // Primary background - dark charcoal
  darkText: 'oklch(1 0 0)',                  // Primary text - white
  darkTextSecondary: 'oklch(0.53 0 0)',     // Secondary text - medium gray
  darkButtonText: 'oklch(0.8 0 0)',         // Button text - light gray
  darkBorder: 'oklch(0.2 0 0)',             // Button border - dark gray

  // Additional utility colors
  dotPattern: 'oklch(0.4 0 0)',              // Dot pattern color
  innerButtonDark: 'oklch(0.16 0 0)',       // Inner button background (dark)
  mediumGray: 'oklch(0.53 0 0)',            // Medium gray for variations
} as const;

// Comprehensive grey color palette with multiple variations
// - Standard greys: Basic grey scale with subtle blue tint
// - Neutral greys: Pure greys without any color tint
// - Warm greys: Greys with subtle reddish tint (hue: 25°)
// - Cool greys: Greys with subtle bluish tint (hue: 240°)
// - Slate: Greys with stronger blue tint for design accent
export const GREY_COLORS = {
  // Ultra light greys
  grey25: 'oklch(0.99 0.001 240)',   // Ultra light grey
  grey50: 'oklch(0.98 0 0)',         // Very light grey

  // Light greys
  grey75: 'oklch(0.97 0.002 240)',   // Very light grey
  grey100: 'oklch(0.95 0.005 240)',  // Light grey
  grey150: 'oklch(0.92 0.007 240)',  // Light grey
  grey200: 'oklch(0.88 0.01 240)',   // Lighter grey
  grey250: 'oklch(0.85 0.012 240)',  // Light grey
  grey300: 'oklch(0.8 0.015 240)',   // Light grey

  // Medium-light greys
  grey350: 'oklch(0.75 0.017 240)',  // Medium-light grey
  grey400: 'oklch(0.65 0.02 240)',   // Medium-light grey
  grey450: 'oklch(0.6 0.021 240)',   // Medium-light grey

  // Medium greys
  grey500: 'oklch(0.53 0.02 240)',   // Medium grey
  grey550: 'oklch(0.48 0.02 240)',   // Medium grey
  grey600: 'oklch(0.4 0.02 240)',    // Medium-dark grey

  // Medium-dark greys
  grey650: 'oklch(0.35 0.018 240)',  // Medium-dark grey
  grey700: 'oklch(0.3 0.015 240)',   // Dark grey
  grey750: 'oklch(0.25 0.012 240)',  // Dark grey

  // Dark greys
  grey800: 'oklch(0.2 0.01 240)',    // Darker grey
  grey850: 'oklch(0.15 0.008 240)',  // Very dark grey
  grey900: 'oklch(0.1 0.005 240)',   // Very dark grey

  // Ultra dark greys
  grey950: 'oklch(0.05 0.002 240)',  // Ultra dark grey
  grey975: 'oklch(0.025 0.001 240)', // Near black grey

  // Slate variations (stronger blue tint)
  slate50: 'oklch(0.98 0.005 240)',   // Very light slate
  slate100: 'oklch(0.95 0.01 240)',   // Light slate
  slate200: 'oklch(0.88 0.015 240)',  // Lighter slate
  slate300: 'oklch(0.8 0.02 240)',    // Light slate
  slate400: 'oklch(0.65 0.025 240)',  // Medium-light slate
  slate500: 'oklch(0.53 0.03 240)',   // Medium slate
  slate600: 'oklch(0.4 0.025 240)',   // Medium-dark slate
  slate700: 'oklch(0.3 0.02 240)',    // Dark slate
  slate800: 'oklch(0.2 0.015 240)',   // Darker slate
  slate900: 'oklch(0.1 0.01 240)',    // Very dark slate
} as const;

// Typography (non-color properties)
export const TYPOGRAPHY = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSizeSm: '0.875rem',
  fontSizeBase: '1rem',
  fontSizeLg: '1.125rem',
  fontSizeXl: '1.25rem',
} as const;

// Spacing
export const SPACING_VARS = {
  radiusSm: '0.375rem',
  radiusMd: '0.5rem',
  radiusLg: '0.75rem',
  radiusXl: '1rem',
  gap2: '0.5rem',
  gap3: '0.75rem',
  gap4: '1rem',
  gap6: '1.5rem',
  shadowSm: '0 1px 2px rgba(0, 0, 0, 0.06), 0 1px 1px rgba(0, 0, 0, 0.04)',
  shadowMd: '0 2px 8px rgba(0, 0, 0, 0.08), 0 1px 4px rgba(0, 0, 0, 0.06)',
} as const;

// Dark Theme Colors - Using ONLY colors from Guidelines.md
export const DARK_THEME_COLORS = {
  ...GUIDELINES_COLORS,
  ...GREY_COLORS,

  // Core colors using Guidelines.md palette
  colorBackground: GUIDELINES_COLORS.darkBackground,     // Primary dark background
  colorSurface: GUIDELINES_COLORS.innerButtonDark,       // Dark surface (using inner button color)
  colorBorder: GUIDELINES_COLORS.darkBorder,             // Dark border
  colorText: GUIDELINES_COLORS.darkText,                 // Primary text
  colorTextSecondary: GUIDELINES_COLORS.darkTextSecondary, // Secondary text

  // Highlighting colors using available Guidelines.md colors
  highlightReceiverId: GUIDELINES_COLORS.mediumGray,     // Using medium gray for contrast
  highlightMethodName: GUIDELINES_COLORS.darkTextSecondary, // Using secondary text color

  // Additional component colors
  colorButtonText: GUIDELINES_COLORS.darkButtonText,     // Button text
  colorDotPattern: GUIDELINES_COLORS.dotPattern,         // Dot pattern

  // Semantic colors - Using cobalt blue hues from style-guide-2.md
  colorPrimary: 'oklch(0.55 0.18 240)',      // Base cobalt blue for dark mode
  colorSecondary: 'oklch(0.65 0.14 240)',    // Lighter cobalt blue for dark mode
  colorSuccess: 'oklch(0.55 0.18 140)',      // Consistent brightness green for dark mode
  colorWarning: 'oklch(0.55 0.18 85)',       // Consistent brightness orange for dark mode
  colorError: 'oklch(0.55 0.18 15)',         // Consistent brightness red for dark mode
} as const;

// Light Theme Colors - Using ONLY colors from Guidelines.md
export const LIGHT_THEME_COLORS = {
  ...GUIDELINES_COLORS,
  ...GREY_COLORS,

  // Core colors using Guidelines.md palette
  colorBackground: GUIDELINES_COLORS.lightBackground,    // Primary light background
  colorSurface: GUIDELINES_COLORS.lightBorder,           // Light surface (using border color)
  colorBorder: GUIDELINES_COLORS.lightBorder,            // Light border
  colorText: GUIDELINES_COLORS.lightText,                // Primary text
  colorTextSecondary: GUIDELINES_COLORS.lightTextSecondary, // Secondary text

  // Highlighting colors using available Guidelines.md colors
  highlightReceiverId: GUIDELINES_COLORS.lightTextSecondary, // Using secondary text for contrast
  highlightMethodName: GUIDELINES_COLORS.dotPattern,        // Using dot pattern color

  // Additional component colors
  colorButtonText: GUIDELINES_COLORS.lightButtonText,     // Button text
  colorDotPattern: GUIDELINES_COLORS.dotPattern,          // Dot pattern

  // Semantic colors - Using deeper cobalt blue hues from style-guide-2.md
  colorPrimary: 'oklch(0.45 0.18 240)',      // Deeper cobalt blue for light mode
  colorSecondary: 'oklch(0.55 0.14 240)',    // Base cobalt blue for light mode
  colorSuccess: 'oklch(0.45 0.18 140)',      // Consistent brightness green for light mode
  colorWarning: 'oklch(0.45 0.18 85)',       // Consistent brightness orange for light mode
  colorError: 'oklch(0.45 0.18 15)',         // Consistent brightness red for light mode
} as const;
