import React from 'react';
import { PasskeyProvider } from '../../context';
import { Theme } from '../theme';
import type { ThemeProps } from '../theme';
import type { PasskeyContextProviderProps } from '../../types';

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
  const themeProps: ThemeProps = { mode: 'provider+scope', ...(theme as any) };
  return (
    <PasskeyProvider config={config}>
      <Theme {...themeProps}>{children}</Theme>
    </PasskeyProvider>
  );
};

export default TatchiPasskeyProvider;
