import React from 'react';
import { Toaster } from 'react-hot-toast';
import { useTheme } from '@web3authn/passkey/react';

export const ToasterThemed: React.FC = () => {
  const { tokens, isDark } = useTheme();

  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        duration: 3500,
        style: {
          background: tokens.colors.colorSurface,
          color: tokens.colors.textPrimary,
          border: `1px solid ${tokens.colors.borderPrimary}`,
          boxShadow: tokens.shadows.sm,
          borderRadius: '12px',
          // Make long messages behave nicely
          maxWidth: 'min(90vw, 420px)',
          whiteSpace: 'normal',          // allow wrapping
          wordBreak: 'break-word',       // break long hashes/words
          overflowWrap: 'anywhere',
          lineHeight: 1.3,
        },
        success: {
          iconTheme: {
            primary: tokens.colors.success,
            secondary: tokens.colors.colorSurface,
          },
        },
        error: {
          iconTheme: {
            primary: tokens.colors.error,
            secondary: tokens.colors.colorSurface,
          },
        },
      }}
    />
  );
};

export default ToasterThemed;
