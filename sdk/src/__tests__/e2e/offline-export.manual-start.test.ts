import { test, expect } from '@playwright/test'
import { installWalletSdkCorsShim } from '../setup/cross-origin-headers'

test('offline-export requires manual click to start', async ({ page }) => {
  const walletOrigin = process.env.VITE_WALLET_ORIGIN || 'https://wallet.example.localhost'
  await installWalletSdkCorsShim(page, { walletOrigin, logStyle: 'silent', mirror: true })

  await page.goto(`${walletOrigin}/offline-export/`)

  // Expect the minimal app shell to render with an explicit action button
  await expect(page.getByRole('heading', { name: 'Offline Export' })).toBeVisible()
  const btn = page.getByText('Export My Key')
  await expect(btn).toBeVisible()

  // Ensure no recovery/export status appeared before clicking
  await expect(page.locator('text=Recovered local key material')).toHaveCount(0)
})
