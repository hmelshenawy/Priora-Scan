import {
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import '../../types/auth.types';
import { DtcClearService } from '../services/dtc-clear.service';
import { AuthGuard } from '../../guards/auth.guard';
import { TenantGuard } from '../../guards/tenant.guard';
import { RbacGuard } from '../../guards/rbac.guard';
import { CsrfGuard } from '../../guards/csrf.guard';
import { Permissions } from '../../decorators/permissions.decorator';

/**
 * DtcClearController — Feature 009 Phase B.
 *
 * Endpoints:
 *   - POST /api/v1/diagnostic-sessions/:sessionId/fault-codes/clear
 *     Queue a DTC clear command for the Desktop Agent.
 *   - GET /api/v1/diagnostic-sessions/:sessionId/fault-codes/clear-status
 *     Return the current DTC clear status for a session.
 */
@Controller('api/v1/diagnostic-sessions/:sessionId/fault-codes')
@UseGuards(AuthGuard, TenantGuard, RbacGuard)
export class DtcClearController {
  constructor(private readonly service: DtcClearService) {}

  @Post('clear')
  @UseGuards(CsrfGuard)
  @Permissions('update:diagnostic-session')
  @HttpCode(HttpStatus.ACCEPTED)
  async queueClear(
    @Param('sessionId') sessionId: string,
    @Req() req: Request,
  ) {
    const organizationId = req.organizationId!;
    const userId = req.user!.sub;
    return this.service.queueClear(sessionId, organizationId, userId);
  }

  @Get('clear-status')
  @Permissions('read:diagnostic-session')
  async getClearStatus(
    @Param('sessionId') sessionId: string,
    @Req() req: Request,
  ) {
    const organizationId = req.organizationId!;
    return this.service.getClearStatus(sessionId, organizationId);
  }
}