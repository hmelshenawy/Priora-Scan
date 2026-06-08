export function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const match = document.cookie.match(
    new RegExp('(^| )csrf_token=([^;]+)'),
  );

  if (match) {
    return decodeURIComponent(match[2]);
  }

  return null;
}
