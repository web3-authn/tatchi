import { forwardRef, useMemo } from 'react';
import { MenuItem } from './MenuItem';
import { LogoutMenuItem } from './LogoutMenuItem';
import { TransactionSettingsSection } from './TransactionSettingsSection';
import type { ProfileDropdownProps } from './types';
import './ProfileDropdown.css';

interface ProfileDropdownWithRefs extends Omit<ProfileDropdownProps, 'menuItemsRef'> {
  menuItemsRef: React.MutableRefObject<(HTMLElement | null)[]>;
  // Transaction settings props
  currentConfirmConfig?: any;
  onSetUiMode?: (mode: 'skip' | 'modal' | 'drawer') => void;
  onToggleShowDetails?: () => void;
  onToggleSkipClick?: () => void;
  onSetDelay?: (delay: number) => void;
  onToggleTheme?: () => void;
  transactionSettingsOpen?: boolean;
}

export const ProfileDropdown = forwardRef<HTMLDivElement, ProfileDropdownWithRefs>(
  ({
    isOpen,
    menuItems,
    onLogout,
    onClose,
    menuItemsRef,
    toggleColors,
    currentConfirmConfig,
    signerMode,
    onToggleThresholdSigning,
    onSetUiMode,
    onToggleShowDetails,
    onToggleSkipClick,
    onSetDelay,
    onToggleTheme,
    transactionSettingsOpen = false,
    theme = 'dark',
    highlightedMenuItemId,
  }, ref) => {
    // Only count transaction settings if it's actually rendered (when expanded)
    const hasTransactionSettings = transactionSettingsOpen && currentConfirmConfig && onToggleShowDetails && onToggleSkipClick && onSetDelay;

    menuItemsRef.current.length = menuItems.length;

    const highlightedIndex = useMemo(() => {
      if (!highlightedMenuItemId) return -1;
      return menuItems.findIndex((item) => item.id === highlightedMenuItemId || item.label === highlightedMenuItemId);
    }, [highlightedMenuItemId, menuItems]);

    return (
      <div
        ref={ref}
        className={`w3a-profile-dropdown-morphed ${theme}`}
        data-state={isOpen ? 'open' : 'closed'}
      >
        <div className="w3a-profile-dropdown-menu">

          {/* Menu Items */}
          {menuItems.map((item, index) => {
            const refCallback = (el: HTMLElement | null) => {
              if (menuItemsRef.current) {
                menuItemsRef.current[index] = el;
              }
            };
            const isHighlighted = index === highlightedIndex;

            return (
              <MenuItem
                key={item.id ?? index}
                ref={refCallback}
                item={item}
                onClose={onClose}
                className=""
                isHighlighted={isHighlighted}
                // Set CSS variable to calculate stagger delay in CSS stylesheet
                style={{ ['--stagger-item-n' as any]: index }}
              />
            );
          })}

          {/* Transaction Settings Section - Always render with animation */}
          {currentConfirmConfig && (onSetUiMode || onToggleShowDetails) && onToggleSkipClick && onSetDelay && (
            <TransactionSettingsSection
              currentConfirmConfig={currentConfirmConfig}
              signerMode={signerMode}
              onToggleThresholdSigning={onToggleThresholdSigning}
              onSetUiMode={onSetUiMode}
              onToggleShowDetails={onToggleShowDetails}
              onToggleSkipClick={onToggleSkipClick}
              onSetDelay={onSetDelay}
              onToggleTheme={onToggleTheme}
              isOpen={transactionSettingsOpen}
              theme={theme}
              // Set CSS variable to calculate stagger delay in CSS stylesheet
              style={{ ['--stagger-item-n' as any]: menuItems.length }}
            />
          )}

          {/* Logout Section */}
          <LogoutMenuItem
            onLogout={onLogout}
            className="w3a-logout-menu-item"
            // Set CSS variable to calculate stagger delay in CSS stylesheet
            style={{ ['--stagger-item-n' as any]: hasTransactionSettings ? menuItems.length + 1 : menuItems.length }}
          />
        </div>
      </div>
    );
  }
);
