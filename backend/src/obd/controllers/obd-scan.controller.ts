import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ObdScanService } from '../services/obd-scan.service';
import { ScanJobRepository } from '../repositories/scan-job.repository';
import { SessionFaultCodeRepository } from '../repositories/session-fault-code.repository';
import { CreateScanJobDto } from '../dtos/create-scan-job.dto';
import { ConfirmVehicleDto } from '../dtos/confirm-vehicle.dto';
import { ScanJobResponseDto } from '../dtos/scan-job-response.dto';
import { AuthGuard } from '../../guards/auth.guard';
import { TenantGuard } from '../../guards/tenant.guard';
import { RbacGuard } from '../../guards/rbac.guard';
import { Permissions } from '../../decorators/permissions.decorator';

@Controller('obd/scans')
@UseGuards(AuthGuard, TenantGuard, RbacGuard)
export class ObdScanController {
  constructor(
    private scanService: ObdScanService,
    private scanJobRepository: ScanJobRepository,
    private faultCodeRepository: SessionFaultCodeRepository,
  ) {}

  @Post()
  @Permissions('obd:scan:create')
  async createScan(
    @Body() dto: CreateScanJobDto,
    @Query('agentId') agentId: string,
    @Req() req: Request,
  ) {
    if (!agentId) {
      throw new NotFoundException({
        code: 'AGENT_NOT_FOUND',
        message: 'Agent ID is required.',
      });
    }
    const organizationId = req.organizationId!;
    const userId = req.user!.sub;
    return this.scanService.createScan(dto, organizationId, userId, agentId);
  }

  @Get()
  @Permissions('obd:scan:read')
  async listScans(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Req() req: Request,
  ) {
    const organizationId = req.organizationId!;
    const result = await this.scanJobRepository.findByOrganization(
      organizationId,
      parseInt(page || '1', 10),
      parseInt(limit || '25', 10),
    );
    return {
      data: result.data.map(ScanJobResponseDto.fromEntity),
      total: result.total,
    };
  }

  @Get(':id')
  @Permissions('obd:scan:read')
  async getScan(@Param('id') id: string, @Req() req: Request) {
    const organizationId = req.organizationId!;
    const scan = await this.scanJobRepository.findById(id, organizationId);
    if (!scan) {
      throw new NotFoundException({
        code: 'SCAN_JOB_NOT_FOUND',
        message: 'Scan job not found.',
      });
    }
    return ScanJobResponseDto.fromEntity(scan);
  }

  @Post(':id/cancel')
  @Permissions('obd:scan:cancel')
  async cancelScan(@Param('id') id: string, @Req() req: Request) {
    const organizationId = req.organizationId!;
    const userId = req.user!.sub;
    return this.scanService.cancelScan(id, organizationId, userId);
  }

  @Post(':id/confirm-vehicle')
  @Permissions('obd:scan:create')
  async confirmVehicle(
    @Param('id') id: string,
    @Body() dto: ConfirmVehicleDto,
    @Req() req: Request,
  ) {
    const organizationId = req.organizationId!;
    const userId = req.user!.sub;
    return this.scanService.confirmVehicle(id, dto, organizationId, userId);
  }

  @Get(':id/results')
  @Permissions('obd:fault-code:read')
  async getResults(@Param('id') id: string, @Req() req: Request) {
    const organizationId = req.organizationId!;
    const codes = await this.faultCodeRepository.findByScanJob(
      id,
      organizationId,
    );
    return { data: codes };
  }

  @Get('sessions/:id/results')
  @Permissions('obd:fault-code:read')
  async getSessionResults(@Param('id') id: string, @Req() req: Request) {
    const organizationId = req.organizationId!;
    const codes = await this.faultCodeRepository.findBySession(
      id,
      organizationId,
    );
    return { data: codes };
  }
}
