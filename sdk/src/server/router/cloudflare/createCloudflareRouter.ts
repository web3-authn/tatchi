import type { AuthService } from '../../core/AuthService';
import type { DelegateActionPolicy } from '../../delegateAction';
import { normalizePath, type RelayRouterOptions } from '../relay';
import type { NormalizedRouterLogger } from '../logger';
import { normalizeRouterLogger } from '../logger';
import type { CfEnv, CfExecutionContext, FetchHandler } from './types';
import { json, withCors } from './http';
import { handleCreateAccountAndRegisterUser } from './routes/createAccountAndRegisterUser';
import { handleHealth, handleReady } from './routes/health';
import { handleRecoverEmail } from './routes/recoverEmail';
import { handleSessionAuth, handleSessionLogout, handleSessionRefresh } from './routes/sessions';
import { handleShamir } from './routes/shamir';
import { handleSignedDelegate } from './routes/signedDelegate';
import { handleThresholdEd25519 } from './routes/thresholdEd25519';
import { handleVerifyAuthenticationResponse } from './routes/verifyAuthenticationResponse';
import { handleWellKnown } from './routes/wellKnown';

export interface CloudflareRelayContext {
  request: Request;
  url: URL;
  pathname: string;
  method: string;
  env?: CfEnv;
  cfCtx?: CfExecutionContext;

  service: AuthService;
  opts: RelayRouterOptions;
  logger: NormalizedRouterLogger;

  mePath: string;
  logoutPath: string;
  signedDelegatePath: string;
  signedDelegatePolicy?: DelegateActionPolicy;
}

export function createCloudflareRouter(service: AuthService, opts: RelayRouterOptions = {}): FetchHandler {
  const notFound = () => new Response('Not Found', { status: 404 });
  const mePath = opts.sessionRoutes?.auth || '/session/auth';
  const logoutPath = opts.sessionRoutes?.logout || '/session/logout';
  const logger = normalizeRouterLogger(opts.logger);
  const signedDelegatePath = (() => {
    if (!opts.signedDelegate) return '';
    const raw = String(opts.signedDelegate.route || '').trim();
    if (!raw) throw new Error('RelayRouterOptions.signedDelegate.route is required');
    return normalizePath(raw);
  })();
  const signedDelegatePolicy = opts.signedDelegate?.policy;

  const handlers: Array<(c: CloudflareRelayContext) => Promise<Response | null>> = [
    handleWellKnown,
    handleCreateAccountAndRegisterUser,
    handleSignedDelegate,
    handleShamir,
    handleVerifyAuthenticationResponse,
    handleThresholdEd25519,
    handleSessionAuth,
    handleSessionLogout,
    handleSessionRefresh,
    handleRecoverEmail,
    handleHealth,
    handleReady,
  ];

  return async function handler(request: Request, env?: CfEnv, cfCtx?: CfExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method.toUpperCase();

    // Preflight CORS
    if (method === 'OPTIONS') {
      const res = new Response(null, { status: 204 });
      withCors(res.headers, opts, request);
      return res;
    }

    const baseCtx: Omit<CloudflareRelayContext, 'request' | 'url' | 'pathname' | 'method'> = {
      env,
      cfCtx,
      service,
      opts,
      logger,
      mePath,
      logoutPath,
      signedDelegatePath,
      signedDelegatePolicy,
    };

    const ctx: CloudflareRelayContext = {
      ...baseCtx,
      request,
      url,
      pathname,
      method,
    };

    try {
      for (const fn of handlers) {
        const res = await fn(ctx);
        if (res) {
          withCors(res.headers, opts, request);
          return res;
        }
      }

      return notFound();
    } catch (e: unknown) {
      const res = json({ code: 'internal', message: e instanceof Error ? e.message : String(e) }, { status: 500 });
      withCors(res.headers, opts, request);
      return res;
    }
  };
}
