import { DesktopAgent } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  organizationId: string;
  roles: string[];
  permissions: string[];
  iat: number;
  exp: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      organizationId?: string;
      agent?: DesktopAgent;
    }
  }
}
