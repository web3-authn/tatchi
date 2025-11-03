import palette from '@/theme/palette.json';

// Optional flat tokens sourced from palette.json
// Allows single-source overrides like `buttonBackground`
const TOKENS: { buttonBackground?: string } = (palette as any).tokens || {};

/**
 * Base color palette for Web3Auth components (single-source from palette.json)
 */

export const CHROMA_COLORS = {
  //yellow
  yellow50: palette.chroma.yellow['50'],
  yellow100: palette.chroma.yellow['100'],
  yellow150: palette.chroma.yellow['150'],
  yellow200: palette.chroma.yellow['200'],
  yellow250: palette.chroma.yellow['250'],
  yellow300: palette.chroma.yellow['300'],
  yellow350: palette.chroma.yellow['350'],
  yellow400: palette.chroma.yellow['400'],
  yellow450: palette.chroma.yellow['450'],
  yellow500: palette.chroma.yellow['500'],
  yellow550: palette.chroma.yellow['550'],
  yellow600: palette.chroma.yellow['600'],
  yellow650: palette.chroma.yellow['650'],
  yellow700: palette.chroma.yellow['700'],
  yellow750: palette.chroma.yellow['750'],
  yellow800: palette.chroma.yellow['800'],
  yellow850: palette.chroma.yellow['850'],
  yellow900: palette.chroma.yellow['900'],
  yellow950: palette.chroma.yellow['950'],

  // blue
  blue50: palette.chroma.blue['50'],
  blue100: palette.chroma.blue['100'],
  blue150: palette.chroma.blue['150'],
  blue200: palette.chroma.blue['200'],
  blue250: palette.chroma.blue['250'],
  blue300: palette.chroma.blue['300'],
  blue350: palette.chroma.blue['350'],
  blue400: palette.chroma.blue['400'],
  blue450: palette.chroma.blue['450'],
  blue500: palette.chroma.blue['500'],
  blue550: palette.chroma.blue['550'],
  blue600: palette.chroma.blue['600'],
  blue650: palette.chroma.blue['650'],
  blue700: palette.chroma.blue['700'],
  blue750: palette.chroma.blue['750'],
  blue800: palette.chroma.blue['800'],
  blue850: palette.chroma.blue['850'],
  blue900: palette.chroma.blue['900'],
  blue950: palette.chroma.blue['950'],
  // red
  red50: palette.chroma.red['50'],
  red100: palette.chroma.red['100'],
  red150: palette.chroma.red['150'],
  red200: palette.chroma.red['200'],
  red250: palette.chroma.red['250'],
  red300: palette.chroma.red['300'],
  red350: palette.chroma.red['350'],
  red400: palette.chroma.red['400'],
  red450: palette.chroma.red['450'],
  red500: palette.chroma.red['500'],
  red550: palette.chroma.red['550'],
  red600: palette.chroma.red['600'],
  red650: palette.chroma.red['650'],
  red700: palette.chroma.red['700'],
  red750: palette.chroma.red['750'],
  red800: palette.chroma.red['800'],
  red850: palette.chroma.red['850'],
  red900: palette.chroma.red['900'],
  red950: palette.chroma.red['950'],
  // green
  green50: palette.chroma.green['50'],
  green100: palette.chroma.green['100'],
  green150: palette.chroma.green['150'],
  green200: palette.chroma.green['200'],
  green250: palette.chroma.green['250'],
  green300: palette.chroma.green['300'],
  green350: palette.chroma.green['350'],
  green400: palette.chroma.green['400'],
  green450: palette.chroma.green['450'],
  green500: palette.chroma.green['500'],
  green550: palette.chroma.green['550'],
  green600: palette.chroma.green['600'],
  green650: palette.chroma.green['650'],
  green700: palette.chroma.green['700'],
  green750: palette.chroma.green['750'],
  green800: palette.chroma.green['800'],
  green850: palette.chroma.green['850'],
  green900: palette.chroma.green['900'],
  green950: palette.chroma.green['950'],
} as const;

