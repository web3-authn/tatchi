import { useState } from 'react';
import { usePasskeyContext } from '@web3authn/passkey/react';

import { PasskeyLoginMenu } from '../components/PasskeyLoginMenu';
import { GreetingMenu } from '../components/GreetingMenu';
import { TransactionDetails } from '../components/TransactionDetails';
import type { LastTxDetails } from '../types';
import { LinkDeviceScanQR } from '../components/LinkDeviceScanQR';

export function HomePage() {
  const [lastTxDetails, setLastTxDetails] = useState<LastTxDetails | null>(null);

  const { loginState } = usePasskeyContext();

  return (
    <main>
      {loginState.isLoggedIn ? (
        <div className="homepage-content">
          <GreetingMenu onTransactionUpdate={setLastTxDetails} />
          <TransactionDetails lastTxDetails={lastTxDetails} />
          <LinkDeviceScanQR />
        </div>
      ) : (
        <PasskeyLoginMenu />
      )}
    </main>
  );
}