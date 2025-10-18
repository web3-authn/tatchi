import { usePasskeyContext } from '@tatchi/sdk/react';
import { GreetingMenu } from './GreetingMenu';
import { EmbeddedTxButton } from './EmbeddedTxButton';
import { TransactionDetails } from './TransactionDetails';
import { PasskeyLoginMenu } from './PasskeyLoginMenu';
import type { LastTxDetails } from '../types';

export function PasskeyColumn(props: {
  lastTxDetails: LastTxDetails | null;
  setLastTxDetails: (d: LastTxDetails | null) => void;
}) {
  const { lastTxDetails, setLastTxDetails } = props;
  const { loginState } = usePasskeyContext();

  return (
    <div className="layout-column-right">
      <div className="constrained-column">
        <div className="passkey-sticky">
          {loginState.isLoggedIn ? (
            <div style={{
              maxWidth: 480
            }}>
              <GreetingMenu onTransactionUpdate={setLastTxDetails} />
              <EmbeddedTxButton setLastTxDetails={setLastTxDetails} />
              <TransactionDetails lastTxDetails={lastTxDetails} />
            </div>
          ) : (
            <PasskeyLoginMenu />
          )}
        </div>
      </div>
    </div>
  );
}

