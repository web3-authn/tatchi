import React from 'react';
import { usePasskeyContext } from '../../context';
import type { DesignTokens } from './design-tokens';
import { LIGHT_TOKENS, DARK_TOKENS } from './design-tokens';
import { ThemeContext, ThemeName } from './ThemeContext';
import { createCSSVariables, mergeTokens, PartialDeep } from './utils';

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

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  theme: themeProp,
  defaultTheme,
  onThemeChange,
  tokens,
  prefix = '--w3a',
}) => {
  const { passkeyManager } = usePasskeyContext();
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
    if (isControlled) return;
    const up = passkeyManager?.userPreferences;
    if (!up?.onThemeChange) return;
    const unsub = up.onThemeChange((t: ThemeName) => setThemeState(t));
    return () => {
      try { unsub?.(); } catch {}
    };
  }, [isControlled, passkeyManager]);

  const setTheme = React.useCallback((t: ThemeName) => {
    if (!isControlled) setThemeState(t);
    try { passkeyManager?.userPreferences?.setUserTheme?.(t); } catch {}
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

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
