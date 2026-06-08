import { securityConfig } from '../../src/config/security.config';

describe('Cookie Security Configuration', () => {
  it('should set access_token as HttpOnly', () => {
    expect(securityConfig.cookies.accessToken.httpOnly).toBe(true);
  });

  it('should set refresh_token as HttpOnly', () => {
    expect(securityConfig.cookies.refreshToken.httpOnly).toBe(true);
  });

  it('should set csrf_token as NOT HttpOnly (for JS access)', () => {
    expect(securityConfig.cookies.csrfToken.httpOnly).toBe(false);
  });

  it('should set SameSite=Strict on all cookies', () => {
    expect(securityConfig.cookies.accessToken.sameSite).toBe('strict');
    expect(securityConfig.cookies.refreshToken.sameSite).toBe('strict');
    expect(securityConfig.cookies.csrfToken.sameSite).toBe('strict');
  });

  it('should set path=/ on all cookies', () => {
    expect(securityConfig.cookies.accessToken.path).toBe('/');
    expect(securityConfig.cookies.refreshToken.path).toBe('/');
    expect(securityConfig.cookies.csrfToken.path).toBe('/');
  });

  it('should conditionally set Secure based on NODE_ENV', () => {
    // In development (current test environment), Secure should be false
    expect(securityConfig.cookies.accessToken.secure).toBe(false);
    expect(securityConfig.cookies.refreshToken.secure).toBe(false);
    expect(securityConfig.cookies.csrfToken.secure).toBe(false);
  });

  it('should have reasonable token expiry times', () => {
    expect(securityConfig.cookies.accessToken.maxAge).toBe(15 * 60 * 1000); // 15 min
    expect(securityConfig.cookies.refreshToken.maxAge).toBe(7 * 24 * 60 * 60 * 1000); // 7 days
  });
});
