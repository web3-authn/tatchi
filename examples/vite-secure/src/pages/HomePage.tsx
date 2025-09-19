import { useState } from 'react';
import { usePasskeyContext, useTheme } from '@web3authn/passkey/react';

import { PasskeyLoginMenu } from '../components/PasskeyLoginMenu';
import { GreetingMenu } from '../components/GreetingMenu';
import { TransactionDetails } from '../components/TransactionDetails';
import type { LastTxDetails } from '../types';

export function HomePage() {
  const [lastTxDetails, setLastTxDetails] = useState<LastTxDetails | null>(null);

  const { loginState } = usePasskeyContext();
  const { tokens } = useTheme();

  return (
    <main>
      {loginState.isLoggedIn ? (
        <div className="layout-root">
          <GreetingMenu onTransactionUpdate={setLastTxDetails} />
          <TransactionDetails lastTxDetails={lastTxDetails} />
        </div>
      ) : (
        <div className="layout-root">
          <PasskeyLoginMenu />
        </div>
      )}
    </main>
  );
}