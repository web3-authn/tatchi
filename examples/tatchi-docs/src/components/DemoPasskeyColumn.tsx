import React from 'react'
import NavbarStatic from './Navbar/NavbarStatic'
import NavbarProfileOverlay from './Navbar/NavbarProfileOverlay'
import { useTatchi } from '@tatchi-xyz/sdk/react'

import { GlassBorder } from './GlassBorder';
import { CarouselProvider } from './Carousel2/CarouselProvider'
import { Carousel } from './Carousel2/Carousel'
import { CarouselNextButton } from './Carousel2/CarouselNextButton'
import { CarouselPrevButton } from './Carousel2/CarouselPrevButton'

// Lazily load the most common flows to shrink the initial bundle.
const PasskeyLoginMenu = React.lazy(() => import('./PasskeyLoginMenu').then(m => ({ default: m.PasskeyLoginMenu })))
const DemoPage = React.lazy(() => import('./DemoPage').then(m => ({ default: m.DemoPage })))
const AccountRecovery = React.lazy(() => import('./AccountRecovery').then(m => ({ default: m.AccountRecovery })))
// DemoChainsigs is relatively heavy and has its own internal async flows.
// Import it eagerly to avoid first-load quirks from nested lazy + network calls.
import { DemoChainsigs } from './DemoChainsigs'
import { AuthMenuControlProvider } from '../contexts/AuthMenuControl';
import { ProfileMenuControlProvider } from '../contexts/ProfileMenuControl';
import NearLogoBg from './NearLogoBg'


export function DemoPasskeyColumn() {
  const { loginState } = useTatchi()
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
          <React.Suspense fallback={<SuspenseFallback />}>
            <PasskeyLoginMenu onLoggedIn={() => setCurrentPage(1)} />
          </React.Suspense>
          {index > 0 && canNext && (
            <div className="carousel-cta">
              <CarouselNextButton onClick={nextSlide} />
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
          <GlassBorder style={{ maxWidth: 480, marginTop: '1rem' }} >
            <React.Suspense fallback={<SuspenseFallback />}>
              <DemoPage />
            </React.Suspense>
          </GlassBorder>
          {index > 0 && (
            <div className="carousel-cta"
              style={{ paddingBottom: '2rem' }} // prevent clipping of ButtonWithTooltip
            >
              <CarouselPrevButton onClick={prevSlide} disabled={!canPrev} />
              <CarouselNextButton onClick={nextSlide} disabled={!canNext} />
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
          <GlassBorder style={{ maxWidth: 480, marginTop: '1rem' }}>
            <React.Suspense fallback={<SuspenseFallback />}>
              <DemoChainsigs />
            </React.Suspense>
          </GlassBorder>
          {index > 0 && (
            <div className="carousel-cta">
              <CarouselPrevButton onClick={prevSlide} disabled={!canPrev} />
              <CarouselNextButton onClick={nextSlide} disabled={!canNext} />
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
          <React.Suspense fallback={<SuspenseFallback />}>
            <AccountRecovery />
          </React.Suspense>
          {index > 0 && canPrev && (
            <div className="carousel-cta carousel-cta--left">
              <CarouselPrevButton onClick={prevSlide} />
            </div>
          )}
        </>
      ),
    },
  ]), [loginState?.isLoggedIn])

  return (
    <div className="layout-column-right">
      <NearLogoBg />
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

const SuspenseFallback = () => (
  <div className={'suspense-fallback'}
    style={{ height: 320, width: 'min(480px, calc(100vw - 2rem))' }}
  />
);