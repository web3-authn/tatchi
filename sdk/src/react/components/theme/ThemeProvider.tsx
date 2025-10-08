import React from 'react';
import { usePasskeyContext } from '../../context';
import type { DesignTokens, UseThemeReturn } from './design-tokens';
import { LIGHT_TOKENS, DARK_TOKENS } from './design-tokens';
import { createCSSVariables, mergeTokens, PartialDeep } from './utils';
import { useSyncSafariThemeColor } from './useSyncSafariThemeColor';

// Consolidated theme context, hook, scope, and provider in one file to reduce confusion.
// External API: ThemeProvider, useTheme, ThemeScope, ThemeName

export type ThemeName = 'light' | 'dark';

interface ThemeContextValue {
  theme: ThemeName;
  tokens: DesignTokens;
  isDark: boolean;
  prefix: string;
  toggleTheme: () => void;
  setTheme: (t: ThemeName) => void;
  // Precomputed CSS variables for convenience
  vars: React.CSSProperties;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

const noop = () => {};

// Internal: safe context read with sensible fallback when no provider is present
export const useThemeContext = (): ThemeContextValue => {
  const ctx = React.useContext(ThemeContext);
  if (ctx) return ctx;

  const prefersDark =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false;
  const theme: ThemeName = prefersDark ? 'dark' : 'light';
  const tokens: DesignTokens = theme === 'dark' ? DARK_TOKENS : LIGHT_TOKENS;
  const vars = createCSSVariables(tokens, '--w3a');
  return {
    theme,
    tokens,
    isDark: theme === 'dark',
    prefix: '--w3a',
    toggleTheme: noop,
    setTheme: noop as (t: ThemeName) => void,
    vars,
  };
};

// Public: simple hook used by components
export function useTheme(): UseThemeReturn {
  const ctx = useThemeContext();
  return React.useMemo(() => ({
    theme: ctx.theme,
    tokens: ctx.tokens,
    isDark: ctx.isDark,
    toggleTheme: ctx.toggleTheme,
    setTheme: ctx.setTheme,
  }), [ctx.theme, ctx.tokens, ctx.isDark, ctx.toggleTheme, ctx.setTheme]);
}

// Public: boundary element that applies CSS variables and data attribute
export interface ThemeScopeProps {
  as?: keyof React.JSX.IntrinsicElements;
  className?: string;
  style?: React.CSSProperties;
  dataAttr?: string; // attribute to mark theme on boundary
  children?: React.ReactNode;
}

export const ThemeScope: React.FC<ThemeScopeProps> = ({
  as = 'div',
  className,
  style,
  dataAttr = 'data-w3a-theme',
  children,
}) => {
  const { theme, vars } = useThemeContext();
  const Comp: any = as;
  const attrs: any = { [dataAttr]: theme };
  return (
    <Comp className={className} style={{ ...vars, ...style }} {...attrs}>
      {children}
    </Comp>
  );
};

export interface ThemeOverrides {
  light?: PartialDeep<DesignTokens>;
  dark?: PartialDeep<DesignTokens>;
}

export interface ThemeProviderProps {
  children: React.ReactNode;
  theme?: ThemeName;                 // controlled
  defaultTheme?: ThemeName;          // uncontrolled
  onThemeChange?: (t: ThemeName) => void;
  tokens?: ThemeOverrides | ((base: { light: DesignTokens; dark: DesignTokens }) => ThemeOverrides);
  prefix?: string;                   // CSS var prefix
}

function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

const THEME_STORAGE_KEY = 'w3a_theme';

function safeLoadStoredTheme(): ThemeName | null {
  try {
    if (typeof window === 'undefined') return null;
    const v = window.localStorage?.getItem?.(THEME_STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function safeStoreTheme(t: ThemeName) {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage?.setItem?.(THEME_STORAGE_KEY, t);
  } catch {}
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  theme: themeProp,
  defaultTheme,
  onThemeChange,
  tokens,
  prefix = '--w3a',
}) => {
  // Make passkey context optional - ThemeProvider can work without it
  let passkeyManager;
  try {
    ({ passkeyManager } = usePasskeyContext());
  } catch {
    // ThemeProvider can work without PasskeyProvider
    passkeyManager = null;
  }
  const isControlled = themeProp !== undefined && themeProp !== null;

  const baseLight = React.useMemo(() => LIGHT_TOKENS, []);
  const baseDark = React.useMemo(() => DARK_TOKENS, []);

  const resolvedOverrides = React.useMemo(() =>
    typeof tokens === 'function' ? tokens({ light: baseLight, dark: baseDark }) : (tokens || {}),
    [tokens, baseLight, baseDark]
  );

  const lightTokens = React.useMemo(
    () => mergeTokens(baseLight, resolvedOverrides.light),
    [baseLight, resolvedOverrides.light]
  );
  const darkTokens = React.useMemo(
    () => mergeTokens(baseDark, resolvedOverrides.dark),
    [baseDark, resolvedOverrides.dark]
  );

  const [themeState, setThemeState] = React.useState<ThemeName>(() => {
    if (isControlled) return themeProp as ThemeName;
    try {
      const t = passkeyManager?.userPreferences?.getUserTheme?.();
      if (t === 'light' || t === 'dark') return t;
    } catch {}
    const stored = safeLoadStoredTheme();
    if (stored) return stored;
    return defaultTheme || (getSystemPrefersDark() ? 'dark' : 'light');
  });

  // Sync internal state when controlled prop changes
  React.useEffect(() => {
    if (isControlled && themeProp && themeProp !== themeState) {
      setThemeState(themeProp);
    }
  }, [isControlled, themeProp]);

  // Subscribe to manager updates if uncontrolled
  React.useEffect(() => {
    if (isControlled || !passkeyManager) return;
    const up = passkeyManager.userPreferences;
    if (!up?.onThemeChange) return;
    const unsub = up.onThemeChange((t: ThemeName) => setThemeState(t));
    return () => {
      try { unsub?.(); } catch {}
    };
  }, [isControlled, passkeyManager]);

  const setTheme = React.useCallback((t: ThemeName) => {
    if (!isControlled) setThemeState(t);
    try {
      const didPersistToProfile = !!passkeyManager?.userPreferences?.setUserTheme?.(t);
      if (!didPersistToProfile) safeStoreTheme(t);
    } catch {
      // If persisting to profile fails (e.g., logged out), keep local storage updated
      safeStoreTheme(t);
    }
    onThemeChange?.(t);
  }, [isControlled, onThemeChange, passkeyManager]);

  const toggleTheme = React.useCallback(() => {
    setTheme(themeState === 'dark' ? 'light' : 'dark');
  }, [themeState, setTheme]);

  const tokensForTheme = themeState === 'dark' ? darkTokens : lightTokens;
  const vars = React.useMemo(() => createCSSVariables(tokensForTheme, prefix), [tokensForTheme, prefix]);

  const value = React.useMemo(() => ({
    theme: themeState,
    tokens: tokensForTheme,
    isDark: themeState === 'dark',
    prefix,
    toggleTheme,
    setTheme,
    vars,
  }), [themeState, tokensForTheme, prefix, toggleTheme, setTheme, vars]);

  // Keep Safari's bar fade in sync with theme; allow overrides, but default
  // to reading computed background or safe fallbacks.
  useSyncSafariThemeColor(themeState === 'dark', { darkColor: '#21212a', lightColor: '#fafafa' });

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
