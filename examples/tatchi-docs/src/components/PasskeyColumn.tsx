import React from 'react'
import NavbarStatic from './Navbar/NavbarStatic'
import NavbarProfileOverlay from './Navbar/NavbarProfileOverlay'
import { usePasskeyContext } from '@tatchi/sdk/react'

import { CarouselProvider } from './carousel/CarouselProvider'
import { Carousel } from './carousel/Carousel'

import { DemoTransaction } from './DemoTransaction';
import { PasskeyLoginMenu } from './PasskeyLoginMenu';
import { AccountRecovery } from './AccountRecovery'

export function PasskeyColumn() {
  const { loginState } = usePasskeyContext()
  const [currentPage, setCurrentPage] = React.useState(0)

  // After login, jump to Demo Tx page (index 1). On logout, go back to Login (index 0).
  React.useEffect(() => {
    setCurrentPage(loginState?.isLoggedIn ? 1 : 0)
  }, [loginState?.isLoggedIn])

  const pages = React.useMemo(() => ([
    { key: 'login', title: 'Login', element: <PasskeyLoginMenu onLoggedIn={() => setCurrentPage(1)} /> },
    { key: 'demo-tx', title: 'Demo Tx', element: <DemoTransaction />, disabled: !loginState?.isLoggedIn },
    { key: 'recovery', title: 'Account Recovery', element: <AccountRecovery />, disabled: !loginState?.isLoggedIn },
  ]), [loginState?.isLoggedIn])

  return (
    <div className="layout-column-right">
      <div className="constrained-column">
        <NavbarStatic />
        <NavbarProfileOverlay />
        <div className="passkey-demo">
          <CarouselProvider
            pages={pages}
            initialKey="login"
            showBreadcrumbs
            currentPage={currentPage}
            onCurrentPageChange={setCurrentPage}
            rootStyle={{
              padding: '0rem 1rem',
              display: 'grid',
              placeContent: 'center',
              paddingBottom: '6rem', // make space for tooltip so it's not clipped
            }}
            breadcrumbsStyle={{
              padding: '2rem 1rem 0rem 1rem',
              display: 'grid',
              placeContent: 'center',
            }}
          >
            <Carousel />
          </CarouselProvider>
        </div>
      </div>
    </div>
  );
}
