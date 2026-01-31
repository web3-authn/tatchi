import { test, expect } from '@playwright/test'
import { installWalletSdkCorsShim } from '../setup/cross-origin-headers'

test('offline-export opens offline with no fetch/xhr', async ({ page }) => {
  const walletOrigins = (process.env.VITE_WALLET_ORIGIN || 'https://wallet.example.localhost')
    .split(/[,\s]+/)
    .map((v) => v.trim())
    .filter(Boolean)
  const walletOrigin = walletOrigins[0] || 'https://wallet.example.localhost'

  // Mirror wallet-origin requests to app origin in dev to serve HTML and assets
  await installWalletSdkCorsShim(page, { walletOrigin, logStyle: 'silent', mirror: true })

  // Prime SW online
  await page.goto(`${walletOrigin}/offline-export/`)
  // Wait a bit for SW to install and precache
  await page.waitForTimeout(500)

  // Go offline and re-open the route
  await page.context().setOffline(true)

  const requests: string[] = []
  page.on('request', (req) => {
    const t = req.resourceType()
    if (t === 'fetch' || t === 'xhr') requests.push(req.url())
  })

  await page.goto(`${walletOrigin}/offline-export/`)
  // Expect the minimal app shell to render a visible heading
  await expect(page.getByRole('heading', { name: 'Offline Export' })).toBeVisible()

  // Ensure no fetch/xhr happened while offline (cache-only SW)
  expect(requests.length).toBe(0)
})
