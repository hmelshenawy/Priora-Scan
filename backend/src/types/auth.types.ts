export interface JwtPayload {
  sub: string;
  email: string;
  organizationId: string;
  permissions: string[];
  iat: number;
  exp: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      organizationId?: string;
    }
  }
}
