import { test, expect } from '@playwright/test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { tatchiBuildHeaders, tatchiWalletService } from '../../plugins/vite'

test.describe('plugins/vite wallet CORP defaults', () => {
  test('dev wallet-service sets CORP even when COEP is off', async () => {
    const plugin = tatchiWalletService({
      walletServicePath: '/wallet-service',
      sdkBasePath: '/sdk',
      coepMode: 'off',
    })

    const middlewares: Array<(req: any, res: any, next: any) => void> = []
    plugin.configureServer?.({
      middlewares: {
        use(fn: any) {
          middlewares.push(fn)
        },
      },
    })

    const headers: Record<string, string> = {}
    let ended = false
    const res = {
      statusCode: 0,
      setHeader(key: string, value: string) {
        headers[key.toLowerCase()] = value
      },
      end() {
        ended = true
      },
    }
    const req = { url: '/wallet-service' }

    let i = 0
    const next = () => {
      const fn = middlewares[i++]
      if (fn) fn(req, res, next)
    }
    next()

    expect(ended).toBe(true)
    expect(headers['cross-origin-resource-policy']).toBe('cross-origin')
  })

  test('build _headers includes CORP for wallet HTML even when COEP is off', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tatchi-headers-'))
    const outDir = path.join(tmp, 'dist')

    const plugin = tatchiBuildHeaders({
      walletOrigin: 'https://wallet.example.localhost',
      coepMode: 'off',
    })

    ;(plugin as any).configResolved?.({ build: { outDir } })
    ;(plugin as any).generateBundle?.()

    const content = fs.readFileSync(path.join(outDir, '_headers'), 'utf-8')
    expect(content).toContain('/wallet-service')
    expect(content).toContain('Cross-Origin-Resource-Policy: cross-origin')
  })
})

