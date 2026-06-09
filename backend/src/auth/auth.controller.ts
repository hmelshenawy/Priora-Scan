import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dtos/login.dto';
import { AuthGuard } from '../guards/auth.guard';
import { UserProfileDto } from './dtos/user-profile.dto';
import { securityConfig } from '../config/security.config';

@Controller('/api/v1/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.authService.login(dto, res);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) res: Response) {
    return this.authService.logout(res);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async me(@Req() req: Request): Promise<UserProfileDto> {
    const user = req.user as any;
    return this.authService.getCurrentUser(user.email);
  }

  @Get('csrf')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async csrf(
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ csrfToken: string }> {
    const csrfToken = this.authService.getCsrfToken();
    const { csrfToken: cs } = securityConfig.cookies;
    res.cookie(cs.name, csrfToken, {
      httpOnly: cs.httpOnly,
      secure: cs.secure,
      sameSite: cs.sameSite,
      path: cs.path,
    });
    return { csrfToken };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'No refresh token provided.',
      });
    }
    return this.authService.refreshToken(refreshToken, res);
  }
}
