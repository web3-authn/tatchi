import type {
  ServerRequest,
  ServerResponse,
  VerifyAuthenticationRequest,
  VerifyAuthenticationResponse
} from './types';
import { AuthService } from './AuthService';

/**
 * Handle verify authentication response requests
 * This is a framework-agnostic handler that can be used with Express, Fastify, etc.
 */
export async function handleVerifyAuthenticationResponse(
  request: ServerRequest,
  accountService: AuthService
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
    const result: VerifyAuthenticationResponse = await accountService.verifyAuthenticationResponse(body);

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
 * Usage: app.post('/verify-authentication-response', verifyAuthenticationMiddleware(accountService))
 */
export function verifyAuthenticationMiddleware(accountService: AuthService) {
  return async (req: any, res: any) => {
    const serverRequest: ServerRequest = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: JSON.stringify(req.body),
    };

    const response = await handleVerifyAuthenticationResponse(serverRequest, accountService);

    // Set headers
    Object.entries(response.headers).forEach(([key, value]) => {
      res.set(key, value);
    });

    // Send response
    res.status(response.status).send(JSON.parse(response.body));
  };
}