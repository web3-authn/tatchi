import { useState } from 'react';
import { usePasskeyContext } from '@web3authn/passkey/react';

import { PasskeyLoginMenu } from '../components/PasskeyLoginMenu';
import { GreetingMenu } from '../components/GreetingMenu';
import { TransactionDetails } from '../components/TransactionDetails';
import type { LastTxDetails } from '../types';
import { LinkDeviceShowQR } from '../components/LinkDeviceShowQR';

export function HomePage() {
  const [lastTxDetails, setLastTxDetails] = useState<LastTxDetails | null>(null);

  const { loginState } = usePasskeyContext();

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
          <LinkDeviceShowQR />
        </div>
      )}
    </main>
  );
}