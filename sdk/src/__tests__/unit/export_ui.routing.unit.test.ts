import { test, expect } from '@playwright/test'
import { WalletIframeRouter } from '../../core/WalletIframe/client/router'

test('WalletIframeRouter.exportNearKeypairWithUI: if post() throws, opens offline-export', async () => {
  const walletOrigin = 'https://wallet.example.localhost';
  const router = new WalletIframeRouter({ walletOrigin });

  // Avoid overlay side effects for unit scope
  (router as any).showFrameForActivation = () => {}
  (router as any).hideFrameForActivation = () => {}

  // Force post() to throw to exercise catch → openOfflineExport
  (router as any).post = async () => {
    throw new Error('simulated port error')
  }

  let offlineCalledWith: string | null = null;
  (router as any).openOfflineExport = async ({ accountId }: { accountId: string }) => {
    offlineCalledWith = accountId
  }

  await router.exportNearKeypairWithUI('dave.testnet', { variant: 'drawer', theme: 'dark' })
  expect(offlineCalledWith).toBe('dave.testnet')
})

test('WalletIframeRouter.exportNearKeypairWithUI: delegates to wallet host without exposing key material', async () => {
  const walletOrigin = 'https://wallet.example.localhost';
  const router = new WalletIframeRouter({ walletOrigin });

  // Avoid DOM/overlay side effects for unit scope
  (router as any).showFrameForActivation = () => {}
  (router as any).attachExportUiClosedListener = () => () => {}
  (router as any).attachExportUiFallbackListener = () => () => {}

  const posted: any[] = [];
  let offlineCalled = false;

  (router as any).post = async (payload: any) => {
    posted.push(payload)
    return { ok: true, result: undefined }
  }
  (router as any).openOfflineExport = async () => { offlineCalled = true }

  await router.exportNearKeypairWithUI('zoe.testnet', { variant: 'modal', theme: 'light' })

  expect(offlineCalled).toBe(false)
  expect(posted).toHaveLength(1)
  const msg = posted[0]
  expect(msg.type).toBe('PM_EXPORT_NEAR_KEYPAIR_UI')
  expect(msg.payload).toEqual({ nearAccountId: 'zoe.testnet', variant: 'modal', theme: 'light' })
  expect(msg.payload).not.toHaveProperty('privateKey')
  expect(msg.payload).not.toHaveProperty('secretKey')
})
