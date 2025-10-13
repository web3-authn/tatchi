import * as React from 'react';

/**
 * useIsMobile
 * Media-query driven mobile detection hook. SSR-safe.
 * Defaults to `false` until hydrated, then tracks `(max-width: 768px)`.
 */
export function useIsMobile(query: string = '(max-width: 768px)'): boolean {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    // Initialize
    setIsMobile(mq.matches);
    if ('addEventListener' in mq) mq.addEventListener('change', onChange);
    else (mq as MediaQueryList).onchange = onChange as any;
    return () => {
      if ('removeEventListener' in mq) mq.removeEventListener('change', onChange);
      else (mq as MediaQueryList).onchange = null;
    };
  }, [query]);

  return isMobile;
}

