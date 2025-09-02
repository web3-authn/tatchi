/**
 * Base color palette for Web3Auth Lit components
 */

export const CHROMA_COLORS = {
  // yellow color scale from lightest to darkest
  yellow25: 'oklch(0.950 0.055 90.0)',  // lightest
  yellow50: 'oklch(0.870 0.145 90.0)',
  yellow100: 'oklch(0.790 0.134 90.0)',
  yellow200: 'oklch(0.710 0.121 90.0)',
  yellow300: 'oklch(0.630 0.107 90.0)',
  yellow400: 'oklch(0.550 0.093 90.0)',
  yellow500: 'oklch(0.470 0.080 90.0)',
  yellow600: 'oklch(0.390 0.066 90.0)',
  yellow700: 'oklch(0.310 0.053 90.0)', // darkest

  // Blue color scale from lightest to darkest
  blue25: 'oklch(0.900 0.041 260.0)',  // lightest
  blue50: 'oklch(0.827 0.073 260.0)',
  blue100: 'oklch(0.755 0.107 260.0)',
  blue200: 'oklch(0.682 0.142 260.0)',
  blue300: 'oklch(0.609 0.178 260.0)',
  blue400: 'oklch(0.536 0.214 260.0)',
  blue500: 'oklch(0.464 0.185 260.0)',
  blue600: 'oklch(0.391 0.156 260.0)',
  blue700: 'oklch(0.318 0.127 260.0)',
  blue800: 'oklch(0.245 0.098 260.0)',
  blue900: 'oklch(0.173 0.069 260.0)',
  blue1000: 'oklch(0.100 0.040 260.0)', // darkest

  // Red color scale from lightest to darkest
  red25: 'oklch(0.900 0.060 20.0)',  // lightest
  red50: 'oklch(0.827 0.110 20.0)',
  red100: 'oklch(0.755 0.167 20.0)',
  red200: 'oklch(0.682 0.233 20.0)',
  red300: 'oklch(0.609 0.244 20.0)',
  red400: 'oklch(0.536 0.215 20.0)',
  red500: 'oklch(0.464 0.186 20.0)',
  red600: 'oklch(0.391 0.156 20.0)',
  red700: 'oklch(0.318 0.127 20.0)',
  red800: 'oklch(0.245 0.098 20.0)',
  red900: 'oklch(0.173 0.069 20.0)',
  red1000: 'oklch(0.100 0.040 20.0)', // darkest
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
  slate25: 'oklch(0.99 0.003 240)',    // Ultra light slate
  slate50: 'oklch(0.98 0.005 240)',   // Very light slate
  slate100: 'oklch(0.95 0.01 240)',   // Light slate
  slate150: 'oklch(0.915 0.0125 240)', // Between 100 and 200
  slate200: 'oklch(0.88 0.015 240)',  // Lighter slate
  slate250: 'oklch(0.84 0.0175 240)',  // Between 200 and 300
  slate300: 'oklch(0.8 0.02 240)',    // Light slate
  slate350: 'oklch(0.725 0.0225 240)', // Between 300 and 400
  slate400: 'oklch(0.65 0.025 240)',  // Medium-light slate
  slate450: 'oklch(0.59 0.0275 240)',  // Between 400 and 500
  slate500: 'oklch(0.53 0.03 240)',   // Medium slate
  slate550: 'oklch(0.465 0.0275 240)', // Between 500 and 600
  slate600: 'oklch(0.4 0.025 240)',   // Medium-dark slate
  slate650: 'oklch(0.35 0.0225 240)',  // Between 600 and 700
  slate700: 'oklch(0.3 0.02 240)',    // Dark slate
  slate750: 'oklch(0.25 0.0175 240)',  // Between 700 and 800
  slate800: 'oklch(0.2 0.015 240)',   // Darker slate
  slate850: 'oklch(0.15 0.0125 240)',  // Between 800 and 900
  slate900: 'oklch(0.1 0.01 240)',    // Very dark slate
} as const;

// No separate guideline map; themes below compose from GREY_COLORS + CHROMA_COLORS

// (Typography and spacing tokens are defined per-component in themes.)

// Dark Theme Colors - Using ONLY colors from Guidelines.md
export const DARK_THEME_COLORS = {
  ...GREY_COLORS,

  // Core colors used by components
  colorBackground: GREY_COLORS.grey900,
  colorSurface: GREY_COLORS.grey850,
  colorBorder: GREY_COLORS.grey800,
  colorText: GREY_COLORS.grey25,
  colorTextSecondary: GREY_COLORS.grey500,

  // Specific neutrals referenced
  grey500: GREY_COLORS.grey500,
  grey600: GREY_COLORS.grey600,
  grey650: GREY_COLORS.grey650,
  grey700: GREY_COLORS.grey700,
  grey750: GREY_COLORS.grey750,

  // Accent blues referenced
  blue300: CHROMA_COLORS.blue300,
  blue400: CHROMA_COLORS.blue400,

  // Highlights
  highlightReceiverId: CHROMA_COLORS.blue300,
  highlightMethodName: CHROMA_COLORS.blue200,

  // Misc
  colorPrimary: CHROMA_COLORS.blue400,
} as const;

// Light Theme Colors - Using ONLY colors from Guidelines.md
export const LIGHT_THEME_COLORS = {
  ...GREY_COLORS,

  // Core colors used by components
  colorBackground: GREY_COLORS.grey200,
  colorSurface: GREY_COLORS.grey300,
  colorBorder: GREY_COLORS.grey300,
  colorText: GREY_COLORS.grey975,
  colorTextSecondary: GREY_COLORS.grey500,

  // Specific neutrals referenced
  grey25: GREY_COLORS.grey25,
  grey50: GREY_COLORS.grey50,
  grey75: GREY_COLORS.grey75,
  grey100: GREY_COLORS.grey100,

  // Slate variants referenced
  slate25: GREY_COLORS.slate25,
  slate100: GREY_COLORS.slate100,
  slate150: GREY_COLORS.slate150,
  slate200: GREY_COLORS.slate200,
  slate300: GREY_COLORS.slate300,

  // Accent blues referenced
  blue300: CHROMA_COLORS.blue300,
  blue400: CHROMA_COLORS.blue400,

  // Highlights
  highlightReceiverId: CHROMA_COLORS.blue400,
  highlightMethodName: CHROMA_COLORS.blue300,

  // Misc
  colorPrimary: CHROMA_COLORS.blue400,
} as const;
