type ForwardableEmailPayload = {
  from: string;
  to: string;
  headers: Record<string, string>;
  raw?: string;
  rawSize?: number;
};

export default {
  async email(message: any, env: any, ctx: any): Promise<void> {
    const relayBaseUrl = env.RELAY_BASE_URL ?? 'https://relay.tatchi.xyz';

    // Hit the relay health endpoint once for basic liveness.
    const healthResponse = await fetch(`${relayBaseUrl}/healthz`);
    const relayerHealth = JSON.stringify(await healthResponse.json());

    console.log('message.from:', JSON.stringify(message.from));
    console.log('message.to:', JSON.stringify(message.to));

    // Convert Headers to a standard JS object
    const headersObj = Object.fromEntries(message.headers as any);
    console.log('message.headers:', JSON.stringify(headersObj, null, 2));
    console.log('DKIM-Signature:', message.headers.get('DKIM-Signature'));

    const rawText = await new Response(message.raw).text();
    console.log('message.raw:', rawText);
    console.log('message.rawSize:', JSON.stringify(message.rawSize));

    console.log('env:', JSON.stringify(env));
    console.log('ctx:', JSON.stringify(ctx));

    switch (message.to) {
      case 'reset@web3authn.org': {
        console.log(`Forwarding ZK-email reset request to ${relayBaseUrl}/reset-email`);

        // Normalize headers to lowercase keys for the payload.
        const normalizedHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(headersObj)) {
          normalizedHeaders[String(k).toLowerCase()] = String(v);
        }

        const payload: ForwardableEmailPayload = {
          from: message.from,
          to: message.to,
          headers: normalizedHeaders,
          raw: rawText,
          rawSize: typeof message.rawSize === 'number' ? message.rawSize : undefined,
        };

        const response = await fetch(`${relayBaseUrl}/reset-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          message.setReject('Recovery relayer rejected email');
          return;
        }

        await message.forward('dev@web3authn.org');
        break;
      }

      default:
        message.setReject('Unknown address');
    }
  },
};

