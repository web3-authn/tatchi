import React from 'react';
import type { DesignTokens } from '../ProfileSettingsButton/types';

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

export const useThemeContext = () => {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
