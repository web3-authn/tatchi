import { useState } from 'react';
import { usePasskeyContext } from '@tatchi/sdk/react';

import { PasskeyLoginMenu } from '../components/PasskeyLoginMenu';
import { GreetingMenu } from '../components/GreetingMenu';
import { TransactionDetails } from '../components/TransactionDetails';
import { EmbeddedTxButton } from '../components/EmbeddedTxButton'
import type { LastTxDetails } from '../types';

export function HomePage() {
  const [lastTxDetails, setLastTxDetails] = useState<LastTxDetails | null>(null);
  const { loginState } = usePasskeyContext();
  return (
    <div className="layout-root">
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
  )
}
