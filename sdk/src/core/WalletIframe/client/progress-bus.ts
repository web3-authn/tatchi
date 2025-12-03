/**
 * ProgressBus - Client-Side Communication Layer
 *
 * Manages progress event routing and overlay visibility for the wallet iframe.
 * Uses phase heuristics to decide when the overlay should be visible to capture
 * user activation for WebAuthn operations, and aggregates visibility across
 * multiple concurrent requests.
 *
 * Key Responsibilities:
 * - Progress Routing: Dispatches typed progress payloads to per-request subscribers
 * - Overlay Control: Applies SHOW/HIDE based on phase heuristics
 * - Concurrent Aggregation: Tracks overlay demand per requestId and only hides
 *   when no request still requires SHOW (multi-request safe)
 * - Sticky Subscriptions: Supports long-running subscriptions that persist after completion
 * - Phase Heuristics: Pluggable logic to map phases → 'show' | 'hide' | 'none'
 * - Event Statistics: Tracks counts/timestamps for debugging
 *
 * Overlay Logic:
 * - Show when phases require user interaction (confirmation, WebAuthn)
 * - Hide when phases are post-activation (signing, broadcasting, completion)
 * - With concurrency, the latest demand per requestId is recorded; the overlay
 *   remains visible if any request demands 'show'.
 *
 * Phase Heuristics:
 * - SHOW_PHASES: Phases that need immediate user interaction (TouchID, confirmation)
 * - HIDE_PHASES: Post-activation phases that are non-interactive
 * - Default behavior: 'none' for unknown phases to avoid unnecessary overlay changes
 *
 * Security Considerations:
 * - Overlay is intentionally invisible but captures pointer events during activation
 * - Uses high z-index to ensure it's above other content when visible
 * - Automatically hides to minimize interaction blocking (subject to aggregation)
 */

import type { ProgressPayload as MessageProgressPayload } from '../shared/messages';
import {
  ActionPhase,
  DeviceLinkingPhase,
  AccountRecoveryPhase,
  RegistrationPhase,
  LoginPhase,
  EmailRecoveryPhase,
} from '../../types/passkeyManager';

