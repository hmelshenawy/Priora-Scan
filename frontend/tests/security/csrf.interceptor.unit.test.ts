/**
 * @jest-environment jsdom
 */

import { getCsrfTokenFromCookie } from '../../src/lib/csrf';

describe('CSRF Cookie Helper', () => {
  beforeEach(() => {
    // Clear all cookies
    document.cookie.split(';').forEach((cookie) => {
      const [name] = cookie.split('=');
      document.cookie = `${name.trim()}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    });
  });

  it('should return null when document is undefined (SSR)', () => {
    const originalDocument = global.document;
    // @ts-ignore
    global.document = undefined;
    expect(getCsrfTokenFromCookie()).toBeNull();
    global.document = originalDocument;
  });

  it('should return null when csrf_token cookie is absent', () => {
    expect(getCsrfTokenFromCookie()).toBeNull();
  });

  it('should extract csrf_token from cookie', () => {
    document.cookie = 'csrf_token=abc123; path=/';
    expect(getCsrfTokenFromCookie()).toBe('abc123');
  });

  it('should extract csrf_token from multiple cookies', () => {
    document.cookie = 'other=value; path=/';
    document.cookie = 'csrf_token=xyz789; path=/';
    expect(getCsrfTokenFromCookie()).toBe('xyz789');
  });

  it('should decode URL-encoded token', () => {
    document.cookie = `csrf_token=${encodeURIComponent('token/with+special=')}; path=/`;
    expect(getCsrfTokenFromCookie()).toBe('token/with+special=');
  });
});
