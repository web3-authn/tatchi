const require_rolldown_runtime = require('../../_virtual/rolldown_runtime.js');
const require_index = require('../../context/index.js');
const require_design_tokens = require('./design-tokens.js');
const require_utils = require('./utils.js');
let react = require("react");
react = require_rolldown_runtime.__toESM(react);
let react_jsx_runtime = require("react/jsx-runtime");
react_jsx_runtime = require_rolldown_runtime.__toESM(react_jsx_runtime);

//#region src/react/components/theme/ThemeProvider.tsx
const ThemeContext = react.default.createContext(null);
const noop = () => {};
const useThemeContext = () => {
	const ctx = react.default.useContext(ThemeContext);
	if (ctx) return ctx;
	const prefersDark = typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)").matches : false;
	const theme = prefersDark ? "dark" : "light";
	const tokens = theme === "dark" ? require_design_tokens.DARK_TOKENS : require_design_tokens.LIGHT_TOKENS;
	const vars = require_utils.createCSSVariables(tokens, "--w3a");
	return {
		theme,
		tokens,
		isDark: theme === "dark",
		prefix: "--w3a",
		toggleTheme: noop,
		setTheme: noop,
		vars
	};
};
function useTheme() {
	const ctx = useThemeContext();
	return react.default.useMemo(() => ({
		theme: ctx.theme,
		tokens: ctx.tokens,
		isDark: ctx.isDark,
		toggleTheme: ctx.toggleTheme,
		setTheme: ctx.setTheme
	}), [
		ctx.theme,
		ctx.tokens,
		ctx.isDark,
		ctx.toggleTheme,
		ctx.setTheme
	]);
}
const ThemeScope = ({ as = "div", className, style, dataAttr = "data-w3a-theme", children }) => {
	const { theme, vars } = useThemeContext();
	const Comp = as;
	const attrs = { [dataAttr]: theme };
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Comp, {
		className,
		style: {
			...vars,
			...style
		},
		...attrs,
		children
	});
};
function getSystemPrefersDark() {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
	return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
const THEME_STORAGE_KEY = "w3a_theme";
function safeLoadStoredTheme() {
	try {
		if (typeof window === "undefined") return null;
		const v = window.localStorage?.getItem?.(THEME_STORAGE_KEY);
		return v === "light" || v === "dark" ? v : null;
	} catch {
		return null;
	}
}
function safeStoreTheme(t) {
	try {
		if (typeof window === "undefined") return;
		window.localStorage?.setItem?.(THEME_STORAGE_KEY, t);
	} catch {}
}
const ThemeProvider = ({ children, theme: themeProp, defaultTheme, onThemeChange, tokens, prefix = "--w3a" }) => {
	let passkeyManager;
	try {
		({passkeyManager} = require_index.usePasskeyContext());
	} catch {
		passkeyManager = null;
	}
	const isControlled = themeProp !== void 0 && themeProp !== null;
	const baseLight = react.default.useMemo(() => require_design_tokens.LIGHT_TOKENS, []);
	const baseDark = react.default.useMemo(() => require_design_tokens.DARK_TOKENS, []);
	const resolvedOverrides = react.default.useMemo(() => typeof tokens === "function" ? tokens({
		light: baseLight,
		dark: baseDark
	}) : tokens || {}, [
		tokens,
		baseLight,
		baseDark
	]);
	const lightTokens = react.default.useMemo(() => require_utils.mergeTokens(baseLight, resolvedOverrides.light), [baseLight, resolvedOverrides.light]);
	const darkTokens = react.default.useMemo(() => require_utils.mergeTokens(baseDark, resolvedOverrides.dark), [baseDark, resolvedOverrides.dark]);
	const [themeState, setThemeState] = react.default.useState(() => {
		if (isControlled) return themeProp;
		try {
			const t = passkeyManager?.userPreferences?.getUserTheme?.();
			if (t === "light" || t === "dark") return t;
		} catch {}
		const stored = safeLoadStoredTheme();
		if (stored) return stored;
		return defaultTheme || (getSystemPrefersDark() ? "dark" : "light");
	});
	react.default.useEffect(() => {
		if (isControlled && themeProp && themeProp !== themeState) setThemeState(themeProp);
	}, [isControlled, themeProp]);
	react.default.useEffect(() => {
		if (isControlled || !passkeyManager) return;
		const up = passkeyManager.userPreferences;
		if (!up?.onThemeChange) return;
		const unsub = up.onThemeChange((t) => setThemeState(t));
		return () => {
			try {
				unsub?.();
			} catch {}
		};
	}, [isControlled, passkeyManager]);
	const setTheme = react.default.useCallback((t) => {
		if (!isControlled) setThemeState(t);
		try {
			const didPersistToProfile = !!passkeyManager?.userPreferences?.setUserTheme?.(t);
			if (!didPersistToProfile) safeStoreTheme(t);
		} catch {
			safeStoreTheme(t);
		}
		onThemeChange?.(t);
	}, [
		isControlled,
		onThemeChange,
		passkeyManager
	]);
	const toggleTheme = react.default.useCallback(() => {
		setTheme(themeState === "dark" ? "light" : "dark");
	}, [themeState, setTheme]);
	const tokensForTheme = themeState === "dark" ? darkTokens : lightTokens;
	const vars = react.default.useMemo(() => require_utils.createCSSVariables(tokensForTheme, prefix), [tokensForTheme, prefix]);
	const value = react.default.useMemo(() => ({
		theme: themeState,
		tokens: tokensForTheme,
		isDark: themeState === "dark",
		prefix,
		toggleTheme,
		setTheme,
		vars
	}), [
		themeState,
		tokensForTheme,
		prefix,
		toggleTheme,
		setTheme,
		vars
	]);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ThemeContext.Provider, {
		value,
		children
	});
};

//#endregion
exports.ThemeProvider = ThemeProvider;
exports.ThemeScope = ThemeScope;
exports.useTheme = useTheme;
//# sourceMappingURL=ThemeProvider.js.map