import React from 'react';
import { CopyButton } from '../CopyButton';

export const DerivedAddressPill: React.FC<{
  address?: string;
  ariaLabel?: string;
}> = ({ address, ariaLabel = 'Copy derived address' }) => {
  return (
    <div className="derived-address-pill">
      <span className="derived-address-text">{address || 'Deriving address…'}</span>
      <CopyButton text={address || ''} ariaLabel={ariaLabel} size={16} />
    </div>
  );
};

export default DerivedAddressPill;

