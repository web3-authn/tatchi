import { forwardRef } from 'react';
import type { ProfileLogoutSectionProps } from './types';

export const ProfileLogoutSection = forwardRef<HTMLDivElement, ProfileLogoutSectionProps>(
  ({ onLogout, className, style }, ref) => {
    const handleLogout = (e: React.MouseEvent) => {
      e.stopPropagation();
      onLogout();
    };

    return (
      <div ref={ref} className={className} style={style}>
        <div className="web3authn-profile-dropdown-logout-section">
          <button
            className="web3authn-profile-dropdown-logout-button"
            onClick={handleLogout}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" className="web3authn-profile-dropdown-logout-icon">
              <path d="M3 3a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v2a.5.5 0 0 1-1 0V3H4v10h8v-2a.5.5 0 0 1 1 0v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3Z" fill="currentColor"/>
              <path d="M11.854 8.854a.5.5 0 0 0 0-.708l-3-3a.5.5 0 1 0-.708.708L10.293 8H1.5a.5.5 0 0 0 0 1h8.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3Z" fill="currentColor"/>
            </svg>
            <span className="web3authn-profile-dropdown-logout-text">
              Log out
            </span>
          </button>
        </div>
      </div>
    );
  }
);

ProfileLogoutSection.displayName = 'ProfileLogoutSection';