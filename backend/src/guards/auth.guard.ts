import '../types/auth.types';
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { securityConfig } from '../config/security.config';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.[securityConfig.cookies.accessToken.name];

    if (!token) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Please provide a valid bearer token.',
      });
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: securityConfig.jwt.secret,
      });
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException({
        code: 'TOKEN_EXPIRED',
        message: 'Your session has expired. Please log in again.',
      });
    }
  }
}
