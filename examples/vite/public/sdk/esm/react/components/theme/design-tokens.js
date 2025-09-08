import { CHROMA_COLORS, DARK_THEME, GRADIENTS, GREY_COLORS, LIGHT_THEME } from "../../packages/passkey/src/core/WebAuthnManager/LitComponents/base-styles.js";

//#region src/react/components/theme/design-tokens.ts
const LIGHT_TOKENS = {
	colors: {
		...CHROMA_COLORS,
		primary: CHROMA_COLORS.blue500,
		primaryHover: CHROMA_COLORS.blue600,
		secondary: GREY_COLORS.grey600,
		accent: CHROMA_COLORS.blue300,
		textPrimary: LIGHT_THEME.textPrimary,
		textSecondary: LIGHT_THEME.textSecondary,
		textMuted: LIGHT_THEME.textMuted,
		colorBackground: LIGHT_THEME.colorBackground,
		colorSurface: LIGHT_THEME.colorSurface,
		colorSurface2: LIGHT_THEME.colorSurface2,
		colorBorder: LIGHT_THEME.colorBorder,
		hover: GREY_COLORS.grey100,
		active: GREY_COLORS.grey200,
		focus: CHROMA_COLORS.blue400,
		success: CHROMA_COLORS.blue500,
		warning: CHROMA_COLORS.yellow500,
		error: CHROMA_COLORS.red500,
		info: CHROMA_COLORS.blue500,
		borderPrimary: LIGHT_THEME.slate300,
		borderSecondary: GREY_COLORS.grey300,
		borderHover: GREY_COLORS.slate350,
		backgroundGradientPrimary: GRADIENTS.blue,
		backgroundGradientSecondary: GRADIENTS.blueWhite,
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
		slate25: LIGHT_THEME.slate25,
		slate100: LIGHT_THEME.slate100,
		slate150: LIGHT_THEME.slate150,
		slate200: LIGHT_THEME.slate200,
		slate300: LIGHT_THEME.slate300,
		highlightReceiverId: LIGHT_THEME.highlightReceiverId,
		highlightMethodName: LIGHT_THEME.highlightMethodName,
		highlightAmount: LIGHT_THEME.highlightAmount,
		highlightReceiverIdBackground: LIGHT_THEME.highlightReceiverIdBackground,
		highlightMethodNameBackground: LIGHT_THEME.highlightMethodNameBackground,
		highlightAmountBackground: LIGHT_THEME.highlightAmountBackground,
		colorPrimary: LIGHT_THEME.colorPrimary,
		gradientPeach: LIGHT_THEME.gradientPeach,
		gradientAqua: LIGHT_THEME.gradientAqua
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
		...CHROMA_COLORS,
		primary: CHROMA_COLORS.blue500,
		primaryHover: CHROMA_COLORS.blue600,
		secondary: GREY_COLORS.grey400,
		accent: CHROMA_COLORS.blue300,
		textPrimary: DARK_THEME.textPrimary,
		textSecondary: DARK_THEME.textSecondary,
		textMuted: DARK_THEME.textMuted,
		colorBackground: DARK_THEME.colorBackground,
		colorSurface: DARK_THEME.colorSurface,
		colorSurface2: DARK_THEME.colorSurface2,
		colorBorder: DARK_THEME.colorBorder,
		hover: DARK_THEME.grey850,
		active: DARK_THEME.grey650,
		focus: CHROMA_COLORS.blue400,
		success: CHROMA_COLORS.blue400,
		warning: CHROMA_COLORS.yellow400,
		error: CHROMA_COLORS.red400,
		info: CHROMA_COLORS.blue400,
		borderPrimary: DARK_THEME.grey650,
		borderSecondary: DARK_THEME.grey750,
		borderHover: DARK_THEME.grey750,
		backgroundGradientPrimary: GRADIENTS.blue,
		backgroundGradientSecondary: GRADIENTS.blueWhite,
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
		slate25: DARK_THEME.slate25,
		slate100: DARK_THEME.slate100,
		slate150: DARK_THEME.slate150,
		slate200: DARK_THEME.slate200,
		slate300: DARK_THEME.slate300,
		highlightReceiverId: DARK_THEME.highlightReceiverId,
		highlightMethodName: DARK_THEME.highlightMethodName,
		highlightAmount: DARK_THEME.highlightAmount,
		highlightReceiverIdBackground: DARK_THEME.highlightReceiverIdBackground,
		highlightMethodNameBackground: DARK_THEME.highlightMethodNameBackground,
		highlightAmountBackground: DARK_THEME.highlightAmountBackground,
		colorPrimary: DARK_THEME.colorPrimary,
		gradientPeach: DARK_THEME.gradientPeach,
		gradientAqua: DARK_THEME.gradientAqua
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
		activeBackground: GRADIENTS.blue,
		activeShadow: LIGHT_TOKENS.shadows.md,
		inactiveBackground: LIGHT_TOKENS.colors.borderHover,
		inactiveShadow: LIGHT_TOKENS.shadows.sm,
		disabledBackground: LIGHT_TOKENS.colors.borderSecondary,
		disabledCircle: "transparent",
		textColor: LIGHT_TOKENS.colors.textPrimary,
		disabledTextColor: LIGHT_TOKENS.colors.textMuted,
		circleColor: GREY_COLORS.grey100
	},
	dark: {
		activeBackground: GRADIENTS.blue,
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
export { DARK_TOKENS, LIGHT_TOKENS, PROFILE_TOGGLE_TOKENS };
//# sourceMappingURL=design-tokens.js.map