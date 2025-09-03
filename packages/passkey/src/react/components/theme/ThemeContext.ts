import React from 'react';
import type { DesignTokens } from './design-tokens';
import { LIGHT_TOKENS, DARK_TOKENS } from './design-tokens';
import { createCSSVariables } from './utils';

export type ThemeName = 'light' | 'dark';

export interface ThemeContextValue {
  theme: ThemeName;
  tokens: DesignTokens;
  isDark: boolean;
  prefix: string;
  toggleTheme: () => void;
  setTheme: (t: ThemeName) => void;
  // Precomputed CSS variables for convenience
  vars: React.CSSProperties;
}

export const ThemeContext = React.createContext<ThemeContextValue | null>(null);

const noop = () => {};

export const useThemeContext = (): ThemeContextValue => {
  const ctx = React.useContext(ThemeContext);
  if (ctx) return ctx;

  // Fallback: allow components to work without an explicit ThemeProvider.
  // Uses system preference to choose between light/dark and exposes no-op setters.
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
