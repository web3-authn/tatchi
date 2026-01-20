import React from 'react';
import type { DesignTokens, UseThemeReturn } from './design-tokens';
import { LIGHT_TOKENS, DARK_TOKENS } from './design-tokens';
import { createCSSVariables, mergeTokens, PartialDeep } from './utils';

// Consolidated theme context, hook, scope, and provider in one file to reduce confusion.
// External API: Theme (consolidated), useTheme, ThemeName

export type ThemeName = 'light' | 'dark';

interface ThemeContextValue {
  theme: ThemeName;
  tokens: DesignTokens;
  isDark: boolean;
  prefix: string;
  // Precomputed CSS variables for convenience
  vars: React.CSSProperties;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

// Internal: safe context read with sensible fallback when no provider is present
export const useThemeContext = (): ThemeContextValue => {
  const ctx = React.useContext(ThemeContext);
  if (ctx) return ctx;

  const theme: ThemeName = 'dark';
  const tokens: DesignTokens = DARK_TOKENS;
  const vars = createCSSVariables(tokens, '--w3a');
  return {
    theme,
    tokens,
    isDark: theme === 'dark',
    prefix: '--w3a',
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
  }), [ctx.theme, ctx.tokens, ctx.isDark]);
}

// Public: boundary element that applies CSS variables and data attribute
interface ThemeScopeProps {
  tag?: keyof React.JSX.IntrinsicElements;
  className?: string;
  style?: React.CSSProperties;
  dataAttr?: string; // attribute to mark theme on boundary
  children?: React.ReactNode;
}

const ThemeScope: React.FC<ThemeScopeProps> = ({
  tag = 'main',
  className,
  style,
  dataAttr = 'data-w3a-theme',
  children,
}) => {
  const { theme, vars } = useThemeContext();
  const Comp: any = tag;
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

interface ThemeProviderProps {
  children: React.ReactNode;
  theme?: ThemeName;
  tokens?: ThemeOverrides | ((base: { light: DesignTokens; dark: DesignTokens }) => ThemeOverrides);
  prefix?: string; // CSS var prefix
}

const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  theme,
  tokens,
  prefix = '--w3a',
}) => {
  const resolvedTheme: ThemeName = theme === 'light' || theme === 'dark' ? theme : 'dark';

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

  const tokensForTheme = resolvedTheme === 'dark' ? darkTokens : lightTokens;
  const vars = React.useMemo(() => createCSSVariables(tokensForTheme, prefix), [tokensForTheme, prefix]);

  const value = React.useMemo(() => ({
    theme: resolvedTheme,
    tokens: tokensForTheme,
    isDark: resolvedTheme === 'dark',
    prefix,
    vars,
  }), [resolvedTheme, tokensForTheme, prefix, vars]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

// Unified Theme component: combines provider and scope with mode control
export type ThemeMode = 'provider+scope' | 'provider-only' | 'scope-only';

export interface ThemeProps extends Omit<ThemeProviderProps, 'children'>, Omit<ThemeScopeProps, 'children'> {
  mode?: ThemeMode;
  children?: React.ReactNode;
}

/**
 * Theme — consolidated theming component
 * - Default: provider + scope boundary
 * - mode="provider-only": only provides context
 * - mode="scope-only": only renders boundary using existing context
 */
export const Theme: React.FC<ThemeProps> = ({
  mode = 'provider+scope',
  children,
  tag = 'main', // div, main, etc
  className = 'w3a-theme-provider',
  style,
  dataAttr,
  // Provider props
  theme,
  tokens,
  prefix,
}) => {
  if (mode === 'scope-only') {
    return (
      <ThemeScope tag={tag} className={className} style={style} dataAttr={dataAttr}>
        {children}
      </ThemeScope>
    );
  }

  const providerEl = (
    <ThemeProvider
      theme={theme}
      tokens={tokens}
      prefix={prefix}
    >
      {mode === 'provider-only' ? (
        <>{children}</>
      ) : (
        <ThemeScope tag={tag} className={className} style={style} dataAttr={dataAttr}>
          {children}
        </ThemeScope>
      )}
    </ThemeProvider>
  );

  return providerEl;
};
