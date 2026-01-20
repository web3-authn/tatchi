import React from 'react';
import type { DesignTokens, UseThemeReturn } from './design-tokens';
import { LIGHT_TOKENS, DARK_TOKENS } from './design-tokens';
import { createCSSVariables, mergeTokens, PartialDeep } from './utils';


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

export function useTheme(): UseThemeReturn {
  const ctx = useThemeContext();
  return React.useMemo(() => ({
    theme: ctx.theme,
    tokens: ctx.tokens,
    isDark: ctx.isDark,
  }), [ctx.theme, ctx.tokens, ctx.isDark]);
}

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

export interface ThemeProps extends Omit<ThemeProviderProps, 'children'>, Omit<ThemeScopeProps, 'children'> {
  children?: React.ReactNode;
}

export const Theme: React.FC<ThemeProps> = ({
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
  return (
    <ThemeProvider
      theme={theme}
      tokens={tokens}
      prefix={prefix}
    >
      <ThemeScope tag={tag} className={className} style={style} dataAttr={dataAttr}>
        {children}
      </ThemeScope>
    </ThemeProvider>
  );
};
