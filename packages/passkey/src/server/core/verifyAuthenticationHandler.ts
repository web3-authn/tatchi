import type {
  ServerRequest,
  ServerResponse,
  VerifyAuthenticationRequest,
  VerifyAuthenticationResponse,
  ApplyServerLockRequest,
  ApplyServerLockResponse,
  RemoveServerLockRequest,
  RemoveServerLockResponse
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

    const result = await authService.handleVerifyAuthenticationResponse(JSON.parse(serverRequest.body!));
    res.status(result.success ? 200 : 400).json(result);
  };
}