import { useTatchi } from '@tatchi-xyz/sdk/react';

import { PasskeyLoginMenu } from '../components/PasskeyLoginMenu';
import { GreetingMenu } from '../components/GreetingMenu';
import { DemoMultiTx } from '../components/DemoMultiTx';
import { Navbar } from '../components/Navbar';

export function HomePage() {
  const { loginState } = useTatchi();
  return (
    <div className="layout-root">
      <Navbar />
      {
        loginState.isLoggedIn
        ? <>
            <GreetingMenu />
            <DemoMultiTx />
          </>
        : <PasskeyLoginMenu />
      }
    </div>
  )
}
