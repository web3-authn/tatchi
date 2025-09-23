import React, { useCallback, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme, usePasskeyContext } from '@web3authn/passkey/react';

export const DarkModeToggle: React.FC = () => {
  const { tokens, isDark, setTheme } = useTheme();
  const { loginState, passkeyManager } = usePasskeyContext();

  const onToggle = useCallback(() => {
    const next = isDark ? 'light' : 'dark';
    // If logged in, persist to user preferences via passkeyManager
    if (loginState.isLoggedIn) {
      passkeyManager.setUserTheme(next);
    }
    // Always update local theme context immediately for snappy UI
    setTheme(next);
  }, [isDark, loginState.isLoggedIn, passkeyManager, setTheme]);

  // Subscribe to user preference theme updates when logged in
  useEffect(() => {
    if (!loginState.isLoggedIn || !passkeyManager) return;
    const unsub = passkeyManager.userPreferences.onThemeChange(t => setTheme(t));
    const t = passkeyManager.userPreferences.getUserTheme();
    if (t === 'light' || t === 'dark') {
      setTheme(t);
    }

    return () => { unsub?.(); };
  }, [loginState.isLoggedIn, passkeyManager, setTheme]);

  return (
    <button
      onClick={onToggle}
      style={{
        background: tokens.colors.surface2,
        border: `1px solid ${tokens.colors.borderPrimary}`,
        cursor: 'pointer',
        borderRadius: '20px',
        padding: '4px',
        width: '66px',
        height: '34px',
        position: 'relative',
        transition: 'all 0.3s ease',
        boxShadow: tokens.shadows.sm,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = tokens.colors.surface2;
        e.currentTarget.style.boxShadow = tokens.shadows.md;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = tokens.colors.surface;
        e.currentTarget.style.boxShadow = tokens.shadows.sm;
      }}
      title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
    >
      {/* Toggle slider */}
      <div
        style={{
          position: 'absolute',
          top: '2px',
          left: isDark ? '34px' : '2px',
          width: '28px',
          height: '28px',
          background: tokens.colors.primary,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'left 0.3s ease',
          boxShadow: tokens.shadows.sm,
        }}
      >
        {isDark ? (
          <Moon size={14} color="#ffffff" />
        ) : (
          <Sun size={14} color="#ffffff" />
        )}
      </div>

      {/* Background icons */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 6px',
        }}
      >
        <Sun size={12} style={{ opacity: isDark ? 0.3 : 1, transition: 'opacity 0.3s ease' }} />
        <Moon size={12} style={{ opacity: isDark ? 1 : 0.3, transition: 'opacity 0.3s ease' }} />
      </div>
    </button>
  );
};
