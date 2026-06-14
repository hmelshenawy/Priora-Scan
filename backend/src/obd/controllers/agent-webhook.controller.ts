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
import { VehicleDataRepository } from '../../vehicle-data/repositories/vehicle-data.repository';
import { VehicleDataService } from '../../vehicle-data/services/vehicle-data.service';
import { DtcClearService } from '../../dtc-clear/services/dtc-clear.service';
import { isValidVehicleDataJson } from '../../vehicle-data/dtos/vehicle-data-response.dto';

@Controller('obd/agents')
export class AgentWebhookController {
  constructor(
    private prisma: PrismaService,
    private pairingService: AgentPairingService,
    private heartbeatService: AgentHeartbeatService,
    private scanService: ObdScanService,
    private scanJobRepository: ScanJobRepository,
    private vehicleDataRepository: VehicleDataRepository,
    private vehicleDataService: VehicleDataService,
    private dtcClearService: DtcClearService,
  ) {}

  @Post('register')
  async registerAgent(
    @Body('pairingToken') pairingToken: string,
    @Body('agentName') agentName: string,
    @Body('version') version: string,
  ) {
    return this.pairingService.exchangePairingToken(pairingToken, agentName, version);
  }

  @Post(':id/heartbeat')
  @UseGuards(AgentAuthGuard)
  async heartbeat(@Param('id') id: string, @Body() dto: AgentHeartbeatDto, @Req() req: Request) {
    await this.heartbeatService.processHeartbeat(id, dto);
    return { success: true };
  }

  @Post(':id/adapter-status')
  @UseGuards(AgentAuthGuard)
  async adapterStatus(
    @Param('id') id: string,
    @Body()
    body: {
      status: string;
      adapterType?: string;
      connectionType?: string;
      protocol?: string;
      errorMessage?: string;
    },
    @Req() req: Request,
  ) {
    const agent = req.agent!;
    // TODO: Store adapter status in AdapterConnection model (Phase 10)
    // Use agent.organizationId for tenant-scoped writes when implemented.
    return { success: true };
  }

