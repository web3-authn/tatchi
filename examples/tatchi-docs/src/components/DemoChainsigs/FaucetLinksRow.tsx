import React from 'react';
import { faucetLinksForChainId } from './utils';

export const FaucetLinksRow: React.FC<{ chainId: number }>
  = ({ chainId }) => {
    const links = faucetLinksForChainId(chainId);
    if (!links?.length) return null;
    return (
      <div style={{ marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {links.map((f) => (
          <a key={f.url} href={f.url} target="_blank" rel="noreferrer">
            {f.label}
          </a>
        ))}
      </div>
    );
  };

export default FaucetLinksRow;

