import { forwardRef } from 'react';
import { ProfileMenuItem } from './ProfileMenuItem';
import { ProfileRelayerToggleSection } from './ProfileRelayerToggleSection';
import { ProfileLogoutSection } from './ProfileLogoutSection';
import type { ProfileDropdownProps } from './types';

interface AnimationState {
  containerAnimationClass: string;
  dropdownAnimationClass: string;
  menuItemAnimationClass: string;
}

interface AnimationStyles {
  containerStyle: React.CSSProperties;
  dropdownStyle: React.CSSProperties;
  getMenuItemStyle: (index: number, totalItems?: number) => React.CSSProperties;
}

interface ProfileDropdownWithRefs extends ProfileDropdownProps {
  menuItemsRef: React.RefObject<(HTMLElement | null)[]>;
  animationState?: AnimationState;
  animationStyles?: AnimationStyles;
}

export const ProfileDropdown = forwardRef<HTMLDivElement, ProfileDropdownWithRefs>(
  ({ isOpen, menuItems, useRelayer, onRelayerChange, onLogout, onClose, menuItemsRef, toggleColors, animationState, animationStyles }, ref) => {
    const totalItems = menuItems.length + 2; // menuItems + relayer toggle + logout

    return (
      <div
        ref={ref}
        className={`web3authn-profile-dropdown-morphed ${isOpen ? 'visible' : 'hidden'} ${animationState?.dropdownAnimationClass || ''}`}
        style={animationStyles?.dropdownStyle}
      >
        <div className="web3authn-profile-dropdown-menu">
          {/* Menu Items */}
          {menuItems.map((item, index) => (
            <ProfileMenuItem
              key={index}
              ref={(el) => {
                if (menuItemsRef.current) {
                  menuItemsRef.current[index + 1] = el;
                }
              }}
              item={item}
              index={index}
              onClose={onClose}
              className={animationState?.menuItemAnimationClass}
              style={animationStyles?.getMenuItemStyle(index, totalItems)}
            />
          ))}

          {/* Relayer Toggle Section */}
          <ProfileRelayerToggleSection
            ref={(el: any) => {
              if (menuItemsRef.current) {
                menuItemsRef.current[menuItems.length + 1] = el;
              }
            }}
            useRelayer={useRelayer}
            onRelayerChange={onRelayerChange}
            toggleColors={toggleColors}
            className={animationState?.menuItemAnimationClass}
            style={animationStyles?.getMenuItemStyle(menuItems.length, totalItems)}
          />

          {/* Logout Section */}
          <ProfileLogoutSection
            ref={(el: any) => {
              if (menuItemsRef.current) {
                menuItemsRef.current[menuItems.length + 2] = el;
              }
            }}
            onLogout={onLogout}
            className={animationState?.menuItemAnimationClass}
            style={animationStyles?.getMenuItemStyle(menuItems.length + 1, totalItems)}
          />
        </div>
      </div>
    );
  }
);

ProfileDropdown.displayName = 'ProfileDropdown';