// Phases that should temporarily SHOW the overlay (to capture activation)
// IMPORTANT: STEP_2_USER_CONFIRMATION must remain in this list. Without it,
// modal confirmation with behavior: 'requireClick' will never be visible in
// iframe mode, because the wallet iframe is still 0×0 when the modal mounts.
const SHOW_PHASES = new Set<string>([
  // Gate overlay to moments of imminent activation only.
  // Show early during user confirmation so the modal inside the wallet iframe is visible
  // and can capture the required click when behavior === 'requireClick'.
  ActionPhase.STEP_2_USER_CONFIRMATION,
  ActionPhase.STEP_4_WEBAUTHN_AUTHENTICATION,
  // Registration requires a WebAuthn create() ceremony at step 1
  RegistrationPhase.STEP_1_WEBAUTHN_VERIFICATION,
  // Email recovery: TouchID registration uses WebAuthn create()
  EmailRecoveryPhase.STEP_2_TOUCH_ID_REGISTRATION,
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
  // Registration: hide once contract work starts or flow completes/errors
  RegistrationPhase.STEP_5_CONTRACT_REGISTRATION,
  RegistrationPhase.STEP_8_REGISTRATION_COMPLETE,
  RegistrationPhase.REGISTRATION_ERROR,
  // Login: hide after assertion leads to VRF unlock or completion/errors
  LoginPhase.STEP_3_VRF_UNLOCK,
  LoginPhase.STEP_4_LOGIN_COMPLETE,
  LoginPhase.LOGIN_ERROR,
  // Account recovery: hide after authentication completes or on completion/errors
  AccountRecoveryPhase.STEP_4_AUTHENTICATOR_SAVED,
  AccountRecoveryPhase.STEP_5_ACCOUNT_RECOVERY_COMPLETE,
  AccountRecoveryPhase.ERROR,
  // Email recovery: hide after finalization/complete or on error
  EmailRecoveryPhase.STEP_5_FINALIZING_REGISTRATION,
  EmailRecoveryPhase.STEP_6_COMPLETE,
  EmailRecoveryPhase.ERROR,
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
  // Track the most recent overlay intent per requestId so that we can
  // aggregate visibility across concurrent requests. If any request's
  // latest intent is 'show', we keep the overlay visible.
  private overlayDemands = new Map<string, 'show' | 'hide' | 'none'>();

  constructor(overlay: OverlayController, heuristic: PhaseHeuristics, logger?: (msg: string, data?: Record<string, unknown>) => void) {
    this.overlay = overlay;
    this.heuristic = heuristic;
    this.logger = logger;
  }

  /**
   * Register a subscriber for a requestId.
   * Initializes demand tracking to 'none' (neutral) until phases arrive.
   */
  register({ requestId, onProgress, sticky = false }: {
    requestId: string,
    sticky: boolean,
    onProgress?: (p: ProgressPayload) => void,
  }): void {
    this.subs.set(requestId, {
      onProgress,
      sticky,
      stats: { count: 0, lastPhase: null, lastAt: null }
    });
    // Initialize demand tracking for this request as neutral
    this.overlayDemands.set(requestId, 'none');
    this.log('register', { requestId, sticky });
  }

  /**
   * Unregister a subscriber and clear its overlay demand.
   * If no remaining requests demand 'show', the overlay is hidden.
   */
  unregister(requestId: string): void {
    if (this.subs.delete(requestId)) this.log('unregister', { requestId });
    // Remove any overlay demand for this request
    this.overlayDemands.delete(requestId);
    // If no remaining requests demand 'show', we can safely hide
    if (!this.wantsVisible()) {
      try { this.overlay.hide(); } catch {}
    }
  }

  /**
   * Remove all subscribers and demands; overlay demand set is cleared.
   */
  clearAll(): void {
    this.subs.clear();
    this.overlayDemands.clear();
    this.log('clearAll');
  }

  isSticky(requestId: string): boolean {
    const sub = this.subs.get(requestId);
    return !!sub?.sticky;
  }

  /**
   * Dispatch a progress payload to a request's subscriber and update
   * the aggregate overlay demand based on the phase heuristic.
   */
  dispatch({ requestId, payload }: {
    requestId: string,
    payload: ProgressPayload
  }): boolean {

    const phase = String((payload || {}).phase || '');
    const action = this.heuristic(payload);

    // Update the latest demand for this request
    this.overlayDemands.set(requestId, action);

    // Apply aggregated overlay visibility:
    // - If any request currently demands 'show', ensure overlay is visible
    // - Only hide when no outstanding 'show' demands remain
    if (action === 'show') {
      try { this.overlay.show(); } catch {}
    } else if (action === 'hide') {
      if (!this.wantsVisible()) {
        try { this.overlay.hide(); } catch {}
      }
    }

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

  getStats(requestId: string): {
    count: number;
    lastPhase: string | null;
    lastAt: number | null
  } | null {
    const sub = this.subs.get(requestId);
    return sub ? sub.stats : null;
  }

  /**
   * Returns true if any tracked request currently demands the overlay be visible.
   * Useful for higher layers (router) to avoid premature hides on completion/timeout.
   */
  wantsVisible(): boolean {
    for (const v of this.overlayDemands.values()) {
      if (v === 'show') return true;
    }
    return false;
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

    // Step 1: Check if this phase requires showing the overlay for user activation
    if (SHOW_PHASES.has(phase)) return 'show';

    // Step 2: Check if this phase indicates we should hide the overlay (post-activation)
    if (HIDE_PHASES.has(phase)) return 'hide';

    // Step 3: Handle legacy/custom completion markers
    const raw = phase.toLowerCase();
    if (raw === 'user-confirmation-complete') return 'hide';

    // Step 4: Extra hardening - hide overlay on explicit cancellation
    if (raw === 'cancelled') return 'hide';

    // Step 5: Default to no change for unknown phases
    return 'none';
  } catch { return 'none'; }
};
