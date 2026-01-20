import { Page, expect } from '@playwright/test';
import { DEFAULT_TEST_CONFIG } from './config';
import { printLog } from './logging';

export interface ContractBypassOptions {
  nearRpcUrl?: string;
}

export async function bypassContractVerification(
  page: Page,
  options: ContractBypassOptions = {}
): Promise<void> {
  const rpcUrl = options.nearRpcUrl ?? DEFAULT_TEST_CONFIG.nearRpcUrl;

  await page.route(rpcUrl, async (route) => {
    try {
      const request = route.request();
      if (request.method() !== 'POST') {
        return route.fallback();
      }

      const bodyText = request.postData() || '';
      let body: any = {};
      try {
        body = JSON.parse(bodyText);
      } catch {
        return route.fallback();
      }

      const method = body?.method;
      const params = body?.params || {};
      const methodName = params?.method_name;
      if (method !== 'query' || params?.request_type !== 'call_function') {
        return route.fallback();
      }

      const contentType = request.headers()['content-type'] || '';
      expect(contentType).toContain('application/json');

      const decodeArgs = (): Record<string, any> => {
        try {
          const argsB64 = params?.args_base64 || '';
          const argsJsonStr = Buffer.from(argsB64, 'base64').toString('utf8');
          return JSON.parse(argsJsonStr) || {};
        } catch {
          return {};
        }
      };

      const respondWithResult = (result: unknown, logs: string[], idOverride?: string) => {
        const resultBytes = Array.from(Buffer.from(JSON.stringify(result), 'utf8'));
        const rpcResponse = {
          jsonrpc: '2.0',
          id: body?.id || idOverride || 'call_function',
          result: {
            result: resultBytes,
            logs,
          },
        };
        return route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rpcResponse),
        });
      };

      if (methodName === 'verify_authentication_response') {
        let userId = 'unknown.user';
        let rpId = 'example.localhost';
        try {
          const args = decodeArgs();
          userId = args?.vrf_data?.user_id || userId;
          rpId = args?.vrf_data?.rp_id || rpId;
        } catch {
          // ignore decode failures
        }

        printLog('intercept', `contract verification bypass responded for ${userId}`, {
          scope: 'contract',
          indent: 1,
        });

        return respondWithResult(
          { verified: true },
          [
            'VRF Authentication: Verifying VRF proof + WebAuthn authentication',
            `  - User ID: ${userId}`,
            `  - RP ID (domain): ${rpId}`,
          ],
          'verify_from_wasm',
        );
      }

      if (methodName === 'get_credential_ids_by_account' || methodName === 'get_authenticators_by_user') {
        const args = decodeArgs();
        const accountId = String(args?.account_id || args?.user_id || '');
        if (!accountId) {
          return respondWithResult([], ['contract: missing account id'], 'account_sync_empty');
        }

        const credentialIdString = `test-credential-${accountId}-auth`;
        const credentialIdB64u = Buffer.from(credentialIdString, 'utf8').toString('base64url');

        if (methodName === 'get_credential_ids_by_account') {
          return respondWithResult([credentialIdB64u], [`contract: credential ids for ${accountId}`], 'credential_ids');
        }

        const credentialPublicKey = Array.from({ length: 65 }, (_, i) => (i + 1) & 0xff);
        const authenticator = {
          credential_public_key: credentialPublicKey,
          transports: ['internal'],
          registered: new Date().toISOString(),
          device_number: 1,
        };
        return respondWithResult(
          [[credentialIdB64u, authenticator]],
          [`contract: authenticators for ${accountId}`],
          'authenticators_by_user',
        );
      }

      return route.fallback();
    } catch (error) {
      printLog('intercept', `contract bypass fell back (${(error as Error).message})`, {
        scope: 'contract',
        indent: 1,
      });
      return route.fallback();
    }
  });

  printLog('intercept', `contract verification bypass installed at ${rpcUrl}`, {
    scope: 'contract',
    step: 'ready',
  });
}
