// Single source of truth for palettes and theme tokens used by:
// - Lit components
// - React design tokens
// - CSS variable generators (rolldown + dev script)

export function createThemeTokens(palette) {

  const CHROMA_COLORS = {
    ...fromScale('yellow', palette.yellow),
    ...fromScale('blue', palette.blue),
    ...fromScale('red', palette.red),
    ...fromScale('orange', palette.orange),
    ...fromScale('violet', palette.violet),
    ...fromScale('green', palette.green),
  };
  const GREY_COLORS = {
    ...fromScale('grey', palette.grey),
    ...fromScale('slate', palette.slate),
  };
  const CREAM_COLORS = {
    ...fromScale('cream', palette.cream),
  };
  const GRADIENTS = {
    blue: palette.gradients?.blue,
    red: palette.gradients?.red,
    green: palette.gradients?.green,
    black: palette.gradients?.black,
    blueWhite: palette.gradients?.blueWhite,
    blackWhite: palette.gradients?.blackWhite,
  };

  const DARK_THEME = {
    ...GREY_COLORS,
    ...CHROMA_COLORS,

    // Text
    textPrimary: GREY_COLORS.grey75,
    textSecondary: GREY_COLORS.grey500,
    textMuted: GREY_COLORS.grey650,
    textButton: GREY_COLORS.grey75,

    // Surfaces
    colorBackground: GREY_COLORS.grey800,
    surface: GREY_COLORS.slate700,
    surface2: GREY_COLORS.slate750,
    surface3: GREY_COLORS.slate800,
    surface4: GREY_COLORS.slate825,

    // Canonical palette aliases
    primary: CHROMA_COLORS.blue600,
    primaryHover: CHROMA_COLORS.blue500,
    secondary: CHROMA_COLORS.violet600,
    secondaryHover: CHROMA_COLORS.violet500,
    accent: CHROMA_COLORS.green400,

    // Buttons
    buttonBackground: CHROMA_COLORS.blue500,
    buttonHoverBackground: CHROMA_COLORS.blue450,

    // Interactive
    hover: GREY_COLORS.grey850,
    active: GREY_COLORS.grey650,
    focus: CHROMA_COLORS.blue400,

    // Status
    success: CHROMA_COLORS.blue400,
    warning: (palette.yellow || {})['400'],
    error: CHROMA_COLORS.red400,
    info: CHROMA_COLORS.blue400,

    // Borders
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
  };

  const LIGHT_THEME = {
    ...GREY_COLORS,
    ...CHROMA_COLORS,

    // Text
    textPrimary: GREY_COLORS.grey650,
    textSecondary: GREY_COLORS.grey500,
    textMuted: GREY_COLORS.grey350,
    textButton: GREY_COLORS.grey75,

    // Surfaces
    colorBackground: GREY_COLORS.grey50,
    surface: GREY_COLORS.slate100,
    surface2: GREY_COLORS.slate150,
    surface3: GREY_COLORS.slate200,
    surface4: GREY_COLORS.slate250,

    // Canonical palette aliases
    primary: CHROMA_COLORS.blue600,
    primaryHover: CHROMA_COLORS.blue500,
    secondary: CHROMA_COLORS.violet600,
    secondaryHover: CHROMA_COLORS.violet500,
    accent: CHROMA_COLORS.green400,

    // Buttons
    buttonBackground: CHROMA_COLORS.blue500,
    buttonHoverBackground: CHROMA_COLORS.blue450,

    // Interactive
    hover: GREY_COLORS.grey100,
    active: GREY_COLORS.grey200,
    focus: CHROMA_COLORS.blue400,

    // Status
    success: CHROMA_COLORS.blue500,
    warning: (palette.yellow || {})['500'],
    error: CHROMA_COLORS.red500,
    info: CHROMA_COLORS.blue500,

    // Borders
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
  };

  // Warm light (cream) theme
  const CREAM_THEME = {
    ...GREY_COLORS,
    ...CREAM_COLORS,
    ...CHROMA_COLORS,

    // Text
    textPrimary: GREY_COLORS.grey650,
    textSecondary: GREY_COLORS.grey600,
    textMuted: GREY_COLORS.grey450,
    textButton: GREY_COLORS.grey75,

    // Surfaces (warm neutrals)
    colorBackground: CREAM_COLORS.cream50,
    surface: CREAM_COLORS.cream100,
    surface2: CREAM_COLORS.cream150,
    surface3: CREAM_COLORS.cream200,
    surface4: CREAM_COLORS.cream250,

    // Brand/accents (neutral primary, warm accent)
    primary: GREY_COLORS.grey700,
    primaryHover: GREY_COLORS.grey650,
    secondary: CHROMA_COLORS.violet600,
    secondaryHover: CHROMA_COLORS.violet500,
    accent: CHROMA_COLORS.green400,

    // Buttons
    buttonBackground: CHROMA_COLORS.blue500,
    buttonHoverBackground: CHROMA_COLORS.blue450,

    // Interactive
    hover: CREAM_COLORS.cream75,
    active: CREAM_COLORS.cream200,
    focus: CHROMA_COLORS.yellow500,

    // Status
    success: CHROMA_COLORS.yellow300,
    warning: CHROMA_COLORS.yellow600,
    error: CHROMA_COLORS.red500,
    info: CHROMA_COLORS.blue500,

    // Borders
    borderPrimary: CREAM_COLORS.cream300,
    borderSecondary: CREAM_COLORS.cream200,
    borderHover: CREAM_COLORS.cream350,

    // Background Gradients
    backgroundGradientPrimary: GRADIENTS.black,
    backgroundGradientSecondary: GRADIENTS.blackWhite,
    backgroundGradient3: GRADIENTS.blackWhite,
    backgroundGradient4: GRADIENTS.black,

    // Highlights
    highlightReceiverId: CHROMA_COLORS.yellow400,
    highlightMethodName: CHROMA_COLORS.yellow400,
    highlightAmount: CHROMA_COLORS.yellow400,
  };

  return {
    CHROMA_COLORS,
    GREY_COLORS,
    CREAM_COLORS,
    GRADIENTS,
    DARK_THEME,
    LIGHT_THEME,
    CREAM_THEME,
  };
}

// Pure factory to build color scales + themes from a palette object.
// Keep this module JSON/FS-free so it can run in both Node (rolldown) and browser bundles.
const fromScale = (prefix, scale) => {
  if (!scale) return {};
  const out = {};
  for (const k of Object.keys(scale)) out[`${prefix}${k}`] = scale[k];
  return out;
};

export default { createThemeTokens };
