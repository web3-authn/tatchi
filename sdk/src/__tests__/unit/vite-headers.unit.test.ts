import { test, expect } from '@playwright/test'
import { computeDevPermissionsPolicy, computeDevWalletCsp } from '../../plugins/vite'
import { buildPermissionsPolicy, buildWalletCsp } from '../../plugins/headers'

test.describe('plugins/vite header helpers', () => {
  test('computeDevPermissionsPolicy matches shared builder', () => {
    const wallet = 'https://wallet.example.localhost'
    expect(computeDevPermissionsPolicy(wallet)).toBe(buildPermissionsPolicy(wallet))
    expect(computeDevPermissionsPolicy(undefined)).toBe(buildPermissionsPolicy(undefined))
  })

  test('buildPermissionsPolicy supports multiple wallet origins', () => {
    const wallet = 'https://wallet.example.localhost'
    const extension = 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const policy = buildPermissionsPolicy([wallet, extension])
    expect(policy).toContain(`"${wallet}"`)
    expect(policy).toContain(`"${extension}"`)
  })

  test('computeDevWalletCsp matches shared builder', () => {
    expect(computeDevWalletCsp('strict')).toBe(buildWalletCsp({ mode: 'strict' }))
    expect(computeDevWalletCsp('compatible')).toBe(buildWalletCsp({ mode: 'compatible' }))
  })
})
