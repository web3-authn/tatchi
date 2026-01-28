import { SessionService } from '@tatchi-xyz/sdk/server';
import jwt from 'jsonwebtoken';
// Optional JWT session integration example

type DemoJwtClaims = {
  sub: string;
  iss?: string;
  aud?: string;
  iat?: number;
  vrfSessionExp?: number;
  rpId?: string;
  blockHeight?: number;
};

const demoSecret = 'demo-secret';
const demoIssuer = 'relay-worker-demo';
const demoAudience = 'tatchi-app-demo';
const demoExpiresInSec = 24 * 60 * 60;
const demoCookieName = 'w3a_session';

const jwtSession = new SessionService<DemoJwtClaims>({
  cookie: { name: demoCookieName },
  jwt: {
    signToken: ({ payload }) => {
      const record = (payload && typeof payload === 'object')
        ? (payload as Record<string, unknown>)
        : {};
      const vrfSessionExp = typeof record.vrfSessionExp === 'number' ? record.vrfSessionExp : undefined;
      const iat = typeof record.iat === 'number' ? record.iat : Math.floor(Date.now() / 1000);
      const expiresIn = (() => {
        if (typeof vrfSessionExp === 'number') {
          const seconds = Math.floor(vrfSessionExp - iat);
          if (Number.isFinite(seconds) && seconds > 0) return seconds;
        }
        return demoExpiresInSec;
      })();
      const { exp: _omitExp, ...rest } = record as { exp?: unknown } & Record<string, unknown>;

      return jwt.sign(rest, demoSecret, {
        algorithm: 'HS256',
        issuer: demoIssuer,
        audience: demoAudience,
        expiresIn,
      });
    },
    verifyToken: async (token): Promise<{ valid: boolean; payload?: DemoJwtClaims }> => {
      try {
        const payload = jwt.verify(token, demoSecret, {
          algorithms: ['HS256'],
          issuer: demoIssuer,
          audience: demoAudience,
        }) as DemoJwtClaims;
        return { valid: true, payload };
      } catch {
        return { valid: false };
      }
    },
  },
});

export default jwtSession;
