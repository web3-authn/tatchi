import { usePasskeyContext } from '@tatchi-xyz/sdk/react';

import { PasskeyLoginMenu } from '../components/PasskeyLoginMenu';
import { GreetingMenu } from '../components/GreetingMenu';
import { EmbeddedTxButton } from '../components/EmbeddedTxButton'
import { DemoMultiTx } from '../components/DemoMultiTx';
import { Navbar } from '../components/Navbar';

export function HomePage() {
  const { loginState } = usePasskeyContext();
  return (
    <div className="layout-root">
      <Navbar />
      {
        loginState.isLoggedIn
        ? <>
            <GreetingMenu />
            <EmbeddedTxButton />
            <DemoMultiTx />
          </>
        : <PasskeyLoginMenu />
      }
    </div>
  )
}
