import { test, expect } from '@playwright/test'
import { buildPermissionsPolicy, buildWalletCsp } from '../../plugins/headers'

test('wallet-service headers are present and consistent', async ({ request }) => {
  const walletOrigin = process.env.VITE_WALLET_ORIGIN || 'https://wallet.example.localhost'

  const res = await request.get('/wallet-service')
  expect(res.ok()).toBeTruthy()

  const headers = res.headers()
  // Header names are lower-cased by Playwright
  const pp = headers['permissions-policy']
  const csp = headers['content-security-policy']
  const coop = headers['cross-origin-opener-policy']
  const coep = headers['cross-origin-embedder-policy']
  const corp = headers['cross-origin-resource-policy']

  expect(pp).toBe(buildPermissionsPolicy(walletOrigin))
  // Dev server defaults to strict CSP for wallet route
  expect(csp).toBe(buildWalletCsp({ mode: 'strict' }))
  expect(coop).toBe('unsafe-none')
  expect(coep).toBe('require-corp')
  expect(corp).toBe('cross-origin')
})

