export const securityConfig = {
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    accessTokenExpiry: '15m',
    refreshTokenExpiry: '7d',
  },
  cookies: {
    accessToken: {
      name: 'access_token',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      path: '/',
      maxAge: 15 * 60 * 1000, // 15 minutes
    },
    refreshToken: {
      name: 'refresh_token',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
    csrfToken: {
      name: 'csrf_token',
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      path: '/',
    },
  },
  cors: {
    allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
    allowedMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Authorization'],
    credentials: true,
    maxAge: 86400, // 24 hours
  },
  csrf: {
    headerName: 'X-CSRF-Token',
    cookieName: 'csrf_token',
    exemptMethods: ['GET', 'HEAD', 'OPTIONS'],
  },
};
