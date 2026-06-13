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
import { VehicleDataService } from '../services/vehicle-data.service';
import { AuthGuard } from '../../guards/auth.guard';
import { TenantGuard } from '../../guards/tenant.guard';
import { RbacGuard } from '../../guards/rbac.guard';
import { CsrfGuard } from '../../guards/csrf.guard';
import { Permissions } from '../../decorators/permissions.decorator';

/**
 * VehicleDataController — Feature 009 Phase A.
 *
 * Endpoints:
 *   - POST /api/v1/diagnostic-sessions/:sessionId/vehicle-data/read
 *     Queue a one-shot vehicle data read command for the Desktop Agent.
 *   - GET /api/v1/diagnostic-sessions/:sessionId/vehicle-data
 *     Return the last-read vehicle data for a session.
 */
@Controller('api/v1/diagnostic-sessions/:sessionId/vehicle-data')
@UseGuards(AuthGuard, TenantGuard, RbacGuard)
export class VehicleDataController {
  constructor(private readonly service: VehicleDataService) {}

  @Post('read')
  @UseGuards(CsrfGuard)
  @Permissions('update:diagnostic-session')
  @HttpCode(HttpStatus.ACCEPTED)
  async queueRead(
    @Param('sessionId') sessionId: string,
    @Req() req: Request,
  ) {
    const organizationId = req.organizationId!;
    const userId = req.user!.sub;
    return this.service.queueRead(sessionId, organizationId, userId);
  }

  @Get()
  @Permissions('read:diagnostic-session')
  async getVehicleData(
    @Param('sessionId') sessionId: string,
    @Req() req: Request,
  ) {
    const organizationId = req.organizationId!;
    return this.service.getVehicleData(sessionId, organizationId);
  }
}