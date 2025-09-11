// Lightweight progress event router for wallet iframe client
// Encapsulates sticky and in-flight progress handling and overlay heuristics.

export type ProgressPayload = any;

export interface OverlayController {
  show: () => void;
  hide: () => void;
}

export type PhaseHeuristics = (payload: ProgressPayload) => 'show' | 'hide' | 'none';

export interface ProgressSubscriber {
  onProgress?: (payload: ProgressPayload) => void;
  sticky: boolean;
  stats: { count: number; lastPhase: string | null; lastAt: number | null };
}

export class ProgressBus {
  private subs = new Map<string, ProgressSubscriber>();
  private logger?: (msg: string, data?: Record<string, unknown>) => void;
  private overlay: OverlayController;
  private heuristic: PhaseHeuristics;

  constructor(overlay: OverlayController, heuristic: PhaseHeuristics, logger?: (msg: string, data?: Record<string, unknown>) => void) {
    this.overlay = overlay;
    this.heuristic = heuristic;
    this.logger = logger;
  }

  register(requestId: string, onProgress?: (p: ProgressPayload) => void, sticky: boolean = false): void {
    this.subs.set(requestId, { onProgress, sticky, stats: { count: 0, lastPhase: null, lastAt: null } });
    this.log('register', { requestId, sticky });
  }

  unregister(requestId: string): void {
    if (this.subs.delete(requestId)) this.log('unregister', { requestId });
  }

  clearAll(): void {
    this.subs.clear();
    this.log('clearAll');
  }

  isSticky(requestId: string): boolean {
    const sub = this.subs.get(requestId);
    return !!sub?.sticky;
  }

  dispatch(requestId: string, payload: ProgressPayload): boolean {
    const phase = String((payload || {}).phase || '');
    const action = this.heuristic(payload);
    if (action === 'show') { try { this.overlay.show(); } catch {} }
    if (action === 'hide') { try { this.overlay.hide(); } catch {} }

    const sub = this.subs.get(requestId);
    if (sub) {
      this.bumpStats(sub, phase);
      try { sub.onProgress?.(payload); } catch {}
      this.log('dispatch', { requestId, phase, sticky: sub.sticky });
      return true;
    }

    // Deliver to sticky-only subscriber if present (e.g., flow finished but status updates continue)
    const sticky = this.findSticky(requestId);
    if (sticky) {
      this.bumpStats(sticky, phase);
      try { sticky.onProgress?.(payload); } catch {}
      this.log('dispatch-sticky', { requestId, phase });
      return true;
    }
    this.log('dispatch-miss', { requestId, phase });
    return false;
  }

  getStats(requestId: string): { count: number; lastPhase: string | null; lastAt: number | null } | null {
    const sub = this.subs.get(requestId);
    return sub ? sub.stats : null;
  }

  private findSticky(requestId: string): ProgressSubscriber | null {
    const sub = this.subs.get(requestId);
    if (sub && sub.sticky) return sub;
    // sticky subscribers are keyed by the same requestId in this design
    return null;
  }

  private bumpStats(sub: ProgressSubscriber, phase: string) {
    sub.stats.count += 1;
    sub.stats.lastPhase = phase || null;
    sub.stats.lastAt = Date.now();
  }

  private log(msg: string, data?: Record<string, unknown>) {
    try { this.logger?.(msg, data); } catch {}
  }
}

// Default phase heuristic used by the client
export const defaultPhaseHeuristics: PhaseHeuristics = (payload: ProgressPayload) => {
  try {
    const raw = String((payload || {}).phase || '').toLowerCase();
    if (!raw) return 'none';
    if (
      raw === 'user-confirmation' || raw.includes('user-confirmation') ||
      raw.includes('webauthn-authentication') || raw.includes('authorization') ||
      raw.includes('step_6_registration') || raw.includes('registration')
    ) return 'show';
    if (raw === 'user-confirmation-complete') return 'hide';
    return 'none';
  } catch { return 'none'; }
};
