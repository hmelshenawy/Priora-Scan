import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CsrfGuard } from '../../src/guards/csrf.guard';

function createMockExecutionContext(
  method: string,
  cookies: Record<string, string> = {},
  headers: Record<string, string> = {},
): ExecutionContext {
  const request = {
    method,
    cookies,
    headers,
  } as any;

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('CsrfGuard', () => {
  let guard: CsrfGuard;

  beforeEach(() => {
    guard = new CsrfGuard();
  });

  describe('exempt methods', () => {
    it('should allow GET requests without CSRF token', () => {
      const context = createMockExecutionContext('GET');
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow HEAD requests without CSRF token', () => {
      const context = createMockExecutionContext('HEAD');
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow OPTIONS requests without CSRF token', () => {
      const context = createMockExecutionContext('OPTIONS');
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('mutating requests', () => {
    it('should reject POST without CSRF token', () => {
      const context = createMockExecutionContext('POST');
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      try {
        guard.canActivate(context);
      } catch (err: any) {
        expect(err.response.code).toBe('CSRF_MISSING');
      }
    });

    it('should reject POST with cookie but no header', () => {
      const context = createMockExecutionContext('POST', {
        csrf_token: 'valid-token',
      });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      try {
        guard.canActivate(context);
      } catch (err: any) {
        expect(err.response.code).toBe('CSRF_MISSING');
      }
    });

    it('should reject POST with header but no cookie', () => {
      const context = createMockExecutionContext('POST', {}, {
        'x-csrf-token': 'valid-token',
      });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      try {
        guard.canActivate(context);
      } catch (err: any) {
        expect(err.response.code).toBe('CSRF_MISSING');
      }
    });

    it('should reject mismatched token lengths', () => {
      const context = createMockExecutionContext(
        'POST',
        { csrf_token: 'short' },
        { 'x-csrf-token': 'much-longer-token-value' },
      );
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      try {
        guard.canActivate(context);
      } catch (err: any) {
        expect(err.response.code).toBe('CSRF_INVALID');
      }
    });

    it('should reject mismatched tokens (timing-safe)', () => {
      const context = createMockExecutionContext(
        'POST',
        { csrf_token: 'token-one-value' },
        { 'x-csrf-token': 'token-two-value' },
      );
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      try {
        guard.canActivate(context);
      } catch (err: any) {
        expect(err.response.code).toBe('CSRF_INVALID');
      }
    });

    it('should allow matching tokens', () => {
      const context = createMockExecutionContext(
        'POST',
        { csrf_token: 'matching-token-value' },
        { 'x-csrf-token': 'matching-token-value' },
      );
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow PATCH with matching tokens', () => {
      const context = createMockExecutionContext(
        'PATCH',
        { csrf_token: 'patch-token' },
        { 'x-csrf-token': 'patch-token' },
      );
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow PUT with matching tokens', () => {
      const context = createMockExecutionContext(
        'PUT',
        { csrf_token: 'put-token' },
        { 'x-csrf-token': 'put-token' },
      );
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow DELETE with matching tokens', () => {
      const context = createMockExecutionContext(
        'DELETE',
        { csrf_token: 'delete-token' },
        { 'x-csrf-token': 'delete-token' },
      );
      expect(guard.canActivate(context)).toBe(true);
    });
  });
});
