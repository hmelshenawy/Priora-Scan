import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { LoginDto } from './dtos/login.dto';
import { UserProfileDto } from './dtos/user-profile.dto';
import { securityConfig } from '../config/security.config';
import { ROLE_PERMISSIONS } from './constants/role-permissions';

export interface AuthUser {
  sub: string;
  email: string;
  organizationId: string;
  roles: string[];
  permissions: string[];
}

const MOCK_USERS: Record<string, { sub: string; email: string; organizationId: string; roles: string[] }> = {
  'tech@workshop.com': {
    sub: '00000000-0000-0000-0000-000000000001',
    email: 'tech@workshop.com',
    organizationId: '00000000-0000-0000-0000-000000000002',
    roles: ['technician'],
  },
  'advisor@workshop.com': {
    sub: '00000000-0000-0000-0000-000000000003',
    email: 'advisor@workshop.com',
    organizationId: '00000000-0000-0000-0000-000000000002',
    roles: ['service_advisor'],
  },
  'manager@workshop.com': {
    sub: '00000000-0000-0000-0000-000000000004',
    email: 'manager@workshop.com',
    organizationId: '00000000-0000-0000-0000-000000000002',
    roles: ['workshop_manager'],
  },
};

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

  async login(dto: LoginDto, res: Response): Promise<{ user: AuthUser }> {
    if (dto.password.length < 6) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }

    const profile = MOCK_USERS[dto.email];
    if (!profile) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }

    const permissions = this.resolvePermissions(profile.roles);
    const user: AuthUser = {
      ...profile,
      permissions,
    };

    const accessToken = this.jwtService.sign(user, {
      expiresIn: securityConfig.jwt.accessTokenExpiry,
    });

    const refreshToken = this.jwtService.sign(
      { sub: user.sub },
      { expiresIn: securityConfig.jwt.refreshTokenExpiry },
    );

    const csrfToken = this.generateCsrfToken();

    this.setCookies(res, accessToken, refreshToken, csrfToken);

    return { user };
  }

  async logout(res: Response): Promise<{ message: string }> {
    this.clearCookies(res);
    return { message: 'Logged out successfully.' };
  }

  getCurrentUser(email: string): UserProfileDto {
    const profile = MOCK_USERS[email];
    if (!profile) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'User not found.',
      });
    }
    const permissions = this.resolvePermissions(profile.roles);
    return {
      id: profile.sub,
      email: profile.email,
      organizationId: profile.organizationId,
      roles: profile.roles,
      permissions,
    };
  }

  async refreshToken(
    refreshToken: string,
    res: Response,
  ): Promise<{ message: string }> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: securityConfig.jwt.secret,
      }) as { sub: string };

      const profile = Object.values(MOCK_USERS).find(
        (u) => u.sub === payload.sub,
      );
      if (!profile) {
        throw new UnauthorizedException({
          code: 'REFRESH_TOKEN_EXPIRED',
          message: 'Your session has expired. Please log in again.',
        });
      }

      const permissions = this.resolvePermissions(profile.roles);
      const user: AuthUser = {
        ...profile,
        permissions,
      };

      const accessToken = this.jwtService.sign(user, {
        expiresIn: securityConfig.jwt.accessTokenExpiry,
      });

      const newRefreshToken = this.jwtService.sign(
        { sub: user.sub },
        { expiresIn: securityConfig.jwt.refreshTokenExpiry },
      );

      const csrfToken = this.generateCsrfToken();

      this.setCookies(res, accessToken, newRefreshToken, csrfToken);

      return { message: 'Token refreshed successfully.' };
    } catch {
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_EXPIRED',
        message: 'Your session has expired. Please log in again.',
      });
    }
  }

  getCsrfToken(): string {
    return this.generateCsrfToken();
  }

  private resolvePermissions(roles: string[]): string[] {
    const permissions = new Set<string>();
    for (const role of roles) {
      const perms = ROLE_PERMISSIONS[role];
      if (perms) {
        perms.forEach((p) => permissions.add(p));
      }
    }
    return Array.from(permissions);
  }

  private generateCsrfToken(): string {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
    return Buffer.from(bytes).toString('hex');
  }

  private setCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
    csrfToken: string,
  ): void {
    const { accessToken: at, refreshToken: rt, csrfToken: cs } =
      securityConfig.cookies;

    res.cookie(at.name, accessToken, {
      httpOnly: at.httpOnly,
      secure: at.secure,
      sameSite: at.sameSite,
      path: at.path,
      maxAge: at.maxAge,
    });

    res.cookie(rt.name, refreshToken, {
      httpOnly: rt.httpOnly,
      secure: rt.secure,
      sameSite: rt.sameSite,
      path: rt.path,
      maxAge: rt.maxAge,
    });

    res.cookie(cs.name, csrfToken, {
      httpOnly: cs.httpOnly,
      secure: cs.secure,
      sameSite: cs.sameSite,
      path: cs.path,
    });
  }

  private clearCookies(res: Response): void {
    const { accessToken: at, refreshToken: rt, csrfToken: cs } =
      securityConfig.cookies;

    res.clearCookie(at.name, { path: at.path });
    res.clearCookie(rt.name, { path: rt.path });
    res.clearCookie(cs.name, { path: cs.path });
  }
}
