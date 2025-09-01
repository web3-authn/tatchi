import { forwardRef } from 'react';
import { MenuItem } from './MenuItem';
import { LogoutMenuItem } from './LogoutMenuItem';
import { TransactionSettingsSection } from './TransactionSettingsSection';
import type { ProfileDropdownProps } from './types';
import './ProfileDropdown.css';

interface ProfileDropdownWithRefs extends ProfileDropdownProps {
  menuItemsRef: React.RefObject<(HTMLElement | null)[]>;
  // Transaction settings props
  currentConfirmConfig?: any;
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
    useRelayer,
    onRelayerChange,
    onLogout,
    onClose,
    menuItemsRef,
    toggleColors,
    currentConfirmConfig,
    onToggleShowDetails,
    onToggleSkipClick,
    onSetDelay,
    onToggleTheme,
    transactionSettingsOpen = false,
  }, ref) => {
    // Only count transaction settings if it's actually rendered (when expanded)
    const hasTransactionSettings = transactionSettingsOpen && currentConfirmConfig && onToggleShowDetails && onToggleSkipClick && onSetDelay;
    const totalItems = menuItems.length + (hasTransactionSettings ? 3 : 2); // menuItems + (transaction settings if expanded) + relayer toggle + logout

    return (
      <div
        ref={ref}
        className={`w3a-profile-dropdown-morphed`}
        data-state={isOpen ? 'open' : 'closed'}
      >
        <div className="w3a-profile-dropdown-menu">

          {/* Menu Items */}
          {menuItems.map((item, index) => (
            <MenuItem
              key={index}
              ref={(el) => {
                if (menuItemsRef.current) {
                  menuItemsRef.current[index + 1] = el;
                }
              }}
              item={item}
              index={index}
              onClose={onClose}
              className=""
              // Set CSS variable to calculate stagger delay in CSS stylesheet
              style={{ ['--stagger-item-n' as any]: index }}
            />
          ))}

          {/* Transaction Settings Section - Always render with animation */}
          {currentConfirmConfig && onToggleShowDetails && onToggleSkipClick && onSetDelay && (
            <TransactionSettingsSection
              currentConfirmConfig={currentConfirmConfig}
              onToggleShowDetails={onToggleShowDetails}
              onToggleSkipClick={onToggleSkipClick}
              onSetDelay={onSetDelay}
              onToggleTheme={onToggleTheme}
              isOpen={transactionSettingsOpen}
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
