import { test, expect } from '@playwright/test'
import { tatchiNextHeaders } from '../../plugins/next'
import { buildPermissionsPolicy, buildWalletCsp } from '../../plugins/headers'

test.describe('plugins/next headers', () => {
  test('tatchiNextHeaders strict mode equals shared builders', () => {
    const wallet = 'https://wallet.example.localhost'
    const entries = tatchiNextHeaders({ walletOrigin: wallet, cspMode: 'strict', allowUnsafeEvalDev: false, extraFrameSrc: [], extraScriptSrc: [] })
    expect(Array.isArray(entries)).toBeTruthy()
    const entry = entries[0]
    const headers = Object.fromEntries(entry.headers.map(h => [h.key, h.value]))
    expect(headers['Permissions-Policy']).toBe(buildPermissionsPolicy(wallet))
    expect(headers['Content-Security-Policy']).toBe(buildWalletCsp({ mode: 'strict', frameSrc: [wallet] }))
  })

  test('tatchiNextHeaders compatible mode + unsafe-eval equals shared builders', () => {
    const wallet = 'https://wallet.example.localhost'
    const entries = tatchiNextHeaders({ walletOrigin: wallet, cspMode: 'compatible', allowUnsafeEvalDev: true, extraFrameSrc: [], extraScriptSrc: [] })
    const entry = entries[0]
    const headers = Object.fromEntries(entry.headers.map(h => [h.key, h.value]))
    expect(headers['Permissions-Policy']).toBe(buildPermissionsPolicy(wallet))
    expect(headers['Content-Security-Policy']).toBe(buildWalletCsp({ mode: 'compatible', allowUnsafeEval: true, frameSrc: [wallet] }))
  })
})