export const GREY_COLORS = {
  // greys
  grey25: palette.grey['25'],
  grey50: palette.grey['50'],
  grey75: palette.grey['75'],
  grey100: palette.grey['100'],
  grey150: palette.grey['150'],
  grey200: palette.grey['200'],
  grey250: palette.grey['250'],
  grey300: palette.grey['300'],
  grey350: palette.grey['350'],
  grey400: palette.grey['400'],
  grey450: palette.grey['450'],
  grey500: palette.grey['500'],
  grey550: palette.grey['550'],
  grey600: palette.grey['600'],
  grey650: palette.grey['650'],
  grey700: palette.grey['700'],
  grey750: palette.grey['750'],
  grey800: palette.grey['800'],
  grey850: palette.grey['850'],
  grey900: palette.grey['900'],
  grey950: palette.grey['950'],
  grey975: palette.grey['975'],
  // slate
  slate25: palette.slate['25'],
  slate50: palette.slate['50'],
  slate75: palette.slate['75'],
  slate100: palette.slate['100'],
  slate150: palette.slate['150'],
  slate200: palette.slate['200'],
  slate250: palette.slate['250'],
  slate300: palette.slate['300'],
  slate350: palette.slate['350'],
  slate400: palette.slate['400'],
  slate450: palette.slate['450'],
  slate500: palette.slate['500'],
  slate550: palette.slate['550'],
  slate600: palette.slate['600'],
  slate650: palette.slate['650'],
  slate700: palette.slate['700'],
  slate750: palette.slate['750'],
  slate800: palette.slate['800'],
  slate825: palette.slate['825'],
  slate850: palette.slate['850'],
  slate900: palette.slate['900'],
} as const;

export const CREAM_COLORS = {
  cream25: palette.cream['25'],
  cream50: palette.cream['50'],
  cream75: palette.cream['75'],
  cream100: palette.cream['100'],
  cream150: palette.cream['150'],
  cream200: palette.cream['200'],
  cream250: palette.cream['250'],
  cream300: palette.cream['300'],
  cream350: palette.cream['350'],
  cream400: palette.cream['400'],
  cream450: palette.cream['450'],
  cream500: palette.cream['500'],
  cream550: palette.cream['550'],
  cream600: palette.cream['600'],
  cream650: palette.cream['650'],
  cream700: palette.cream['700'],
  cream750: palette.cream['750'],
  cream800: palette.cream['800'],
  cream825: palette.cream['825'],
  cream850: palette.cream['850'],
  cream900: palette.cream['900'],
} as const;

export const GRADIENTS = {
  blue: palette.gradients.blue,
  red: palette.gradients.red,
  green: palette.gradients.green,
  black: palette.gradients.black,
  blueWhite: palette.gradients.blueWhite,
  blackWhite: palette.gradients.blackWhite,
} as const;

// Dark Theme Colors
export const DARK_THEME = {
  ...GREY_COLORS,
  ...CHROMA_COLORS,

  // Core colors used by components
  textPrimary: GREY_COLORS.grey75,
  textSecondary: GREY_COLORS.grey500,
  textMuted: GREY_COLORS.grey650,
  textButton: GREY_COLORS.grey75,

  colorBackground: GREY_COLORS.grey800,
  surface: GREY_COLORS.slate700,
  surface2: GREY_COLORS.slate750,
  surface3: GREY_COLORS.slate800,
  surface4: GREY_COLORS.slate825,

  // Canonical palette aliases (align with React tokens)
  primary: CHROMA_COLORS.blue600,
  primaryHover: CHROMA_COLORS.blue500,
  secondary: CHROMA_COLORS.red500,
  secondaryHover: CHROMA_COLORS.red400,
  accent: CHROMA_COLORS.blue400,

  // Buttons
  buttonBackground: TOKENS.buttonBackground || CHROMA_COLORS.blue500,

  // Interactive states
  hover: GREY_COLORS.grey850,
  active: GREY_COLORS.grey650,
  focus: CHROMA_COLORS.blue400,

  // Status colors
  success: CHROMA_COLORS.blue400,
  warning: palette.chroma.yellow['400'],
  error: CHROMA_COLORS.red400,
  info: CHROMA_COLORS.blue400,

  // Border colors
  borderPrimary: GREY_COLORS.grey650,
  borderSecondary: GREY_COLORS.slate650,
  borderHover: GREY_COLORS.grey600,

  // Background Gradients
  backgroundGradientPrimary: GRADIENTS.blue,
  backgroundGradientSecondary: GRADIENTS.blueWhite,
  backgroundGradient3: GRADIENTS.blackWhite,
  backgroundGradient4: GRADIENTS.black,

  // Highlights
  highlightReceiverId: CHROMA_COLORS.blue400,
  highlightMethodName: CHROMA_COLORS.blue400,
  highlightAmount: CHROMA_COLORS.blue400,
} as const;

