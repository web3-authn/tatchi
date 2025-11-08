import React from 'react';
import type { HighlightedProfileMenuItem } from '@tatchi-xyz/sdk/react';

export interface ProfileMenuControlValue {
  isMenuOpen: boolean;
  highlightedMenuItem: HighlightedProfileMenuItem | null;
  setMenuOpen: (open: boolean) => void;
  requestHighlight: (config: HighlightedProfileMenuItem) => void;
  clearHighlight: () => void;
}

const ProfileMenuControlContext = React.createContext<ProfileMenuControlValue | null>(null);

export const useProfileMenuControl = (): ProfileMenuControlValue => {
  const ctx = React.useContext(ProfileMenuControlContext);
  if (!ctx) throw new Error('useProfileMenuControl must be used within ProfileMenuControlProvider');
  return ctx;
};

export function ProfileMenuControlProvider({ children }: { children: React.ReactNode }) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [highlightedMenuItem, setHighlightedMenuItem] = React.useState<HighlightedProfileMenuItem | null>(null);

  const handleSetMenuOpen = React.useCallback((open: boolean) => {
    setIsMenuOpen(open);
    if (!open) {
      setHighlightedMenuItem(null);
    }
  }, []);

  const requestHighlight = React.useCallback((config: HighlightedProfileMenuItem) => {
    setHighlightedMenuItem({
      focus: true,
      ...config,
    });
    setIsMenuOpen(true);
  }, []);

  const clearHighlight = React.useCallback(() => {
    setHighlightedMenuItem(null);
  }, []);

  const value = React.useMemo<ProfileMenuControlValue>(() => ({
    isMenuOpen,
    highlightedMenuItem,
    setMenuOpen: handleSetMenuOpen,
    requestHighlight,
    clearHighlight,
  }), [clearHighlight, handleSetMenuOpen, highlightedMenuItem, isMenuOpen, requestHighlight]);

  return (
    <ProfileMenuControlContext.Provider value={value}>
      {children}
    </ProfileMenuControlContext.Provider>
  );
}
