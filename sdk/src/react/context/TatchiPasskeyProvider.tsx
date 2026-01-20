import React from 'react';
import { TatchiContextProvider } from '.';
import { Theme } from '../components/theme';
import type { ThemeProps, ThemeName } from '../components/theme';
import { usePreconnectWalletAssets } from '../hooks/usePreconnectWalletAssets';
import { useWalletIframeZIndex } from '../hooks/useWalletIframeZIndex';
import type { TatchiContextProviderProps } from '../types';

export type TatchiPasskeyProviderThemeProps = Omit<ThemeProps, 'children'> & {
  setTheme?: (theme: ThemeName) => void;
};

export interface TatchiPasskeyProviderProps {
  /** TatchiContextProvider configuration */
  config: TatchiContextProviderProps['config'];
  /** Theme props for the boundary (defaults to provider+scope) */
  theme?: TatchiPasskeyProviderThemeProps;
  /**
   * Optional z-index override for the wallet iframe overlay.
   * Sets the CSS variable --w3a-wallet-overlay-z on the document root.
   *
   * Defaults and layering:
   * - Wallet iframe overlay: `var(--w3a-wallet-overlay-z, 2147483646)`
   * - Linked Devices modal + QR scanner: `overlayZ - 2` / `overlayZ - 1`
   *   (always below the wallet overlay so tx confirmer wins)
   * - ProfileSettingsMenu/PasskeyAuthMenu: small local z-indexes only (1–3),
   *   no fullscreen overlay z-index.
   */
  walletOverlayZIndex?: number;
  /**
   * When true, pre-warm iframe + workers on idle after mount.
   * Defaults to false (lazy by default).
   */
  eager?: boolean;
  children: React.ReactNode;
}

/**
 * TatchiPasskeyProvider — ergonomic composition of Theme + PasskeyProvider.
 * Renders a theming boundary (Theme) and provides Passkey context.
 */
export const TatchiPasskeyProvider: React.FC<TatchiPasskeyProviderProps> = ({
  config,
  theme,
  walletOverlayZIndex,
  eager,
  children
}) => {
  // Internal: opportunistically add preconnect/prefetch hints for wallet + relayer
  usePreconnectWalletAssets(config);

  // Optionally override the wallet iframe overlay z-index via CSS variable
  useWalletIframeZIndex(walletOverlayZIndex);

  const { theme: controlledTheme, setTheme, ...themeOverrides } = theme || ({} as any);
  const themeProps: ThemeProps = {
    theme: controlledTheme,
    ...(themeOverrides as Omit<ThemeProps, 'children' | 'theme'>),
  };
  return (
    <TatchiContextProvider config={config} eager={eager} theme={controlledTheme ? { theme: controlledTheme, setTheme } : undefined}>
      <Theme {...themeProps}>{children}</Theme>
    </TatchiContextProvider>
  );
};

export default TatchiPasskeyProvider;
