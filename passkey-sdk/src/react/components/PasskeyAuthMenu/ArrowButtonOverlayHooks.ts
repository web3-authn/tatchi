import React from 'react';
import { usePasskeyContext } from '../../context';
import type { ArrowRegisterButtonMode } from '@/core/WebAuthnManager/LitComponents/ArrowRegisterButton';

export type OverlayRect = { top: number; left: number; width: number; height: number };

export function useRegisterOverlayWaitingBridge(params: {
  enabled: boolean;
  setWaiting?: (v: boolean) => void;
  onSubmit?: () => void;
  onResult?: (ok: boolean) => void;
}): void {
  const { enabled, setWaiting, onSubmit, onResult } = params || ({} as typeof params);
  const ctx = (() => {
    try { return usePasskeyContext(); } catch { return undefined; }
  })();

  React.useEffect(() => {
    if (!enabled) return;

    // Prefer router-level overlay events when available
    const client = (() => { try { return ctx?.passkeyManager?.getServiceClient?.(); } catch { return null; } })();
    let offSubmit: (() => void) | undefined;
    let offResult: (() => void) | undefined;

    if (client && typeof client.onRegisterOverlaySubmit === 'function' && typeof client.onRegisterOverlayResult === 'function') {
      try { offSubmit = client.onRegisterOverlaySubmit(() => { try { onSubmit?.(); } catch {}; try { setWaiting?.(true); } catch {} }); } catch {}
      try { offResult = client.onRegisterOverlayResult(({ ok }) => { try { onResult?.(!!ok); } catch {}; try { setWaiting?.(false); } catch {} }); } catch {}
    }
    return () => { try { offSubmit?.(); } catch {}; try { offResult?.(); } catch {} };
  }, [ctx, enabled, onResult, onSubmit, setWaiting]);
}

