import React from 'react';
import { TatchiContextProvider } from '.';
import { Theme } from '../components/theme';
import type { ThemeProps } from '../components/theme';
import { usePreconnectWalletAssets } from '../hooks/usePreconnectWalletAssets';
import type { TatchiContextProviderProps } from '../types';

export interface TatchiPasskeyProviderProps {
  /** TatchiContextProvider configuration */
  config: TatchiContextProviderProps['config'];
  /** Theme props for the boundary (defaults to provider+scope) */
  theme?: Omit<ThemeProps, 'children'>;
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
export const TatchiPasskeyProvider: React.FC<TatchiPasskeyProviderProps> = ({ config, theme, eager, children }) => {
  // Internal: opportunistically add preconnect/prefetch hints for wallet + relayer
  usePreconnectWalletAssets(config);

  const themeProps: ThemeProps = { mode: 'provider+scope', ...(theme as any) };
  return (
    <TatchiContextProvider config={config} eager={eager}>
      <Theme {...themeProps}>{children}</Theme>
    </TatchiContextProvider>
  );
};

export default TatchiPasskeyProvider;
