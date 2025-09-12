// Lightweight progress event router for wallet iframe client
// Encapsulates sticky and in-flight progress handling and overlay heuristics.

import type { ProgressPayload as MessageProgressPayload } from './messages';
import {
  ActionPhase,
  DeviceLinkingPhase,
  AccountRecoveryPhase,
  RegistrationPhase,
  LoginPhase,
} from '../types/passkeyManager';

// Phases that should temporarily SHOW the overlay (to capture activation)
const SHOW_PHASES = new Set<string>([
  ActionPhase.STEP_2_USER_CONFIRMATION,
  ActionPhase.STEP_4_WEBAUTHN_AUTHENTICATION,
  // Device1: TouchID authorization (host needs overlay to capture activation)
  DeviceLinkingPhase.STEP_3_AUTHORIZATION,
  // Device2: Registration inside wallet host (collects passkey via ModalTxConfirmer)
  // Show overlay so the wallet iframe is visible and focused for WebAuthn
  DeviceLinkingPhase.STEP_6_REGISTRATION,
  AccountRecoveryPhase.STEP_2_WEBAUTHN_AUTHENTICATION,
  LoginPhase.STEP_2_WEBAUTHN_ASSERTION,
]);

// Phases that should HIDE the overlay asap (post-activation, non-interactive)
const HIDE_PHASES = new Set<string>([
  ActionPhase.STEP_5_AUTHENTICATION_COMPLETE,
  ActionPhase.STEP_6_TRANSACTION_SIGNING_PROGRESS,
  ActionPhase.STEP_7_TRANSACTION_SIGNING_COMPLETE,
  ActionPhase.STEP_3_CONTRACT_VERIFICATION,
  ActionPhase.STEP_8_BROADCASTING,
  ActionPhase.STEP_9_ACTION_COMPLETE,
  // Device linking: hide when the flow has finished or errored
  DeviceLinkingPhase.STEP_7_LINKING_COMPLETE,
  DeviceLinkingPhase.REGISTRATION_ERROR,
  DeviceLinkingPhase.LOGIN_ERROR,
  DeviceLinkingPhase.DEVICE_LINKING_ERROR,
  RegistrationPhase.STEP_6_CONTRACT_REGISTRATION,
]);

export type ProgressPayload = MessageProgressPayload;

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
/**
 * defaultPhaseHeuristics
 *
 * Decides when to expand or contract the invisible wallet iframe overlay
 * based on incoming progress events (phases). Returning:
 *  - 'show' → expands the iframe to a full-screen, invisible layer that captures
 *             user activation (e.g., TouchID / WebAuthn prompts) and pointer events.
 *  - 'hide' → immediately contracts the iframe back to 0×0 so it no longer blocks clicks.
 *  - 'none' → no change.
 *
 * Important UX constraint: the overlay covers the entire viewport and is
 * intentionally invisible. While expanded, it will intercept clicks and can
 * block interactions with the app. Therefore, we must minimize the time it is
 * expanded and only show it during the brief windows where user activation is
 * required (e.g., when the TouchID prompt is about to appear or the modal is
 * mounting and needs focus/activation in the iframe context). As soon as
 * activation completes (e.g., authentication-complete), we hide it again.
 *
 * If new phases are introduced that require user activation, add them to
 * SHOW_PHASES; if phases become non-interactive post-activation, add them to
 * HIDE_PHASES. The goal is to keep the overlay up for the minimum possible time.
 */
export const defaultPhaseHeuristics: PhaseHeuristics = (payload: ProgressPayload) => {
  try {
    const phase = String((payload || {}).phase || '');
    if (!phase) return 'none';

    if (SHOW_PHASES.has(phase)) return 'show';
    if (HIDE_PHASES.has(phase)) return 'hide';

    // Back-compat: hide on legacy/custom completion markers if present.
    const raw = phase.toLowerCase();
    if (raw === 'user-confirmation-complete') return 'hide';

    return 'none';
  } catch { return 'none'; }
};
