import React from 'react';
import { Toaster } from 'sonner';
import { useTheme } from '@tatchi-xyz/sdk/react';

export const ToasterThemed: React.FC = () => {
  const { isDark } = useTheme();
  return (
    <Toaster
      position="bottom-right"
      theme={isDark ? 'dark' : 'light'}
      closeButton
      toastOptions={{
        duration: 3500,
        style: {
          // Keep toast surface in sync with site palette
          background: 'var(--w3a-colors-colorBackground)',
          borderRadius: '1rem',
        },
        // Keep error toasts (e.g., registration failures) visible
        // until the user explicitly closes them.
        // @ts-ignore
        error: {
          duration: Infinity,
        },
      }}
    />
  );
};

export default ToasterThemed;
