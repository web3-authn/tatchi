
import React from 'react';
import { usePasskeyContext } from '@tatchi/sdk/react';
import './MultiTxConfirmPage.css';
import { MultiTxDemo } from '../components/MultiTxDemo';

/**
 * Demo page for modal multi-action confirmation and batch transactions.
 *
 * Users can:
 * 1. Configure a multi-action transaction and execute it through the modal
 * 2. Batch sign and broadcast multiple transfers in sequence
 */
export const MultiTxConfirmPage: React.FC = () => {
  const { loginState: { isLoggedIn } } = usePasskeyContext();

  if (!isLoggedIn) {
    return (
      <div className="multi-tx-page-root">
        <div className="multi-tx-translucent-container">
          <div className="multi-tx-content-area">
            <div className="multi-tx-login-prompt">
              <h2 className="multi-tx-heading">Log in to explore the transaction confirm demos</h2>
              <p className="multi-tx-body">You must be logged in to try the transaction confirmation demos.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="multi-tx-confirm-page">
      <div className="multi-tx-confirm-page-content">
        <MultiTxDemo />
      </div>
    </div>
  );
};
