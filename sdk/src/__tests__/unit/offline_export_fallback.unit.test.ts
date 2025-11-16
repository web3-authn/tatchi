import { test, expect } from '@playwright/test'
import { WalletIframeRouter } from '../../core/WalletIframe/client/router'

test('exportNearKeypairWithUI: OFFLINE_EXPORT_FALLBACK message triggers openOfflineExport', async () => {
  const walletOrigin = 'https://wallet.example.localhost'
  const router = new WalletIframeRouter({ walletOrigin })

  // Silence overlay side effects for unit scope
  ;(router as any).showFrameForActivation = () => {}
  ;(router as any).hideFrameForActivation = () => {}

  // Stub post() to avoid MessagePort handshake; just simulate a successful PM post
  ;(router as any).post = async () => ({ result: undefined })

  let offlineCalledWith: string | null = null
  ;(router as any).openOfflineExport = async ({ accountId }: { accountId: string }) => {
    offlineCalledWith = accountId
  }

  // Provide a minimal message event system in Node test env
  const saved: Array<(ev: any) => void> = []
  const origAdd = (globalThis as any).addEventListener
  const origRemove = (globalThis as any).removeEventListener
  ;(globalThis as any).addEventListener = (type: string, cb: any) => { if (type === 'message') saved.push(cb) }
  ;(globalThis as any).removeEventListener = (type: string, cb: any) => {
    if (type !== 'message') return
    const i = saved.indexOf(cb)
    if (i >= 0) saved.splice(i, 1)
  }
  try {
  // Initiate export flow (registers fallback listener internally)
  await router.exportNearKeypairWithUI('alice.testnet', { variant: 'drawer', theme: 'dark' })

  // Simulate wallet host instructing fallback to offline-export route
  for (const handler of saved) {
    handler({ origin: walletOrigin, data: { type: 'OFFLINE_EXPORT_FALLBACK', error: 'simulated error' } })
  }

  expect(offlineCalledWith).toBe('alice.testnet')
  } finally {
    // Restore globals
    ;(globalThis as any).addEventListener = origAdd
    ;(globalThis as any).removeEventListener = origRemove
  }
})
