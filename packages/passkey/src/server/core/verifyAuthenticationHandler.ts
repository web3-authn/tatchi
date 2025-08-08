import type {
  ServerRequest,
  ServerResponse,
  VerifyAuthenticationRequest,
  VerifyAuthenticationResponse
} from './types';
import { AuthService } from './AuthService';
import type {
  ServerRequest as SR,
  ServerResponse as SP
} from './types';

/**
 * Handle verify authentication response requests
 */
export async function handleVerifyAuthenticationResponse(
  request: ServerRequest,
  authService: AuthService
): Promise<ServerResponse> {
  try {
    // Parse request body
    if (!request.body) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    const body: VerifyAuthenticationRequest = JSON.parse(request.body);

    // Validate required fields
    if (!body.vrf_data || !body.webauthn_authentication) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'vrf_data and webauthn_authentication are required' }),
      };
    }

    // Call the account service to verify authentication
    const result: VerifyAuthenticationResponse = await authService.verifyAuthenticationResponse(body);

    // Return the response
    return {
      status: result.success ? 200 : 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };

  } catch (error: any) {
    console.error('Error in verify authentication handler:', error);

    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: 'Internal server error',
        details: error.message
      }),
    };
  }
}

/**
 * Express.js middleware for verify authentication response
 * Usage: app.post('/verify-authentication-response', verifyAuthenticationMiddleware(authService))
 */
export function verifyAuthenticationMiddleware(authService: AuthService) {
  return async (req: any, res: any) => {
    const serverRequest: ServerRequest = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: JSON.stringify(req.body),
    };

    const response = await handleVerifyAuthenticationResponse(serverRequest, authService);

    // Set headers
    Object.entries(response.headers).forEach(([key, value]) => {
      res.set(key, value);
    });

    // Send response
    res.status(response.status).send(JSON.parse(response.body));
  };
}

// Shamir 3-pass endpoints (framework-agnostic)
export async function handleApplyServerLock(request: SR, authService: AuthService): Promise<SP> {
  try {
    if (!request.body) {
      return {
        status: 400,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Missing body' })
      };
    }
    const body = JSON.parse(request.body);
    const kek_c_b64u = body?.kek_c_b64u;
    if (typeof kek_c_b64u !== 'string') {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'kek_c_b64u required'
        })
      };
    }
    const out = await authService.applyServerLock(kek_c_b64u);
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(out)
    };
  } catch (e: any) {
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'internal', details: e?.message })
    };
  }
}

export async function handleRemoveServerLock(request: SR, authService: AuthService): Promise<SP> {
  try {
    if (!request.body) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing body' })
      };
    }
    const body = JSON.parse(request.body);
    const kek_cs_b64u = body?.kek_cs_b64u;
    if (typeof kek_cs_b64u !== 'string') {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'kek_cs_b64u required' })
      };
    }
    const out = await authService.removeServerLock(kek_cs_b64u);
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(out)
    };
  } catch (e: any) {
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'internal', details: e?.message })
    };
  }
}