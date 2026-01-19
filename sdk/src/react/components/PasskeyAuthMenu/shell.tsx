import React from 'react';
import './PasskeyAuthMenu.css';
import { PasskeyAuthMenuSkeletonInner } from './skeleton';
import { PasskeyAuthMenuThemeScope } from './themeScope';
import { AuthMenuMode, type PasskeyAuthMenuProps } from './types';
import { useTheme } from '../theme';
import { preloadPasskeyAuthMenu } from './preload';
import { PasskeyAuthMenuHydrationContext } from './hydrationContext';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect;

type PasskeyAuthMenuClientComponent = React.ComponentType<PasskeyAuthMenuProps>;

const clientLazyCache = new Map<number, React.LazyExoticComponent<PasskeyAuthMenuClientComponent>>();

let didClientMountOnce = false;

let didAutoPreloadClientChunk = false;
function autoPreloadClientChunk() {
  if (didAutoPreloadClientChunk) return;
  didAutoPreloadClientChunk = true;
  void preloadPasskeyAuthMenu();
}

// If this module is imported in a browser bundle, start fetching the client chunk immediately.
// This reduces the chance of a first-mount Suspense fallback flash without affecting SSR.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  autoPreloadClientChunk();
}

function getClientLazy(retryKey: number): React.LazyExoticComponent<PasskeyAuthMenuClientComponent> {
  const existing = clientLazyCache.get(retryKey);
  if (existing) return existing;

  const next = React.lazy(() =>
    import('./client').then((m) => ({ default: m.PasskeyAuthMenuClient })),
  ) as unknown as React.LazyExoticComponent<PasskeyAuthMenuClientComponent>;

  clientLazyCache.set(retryKey, next);
  return next;
}

function invalidateClientLazy(retryKey: number) {
  clientLazyCache.delete(retryKey);
}

class LazyErrorBoundary extends React.Component<
  {
    fallback: (args: { error: Error; retry: () => void }) => React.ReactNode;
    onRetry: () => void;
    onError?: (error: Error) => void;
    children: React.ReactNode;
  },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  retry = () => {
    this.setState({ error: null });
    this.props.onRetry();
  };

  componentDidCatch(error: Error) {
    this.props.onError?.(error);
  }

  render() {
    if (this.state.error) {
      return this.props.fallback({ error: this.state.error, retry: this.retry });
    }
    return this.props.children;
  }
}

/**
 * `PasskeyAuthMenu` — SSR-safe shell.
 *
 * - Server: renders a skeleton only.
 * - Client: lazy-loads the full implementation after mount.
 */
export const PasskeyAuthMenu: React.FC<PasskeyAuthMenuProps> = (props) => {
  const [isClient, setIsClient] = React.useState(() => {
    if (typeof window === 'undefined') return false;
    return didClientMountOnce;
  });
  const forceInitialRegisterRef = React.useRef(
    !didClientMountOnce && (props.defaultMode == null || props.defaultMode === AuthMenuMode.Register),
  );
  const [retryKey, setRetryKey] = React.useState(0);
  const ClientLazy = React.useMemo(() => getClientLazy(retryKey), [retryKey]);

  // Align with the SDK Theme boundary when present (TatchiPasskeyProvider wraps one by default).
  // Falls back to system preference when used standalone.
  const { theme } = useTheme();

  useIsomorphicLayoutEffect(() => {
    didClientMountOnce = true;
    setIsClient(true);
    // Start fetching the client chunk immediately; the skeleton remains as the Suspense fallback.
    autoPreloadClientChunk();
  }, []);

  const skeleton = (
    <PasskeyAuthMenuSkeletonInner
      className={props.className}
      style={props.style}
      defaultMode={props.defaultMode}
      headings={props.headings}
    />
  );

  return (
    <PasskeyAuthMenuThemeScope theme={theme}>
      {isClient ? (
        <PasskeyAuthMenuHydrationContext.Provider value={forceInitialRegisterRef.current}>
          <LazyErrorBoundary
            onRetry={() => setRetryKey((k) => k + 1)}
            onError={() => invalidateClientLazy(retryKey)}
            fallback={({ retry }) => (
              <div>
                {skeleton}
                <div style={{ marginTop: 10, fontSize: 12, textAlign: 'center', opacity: 0.9 }}>
                  Failed to load menu.{' '}
                  <button type="button" onClick={retry} style={{ textDecoration: 'underline' }}>
                    Retry
                  </button>
                </div>
              </div>
            )}
          >
            <React.Suspense fallback={skeleton}>
              <ClientLazy {...props} />
            </React.Suspense>
          </LazyErrorBoundary>
        </PasskeyAuthMenuHydrationContext.Provider>
      ) : (
        skeleton
      )}
    </PasskeyAuthMenuThemeScope>
  );
};

export default PasskeyAuthMenu;
