import { usePasskeyContext } from '@tatchi/sdk/react';
import { DemoTransaction } from './DemoTransaction';
import { PasskeyLoginMenu } from './PasskeyLoginMenu';
import NavbarStatic from './Navbar/NavbarStatic'
import NavbarProfileOverlay from './Navbar/NavbarProfileOverlay'

export function PasskeyColumn() {
  const { loginState } = usePasskeyContext();

  return (
    <div className="layout-column-right">
      <div className="constrained-column">
        <NavbarStatic />
        <NavbarProfileOverlay />
        <div className="passkey-sticky">
          {loginState.isLoggedIn ? (
            <DemoTransaction />
          ) : (
            <PasskeyLoginMenu />
          )}
        </div>
      </div>
    </div>
  );
}
