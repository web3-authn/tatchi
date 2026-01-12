import type { Router as ExpressRouter } from 'express';
import express from 'express';
import type { AuthService } from '../../core/AuthService';
import type { DelegateActionPolicy } from '../../delegateAction';
import { ensureLeadingSlash } from '../../../utils/validation';
import type { RelayRouterOptions } from '../relay';
import type { NormalizedRouterLogger } from '../logger';
import { coerceRouterLogger } from '../logger';
import { installCors } from './cors';
import { registerCreateAccountAndRegisterUser } from './routes/createAccountAndRegisterUser';
import { registerHealthRoutes } from './routes/health';
import { registerRecoverEmailRoute } from './routes/recoverEmail';
import { registerSessionRoutes } from './routes/sessions';
import { registerShamirRoutes } from './routes/shamir';
import { registerSignedDelegateRoutes } from './routes/signedDelegate';
import { registerThresholdEd25519Routes } from './routes/thresholdEd25519';
import { registerVerifyAuthenticationResponse } from './routes/verifyAuthenticationResponse';
import { registerWellKnownRoutes } from './routes/wellKnown';
import { resolveThresholdOption } from '../routerOptions';

export interface ExpressRelayContext {
  service: AuthService;
  opts: RelayRouterOptions;
  logger: NormalizedRouterLogger;
  mePath: string;
  logoutPath: string;
  signedDelegatePath: string;
  signedDelegatePolicy?: DelegateActionPolicy;
}

export function createRelayRouter(service: AuthService, opts: RelayRouterOptions = {}): ExpressRouter {
  const router = express.Router();

  const threshold = resolveThresholdOption(service, opts);
  const effectiveOpts: RelayRouterOptions = { ...opts, threshold };

  const mePath = effectiveOpts.sessionRoutes?.auth || '/session/auth';
  const logoutPath = effectiveOpts.sessionRoutes?.logout || '/session/logout';
  const logger = coerceRouterLogger(effectiveOpts.logger);
  let signedDelegatePath = '';
  if (effectiveOpts.signedDelegate) {
    signedDelegatePath = ensureLeadingSlash(effectiveOpts.signedDelegate.route) || '/signed-delegate';
  }
  const signedDelegatePolicy = effectiveOpts.signedDelegate?.policy;

  installCors(router, effectiveOpts);

  const ctx: ExpressRelayContext = {
    service,
    opts: effectiveOpts,
    logger,
    mePath,
    logoutPath,
    signedDelegatePath,
    signedDelegatePolicy,
  };

  registerCreateAccountAndRegisterUser(router, ctx);
  registerSignedDelegateRoutes(router, ctx);
  registerShamirRoutes(router, ctx);
  registerVerifyAuthenticationResponse(router, ctx);
  registerThresholdEd25519Routes(router, ctx);
  registerSessionRoutes(router, ctx);
  registerRecoverEmailRoute(router, ctx);
  registerHealthRoutes(router, ctx);
  registerWellKnownRoutes(router, ctx);

  return router;
}
