import { Page } from '@playwright/test';
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
      if (
        method !== 'query' ||
        params?.request_type !== 'call_function' ||
        methodName !== 'verify_authentication_response'
      ) {
        return route.fallback();
      }

      let userId = 'unknown.user';
      let rpId = 'example.localhost';
      try {
        const argsB64 = params?.args_base64 || '';
        const argsJsonStr = Buffer.from(argsB64, 'base64').toString('utf8');
        const args = JSON.parse(argsJsonStr);
        userId = args?.vrf_data?.user_id || userId;
        rpId = args?.vrf_data?.rp_id || rpId;
      } catch {
        // ignore decode failures
      }

      const contractResponse = JSON.stringify({ verified: true });
      const resultBytes = Array.from(Buffer.from(contractResponse, 'utf8'));

      const rpcResponse = {
        jsonrpc: '2.0',
        id: body?.id || 'verify_from_wasm',
        result: {
          result: resultBytes,
          logs: [
            'VRF Authentication: Verifying VRF proof + WebAuthn authentication',
            `  - User ID: ${userId}`,
            `  - RP ID (domain): ${rpId}`,
          ],
        },
      };

      printLog('intercept', `contract verification bypass responded for ${userId}`, {
        scope: 'contract',
        indent: 1,
      });

      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rpcResponse),
      });
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

