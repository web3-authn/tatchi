import { PasskeyAuthMenu } from './shell';
import { PasskeyAuthMenuSkeleton } from './skeleton';
import type { PasskeyAuthMenuProps } from './types';
import { AuthMenuMode, AuthMenuModeMap, type AuthMenuModeLabel, type AuthMenuHeadings } from './authMenuTypes';

/**
 * SSR-safe entrypoint for `@tatchi-xyz/sdk/react/passkey-auth-menu`.
 *
 * This intentionally does NOT import the client implementation, so it can be
 * imported during SSR without pulling in browser-only dependencies.
 */
export { PasskeyAuthMenu, PasskeyAuthMenuSkeleton };
export type { PasskeyAuthMenuProps };

export { AuthMenuMode, AuthMenuModeMap };
export type { AuthMenuModeLabel, AuthMenuHeadings };

export default PasskeyAuthMenu;
