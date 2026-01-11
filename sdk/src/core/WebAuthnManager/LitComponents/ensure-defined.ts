/**
 * Consolidated loaders for known W3A custom elements that may be used across runtimes.
 * This allows dev tooling to auto-ensure definitions for common elements when possible.
 */
import { W3A_EXPORT_VIEWER_IFRAME_ID } from './tags';

export const TAG_LOADERS: Record<string, () => Promise<unknown>> = {
  [W3A_EXPORT_VIEWER_IFRAME_ID]: () => import('./ExportPrivateKey/iframe-host'),
};

/**
 * Small utility that guarantees a custom element definition exists in the
 * current runtime before creating/using it. If the tag is not yet defined,
 * it runs the provided dynamic import loader to execute the module that calls
 * customElements.define().
 */
export async function ensureDefined(tag: string, loader: () => Promise<unknown>): Promise<void> {
  try {
    if (!customElements.get(tag)) {
      await loader();
    }
  } catch {
    // Best-effort; downstream calls will still throw useful errors if missing
  }
}

/** Attempt to ensure a known W3A element by tag; returns true if a loader ran. */
export async function ensureKnownW3aElement(tag: string): Promise<boolean> {
  try {
    const t = (tag || '').toLowerCase();
    const loader = TAG_LOADERS[t];
    if (!loader) return false;
    await ensureDefined(t, loader);
    return true;
  } catch {
    return false;
  }
}
