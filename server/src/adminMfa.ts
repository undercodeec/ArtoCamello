import jwt from 'jsonwebtoken';

export function issueAdminEmailSession(userId: string, tenantId: string, version: number, jwtSecret: string): string {
  return jwt.sign({ userId, tenantId, sessionVersion: version }, jwtSecret, { audience: 'admin-email', expiresIn: '30m' });
}

export function verifyAdminEmailSession(token: string | undefined, userId: string, tenantId: string, version: number, jwtSecret: string): boolean {
  try {
    const claims = jwt.verify(token || '', jwtSecret, { audience: 'admin-email' }) as jwt.JwtPayload;
    return claims.userId === userId && claims.tenantId === tenantId && claims.sessionVersion === version;
  } catch { return false; }
}
