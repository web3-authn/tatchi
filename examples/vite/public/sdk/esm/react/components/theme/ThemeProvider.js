import { usePasskeyContext } from "../../context/index.js";
import { DARK_TOKENS, LIGHT_TOKENS } from "./design-tokens.js";
import { createCSSVariables, mergeTokens } from "./utils.js";
import React from "react";
import { jsx } from "react/jsx-runtime";

//#region src/react/components/theme/ThemeProvider.tsx
const ThemeContext = React.createContext(null);
const noop = () => {};
const useThemeContext = () => {
	const ctx = React.useContext(ThemeContext);
	if (ctx) return ctx;
	const prefersDark = typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)").matches : false;
	const theme = prefersDark ? "dark" : "light";
	const tokens = theme === "dark" ? DARK_TOKENS : LIGHT_TOKENS;
	const vars = createCSSVariables(tokens, "--w3a");
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
	return React.useMemo(() => ({
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
	return /* @__PURE__ */ jsx(Comp, {
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
		({passkeyManager} = usePasskeyContext());
	} catch {
		passkeyManager = null;
	}
	const isControlled = themeProp !== void 0 && themeProp !== null;
	const baseLight = React.useMemo(() => LIGHT_TOKENS, []);
	const baseDark = React.useMemo(() => DARK_TOKENS, []);
	const resolvedOverrides = React.useMemo(() => typeof tokens === "function" ? tokens({
		light: baseLight,
		dark: baseDark
	}) : tokens || {}, [
		tokens,
		baseLight,
		baseDark
	]);
	const lightTokens = React.useMemo(() => mergeTokens(baseLight, resolvedOverrides.light), [baseLight, resolvedOverrides.light]);
	const darkTokens = React.useMemo(() => mergeTokens(baseDark, resolvedOverrides.dark), [baseDark, resolvedOverrides.dark]);
	const [themeState, setThemeState] = React.useState(() => {
		if (isControlled) return themeProp;
		try {
			const t = passkeyManager?.userPreferences?.getUserTheme?.();
			if (t === "light" || t === "dark") return t;
		} catch {}
		const stored = safeLoadStoredTheme();
		if (stored) return stored;
		return defaultTheme || (getSystemPrefersDark() ? "dark" : "light");
	});
	React.useEffect(() => {
		if (isControlled && themeProp && themeProp !== themeState) setThemeState(themeProp);
	}, [isControlled, themeProp]);
	React.useEffect(() => {
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
	const setTheme = React.useCallback((t) => {
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
	const toggleTheme = React.useCallback(() => {
		setTheme(themeState === "dark" ? "light" : "dark");
	}, [themeState, setTheme]);
	const tokensForTheme = themeState === "dark" ? darkTokens : lightTokens;
	const vars = React.useMemo(() => createCSSVariables(tokensForTheme, prefix), [tokensForTheme, prefix]);
	const value = React.useMemo(() => ({
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
	return /* @__PURE__ */ jsx(ThemeContext.Provider, {
		value,
		children
	});
};

//#endregion
export { ThemeProvider, ThemeScope, useTheme };
//# sourceMappingURL=ThemeProvider.js.map