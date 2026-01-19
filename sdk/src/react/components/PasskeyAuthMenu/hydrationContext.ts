import React from 'react';

/**
 * Internal context used by the SSR-safe shell to hint the client controller about
 * initial hydration strategy (e.g., align first render with the skeleton).
 *
 * Default: false (normal behavior).
 */
export const PasskeyAuthMenuHydrationContext = React.createContext<boolean>(false);

export function usePasskeyAuthMenuForceInitialRegister(): boolean {
  return React.useContext(PasskeyAuthMenuHydrationContext);
}

