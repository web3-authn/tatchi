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
  const { tokens } = useTheme();

  return (
    <main>
      {loginState.isLoggedIn ? (
        <div className="layout-root">
          <GreetingMenu onTransactionUpdate={setLastTxDetails} />
          <EmbeddedTxButton setLastTxDetails={setLastTxDetails} />
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
