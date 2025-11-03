import React from 'react'
import NavbarStatic from './Navbar/NavbarStatic'
import NavbarProfileOverlay from './Navbar/NavbarProfileOverlay'
import { usePasskeyContext } from '@tatchi-xyz/sdk/react'

import { CarouselProvider } from './carousel/CarouselProvider'
import { Carousel } from './carousel/Carousel'

import { DemoPage } from './DemoPage';
import { PasskeyLoginMenu } from './PasskeyLoginMenu';
import { AccountRecovery } from './AccountRecovery';
import { DemoChainsigs } from './DemoChainsigs';
import { AuthMenuControlProvider } from '../contexts/AuthMenuControl';

export function PasskeyColumn() {
  const { loginState } = usePasskeyContext()
  const [currentPage, setCurrentPage] = React.useState(0)

  // After login, jump to Demo Tx page (index 1). On logout, go back to Login (index 0).
  React.useEffect(() => {
    setCurrentPage(loginState?.isLoggedIn ? 1 : 0)
  }, [loginState?.isLoggedIn])

  const pages = React.useMemo(() => ([
    { key: 'login', title: 'Login', element: <PasskeyLoginMenu onLoggedIn={() => setCurrentPage(1)} /> },
    { key: 'demo-page', title: 'Demos', element: <DemoPage />, disabled: !loginState?.isLoggedIn },
    { key: 'intents', title: 'NEAR Intents', element: <DemoChainsigs />, disabled: !loginState?.isLoggedIn },
    { key: 'recovery', title: 'Account Recovery', element: <AccountRecovery />, disabled: !loginState?.isLoggedIn },
  ]), [loginState?.isLoggedIn])

  return (
    <div className="layout-column-right">
      <div className="constrained-column">
        <NavbarStatic />
        <NavbarProfileOverlay />
        <div className="passkey-demo">
          <AuthMenuControlProvider>
            <CarouselProvider
              pages={pages}
              initialKey="login"
              showBreadcrumbs
              currentPage={currentPage}
              onCurrentPageChange={setCurrentPage}
              rootStyle={{
                padding: '0rem 0rem 6rem 0rem',
                // padding-bottom for tooltip so it's not clipped
                display: 'grid',
                placeContent: 'center',
              }}
              breadcrumbsStyle={{
                padding: '2rem 1rem 0rem 1rem',
                display: 'grid',
                placeContent: 'center',
              }}
            >
              <Carousel />
            </CarouselProvider>
          </AuthMenuControlProvider>
        </div>
      </div>
    </div>
  );
}
