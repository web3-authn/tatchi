import { useState } from 'react';
import { usePasskeyContext, useTheme } from '@tatchi/sdk/react';

import { PasskeyLoginMenu } from '../components/PasskeyLoginMenu';
import { GreetingMenu } from '../components/GreetingMenu';
import { TransactionDetails } from '../components/TransactionDetails';
import { EmbeddedTxButton } from '../components/EmbeddedTxButton'
import type { LastTxDetails } from '../types';

export function HomePage() {
  const [lastTxDetails, setLastTxDetails] = useState<LastTxDetails | null>(null);

  const { loginState } = usePasskeyContext();
  const { tokens, theme } = useTheme();

  return (
    <div className="layout-root">
      <div className="layout-column">
        <h2>Tatchi Embedded Wallet SDK</h2>
        <div>content</div>
      </div>
      <div className="layout-column">
        <div className="layout-workspace" data-w3a-theme={theme}>
          {
            loginState.isLoggedIn
            ? <>
                <GreetingMenu onTransactionUpdate={setLastTxDetails} />
                <EmbeddedTxButton setLastTxDetails={setLastTxDetails} />
                <TransactionDetails lastTxDetails={lastTxDetails} />
              </>
            : <PasskeyLoginMenu />
          }
        </div>
      </div>
    </div>
  );
}
