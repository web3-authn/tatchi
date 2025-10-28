import React from 'react';
import { Toaster } from 'react-hot-toast';
import { useTheme } from '@tatchi-xyz/sdk/react';

export const ToasterThemed: React.FC = () => {
  const { tokens, isDark } = useTheme();

  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        duration: 3500,
        style: {
          background: tokens.colors.surface3,
          color: tokens.colors.textPrimary,
          // Thicker, semi‑transparent base border
          border: `2px solid color-mix(in srgb, ${tokens.colors.borderPrimary} 35%, transparent)`,
          boxShadow: tokens.shadows.sm,
          borderRadius: '12px',
          // Make long messages behave nicely
          maxWidth: 'min(90vw, 420px)',
          whiteSpace: 'normal',          // allow wrapping
          wordBreak: 'break-word',       // break long hashes/words
          overflowWrap: 'anywhere',
          lineHeight: 1.2,
        },
        loading: {
          style: {
            background: tokens.colors.surface3,
            border: `2px solid color-mix(in srgb, ${tokens.colors.textSecondary} 35%, transparent)`,
          },
        },
        success: {
          style: {
            border: `2px solid color-mix(in srgb, ${tokens.colors.success} 35%, transparent)`,
          },
          iconTheme: {
            primary: tokens.colors.success,
            secondary: tokens.colors.surface,
          },
        },
        error: {
          style: {
            border: `2px solid color-mix(in srgb, ${tokens.colors.error} 35%, transparent)`,
          },
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
