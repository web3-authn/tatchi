import React from 'react';
import { Toaster } from 'sonner';
import { useTheme } from '@tatchi/sdk/react';

export const ToasterThemed: React.FC = () => {
  const { tokens, isDark } = useTheme();

  return (
    <Toaster
      position="bottom-right"
      theme={isDark ? 'dark' : 'light'}
      closeButton
      toastOptions={{ duration: 3500 }}
    />
  );
};

export default ToasterThemed;
