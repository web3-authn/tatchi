import { forwardRef } from 'react';
import { Toggle } from './Toggle';
import type { ProfileRelayerToggleSectionProps } from './types';

export const ProfileRelayerToggleSection = forwardRef<HTMLDivElement, ProfileRelayerToggleSectionProps>(
  ({ useRelayer, onRelayerChange, toggleColors, className, style }, ref) => {
    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
    };

    return (
      <div
        ref={ref}
        className={`web3authn-profile-dropdown-toggle-section ${className || ''}`}
        style={style}
        onClick={handleClick}
      >
        <div className="web3authn-profile-dropdown-toggle-content">
          <div className="web3authn-profile-dropdown-toggle-text">
            <p className="web3authn-profile-dropdown-toggle-title">
              {useRelayer ? 'Use Relayer' : 'Use Faucet'}
            </p>
            <p className="web3authn-profile-dropdown-toggle-description">
              {useRelayer
                ? 'Using relayer for account creation'
                : 'Direct testnet account creation'
              }
            </p>
          </div>
          <Toggle
            checked={useRelayer}
            onChange={onRelayerChange}
            showTooltip={false}
            size="large"
            textPosition='left'
            colors={toggleColors}
          />
        </div>
      </div>
    );
  }
);

ProfileRelayerToggleSection.displayName = 'ProfileRelayerToggleSection';