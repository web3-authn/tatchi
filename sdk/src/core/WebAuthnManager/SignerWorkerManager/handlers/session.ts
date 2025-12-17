
export function withSessionId<T>(
  sessionId: string,
  payload: T,
): T & { sessionId: string } {

  if (!sessionId) {
    throw new Error('withSessionId: sessionId is required');
  }

  const existing = (payload as any)?.sessionId as string | undefined;
  if (existing && existing !== sessionId) {
    throw new Error(
      `withSessionId: payload.sessionId (${existing}) does not match provided sessionId (${sessionId})`,
    );
  }

  return { ...payload, sessionId };
}
