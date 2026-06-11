const configuredOrigins =
  `${process.env.ALLOWED_ORIGINS || ''},${process.env.CORS_ORIGIN || ''},http://localhost:3000,http://localhost:3001,http://localhost:3100`;

export const securityConfig = {
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    accessTokenExpiry: '15m' as const,
    refreshTokenExpiry: '7d' as const,
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
    allowedOrigins: Array.from(
      new Set(
        configuredOrigins
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    ),
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
