import React from 'react';
import type { DeviceLinkingSSEEvent } from '../../../core/types/sdkSentEvents';
import { AuthMenuMode, AuthMenuModeMap, type AuthMenuModeLabel, type AuthMenuHeadings } from './authMenuTypes';

export { AuthMenuMode, AuthMenuModeMap };
export type { AuthMenuModeLabel, AuthMenuHeadings };

export interface PasskeyAuthMenuProps {
  onLogin?: () => void;
  onRegister?: () => void;
  onRecoverAccount?: () => void;
  /**
   * Optional delay (in ms) before the waiting screen animation starts.
   * Useful to hold the loading view briefly to avoid jarring flashes
   * during fast transitions. Defaults to 100ms.
   */
  loadingScreenDelayMs?: number;
  /** Optional callbacks for the link-device QR flow */
  linkDeviceOptions?: {
    onEvent?: (event: DeviceLinkingSSEEvent) => void;
    onError?: (error: Error) => void;
    /** Called when the user manually cancels the link-device flow */
    onCancelled?: () => void;
  };
  /** Optional custom header element rendered when not waiting */
  header?: React.ReactElement;
  defaultMode?: AuthMenuMode;
  style?: React.CSSProperties;
  className?: string;
  /** Optional custom headings for each mode */
  headings?: AuthMenuHeadings;
  /**
   * Optional social login hooks. Provide a function per provider that returns
   * the derived username (e.g., email/handle) after the external auth flow.
   * If omitted or all undefined, the social row is hidden.
   *
   * Note: Social login integration is not yet implemented. The UI will
   * display provider buttons and a disclaimer for now, but no auth flow
   * is wired. This is a placeholder for future work.
   */
  socialLogin?: {
    google?: () => string;
    x?: () => string;
    apple?: () => string;
  };
}