  @Get(':id/scan-queue')
  @UseGuards(AgentAuthGuard)
  async scanQueue(@Param('id') id: string, @Req() req: Request) {
    const agent = req.agent!;

    const pendingJob = await this.scanJobRepository.findPendingForAgent(id, agent.organizationId);
    const job =
      pendingJob ??
      (await this.scanJobRepository.findConfirmedRunningForAgent(id, agent.organizationId));
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
        vehicleId: job.vehicleId,
        diagnosticSessionId: job.diagnosticSessionId,
        scanJobId: job.id,
        commands: [
          ...(job.vin || job.vehicleId
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
    @Body()
    body: {
      scanJobId?: string;
      sessionId?: string;
      event: ScanEventType;
      payload: Record<string, unknown>;
    },
    @Req() req: Request,
  ) {
    const agent = req.agent!;

    // Feature 009 events use sessionId instead of scanJobId
    if (
      body.event === ScanEventType.VEHICLE_DATA_READ ||
      body.event === ScanEventType.DTC_CLEARED ||
      body.event === ScanEventType.DTC_CLEAR_FAILED
    ) {
      return this.handleFeature009Event(id, agent.organizationId, body);
    }

    // Existing Feature 004 flow — requires scanJobId
    const scanJobId = body.scanJobId;
    if (!scanJobId) {
      throw new NotFoundException({
        code: 'SCAN_JOB_NOT_FOUND',
        message: 'Scan job not found.',
      });
    }

    const scan = await this.prisma.scanJob.findFirst({
      where: { id: scanJobId, agentId: id, organizationId: agent.organizationId },
    });
    if (!scan) {
      throw new NotFoundException({
        code: 'SCAN_JOB_NOT_FOUND',
        message: 'Scan job not found.',
      });
    }

    switch (body.event) {
      case ScanEventType.VIN_READ: {
        const vin = body.payload.vin;
        const unsupportedVin =
          body.payload.supported === false ||
          body.payload.vinStatus === 'UNSUPPORTED' ||
          vin === null ||
          vin === undefined ||
          vin === '';
        if (unsupportedVin) {
          return {
            status: 'RUNNING',
            vin: null,
            supported: false,
            vinStatus: 'UNSUPPORTED',
            reason: body.payload.reason,
          };
        }

        const result = await this.scanService.processVinRead(
          scan.id,
          scan.organizationId,
          vin as string,
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
        const codes =
          (body.payload.codes as Array<{
            code: string;
            status: string;
            ecu?: string;
          }>) ?? [];
        const faultCodes = codes.map((c) => ({
          code: c.code,
          status: c.status as FaultCodeStatus,
          ecu: c.ecu,
        }));
        if (!scan.diagnosticSessionId && !scan.vehicleId) {
          await this.prisma.$transaction(async (tx) => {
            await tx.scanJob.updateMany({
              where: { id: scan.id, organizationId: scan.organizationId },
              data: { status: ScanJobStatus.NEEDS_VEHICLE_CONFIRMATION },
            });

            await tx.scanJobAuditRecord.create({
              data: {
                organizationId: scan.organizationId,
                userId: scan.userId,
                scanJobId: scan.id,
                action: 'DTC_READ_PENDING_VEHICLE',
                status: ScanJobStatus.NEEDS_VEHICLE_CONFIRMATION,
                metadata: { faultCodes },
              },
            });
          });

          return {
            status: 'NEEDS_VEHICLE_CONFIRMATION',
            reason: 'VEHICLE_REQUIRED',
          };
        }

        if (!scan.diagnosticSessionId && scan.vehicleId) {
          await this.scanService.createSessionFromScan(scan.id, scan.organizationId, scan.userId);
        }
        await this.scanService.completeScan(scan.id, scan.organizationId, scan.userId, faultCodes);
        return { status: 'COMPLETED' };
      }

      case ScanEventType.ERROR: {
        const message = (body.payload.message as string) ?? 'Unknown error';
        await this.scanService.failScan(scan.id, scan.organizationId, scan.userId, message);
        return { status: 'FAILED' };
      }

      default:
        return { status: 'OK' };
    }
  }

  /**
   * Handle Feature 009 agent events (VEHICLE_DATA_READ, DTC_CLEARED, DTC_CLEAR_FAILED).
   * These events use sessionId instead of scanJobId.
   */
  private async handleFeature009Event(
    agentId: string,
    organizationId: string,
    body: {
      sessionId?: string;
      event: ScanEventType;
      payload: Record<string, unknown>;
    },
  ) {
    const sessionId = body.sessionId;
    if (!sessionId) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: 'sessionId is required for this event type.',
      });
    }

    // Verify the session exists and belongs to the agent's organization
    const session = await this.vehicleDataRepository.findSessionById(sessionId, organizationId);
    if (!session) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: 'The diagnostic session does not exist or you do not have access to it.',
      });
    }

    switch (body.event) {
      case ScanEventType.VEHICLE_DATA_READ: {
        const vehicleData = body.payload.vehicleData as Record<string, unknown>;
        if (!vehicleData) {
          return { status: 'OK', warning: 'No vehicleData in payload' };
        }

        // Delegate to VehicleDataService for persistence + audit
        await this.vehicleDataService.processVehicleDataRead(
          sessionId,
          organizationId,
          vehicleData,
        );

        return { status: 'OK' };
      }

      case ScanEventType.DTC_CLEARED: {
        // Delegate to DtcClearService for audit + pending flag clear
        await this.dtcClearService.processClearResult(sessionId, organizationId, true);

        return { status: 'OK' };
      }

      case ScanEventType.DTC_CLEAR_FAILED: {
        const reason = (body.payload.reason as string) ?? 'Unknown failure';

        // Delegate to DtcClearService for audit + pending flag clear
        await this.dtcClearService.processClearResult(sessionId, organizationId, false, reason);

        return { status: 'OK' };
      }

      default:
        return { status: 'OK' };
    }
  }
}
