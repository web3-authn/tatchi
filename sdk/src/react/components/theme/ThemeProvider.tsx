import React from 'react';
import { useTatchi } from '../../context';
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
  /**
   * When true, writes user theme to SDK user preferences (and wallet host when available)
   * on setTheme/toggleTheme. Falls back to localStorage when not logged in.
   * Defaults to true.
   */
  syncUserPreferences?: boolean;
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
  syncUserPreferences = true,
}) => {
  // Make passkey context optional - ThemeProvider can work without it
  let tatchi: any;
  let loginState: { isLoggedIn?: boolean } | null = null;
  try {
    const ctx = useTatchi() as any;
    tatchi = ctx?.tatchi;
    loginState = ctx?.loginState;
  } catch {
    // ThemeProvider can work without TatchiContextProvider
    tatchi = null;
    loginState = null;
  }
  const isControlled = themeProp !== undefined && themeProp !== null;
  const isWalletIframeMode = !!tatchi?.configs?.iframeWallet?.walletOrigin;

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
    const t = tatchi?.userPreferences?.getUserTheme?.();
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
    if (isControlled || !tatchi) return;
    const up = tatchi.userPreferences;
    if (!up?.onThemeChange) return;
    const unsub = up.onThemeChange((t: ThemeName) => setThemeState(t));
    return () => { unsub?.(); };
  }, [isControlled, tatchi]);

  // Hydrate from persisted user preference when available (post-login)
  React.useEffect(() => {
    if (isControlled || !tatchi || !loginState?.isLoggedIn) return;
    // In wallet-iframe mode, persisted preferences live on the wallet origin; the app origin
    // should not attempt to read IndexedDB (it is intentionally disabled).
    if (isWalletIframeMode) return;
    const up = tatchi.userPreferences as any;
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
  }, [isControlled, isWalletIframeMode, tatchi, themeState, loginState?.isLoggedIn]);

  // On login, propagate current theme to user prefs AND wallet host to avoid "first-click does nothing"
  React.useEffect(() => {
    if (isControlled || !tatchi?.userPreferences || !loginState?.isLoggedIn || !syncUserPreferences) return;
    // Wallet-iframe mode: wallet host is the source of truth; avoid pushing app theme on login.
    if (isWalletIframeMode) return;
    let cancelled = false;
    void (async () => {
      const pref = await tatchi.userPreferences.getCurrentUserAccountIdTheme?.();
      if (cancelled) return;
      // If no stored preference yet OR it differs, push current theme
      if (pref !== themeState) {
        tatchi.setUserTheme?.(themeState);
      }
    })();
    return () => { cancelled = true; };
  }, [isControlled, isWalletIframeMode, tatchi, themeState, loginState?.isLoggedIn, syncUserPreferences]);

  const setTheme = React.useCallback((t: ThemeName) => {
    // Avoid redundant writes and subscription loops
    if (t === themeState) return;
    if (!isControlled) setThemeState(t);
    // Attempt to sync to user preferences (wallet host when available)
    if (syncUserPreferences && tatchi?.setUserTheme) {
      tatchi.setUserTheme(t);
    }
    // Persist locally when not logged in, or if no tatchi available
    if (!loginState?.isLoggedIn || !tatchi || !syncUserPreferences) {
      safeStoreTheme(t);
    }
    // If SDK sync failed for any reason, local storage remains as fallback via catchless best-effort above
    onThemeChange?.(t);
  }, [isControlled, onThemeChange, tatchi, themeState, loginState?.isLoggedIn, syncUserPreferences]);

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
  syncUserPreferences,
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
      syncUserPreferences={syncUserPreferences}
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
