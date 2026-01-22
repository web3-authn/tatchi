import { SessionService } from '@tatchi-xyz/sdk/server';
import jwt from 'jsonwebtoken';
// Optional JWT session integration example

type DemoJwtClaims = {
  sub: string;
  iss?: string;
  aud?: string;
  iat?: number;
  exp?: number;
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
      const hasPayloadExp = typeof (payload as { exp?: unknown }).exp === 'number';
      return jwt.sign(payload, demoSecret, {
        algorithm: 'HS256',
        issuer: demoIssuer,
        audience: demoAudience,
        ...(hasPayloadExp ? {} : { expiresIn: demoExpiresInSec }),
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
