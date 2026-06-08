import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { LoginDto } from './dtos/login.dto';
import { securityConfig } from '../config/security.config';

export interface AuthUser {
  sub: string;
  email: string;
  organizationId: string;
  permissions: string[];
}

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

  async login(dto: LoginDto, res: Response): Promise<{ user: AuthUser }> {
    // MVP: Mock credential validation.
    // In production, this must hash and verify against a User table.
    if (dto.password.length < 6) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }

    const user: AuthUser = {
      sub: '00000000-0000-0000-0000-000000000001',
      email: dto.email,
      organizationId: '00000000-0000-0000-0000-000000000002',
      permissions: [
        'create:vehicle',
        'read:vehicle',
        'update:vehicle',
      ],
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
