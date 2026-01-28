/**
 * waitForNextPaint
 *
 * Some environments throttle or pause `requestAnimationFrame` (e.g., hidden/offscreen iframes).
 * Lit components in this SDK sometimes gate first paint on 2× rAF to avoid FOUC, but that
 * can deadlock confirmation UIs when rAF never fires.
 *
 * This helper preserves the 2× rAF behavior when available while adding a bounded timeout
 * fallback so UI can still render (possibly with mild FOUC) instead of hanging forever.
 */
export function waitForNextPaint(opts?: { frames?: number; timeoutMs?: number }): Promise<void> {
  const frames = Math.max(1, Math.floor(Number(opts?.frames ?? 2)));
  const timeoutMs = Math.max(0, Math.floor(Number(opts?.timeoutMs ?? 50)));

  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };

    const timer = (() => {
      if (timeoutMs === 0) return null;
      try {
        return window.setTimeout(finish, timeoutMs);
      } catch {
        return null;
      }
    })();

    const raf = (cb: FrameRequestCallback) => {
      try {
        return requestAnimationFrame(cb);
      } catch {
        try {
          return window.setTimeout(() => cb(Date.now()), 0) as any;
        } catch {
          cb(Date.now());
          return 0 as any;
        }
      }
    };

    try {
      let remaining = frames;
      const step = () => {
        remaining -= 1;
        if (remaining <= 0) {
          if (timer != null) {
            try { window.clearTimeout(timer); } catch {}
          }
          finish();
          return;
        }
        raf(step);
      };
      raf(step);
    } catch {
      if (timer != null) {
        try { window.clearTimeout(timer); } catch {}
      }
      finish();
    }
  });
}

