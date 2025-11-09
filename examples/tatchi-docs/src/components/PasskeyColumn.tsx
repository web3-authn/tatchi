import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import NavbarStatic from './Navbar/NavbarStatic'
import NavbarProfileOverlay from './Navbar/NavbarProfileOverlay'
import { usePasskeyContext } from '@tatchi-xyz/sdk/react'

import { CarouselProvider } from './Carousel2/CarouselProvider'
import { Carousel } from './Carousel2/Carousel'

import { DemoPage } from './DemoPage';
import { PasskeyLoginMenu } from './PasskeyLoginMenu';
import { AccountRecovery } from './AccountRecovery';
import { DemoChainsigs } from './DemoChainsigs';
import { AuthMenuControlProvider } from '../contexts/AuthMenuControl';
import { ProfileMenuControlProvider } from '../contexts/ProfileMenuControl';

export function PasskeyColumn() {
  const { loginState } = usePasskeyContext()
  const [currentPage, setCurrentPage] = React.useState(0)

  // After login, jump to Demo Tx page (index 1). On logout, go back to Login (index 0).
  React.useEffect(() => {
    setCurrentPage(loginState?.isLoggedIn ? 1 : 0)
  }, [loginState?.isLoggedIn])

  const pages = React.useMemo(() => ([
    {
      key: 'demo-auth',
      title: 'Demo',
      element: ({ nextSlide, canNext, index }: { nextSlide: () => void; canNext: boolean; index: number }) => (
        <>
          <PasskeyLoginMenu onLoggedIn={() => setCurrentPage(1)} />
          {index > 0 && canNext && (
            <div className="carousel-cta">
              <button type="button" className="carousel-next-btn" onClick={nextSlide}>
                <span className="btn-icon-left" aria-hidden>
                  <ChevronRight size={16} />
                </span>
                Next
              </button>
            </div>
          )}
        </>
      ),
    },
    {
      key: 'transactions',
      title: 'Transactions',
      disabled: !loginState?.isLoggedIn,
      element: ({ nextSlide, prevSlide, canNext, canPrev, index }: { nextSlide: () => void; prevSlide: () => void; canNext: boolean; canPrev: boolean; index: number }) => (
        <>
          <DemoPage />
          {index > 0 && (
            <div className="carousel-cta"
              style={{ paddingBottom: '2rem' }} // prevent clipping of ButtonWithTooltip
            >
              <button type="button" className="carousel-next-btn" onClick={prevSlide} disabled={!canPrev}>
                <span className="btn-icon-left" aria-hidden>
                  <ChevronLeft size={16} />
                </span>
                Previous
              </button>
              <button type="button" className="carousel-next-btn" onClick={nextSlide} disabled={!canNext}>
                Next
                <span className="btn-icon-right" aria-hidden>
                  <ChevronRight size={16} />
                </span>
              </button>
            </div>
          )}
        </>
      ),
    },
    {
      key: 'intents',
      title: 'NEAR Intents',
      disabled: !loginState?.isLoggedIn,
      element: ({ nextSlide, prevSlide, canNext, canPrev, index }: { nextSlide: () => void; prevSlide: () => void; canNext: boolean; canPrev: boolean; index: number }) => (
        <>
          <DemoChainsigs />
          {index > 0 && (
            <div className="carousel-cta">
              <button type="button" className="carousel-next-btn" onClick={prevSlide} disabled={!canPrev}>
                <span className="btn-icon-left" aria-hidden>
                  <ChevronLeft size={16} />
                </span>
                Previous
              </button>
              <button type="button" className="carousel-next-btn" onClick={nextSlide} disabled={!canNext}>
                Next
                <span className="btn-icon-right" aria-hidden>
                  <ChevronRight size={16} />
                </span>
              </button>
            </div>
          )}
        </>
      ),
    },
    {
      key: 'recovery',
      title: 'Account Recovery',
      disabled: !loginState?.isLoggedIn,
      element: ({ prevSlide, canPrev, index }: { prevSlide: () => void; canPrev: boolean; index: number }) => (
        <>
          <AccountRecovery />
          {index > 0 && canPrev && (
            <div className="carousel-cta carousel-cta--left">
              <button type="button" className="carousel-next-btn" onClick={prevSlide}>
                <span className="btn-icon-left" aria-hidden>
                  <ChevronLeft size={16} />
                </span>
                Previous
              </button>
            </div>
          )}
        </>
      ),
    },
  ]), [loginState?.isLoggedIn])

  return (
    <div className="layout-column-right">
      <div className="constrained-column">
        <ProfileMenuControlProvider>
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
        </ProfileMenuControlProvider>
      </div>
    </div>
  );
}
