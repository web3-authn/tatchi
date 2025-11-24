import * as React from 'react';

/**
 * useRevealOnIdle
 *
 * Returns `false` on first render and flips to `true` only after:
 * - an initial delay (`delayMs`, default 200ms), and
 * - the browser has had an idle slice (via `requestIdleCallback`) or a timeout elapses.
 *
 * This is used to defer mounting heavier components until after first paint / idle to
 * reduce contention on initial load. On browsers without `requestIdleCallback`, it
 * falls back to a secondary `setTimeout` (capped at 500ms).
 */
export function useRevealOnIdle(delayMs = 200, idleTimeoutMs = 1000): boolean {
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const onIdle = (cb: () => void) =>
      (window as any).requestIdleCallback
        ? (window as any).requestIdleCallback(cb, { timeout: idleTimeoutMs })
        : setTimeout(cb, Math.min(idleTimeoutMs, 500));

    const t = setTimeout(() => onIdle(() => setReady(true)), delayMs);
    return () => {
      clearTimeout(t as any);
    };
  }, [delayMs, idleTimeoutMs]);

  return ready;
}
