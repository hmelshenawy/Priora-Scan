import '../../types/auth.types';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { CreateDiagnosticSessionDto } from '../dtos/create-diagnostic-session.dto';
import { UpdateDiagnosticSessionDto } from '../dtos/update-diagnostic-session.dto';
import { ListDiagnosticSessionsQueryDto } from '../dtos/list-diagnostic-sessions-query.dto';
import { DiagnosticSessionsService } from '../services/diagnostic-sessions.service';
import { AuthGuard } from '../../guards/auth.guard';
import { TenantGuard } from '../../guards/tenant.guard';
import { RbacGuard } from '../../guards/rbac.guard';
import { CsrfGuard } from '../../guards/csrf.guard';
import { Permissions } from '../../decorators/permissions.decorator';

@Controller('api/v1')
@UseGuards(AuthGuard, TenantGuard, RbacGuard)
export class DiagnosticSessionsController {
  constructor(private readonly diagnosticSessionsService: DiagnosticSessionsService) {}

  @Post('vehicles/:vehicleId/diagnostic-sessions')
  @UseGuards(CsrfGuard)
  @HttpCode(HttpStatus.CREATED)
  @Permissions('create:diagnostic-session')
  async create(
    @Param('vehicleId') vehicleId: string,
    @Body() payload: CreateDiagnosticSessionDto,
    @Req() req: Request,
  ) {
    const organizationId = req.organizationId!;
    const userId = req.user!.sub;

    return this.diagnosticSessionsService.create(
      organizationId,
      vehicleId,
      userId,
      payload,
    );
  }

  @Get('vehicles/:vehicleId/diagnostic-sessions')
  @Permissions('read:diagnostic-session')
  async list(
    @Param('vehicleId') vehicleId: string,
    @Query() query: ListDiagnosticSessionsQueryDto,
    @Req() req: Request,
  ) {
    const organizationId = req.organizationId!;
    return this.diagnosticSessionsService.listForVehicle(
      organizationId,
      vehicleId,
      query.page,
      query.limit,
    );
  }

  @Get('diagnostic-sessions/:sessionId')
  @Permissions('read:diagnostic-session')
  async get(
    @Param('sessionId') sessionId: string,
    @Req() req: Request,
  ) {
    const organizationId = req.organizationId!;
    return this.diagnosticSessionsService.getById(organizationId, sessionId);
  }

  @Patch('diagnostic-sessions/:sessionId')
  @UseGuards(CsrfGuard)
  @Permissions('update:diagnostic-session')
  async update(
    @Param('sessionId') sessionId: string,
    @Body() payload: UpdateDiagnosticSessionDto,
    @Req() req: Request,
  ) {
    const organizationId = req.organizationId!;
    const userId = req.user!.sub;
    return this.diagnosticSessionsService.update(
      organizationId,
      sessionId,
      userId,
      payload,
    );
  }

  @Get('diagnostic-sessions/:sessionId/audit')
  @Permissions('read:diagnostic-session')
  async getAuditTrail(
    @Param('sessionId') sessionId: string,
    @Req() req: Request,
  ) {
    const organizationId = req.organizationId!;
    return this.diagnosticSessionsService.getAuditTrail(
      organizationId,
      sessionId,
    );
  }
}
