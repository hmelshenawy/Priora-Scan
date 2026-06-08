import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { timingSafeEqual } from 'crypto';
import { securityConfig } from '../config/security.config';

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method.toUpperCase();

    if (securityConfig.csrf.exemptMethods.includes(method)) {
      return true;
    }

    const cookieToken = request.cookies?.[securityConfig.csrf.cookieName];
    const headerToken = request.headers[securityConfig.csrf.headerName.toLowerCase()] as string | undefined;

    if (!cookieToken || !headerToken) {
      throw new ForbiddenException({
        code: 'CSRF_MISSING',
        message: 'CSRF token is required for this action.',
      });
    }

    if (cookieToken.length !== headerToken.length) {
      throw new ForbiddenException({
        code: 'CSRF_INVALID',
        message: 'Invalid or missing CSRF token. Please refresh the page and try again.',
      });
    }

    try {
      const match = timingSafeEqual(
        Buffer.from(cookieToken),
        Buffer.from(headerToken),
      );

      if (!match) {
        throw new ForbiddenException({
          code: 'CSRF_INVALID',
          message: 'Invalid or missing CSRF token. Please refresh the page and try again.',
        });
      }
    } catch {
      throw new ForbiddenException({
        code: 'CSRF_INVALID',
        message: 'Invalid or missing CSRF token. Please refresh the page and try again.',
      });
    }

    return true;
  }
}
