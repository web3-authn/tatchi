import React from 'react'
import { AuthMenuMode } from '@tatchi-xyz/sdk/react'

export type AuthMenuControl = {
  /** Optional override for the PasskeyAuthMenu default mode on mount */
  defaultModeOverride?: AuthMenuMode
  /** Changing this key forces a remount of the menu */
  remountKey: number
  /** Set the default mode override */
  setDefaultModeOverride: (mode?: AuthMenuMode) => void
  /** Force a remount of the menu */
  bumpRemount: () => void
  /** Convenience: set override and force remount */
  setAndRemount: (mode: AuthMenuMode) => void
}

const Ctx = React.createContext<AuthMenuControl | null>(null)

export function useAuthMenuControl(): AuthMenuControl {
  const ctx = React.useContext(Ctx)
  if (!ctx) throw new Error('useAuthMenuControl must be used within <AuthMenuControlProvider>')
  return ctx
}

export function AuthMenuControlProvider({ children }: { children: React.ReactNode }) {
  const [defaultModeOverride, setDefaultModeOverride] = React.useState<AuthMenuMode | undefined>(undefined)
  const [remountKey, setRemountKey] = React.useState(0)

  const bumpRemount = React.useCallback(() => setRemountKey((k) => k + 1), [])
  const setAndRemount = React.useCallback((mode: AuthMenuMode) => {
    setDefaultModeOverride(mode)
    setRemountKey((k) => k + 1)
  }, [])

  const value = React.useMemo<AuthMenuControl>(() => ({
    defaultModeOverride,
    remountKey,
    setDefaultModeOverride,
    bumpRemount,
    setAndRemount,
  }), [defaultModeOverride, remountKey, setAndRemount])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

