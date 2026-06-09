import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentPairingService } from '../services/agent-pairing.service';
import { AgentHeartbeatService } from '../services/agent-heartbeat.service';
import { ObdScanService } from '../services/obd-scan.service';
import { ScanJobRepository } from '../repositories/scan-job.repository';
import { AgentAuthGuard } from '../../guards/agent-auth.guard';
import { AgentHeartbeatDto } from '../dtos/agent-heartbeat.dto';
import { ScanJobStatus } from '../types/scan-job-status.enum';
import { ScanEventType } from '../types/scan-event-type.enum';
import { FaultCodeStatus } from '../types/fault-code-status.enum';

@Controller('obd/agents')
export class AgentWebhookController {
  constructor(
    private prisma: PrismaService,
    private pairingService: AgentPairingService,
    private heartbeatService: AgentHeartbeatService,
    private scanService: ObdScanService,
    private scanJobRepository: ScanJobRepository,
  ) {}

  @Post('register')
  async registerAgent(
    @Body('pairingToken') pairingToken: string,
    @Body('agentName') agentName: string,
    @Body('version') version: string,
  ) {
    return this.pairingService.exchangePairingToken(
      pairingToken,
      agentName,
      version,
    );
  }

  @Post(':id/heartbeat')
  @UseGuards(AgentAuthGuard)
  async heartbeat(
    @Param('id') id: string,
    @Body() dto: AgentHeartbeatDto,
    @Req() req: Request,
  ) {
    await this.heartbeatService.processHeartbeat(id, dto);
    return { success: true };
  }

  @Post(':id/adapter-status')
  @UseGuards(AgentAuthGuard)
  async adapterStatus(
    @Param('id') id: string,
    @Body() body: { status: string; adapterType?: string; connectionType?: string; protocol?: string; errorMessage?: string },
    @Req() req: Request,
  ) {
    const agent = req.agent!;
    // TODO: Store adapter status in AdapterConnection model (Phase 10)
    // Use agent.organizationId for tenant-scoped writes when implemented.
    return { success: true };
  }

  @Get(':id/scan-queue')
  @UseGuards(AgentAuthGuard)
  async scanQueue(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const agent = req.agent!;

    const pendingJob = await this.scanJobRepository.findPendingForAgent(
      id,
      agent.organizationId,
    );
    const job =
      pendingJob ??
      (await this.scanJobRepository.findConfirmedRunningForAgent(
        id,
        agent.organizationId,
      ));
    if (!job) {
      return [];
    }

    if (pendingJob) {
      await this.prisma.$transaction(async (tx) => {
        await tx.scanJob.updateMany({
          where: { id: job.id, organizationId: agent.organizationId },
          data: { status: ScanJobStatus.RUNNING, startedAt: new Date() },
        });

        await tx.scanJobAuditRecord.create({
          data: {
            organizationId: job.organizationId,
            userId: job.userId,
            scanJobId: job.id,
            action: 'SCAN_STARTED',
            status: ScanJobStatus.RUNNING,
          },
        });
      });
    }

    return [
      {
        id: job.id,
        status: ScanJobStatus.RUNNING,
        createdAt: job.createdAt,
        vin: job.vin,
        diagnosticSessionId: job.diagnosticSessionId,
        scanJobId: job.id,
        commands: [
          ...(job.vin
            ? []
            : [
                { type: 'CONNECT_ADAPTER', timeoutMs: 10000 },
                { type: 'READ_VIN', timeoutMs: 30000 },
              ]),
          { type: 'READ_DTCS', timeoutMs: 30000 },
        ],
      },
    ];
  }

  @Post(':id/scan-events')
  @UseGuards(AgentAuthGuard)
  async scanEvents(
    @Param('id') id: string,
    @Body() body: {
      scanJobId: string;
      event: ScanEventType;
      payload: Record<string, unknown>;
    },
    @Req() req: Request,
  ) {
    const agent = req.agent!;

    const scan = await this.prisma.scanJob.findFirst({
      where: { id: body.scanJobId, agentId: id, organizationId: agent.organizationId },
    });
    if (!scan) {
      throw new NotFoundException({
        code: 'SCAN_JOB_NOT_FOUND',
        message: 'Scan job not found.',
      });
    }

    switch (body.event) {
      case ScanEventType.VIN_READ: {
        const vin = body.payload.vin as string;
        const result = await this.scanService.processVinRead(
          scan.id,
          scan.organizationId,
          vin,
        );

        if (result.vehicleId) {
          const sessionId = await this.scanService.createSessionFromScan(
            scan.id,
            scan.organizationId,
            scan.userId,
          );
          return { status: 'RUNNING', sessionId };
        }
        return { status: 'NEEDS_VEHICLE_CONFIRMATION' };
      }

      case ScanEventType.DTC_READ: {
        const codes = (body.payload.codes as Array<{
          code: string;
          status: string;
          ecu?: string;
        }>) ?? [];
        const faultCodes = codes.map((c) => ({
          code: c.code,
          status: c.status as FaultCodeStatus,
          ecu: c.ecu,
        }));
        if (!scan.diagnosticSessionId && scan.vehicleId) {
          await this.scanService.createSessionFromScan(
            scan.id,
            scan.organizationId,
            scan.userId,
          );
        }
        await this.scanService.completeScan(
          scan.id,
          scan.organizationId,
          scan.userId,
          faultCodes,
        );
        return { status: 'COMPLETED' };
      }

      case ScanEventType.ERROR: {
        const message = (body.payload.message as string) ?? 'Unknown error';
        await this.scanService.failScan(
          scan.id,
          scan.organizationId,
          scan.userId,
          message,
        );
        return { status: 'FAILED' };
      }

      default:
        return { status: 'OK' };
    }
  }
}
