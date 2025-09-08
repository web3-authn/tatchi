const require_base_styles = require('../../packages/passkey/src/core/WebAuthnManager/LitComponents/base-styles.js');

//#region src/react/components/theme/design-tokens.ts
const LIGHT_TOKENS = {
	colors: {
		...require_base_styles.CHROMA_COLORS,
		primary: require_base_styles.CHROMA_COLORS.blue500,
		primaryHover: require_base_styles.CHROMA_COLORS.blue600,
		secondary: require_base_styles.GREY_COLORS.grey600,
		accent: require_base_styles.CHROMA_COLORS.blue300,
		textPrimary: require_base_styles.LIGHT_THEME.textPrimary,
		textSecondary: require_base_styles.LIGHT_THEME.textSecondary,
		textMuted: require_base_styles.LIGHT_THEME.textMuted,
		colorBackground: require_base_styles.LIGHT_THEME.colorBackground,
		colorSurface: require_base_styles.LIGHT_THEME.colorSurface,
		colorSurface2: require_base_styles.LIGHT_THEME.colorSurface2,
		colorBorder: require_base_styles.LIGHT_THEME.colorBorder,
		hover: require_base_styles.GREY_COLORS.grey100,
		active: require_base_styles.GREY_COLORS.grey200,
		focus: require_base_styles.CHROMA_COLORS.blue400,
		success: require_base_styles.CHROMA_COLORS.blue500,
		warning: require_base_styles.CHROMA_COLORS.yellow500,
		error: require_base_styles.CHROMA_COLORS.red500,
		info: require_base_styles.CHROMA_COLORS.blue500,
		borderPrimary: require_base_styles.LIGHT_THEME.slate300,
		borderSecondary: require_base_styles.GREY_COLORS.grey300,
		borderHover: require_base_styles.GREY_COLORS.slate350,
		backgroundGradientPrimary: require_base_styles.GRADIENTS.blue,
		backgroundGradientSecondary: require_base_styles.GRADIENTS.blueWhite,
		grey25: require_base_styles.LIGHT_THEME.grey25,
		grey50: require_base_styles.LIGHT_THEME.grey50,
		grey75: require_base_styles.LIGHT_THEME.grey75,
		grey100: require_base_styles.LIGHT_THEME.grey100,
		grey200: require_base_styles.LIGHT_THEME.grey200,
		grey300: require_base_styles.LIGHT_THEME.grey300,
		grey400: require_base_styles.LIGHT_THEME.grey400,
		grey500: require_base_styles.LIGHT_THEME.grey500,
		grey600: require_base_styles.LIGHT_THEME.grey600,
		grey650: require_base_styles.LIGHT_THEME.grey650,
		grey700: require_base_styles.LIGHT_THEME.grey700,
		grey750: require_base_styles.LIGHT_THEME.grey750,
		grey800: require_base_styles.DARK_THEME.grey800,
		grey850: require_base_styles.DARK_THEME.grey850,
		grey900: require_base_styles.DARK_THEME.grey900,
		grey950: require_base_styles.DARK_THEME.grey950,
		slate25: require_base_styles.LIGHT_THEME.slate25,
		slate100: require_base_styles.LIGHT_THEME.slate100,
		slate150: require_base_styles.LIGHT_THEME.slate150,
		slate200: require_base_styles.LIGHT_THEME.slate200,
		slate300: require_base_styles.LIGHT_THEME.slate300,
		highlightReceiverId: require_base_styles.LIGHT_THEME.highlightReceiverId,
		highlightMethodName: require_base_styles.LIGHT_THEME.highlightMethodName,
		highlightAmount: require_base_styles.LIGHT_THEME.highlightAmount,
		highlightReceiverIdBackground: require_base_styles.LIGHT_THEME.highlightReceiverIdBackground,
		highlightMethodNameBackground: require_base_styles.LIGHT_THEME.highlightMethodNameBackground,
		highlightAmountBackground: require_base_styles.LIGHT_THEME.highlightAmountBackground,
		colorPrimary: require_base_styles.LIGHT_THEME.colorPrimary,
		gradientPeach: require_base_styles.LIGHT_THEME.gradientPeach,
		gradientAqua: require_base_styles.LIGHT_THEME.gradientAqua
	},
	spacing: {
		xs: "0.25rem",
		sm: "0.5rem",
		md: "1rem",
		lg: "1.5rem",
		xl: "2rem"
	},
	borderRadius: {
		sm: "0.5rem",
		md: "1rem",
		lg: "1.5rem",
		xl: "2rem"
	},
	shadows: {
		sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
		md: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
		lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
		xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
	}
};
const DARK_TOKENS = {
	colors: {
		...require_base_styles.CHROMA_COLORS,
		primary: require_base_styles.CHROMA_COLORS.blue500,
		primaryHover: require_base_styles.CHROMA_COLORS.blue600,
		secondary: require_base_styles.GREY_COLORS.grey400,
		accent: require_base_styles.CHROMA_COLORS.blue300,
		textPrimary: require_base_styles.DARK_THEME.textPrimary,
		textSecondary: require_base_styles.DARK_THEME.textSecondary,
		textMuted: require_base_styles.DARK_THEME.textMuted,
		colorBackground: require_base_styles.DARK_THEME.colorBackground,
		colorSurface: require_base_styles.DARK_THEME.colorSurface,
		colorSurface2: require_base_styles.DARK_THEME.colorSurface2,
		colorBorder: require_base_styles.DARK_THEME.colorBorder,
		hover: require_base_styles.DARK_THEME.grey850,
		active: require_base_styles.DARK_THEME.grey650,
		focus: require_base_styles.CHROMA_COLORS.blue400,
		success: require_base_styles.CHROMA_COLORS.blue400,
		warning: require_base_styles.CHROMA_COLORS.yellow400,
		error: require_base_styles.CHROMA_COLORS.red400,
		info: require_base_styles.CHROMA_COLORS.blue400,
		borderPrimary: require_base_styles.DARK_THEME.grey650,
		borderSecondary: require_base_styles.DARK_THEME.grey750,
		borderHover: require_base_styles.DARK_THEME.grey750,
		backgroundGradientPrimary: require_base_styles.GRADIENTS.blue,
		backgroundGradientSecondary: require_base_styles.GRADIENTS.blueWhite,
		grey25: require_base_styles.DARK_THEME.grey25,
		grey50: require_base_styles.DARK_THEME.grey50,
		grey75: require_base_styles.DARK_THEME.grey75,
		grey100: require_base_styles.DARK_THEME.grey100,
		grey200: require_base_styles.DARK_THEME.grey200,
		grey300: require_base_styles.DARK_THEME.grey300,
		grey400: require_base_styles.DARK_THEME.grey400,
		grey500: require_base_styles.DARK_THEME.grey500,
		grey600: require_base_styles.DARK_THEME.grey600,
		grey650: require_base_styles.DARK_THEME.grey650,
		grey700: require_base_styles.DARK_THEME.grey700,
		grey750: require_base_styles.DARK_THEME.grey750,
		grey800: require_base_styles.DARK_THEME.grey800,
		grey850: require_base_styles.DARK_THEME.grey850,
		grey900: require_base_styles.DARK_THEME.grey900,
		grey950: require_base_styles.DARK_THEME.grey950,
		slate25: require_base_styles.DARK_THEME.slate25,
		slate100: require_base_styles.DARK_THEME.slate100,
		slate150: require_base_styles.DARK_THEME.slate150,
		slate200: require_base_styles.DARK_THEME.slate200,
		slate300: require_base_styles.DARK_THEME.slate300,
		highlightReceiverId: require_base_styles.DARK_THEME.highlightReceiverId,
		highlightMethodName: require_base_styles.DARK_THEME.highlightMethodName,
		highlightAmount: require_base_styles.DARK_THEME.highlightAmount,
		highlightReceiverIdBackground: require_base_styles.DARK_THEME.highlightReceiverIdBackground,
		highlightMethodNameBackground: require_base_styles.DARK_THEME.highlightMethodNameBackground,
		highlightAmountBackground: require_base_styles.DARK_THEME.highlightAmountBackground,
		colorPrimary: require_base_styles.DARK_THEME.colorPrimary,
		gradientPeach: require_base_styles.DARK_THEME.gradientPeach,
		gradientAqua: require_base_styles.DARK_THEME.gradientAqua
	},
	spacing: LIGHT_TOKENS.spacing,
	borderRadius: LIGHT_TOKENS.borderRadius,
	shadows: {
		sm: "0 1px 2px 0 rgba(0, 0, 0, 0.3)",
		md: "0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.3)",
		lg: "0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -2px rgba(0, 0, 0, 0.3)",
		xl: "0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 10px 10px -5px rgba(0, 0, 0, 0.3)"
	}
};
/**
* Profile Button specific tokens (extends base with component-specific overrides)
*/
const PROFILE_BUTTON_TOKENS = {
	light: {
		...LIGHT_TOKENS,
		colors: { ...LIGHT_TOKENS.colors }
	},
	dark: {
		...DARK_TOKENS,
		colors: { ...DARK_TOKENS.colors }
	}
};
const PROFILE_TOGGLE_TOKENS = {
	light: {
		activeBackground: require_base_styles.GRADIENTS.blue,
		activeShadow: LIGHT_TOKENS.shadows.md,
		inactiveBackground: LIGHT_TOKENS.colors.borderHover,
		inactiveShadow: LIGHT_TOKENS.shadows.sm,
		disabledBackground: LIGHT_TOKENS.colors.borderSecondary,
		disabledCircle: "transparent",
		textColor: LIGHT_TOKENS.colors.textPrimary,
		disabledTextColor: LIGHT_TOKENS.colors.textMuted,
		circleColor: require_base_styles.GREY_COLORS.grey100
	},
	dark: {
		activeBackground: require_base_styles.GRADIENTS.blue,
		activeShadow: DARK_TOKENS.shadows.md,
		inactiveBackground: DARK_TOKENS.colors.borderHover,
		inactiveShadow: DARK_TOKENS.shadows.sm,
		disabledBackground: DARK_TOKENS.colors.borderSecondary,
		disabledCircle: "transparent",
		textColor: DARK_TOKENS.colors.textPrimary,
		disabledTextColor: DARK_TOKENS.colors.textSecondary,
		circleColor: DARK_TOKENS.colors.grey800
	}
};

//#endregion
exports.DARK_TOKENS = DARK_TOKENS;
exports.LIGHT_TOKENS = LIGHT_TOKENS;
exports.PROFILE_TOGGLE_TOKENS = PROFILE_TOGGLE_TOKENS;
//# sourceMappingURL=design-tokens.js.map