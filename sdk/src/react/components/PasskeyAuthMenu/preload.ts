/**
 * Preload the client-only implementation chunk for `PasskeyAuthMenu`.
 * Useful for hover/viewport/idle prefetch to reduce interaction latency.
 */
export function preloadPasskeyAuthMenu(): Promise<void> {
  return import('./client').then(() => undefined);
}

export default preloadPasskeyAuthMenu;
