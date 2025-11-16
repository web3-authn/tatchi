import { test, expect } from '@playwright/test'
import { openOfflineExportWindow } from '../../core/OfflineExport/overlay'

test('openOfflineExportWindow appends accountId in query', async () => {
  const walletOrigin = 'https://wallet.example.localhost'
  let called = false
  let capturedUrl = ''
  const origOpen = (globalThis as any).open
  ;(globalThis as any).open = (url: string) => { called = true; capturedUrl = url as any; return null }
  try {
    openOfflineExportWindow({ walletOrigin, target: '_blank', accountId: 'alice.testnet' })
    expect(called).toBe(true)
    expect(capturedUrl.startsWith(`${walletOrigin}/offline-export/?`)).toBe(true)
    const u = new URL(capturedUrl)
    expect(u.searchParams.get('accountId')).toBe('alice.testnet')
  } finally {
    ;(globalThis as any).open = origOpen
  }
})

