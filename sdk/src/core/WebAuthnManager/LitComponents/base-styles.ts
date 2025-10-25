import palette from '@/theme/palette.json';

/**
 * Base color palette for Web3Auth components (single-source from palette.json)
 */

export const CHROMA_COLORS = {
  // yellow
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

export const GRADIENTS = {
  blue: palette.gradients.blue,
  red: palette.gradients.red,
  green: palette.gradients.green,
  yellow: palette.gradients.yellow,
  peach: palette.gradients.peach,
  aqua: palette.gradients.aqua,
  blueWhite: palette.gradients.blueWhite,
} as const;

// Dark Theme Colors
export const DARK_THEME = {
  ...GREY_COLORS,
  ...CHROMA_COLORS,

  // Core colors used by components
  textPrimary: GREY_COLORS.grey75,
  textSecondary: GREY_COLORS.grey500,
  textMuted: GREY_COLORS.grey650,

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

  // Interactive states
  hover: GREY_COLORS.grey850,
  active: GREY_COLORS.grey650,
  focus: CHROMA_COLORS.blue400,

  // Status colors
  success: CHROMA_COLORS.blue400,
  warning: CHROMA_COLORS.yellow400,
  error: CHROMA_COLORS.red400,
  info: CHROMA_COLORS.blue400,

  // Border colors
  borderPrimary: GREY_COLORS.grey650,
  borderSecondary: GREY_COLORS.slate650,
  borderHover: GREY_COLORS.grey600,

  // Background Gradients
  backgroundGradientPrimary: GRADIENTS.blue,
  backgroundGradientSecondary: GRADIENTS.blueWhite,

  // Highlights
  highlightReceiverId: CHROMA_COLORS.blue400,
  highlightMethodName: CHROMA_COLORS.blue400,
  highlightAmount: CHROMA_COLORS.blue400,
  highlightReceiverIdBackground: GRADIENTS.aqua,
  highlightMethodNameBackground: GRADIENTS.aqua,
  highlightAmountBackground: GRADIENTS.peach,
} as const;

// Light Theme Colors
export const LIGHT_THEME = {
  ...GREY_COLORS,
  ...CHROMA_COLORS,

  // Core colors used by components
  textPrimary: GREY_COLORS.grey975,
  textSecondary: GREY_COLORS.grey500,
  textMuted: GREY_COLORS.grey350,

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

  // Interactive states
  hover: GREY_COLORS.grey100,
  active: GREY_COLORS.grey200,
  focus: CHROMA_COLORS.blue400,

  // Status colors
  success: CHROMA_COLORS.blue500,
  warning: CHROMA_COLORS.yellow500,
  error: CHROMA_COLORS.red500,
  info: CHROMA_COLORS.blue500,

  // Border colors
  borderPrimary: GREY_COLORS.slate300,
  borderSecondary: GREY_COLORS.grey300,
  borderHover: GREY_COLORS.slate350,

  // Background Gradients
  backgroundGradientPrimary: GRADIENTS.blue,
  backgroundGradientSecondary: GRADIENTS.blueWhite,

  // Highlights
  highlightReceiverId: CHROMA_COLORS.blue500,
  highlightMethodName: CHROMA_COLORS.blue500,
  highlightAmount: CHROMA_COLORS.blue500,
  highlightReceiverIdBackground: GRADIENTS.aqua,
  highlightMethodNameBackground: GRADIENTS.aqua,
  highlightAmountBackground: GRADIENTS.peach,
} as const;

