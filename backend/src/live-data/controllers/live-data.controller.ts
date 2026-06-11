import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import '../../types/auth.types';
import { LiveDataSessionService } from '../services/live-data-session.service';
import { AuthGuard } from '../../guards/auth.guard';
import { TenantGuard } from '../../guards/tenant.guard';
import { RbacGuard } from '../../guards/rbac.guard';
import { CsrfGuard } from '../../guards/csrf.guard';
import { Permissions } from '../../decorators/permissions.decorator';

interface StartLiveDataBody {
  agentId?: string;
  cadenceMs?: number;
}

@Controller('api/v1/diagnostic-sessions/:diagnosticSessionId/live-data')
@UseGuards(AuthGuard, TenantGuard, RbacGuard)
export class LiveDataController {
  constructor(private readonly service: LiveDataSessionService) {}

  @Post('start')
  @UseGuards(CsrfGuard)
  @Permissions('update:diagnostic-session')
  @HttpCode(HttpStatus.OK)
  async start(
    @Param('diagnosticSessionId') diagnosticSessionId: string,
    @Body() body: StartLiveDataBody,
    @Req() req: Request,
  ) {
    const organizationId = req.organizationId!;
    const userId = req.user!.sub;
    if (!body || !body.agentId || typeof body.agentId !== 'string') {
      throw new BadRequestException({
        code: 'AGENT_ID_REQUIRED',
        message: 'agentId is required.',
      });
    }
    const session = await this.service.start({
      diagnosticSessionId,
      organizationId,
      userId,
      agentId: body.agentId,
      cadenceMs: typeof body.cadenceMs === 'number' ? body.cadenceMs : undefined,
    });
    return this.service.toStartPayload(session);
  }

  @Post('stop')
  @UseGuards(CsrfGuard)
  @Permissions('update:diagnostic-session')
  @HttpCode(HttpStatus.OK)
  async stop(
    @Param('diagnosticSessionId') diagnosticSessionId: string,
    @Body() body: { liveDataSessionId?: string },
    @Req() req: Request,
  ) {
    const organizationId = req.organizationId!;
    if (!body || !body.liveDataSessionId) {
      throw new BadRequestException({
        code: 'LIVE_DATA_SESSION_ID_REQUIRED',
        message: 'liveDataSessionId is required.',
      });
    }
    // Verify the session belongs to the diagnostic session in the URL.
    const current = await this.service.getCurrent(diagnosticSessionId, organizationId);
    if (current && current.sessionId === body.liveDataSessionId) {
      const session = await this.service.stop(body.liveDataSessionId, organizationId);
      return this.service.toCurrentPayload(session);
    }
    // No active session, or stale. Look up the live session directly
    // and stop it.
    const session = await this.service.stop(body.liveDataSessionId, organizationId);
    return this.service.toCurrentPayload(session);
  }

  @Get('current')
  @Permissions('read:diagnostic-session')
  async current(@Param('diagnosticSessionId') diagnosticSessionId: string, @Req() req: Request) {
    const organizationId = req.organizationId!;
    return this.service.getCurrent(diagnosticSessionId, organizationId);
  }
}
