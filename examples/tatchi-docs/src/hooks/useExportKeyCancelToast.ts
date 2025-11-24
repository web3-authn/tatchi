import React from 'react'
import { toast } from 'sonner'

/**
 * Listen for export-key cancellation messages from the wallet iframe host
 * and surface a friendly toast in the docs app.
 *
 * The wallet host posts a message with:
 *   { type: 'EXPORT_NEAR_KEYPAIR_CANCELLED', nearAccountId: string }
 * when the user explicitly cancels the TouchID/FaceID prompt during key export.
 */
export function useExportKeyCancelToast() {
  React.useEffect(() => {
    if (typeof window === 'undefined') return

    const walletOrigin = (import.meta as any)?.env?.VITE_WALLET_ORIGIN as string | undefined

    const handler = (event: MessageEvent) => {
      try {
        // Optionally gate by origin when configured
        if (walletOrigin && event.origin && event.origin !== walletOrigin) return
        const data = event.data as { type?: string; nearAccountId?: string } | null
        if (!data || data.type !== 'EXPORT_NEAR_KEYPAIR_CANCELLED') return

        const nearId = data.nearAccountId || ''
        const accountLabel = nearId ? ` for ${nearId}` : ''
        toast('Key export cancelled', {
          description: `TouchID was cancelled${accountLabel}.`,
        })
      } catch {
        // Best-effort UX: never throw from a global event handler
      }
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])
}

