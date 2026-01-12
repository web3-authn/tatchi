/**
 * Preload the client-only implementation chunk for `PasskeyAuthMenu`.
 * Useful for hover/viewport/idle prefetch to reduce interaction latency.
 */
import { ensurePasskeyAuthMenuStyles } from './ensureStyles';

export function preloadPasskeyAuthMenu(): Promise<void> {
  return Promise.all([
    import('./client').then(() => undefined),
    ensurePasskeyAuthMenuStyles(),
  ]).then(() => undefined);
}

export default preloadPasskeyAuthMenu;
