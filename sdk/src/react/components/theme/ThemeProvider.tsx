import React from 'react';
import { usePasskeyContext } from '../../context';
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

function safeGetVitepressAppearance(): ThemeName | null {
  try {
    const stored = window.localStorage?.getItem?.('vitepress-theme-appearance');
    return stored === 'dark' || stored === 'light' ? stored : null;
  } catch {
    return null;
  }
}

function getEnvAppearance(): ThemeName | null {
  if (typeof document === 'undefined') return null;
  const isDark = document.documentElement.classList.contains('dark');
  if (typeof isDark === 'boolean') return isDark ? 'dark' : 'light';
  return safeGetVitepressAppearance();
}

const ThemeProvider: React.FC<ThemeProviderProps> = ({
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
    const t = passkeyManager?.userPreferences?.getUserTheme?.();
    if (t === 'light' || t === 'dark') return t;
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
    return () => { unsub?.(); };
  }, [isControlled, passkeyManager]);

  // Hydrate from persisted user preference when available (post-login)
  React.useEffect(() => {
    if (isControlled || !passkeyManager) return;
    const up = passkeyManager.userPreferences as any;
    const fn: undefined | (() => Promise<'dark' | 'light' | null>) = up?.getCurrentUserAccountIdTheme?.bind(up);
    if (!fn) return;
    let cancelled = false;
    (async () => {
      const persisted = await fn();
      if (cancelled) return;
      if (persisted === 'dark' || persisted === 'light') {
        const env = getEnvAppearance();
        // If environment appearance exists and conflicts with persisted, prefer env to avoid flicker.
        if (env && env !== persisted) return;
        if (persisted !== themeState) setThemeState(persisted);
      }
    })();
    return () => { cancelled = true; };
  }, [isControlled, passkeyManager, themeState]);

  // On login, sync stored user preference to the current theme to avoid "first-click does nothing"
  React.useEffect(() => {
    if (isControlled || !passkeyManager?.userPreferences) return;
    let cancelled = false;
    (async () => {
      (async () => {
        const pref = await passkeyManager.userPreferences.getCurrentUserAccountIdTheme?.();
        if (cancelled) return;
        // If stored preference differs from current theme, align stored pref to current theme
        if ((pref === 'light' || pref === 'dark') && pref !== themeState) {
          passkeyManager.userPreferences.setUserTheme?.(themeState);
        }
      })();
    })();
    return () => { cancelled = true; };
  }, [isControlled, passkeyManager, themeState]);

  const setTheme = React.useCallback((t: ThemeName) => {
    // Avoid redundant writes and subscription loops
    if (t === themeState) return;
    if (!isControlled) setThemeState(t);
    // Prefer full SDK propagation when available (ensures wallet-iframe host updates)
    const didCallSdk = !!passkeyManager?.setUserTheme?.(t);
    if (!didCallSdk) safeStoreTheme(t);
    onThemeChange?.(t);
  }, [isControlled, onThemeChange, passkeyManager, themeState]);

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
  defaultTheme,
  onThemeChange,
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
      defaultTheme={defaultTheme}
      onThemeChange={onThemeChange}
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