export function useArrowButtonOverlay(options: {
  enabled: boolean;               // whether overlay can show (e.g., register mode + canProceed)
  waiting: boolean;               // hide while waiting
  mode: ArrowRegisterButtonMode;  // 'register' | 'login' | 'recover'
  nearAccountId: string | null;   // resolved accountId
  id?: string;                    // fixed id for mounted element (stable)
  overlayRectOverride?: Partial<OverlayRect>; // optional rect overrides (e.g., left/width/height)
}) {
  const ctx = (() => {
    try { return usePasskeyContext(); } catch { return undefined; }
  })();

  const { enabled, waiting, mode, nearAccountId } = options;
  const id = options.id || 'w3a-auth-menu-arrow';
  const rectOverride = options.overlayRectOverride || {};

  // Anchor to the actual button element to avoid layout offsets (e.g., negative margins)
  const anchorRef = React.useRef<HTMLButtonElement | null>(null);
  const mountedIdRef = React.useRef<string | null>(null);
  const activeRef = React.useRef<boolean>(false);
  const roRef = React.useRef<ResizeObserver | null>(null);

  const getClient = React.useCallback(() => {
    try { return ctx?.passkeyManager?.getServiceClient?.(); } catch { return null; }
  }, [ctx]);

  const ensureClient = React.useCallback(async () => {
    try { await ctx?.passkeyManager?.initWalletIframe?.(); } catch {}
    return getClient();
  }, [ctx, getClient]);

  const computeRect = React.useCallback((): OverlayRect | null => {
    const el = anchorRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  }, []);

  const waitForUsableRect = React.useCallback(async (maxWaitMs = 300): Promise<OverlayRect | null> => {
    const start = Date.now();
    let rect = computeRect();
    while (rect && (rect.width < 20 || rect.height < 20) && (Date.now() - start) < maxWaitMs) {
      await new Promise(r => setTimeout(r, 50));
      rect = computeRect();
    }
    return rect;
  }, [computeRect]);

  const mountArrowAtRect = React.useCallback(async () => {
    if (!enabled || waiting) return;
    const client = await ensureClient();
    if (!client) return;
    let rect = await waitForUsableRect(300);
    if (!rect) {
      const r0 = computeRect();
      if (!r0) return;
      rect = { top: r0.top, left: r0.left, width: r0.width, height: r0.height };
    }
    try { console.debug('[Overlay] anchor rect (mount):', rect); } catch {}
    // Anchor the wallet iframe overlay to the arrow's viewport rect
    const fixedRect: OverlayRect = {
      top: rect.top,
      left: rect.left + (typeof rectOverride.left === 'number' ? rectOverride.left : 0),
      width: typeof rectOverride.width === 'number' ? rectOverride.width : rect.width,
      height: typeof rectOverride.height === 'number' ? rectOverride.height : rect.height,
    };
    activeRef.current = true;
    client.setOverlayBounds(fixedRect);
    try { (client as any).setAnchoredOverlayBounds?.(fixedRect); } catch {}
    if (typeof (client as any).setAnchoredOverlayBounds !== 'function') {
      client.setOverlayBounds(fixedRect);
    }
    if (mountedIdRef.current === id) {
      client.updateUiComponent({ id, props: {
        nearAccountId: nearAccountId || '',
        disabled: !nearAccountId,
        mode,
        width: fixedRect.width,
        height: fixedRect.height,
        // Inside the overlay-anchored iframe, place the element at (0,0)
        viewportRect: { top: 0, left: 0, width: fixedRect.width, height: fixedRect.height },
        anchorMode: 'iframe',
        waiting: !!waiting,
      }});
      return;
    }
    mountedIdRef.current = id;
    client.mountUiComponent({
      key: 'w3a-arrow-register-button',
      id,
      props: {
        nearAccountId: nearAccountId || '',
        disabled: !nearAccountId,
        mode,
        width: fixedRect.width,
        height: fixedRect.height,
        // Positioned at (0,0) inside the overlay bounds
        viewportRect: { top: 0, left: 0, width: fixedRect.width, height: fixedRect.height },
        anchorMode: 'iframe',
        label: undefined,
        waiting: !!waiting,
      }
    });
  }, [computeRect, ensureClient, enabled, id, mode, nearAccountId, rectOverride.height, rectOverride.width, waitForUsableRect, waiting]);

  const unmountArrow = React.useCallback(() => {
    const client = getClient();
    if (!client) return;
    const mid = mountedIdRef.current;
    if (mid) {
      try { client.unmountUiComponent(mid); } catch {}
      mountedIdRef.current = null;
    }
    try { client.setOverlayVisible(false); } catch {}
    activeRef.current = false;
  }, [getClient]);

  // Keep overlay rect in sync while active
  React.useEffect(() => {
    const el = anchorRef.current;
    const client = getClient();
    if (!el || !client) return;
    const sync = () => {
      if (!activeRef.current) return;
      const r0 = el.getBoundingClientRect();
      const fixedRect: OverlayRect = {
        top: r0.top,
        left: r0.left + (typeof rectOverride.left === 'number' ? rectOverride.left : 0),
        width: typeof rectOverride.width === 'number' ? rectOverride.width : r0.width,
        height: typeof rectOverride.height === 'number' ? rectOverride.height : r0.height,
      };

      // Ensure the wallet iframe overlay itself tracks the anchor position.
      // Use anchored bounds so subsequent show() calls keep the same rect.
      try { (client as any).setAnchoredOverlayBounds?.(fixedRect); } catch {}
      client.setOverlayBounds(fixedRect);
      client.setOverlayVisible(true);

      // Inside the overlay-anchored iframe, the mounted element should stay at (0,0)
      // with the same size as the overlay.
      if (mountedIdRef.current) {
        client.updateUiComponent({ id: mountedIdRef.current, props: {
          viewportRect: { top: 0, left: 0, width: fixedRect.width, height: fixedRect.height },
          width: fixedRect.width,
          height: fixedRect.height,
          anchorMode: 'iframe',
          waiting: !!waiting,
        } });
      }
    };
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    roRef.current = ro;
    const onScroll = () => sync();
    const onResize = () => sync();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize, true);
    return () => {
      try { ro.disconnect(); } catch {}
      roRef.current = null;
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize, true);
    };
  }, [getClient, rectOverride.height, rectOverride.left, rectOverride.width, waiting]);

  // Hide/unmount when disabled or waiting toggles on
  React.useEffect(() => {
    if (!enabled || waiting) {
      unmountArrow();
    }
  }, [enabled, waiting, unmountArrow]);

  // Prevent flicker: unmount when pointer leaves overlay container
  React.useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e?.data as any;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'WALLET_UI_ANCHOR_LEAVE') {
        if (d?.payload?.id && d.payload.id === mountedIdRef.current) {
          unmountArrow();
        }
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [unmountArrow]);

  return {
    arrowAnchorRef: anchorRef,
    mountArrowAtRect,
    unmountArrow,
  } as const;
}
