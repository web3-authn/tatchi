// ============================================================================
// UNIVERSAL THEME HOOK (scoped via ThemeProvider / ThemeScope)
// ============================================================================

import React, { useMemo } from 'react';
import type { UseThemeReturn, DesignTokens } from './design-tokens';
import { useThemeContext } from './ThemeContext';

export function useTheme(): UseThemeReturn {
  const ctx = useThemeContext();
  return useMemo(() => ({
    theme: ctx.theme,
    tokens: ctx.tokens,
    isDark: ctx.isDark,
    toggleTheme: ctx.toggleTheme,
    setTheme: ctx.setTheme,
  }), [ctx.theme, ctx.tokens, ctx.isDark, ctx.toggleTheme, ctx.setTheme]);
}

export function useComponentTheme<T extends Record<string, DesignTokens>>(
  componentTokens: T
): Omit<UseThemeReturn, 'tokens'> & { tokens: T[keyof T] } {
  const { theme, isDark, toggleTheme, setTheme } = useTheme();
  const tokens = componentTokens[theme as keyof T];
  return { theme, tokens, isDark, toggleTheme, setTheme };
}

export function withTheme<P extends object>(Component: React.ComponentType<P>) {
  return function ThemedComponent(props: P) {
    const { theme, tokens } = useTheme();
    return React.createElement(Component as any, { ...(props as any), ...( { theme, tokens } as any) });
  };
}
