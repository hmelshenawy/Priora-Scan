import {
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentPairingService } from '../services/agent-pairing.service';
import { AgentHeartbeatService } from '../services/agent-heartbeat.service';
import { ObdScanService } from '../services/obd-scan.service';
import { ScanJobRepository } from '../repositories/scan-job.repository';
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
  async heartbeat(
    @Param('id') id: string,
    @Body() dto: AgentHeartbeatDto,
    @Headers('x-agent-token') token: string,
  ) {
    await this.validateAgentToken(id, token);
    await this.heartbeatService.processHeartbeat(id, dto);
    return { success: true };
  }

  @Post(':id/adapter-status')
  async adapterStatus(
    @Param('id') id: string,
    @Body() body: { status: string; adapterType?: string; connectionType?: string; protocol?: string; errorMessage?: string },
    @Headers('x-agent-token') token: string,
  ) {
    await this.validateAgentToken(id, token);
    // TODO: Store adapter status in AdapterConnection model (Phase 10)
    return { success: true };
  }

  @Get(':id/scan-queue')
  async scanQueue(
    @Param('id') id: string,
    @Headers('x-agent-token') token: string,
  ) {
    const agent = await this.validateAgentToken(id, token);

    const job = await this.scanJobRepository.findPendingForAgent(
      id,
      agent.organizationId,
    );
    if (!job) {
      return null;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.scanJob.updateMany({
        where: { id: job.id },
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

    return {
      scanJobId: job.id,
      commands: [
        { type: 'CONNECT_ADAPTER', timeoutMs: 10000 },
        { type: 'READ_VIN', timeoutMs: 30000 },
        { type: 'READ_DTCS', timeoutMs: 30000 },
      ],
    };
  }

  @Post(':id/scan-events')
  async scanEvents(
    @Param('id') id: string,
    @Body() body: {
      scanJobId: string;
      event: ScanEventType;
      payload: Record<string, unknown>;
    },
    @Headers('x-agent-token') token: string,
  ) {
    await this.validateAgentToken(id, token);

    const scan = await this.prisma.scanJob.findFirst({
      where: { id: body.scanJobId, agentId: id },
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

  private async validateAgentToken(
    agentId: string,
    token: string,
  ) {
    if (!token) {
      throw new UnauthorizedException({
        code: 'AGENT_TOKEN_MISSING',
        message: 'Agent token is missing.',
      });
    }

    const agent = await this.prisma.desktopAgent.findFirst({
      where: { id: agentId },
    });
    if (!agent) {
      throw new UnauthorizedException({
        code: 'AGENT_NOT_FOUND',
        message: 'Agent not found.',
      });
    }

    // TODO: Hash and compare access token (Phase 10)
    return agent;
  }
}
