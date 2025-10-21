import React from 'react';
import { PasskeyProvider } from '.';
import { Theme } from '../components/theme';
import type { ThemeProps } from '../components/theme';
import { usePreconnectWalletAssets } from '../hooks/usePreconnectWalletAssets';
import type { PasskeyContextProviderProps } from '../types';

export interface TatchiPasskeyProviderProps {
  /** PasskeyProvider configuration (same as PasskeyProvider) */
  config: PasskeyContextProviderProps['config'];
  /** Theme props for the boundary (defaults to provider+scope) */
  theme?: Omit<ThemeProps, 'children'>;
  children: React.ReactNode;
}

/**
 * TatchiPasskeyProvider — ergonomic composition of Theme + PasskeyProvider.
 * Renders a theming boundary (Theme) and provides Passkey context.
 */
export const TatchiPasskeyProvider: React.FC<TatchiPasskeyProviderProps> = ({ config, theme, children }) => {
  // Internal: opportunistically add preconnect/prefetch hints for wallet + relayer
  usePreconnectWalletAssets(config);

  const themeProps: ThemeProps = { mode: 'provider+scope', ...(theme as any) };
  return (
    <PasskeyProvider config={config}>
      <Theme {...themeProps}>{children}</Theme>
    </PasskeyProvider>
  );
};

export default TatchiPasskeyProvider;
