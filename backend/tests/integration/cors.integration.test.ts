import { securityConfig } from '../../src/config/security.config';

describe('CORS Configuration', () => {
  it('should not use wildcard origins', () => {
    expect(securityConfig.cors.allowedOrigins).not.toContain('*');
  });

  it('should allow credentials', () => {
    expect(securityConfig.cors.credentials).toBe(true);
  });

  it('should allow expected HTTP methods', () => {
    expect(securityConfig.cors.allowedMethods).toContain('GET');
    expect(securityConfig.cors.allowedMethods).toContain('POST');
    expect(securityConfig.cors.allowedMethods).toContain('PATCH');
    expect(securityConfig.cors.allowedMethods).toContain('OPTIONS');
  });

  it('should allow X-CSRF-Token header', () => {
    expect(securityConfig.cors.allowedHeaders).toContain('X-CSRF-Token');
  });

  it('should allow Content-Type header', () => {
    expect(securityConfig.cors.allowedHeaders).toContain('Content-Type');
  });

  it('should cache preflight for 24 hours', () => {
    expect(securityConfig.cors.maxAge).toBe(86400);
  });

  it('should include localhost:3000 in development', () => {
    expect(securityConfig.cors.allowedOrigins).toContain('http://localhost:3000');
  });
});
