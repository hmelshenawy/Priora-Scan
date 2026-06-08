import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from '../../src/guards/auth.guard';
import { securityConfig } from '../../src/config/security.config';

function createMockExecutionContext(
  cookies: Record<string, string> = {},
): any {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ cookies }),
    }),
  };
}

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let jwtService: JwtService;

  beforeEach(() => {
    jwtService = new JwtService({
      secret: securityConfig.jwt.secret,
    });
    guard = new AuthGuard(jwtService);
  });

  it('should throw UNAUTHORIZED when access_token cookie is missing', async () => {
    const context = createMockExecutionContext({});
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    try {
      await guard.canActivate(context);
    } catch (err: any) {
      expect(err.response.code).toBe('UNAUTHORIZED');
    }
  });

  it('should throw TOKEN_EXPIRED when JWT is expired', async () => {
    const expiredToken = jwtService.sign(
      { sub: 'user-1', organizationId: 'org-1', permissions: [] },
      { expiresIn: '-1s' },
    );
    const context = createMockExecutionContext({
      access_token: expiredToken,
    });
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    try {
      await guard.canActivate(context);
    } catch (err: any) {
      expect(err.response.code).toBe('TOKEN_EXPIRED');
    }
  });

  it('should throw TOKEN_EXPIRED when JWT is invalid', async () => {
    const context = createMockExecutionContext({
      access_token: 'invalid-token',
    });
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    try {
      await guard.canActivate(context);
    } catch (err: any) {
      expect(err.response.code).toBe('TOKEN_EXPIRED');
    }
  });

  it('should allow request with valid JWT', async () => {
    const validToken = jwtService.sign({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['read:vehicle'],
    });
    const context = createMockExecutionContext({
      access_token: validToken,
    });
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should attach user payload to request', async () => {
    const payload = {
      sub: 'user-1',
      email: 'tech@workshop.com',
      organizationId: 'org-1',
      permissions: ['read:vehicle'],
    };
    const validToken = jwtService.sign(payload);
    const request: any = { cookies: { access_token: validToken } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    };

    await guard.canActivate(context as any);
    expect(request.user).toBeDefined();
    expect(request.user.sub).toBe('user-1');
  });
});
