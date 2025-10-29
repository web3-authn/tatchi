import React from 'react';
import { Toaster } from 'react-hot-toast';
import { useTheme } from '@tatchi-xyz/sdk/react';

export const ToasterThemed: React.FC = () => {
  const { tokens } = useTheme();

  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        duration: 3500,
        style: {
          background: tokens.colors.colorBackground,
          color: tokens.colors.textPrimary,
          border: `1px solid ${tokens.colors.borderPrimary}`,
          boxShadow: tokens.shadows.sm,
          borderRadius: '2rem',
          // Make long messages behave nicely
          maxWidth: 'min(90vw, 420px)',
          whiteSpace: 'normal',
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
          lineHeight: 1.1,
        },
        loading: {},
        success: {
          iconTheme: {
            primary: tokens.colors.success,
            secondary: tokens.colors.surface,
          },
        },
        error: {
          iconTheme: {
            primary: tokens.colors.error,
            secondary: tokens.colors.surface,
          },
        },
      }}
    />
  );
};

export default ToasterThemed;
