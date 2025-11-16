import { test, expect } from '@playwright/test'
import { WalletIframeRouter } from '../../core/WalletIframe/client/router'

test('router.openOfflineExport opens new tab with accountId', async () => {
  const walletOrigin = 'https://wallet.example.localhost'
  const router = new WalletIframeRouter({ walletOrigin })

  let called = false
  let capturedUrl = ''
  const origOpen = (globalThis as any).open
  ;(globalThis as any).open = (url: string) => { called = true; capturedUrl = url as any; return null }
  try {
    await router.openOfflineExport({ accountId: 'alice.testnet' })
    expect(called).toBe(true)
    expect(capturedUrl.startsWith(`${walletOrigin}/offline-export/?`)).toBe(true)
    const u = new URL(capturedUrl)
    expect(u.searchParams.get('accountId')).toBe('alice.testnet')
  } finally {
    ;(globalThis as any).open = origOpen
  }
})

