import { test, expect } from '@playwright/test'
import { WalletIframeRouter } from '../../core/WalletIframe/client/router'

test('WalletIframeRouter.exportNearKeypairWithUI: if post() throws, opens offline-export', async () => {
  const walletOrigin = 'https://wallet.example.localhost'
  const router = new WalletIframeRouter({ walletOrigin })

  // Avoid overlay side effects for unit scope
  ;(router as any).showFrameForActivation = () => {}
  ;(router as any).hideFrameForActivation = () => {}

  // Force post() to throw to exercise catch → openOfflineExport
  ;(router as any).post = async () => { throw new Error('simulated port error') }

  let offlineCalledWith: string | null = null
  ;(router as any).openOfflineExport = async ({ accountId }: { accountId: string }) => { offlineCalledWith = accountId }

  await router.exportNearKeypairWithUI('dave.testnet', { variant: 'drawer', theme: 'dark' })
  expect(offlineCalledWith).toBe('dave.testnet')
})