// Light Theme Colors
export const LIGHT_THEME = {
  ...GREY_COLORS,
  ...CHROMA_COLORS,

  // Core colors used by components
  textPrimary: GREY_COLORS.grey975,
  textSecondary: GREY_COLORS.grey500,
  textMuted: GREY_COLORS.grey350,
  // Button text color (light on both themes)
  textButton: GREY_COLORS.grey75,

  colorBackground: GREY_COLORS.grey50,
  surface: GREY_COLORS.slate100,
  surface2: GREY_COLORS.slate150,
  surface3: GREY_COLORS.slate200,
  surface4: GREY_COLORS.slate250,

  // Canonical palette aliases (align with React tokens)
  primary: CHROMA_COLORS.blue600,
  primaryHover: CHROMA_COLORS.blue500,
  secondary: CHROMA_COLORS.red500,
  secondaryHover: CHROMA_COLORS.red400,
  accent: CHROMA_COLORS.blue400,

  // Buttons
  buttonBackground: TOKENS.buttonBackground || CHROMA_COLORS.blue500,

  // Interactive states
  hover: GREY_COLORS.grey100,
  active: GREY_COLORS.grey200,
  focus: CHROMA_COLORS.blue400,

  // Status colors
  success: CHROMA_COLORS.blue500,
  warning: palette.chroma.yellow['500'],
  error: CHROMA_COLORS.red500,
  info: CHROMA_COLORS.blue500,

  // Border colors
  borderPrimary: GREY_COLORS.slate300,
  borderSecondary: GREY_COLORS.grey300,
  borderHover: GREY_COLORS.slate350,

  // Background Gradients
  backgroundGradientPrimary: GRADIENTS.blue,
  backgroundGradientSecondary: GRADIENTS.blueWhite,
  backgroundGradient3: GRADIENTS.blackWhite,
  backgroundGradient4: GRADIENTS.black,

  // Highlights
  highlightReceiverId: CHROMA_COLORS.blue500,
  highlightMethodName: CHROMA_COLORS.blue500,
  highlightAmount: CHROMA_COLORS.blue500,
} as const;

// Cream (light, warm) Theme Colors
// Inspired by a soft beige/cream UI with charcoal accents.
// Keeps the same token structure as LIGHT_THEME but warms surfaces
// and tweaks text/border contrast for a calmer look.
export const LIGHT_THEME2 = {
  ...GREY_COLORS,
  ...CREAM_COLORS,
  ...CHROMA_COLORS,

  // Text hierarchy (slightly softer than pure black)
  textPrimary: GREY_COLORS.grey900,
  textSecondary: GREY_COLORS.grey600,
  textMuted: GREY_COLORS.grey450,
  // Button text color (light for cream/light theme)
  textButton: GREY_COLORS.grey75,

  // Warm neutral surfaces pulled from cream scale
  colorBackground: CREAM_COLORS.cream50,
  surface: CREAM_COLORS.cream100,
  surface2: CREAM_COLORS.cream150,
  surface3: CREAM_COLORS.cream200,
  surface4: CREAM_COLORS.cream250,

  // Brand accents: charcoal primary with muted blue accent
  // (mirrors screenshot where CTA button is a dark neutral)
  primary: GREY_COLORS.grey700,
  primaryHover: GREY_COLORS.grey650,
  // Keep secondary semantic as-is (red) for system messaging,
  // while overall UI remains neutral/cream.
  secondary: CHROMA_COLORS.red500,
  secondaryHover: CHROMA_COLORS.red400,
  // Subtle accent for outlines or small highlights
  accent: CHROMA_COLORS.yellow550,

  // Buttons (defaults to shared token or blue scale)
  buttonBackground: TOKENS.buttonBackground || CHROMA_COLORS.blue500,

  // Interactive states tuned to warm neutrals
  hover: CREAM_COLORS.cream75,
  active: CREAM_COLORS.cream200,
  focus: CHROMA_COLORS.yellow500,

  // Status colors
  success: CHROMA_COLORS.yellow400,
  warning: CHROMA_COLORS.yellow600,
  error: CHROMA_COLORS.red500,
  info: CHROMA_COLORS.blue500,

  // Borders (slightly warm neutrals)
  borderPrimary: CREAM_COLORS.cream300,
  borderSecondary: CREAM_COLORS.cream200,
  borderHover: CREAM_COLORS.cream350,

  // Background Gradients (reuse neutrals-friendly sets)
  backgroundGradientPrimary: GRADIENTS.black,
  backgroundGradientSecondary: GRADIENTS.blackWhite,

  // Highlights
  highlightReceiverId: CHROMA_COLORS.yellow400,
  highlightMethodName: CHROMA_COLORS.yellow400,
  highlightAmount: CHROMA_COLORS.yellow400,
} as const;

// Public alias for the warm light scheme
// This makes it discoverable as a named theme without breaking existing imports.
export const CREAM_THEME = LIGHT_THEME;
