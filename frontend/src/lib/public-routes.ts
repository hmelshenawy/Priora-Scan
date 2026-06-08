export const PUBLIC_ROUTES = [
  '/login',
  '/',
  '/api', // Let API routes handle their own auth
];

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}
