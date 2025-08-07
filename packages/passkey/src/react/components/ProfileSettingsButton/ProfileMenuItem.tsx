import { forwardRef } from 'react';
import type { ProfileMenuItemProps } from './types';

export const ProfileMenuItem = forwardRef<HTMLButtonElement, ProfileMenuItemProps>(
  ({ item, index, onClose, className, style }, ref) => {
    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!item.disabled) {
        console.log(`Clicked: ${item.label}`);
        if (item.onClick) {
          item.onClick();
        }
        onClose();
      }
    };

    return (
      <button
        ref={ref}
        disabled={item.disabled}
        className={`web3authn-profile-dropdown-menu-item ${item.disabled ? 'disabled' : ''} ${className || ''}`}
        style={style}
        onClick={handleClick}
      >
        <div className="web3authn-profile-dropdown-menu-item-icon">
          {item.icon}
        </div>
        <div className="web3authn-profile-dropdown-menu-item-content">
          <p className="web3authn-profile-dropdown-menu-item-label">
            {item.label}
          </p>
          <p className="web3authn-profile-dropdown-menu-item-description">
            {item.description}
          </p>
        </div>
      </button>
    );
  }
);

ProfileMenuItem.displayName = 'ProfileMenuItem';