import React from 'react';
import { shortenString } from '../utils/strings';
import type { LastTxDetails } from '../types';

interface TransactionDetailsProps {
  lastTxDetails: LastTxDetails | null;
}

export const TransactionDetails: React.FC<TransactionDetailsProps> = ({ lastTxDetails }) => {
  if (!lastTxDetails) {
    return null;
  }

  return (
    <div className="transaction-details-container">
      <h3>Latest Transaction</h3>
      <div className="transaction-content">
        {lastTxDetails.message && (
          <div className="tx-message">
            {lastTxDetails.message}
          </div>
        )}
        {lastTxDetails.id !== 'N/A' && (
          <div className="tx-details">
            <span>Transaction ID: </span>
            <a
              href={lastTxDetails.link}
              target="_blank"
              rel="noopener noreferrer"
              title={`View transaction ${lastTxDetails.id} on NEAR Explorer`}
              className="tx-link"
              style={{
                color: '#007acc',
                textDecoration: 'underline',
                fontFamily: 'monospace'
              }}
            >
              {shortenString(lastTxDetails.id, 12, 8)}
            </a>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              Click to view on NEAR Explorer
            </div>
          </div>
        )}
      </div>
    </div>
  );
};