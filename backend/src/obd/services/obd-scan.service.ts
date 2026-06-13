import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScanJobRepository } from '../repositories/scan-job.repository';
import { DesktopAgentRepository } from '../repositories/desktop-agent.repository';
import { VinResolutionService } from './vin-resolution.service';
import { FaultCodeImportService } from './fault-code-import.service';
import { VehicleDecodeService } from '../../vehicles/services/vehicle-decode.service';
import { VehicleDecodeRepository } from '../../vehicles/repositories/vehicle-decode.repository';
import { VehicleDecodeResponseDto } from '../../vehicles/dtos/vehicle-decode-response.dto';
import { CreateScanJobDto } from '../dtos/create-scan-job.dto';
import { ConfirmVehicleDto } from '../dtos/confirm-vehicle.dto';
import { ScanJobResponseDto } from '../dtos/scan-job-response.dto';
import { FaultCodeImportDto } from '../dtos/fault-code-import.dto';
import { ScanJobStatus } from '../types/scan-job-status.enum';
import { AgentStatus } from '../types/agent-status.enum';
import { Prisma } from '@prisma/client';

@Injectable()
export class ObdScanService {
  private readonly logger = new Logger(ObdScanService.name);

  constructor(
    private prisma: PrismaService,
    private scanJobRepository: ScanJobRepository,
    private agentRepository: DesktopAgentRepository,
    private vinResolutionService: VinResolutionService,
    private faultCodeImportService: FaultCodeImportService,
    private vehicleDecodeService: VehicleDecodeService,
    private vehicleDecodeRepository: VehicleDecodeRepository,
  ) {}

  async createScan(
    dto: CreateScanJobDto,
    organizationId: string,
    userId: string,
    agentId: string,
  ): Promise<ScanJobResponseDto> {
    const agent = await this.agentRepository.findById(agentId, organizationId);
    if (!agent) {
      throw new NotFoundException({
        code: 'AGENT_NOT_FOUND',
        message: 'The agent does not exist or you do not have access to it.',
      });
    }
    if (agent.status !== AgentStatus.ONLINE) {
      throw new ConflictException({
        code: 'AGENT_OFFLINE',
        message: 'Your Desktop Agent is offline. Please ensure it is running.',
      });
    }

    const scanJob = await this.prisma.$transaction(async (tx) => {
      const job = await tx.scanJob.create({
        data: {
          organizationId,
          userId,
          agentId,
          vehicleId: dto.vehicleId ?? null,
          status: ScanJobStatus.PENDING,
        },
      });

      await tx.scanJobAuditRecord.create({
        data: {
          organizationId,
          userId,
          scanJobId: job.id,
          action: 'SCAN_STARTED',
          status: ScanJobStatus.PENDING,
        },
      });

      return job;
    });

    return this.toScanJobResponse(scanJob);
  }

  async cancelScan(
    scanJobId: string,
    organizationId: string,
    userId: string,
  ): Promise<ScanJobResponseDto> {
    const scan = await this.scanJobRepository.findById(scanJobId, organizationId);
    if (!scan) {
      throw new NotFoundException({
        code: 'SCAN_JOB_NOT_FOUND',
        message: 'The scan job does not exist or you do not have access to it.',
      });
    }

    this.validateTransition(scan.status as ScanJobStatus, ScanJobStatus.CANCELLED);

    await this.prisma.$transaction(async (tx) => {
      await tx.scanJob.updateMany({
        where: { id: scanJobId, organizationId },
        data: { status: ScanJobStatus.CANCELLED },
      });

      await tx.scanJobAuditRecord.create({
        data: {
          organizationId,
          userId,
          scanJobId,
          action: 'SCAN_CANCELLED',
          status: ScanJobStatus.CANCELLED,
        },
      });
    });

    const updated = await this.scanJobRepository.findById(scanJobId, organizationId);
    return this.toScanJobResponse(updated!);
  }

  async processVinRead(
    scanJobId: string,
    organizationId: string,
    vin: string,
  ): Promise<{ status: ScanJobStatus; vehicleId?: string }> {
    const scan = await this.scanJobRepository.findById(scanJobId, organizationId);
    if (!scan) {
      throw new NotFoundException({
        code: 'SCAN_JOB_NOT_FOUND',
        message: 'Scan job not found.',
      });
    }

    if (!this.vinResolutionService.validateVin(vin)) {
      throw new ConflictException({
        code: 'VIN_READ_FAILED',
        message: 'Invalid VIN format.',
      });
    }

    await this.decodeVinForScan(vin, organizationId, scan.userId);

    const vehicle = await this.vinResolutionService.resolve(vin, organizationId);

    if (vehicle) {
      await this.prisma.scanJob.updateMany({
        where: { id: scanJobId, organizationId },
        data: { vin, vehicleId: vehicle.id },
      });

      return { status: ScanJobStatus.RUNNING, vehicleId: vehicle.id };
    }

    await this.prisma.scanJob.updateMany({
      where: { id: scanJobId, organizationId },
      data: { vin, status: ScanJobStatus.NEEDS_VEHICLE_CONFIRMATION },
    });

    return { status: ScanJobStatus.NEEDS_VEHICLE_CONFIRMATION };
  }

  async confirmVehicle(
    scanJobId: string,
    dto: ConfirmVehicleDto,
    organizationId: string,
    userId: string,
  ): Promise<ScanJobResponseDto> {
    const scan = await this.scanJobRepository.findById(scanJobId, organizationId);
    if (!scan) {
      throw new NotFoundException({
        code: 'SCAN_JOB_NOT_FOUND',
        message: 'Scan job not found.',
      });
    }

    if (scan.status !== ScanJobStatus.NEEDS_VEHICLE_CONFIRMATION) {
      throw new ConflictException({
        code: 'SCAN_JOB_INVALID_STATE',
        message: 'Vehicle confirmation is not required for this scan.',
      });
    }

    const scanJob = await this.prisma.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.create({
        data: {
          organizationId,
          make: dto.make,
          model: dto.model,
          year: dto.year,
          vin: dto.vin,
          plateNumber: dto.plateNumber ?? null,
          engine: dto.engine ?? null,
          bodyStyle: dto.bodyStyle ?? null,
        },
      });

      await tx.vehicleAuditRecord.create({
        data: {
          organizationId,
          userId,
          entityId: vehicle.id,
          action: 'vehicle:created',
          metadata: {
            make: vehicle.make,
            model: vehicle.model,
            year: vehicle.year,
            vin: vehicle.vin,
            plateNumber: vehicle.plateNumber,
            engine: vehicle.engine,
            bodyStyle: vehicle.bodyStyle,
          },
        },
      });

      const updated = await tx.scanJob.update({
        where: { id: scanJobId },
        data: {
          vehicleId: vehicle.id,
          status: ScanJobStatus.RUNNING,
        },
      });

      return updated;
    });

    return this.toScanJobResponse(scanJob);
  }

  async createSessionFromScan(
    scanJobId: string,
    organizationId: string,
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    const client = tx ?? this.prisma;

    const scan = await client.scanJob.findFirst({
      where: { id: scanJobId, organizationId },
    });
    if (!scan || !scan.vehicleId) {
      throw new ConflictException({
        code: 'SCAN_JOB_INVALID_STATE',
        message: 'Cannot create session without a resolved vehicle.',
      });
    }

    const vehicle = await client.vehicle.findFirst({
      where: { id: scan.vehicleId, organizationId },
    });
    if (!vehicle) {
      throw new NotFoundException({
        code: 'VEHICLE_NOT_FOUND',
        message: 'Vehicle not found.',
      });
    }

    const number = this.buildSessionNumber();
    const title = `OBD Scan — ${vehicle.make} ${vehicle.model}`;

    const session = await client.diagnosticSession.create({
      data: {
        organizationId,
        vehicleId: scan.vehicleId,
        number,
        status: 'OPEN',
        title,
        createdBy: userId,
      },
    });

    await client.diagnosticSessionAuditRecord.create({
      data: {
        organizationId,
        userId,
        sessionId: session.id,
        action: 'SESSION_CREATED',
        status: 'OPEN',
        metadata: {
          title,
          source: 'OBD_SCAN',
        },
      },
    });

    await client.scanJob.update({
      where: { id: scanJobId },
      data: { diagnosticSessionId: session.id },
    });

    return session.id;
  }

  async completeScan(
    scanJobId: string,
    organizationId: string,
    userId: string,
    faultCodes: FaultCodeImportDto[],
  ): Promise<ScanJobResponseDto> {
    const scan = await this.scanJobRepository.findById(scanJobId, organizationId);
    if (!scan) {
      throw new NotFoundException({
        code: 'SCAN_JOB_NOT_FOUND',
        message: 'Scan job not found.',
      });
    }

    if (scan.status !== ScanJobStatus.RUNNING) {
      throw new ConflictException({
        code: 'SCAN_JOB_INVALID_STATE',
        message: 'Scan must be running to complete.',
      });
    }

    if (!scan.diagnosticSessionId) {
      throw new ConflictException({
        code: 'SCAN_JOB_INVALID_STATE',
        message: 'No diagnostic session linked to this scan.',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await this.faultCodeImportService.importFaultCodes(
        scanJobId,
        scan.diagnosticSessionId!,
        organizationId,
        scan.userId,
        faultCodes,
        tx,
      );

      await tx.scanJob.updateMany({
        where: { id: scanJobId, organizationId },
        data: {
          status: ScanJobStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      await tx.scanJobAuditRecord.create({
        data: {
          organizationId,
          userId,
          scanJobId,
          action: 'SCAN_COMPLETED',
          status: ScanJobStatus.COMPLETED,
        },
      });
    });

    const updated = await this.scanJobRepository.findById(scanJobId, organizationId);
    return this.toScanJobResponse(updated!);
  }

  async failScan(
    scanJobId: string,
    organizationId: string,
    userId: string,
    errorMessage: string,
  ): Promise<ScanJobResponseDto> {
    const scan = await this.scanJobRepository.findById(scanJobId, organizationId);
    if (!scan) {
      throw new NotFoundException({
        code: 'SCAN_JOB_NOT_FOUND',
        message: 'Scan job not found.',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.scanJob.updateMany({
        where: { id: scanJobId, organizationId },
        data: {
          status: ScanJobStatus.FAILED,
          errorMessage,
          completedAt: new Date(),
        },
      });

      await tx.scanJobAuditRecord.create({
        data: {
          organizationId,
          userId,
          scanJobId,
          action: 'SCAN_FAILED',
          status: ScanJobStatus.FAILED,
          metadata: { errorMessage },
        },
      });
    });

    const updated = await this.scanJobRepository.findById(scanJobId, organizationId);
    return this.toScanJobResponse(updated!);
  }

  async toScanJobResponse(entity: {
    id: string;
    status: ScanJobStatus | string;
    vehicleId: string | null;
    diagnosticSessionId: string | null;
    vin: string | null;
    adapterType: string | null;
    adapterProtocol: string | null;
    errorMessage: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
  }): Promise<ScanJobResponseDto> {
    const decodedVehicle = await this.findCachedDecodedVehicle(entity.vin);
    return ScanJobResponseDto.fromEntity(entity, decodedVehicle);
  }

  private async decodeVinForScan(
    vin: string,
    organizationId: string,
    userId: string,
  ): Promise<void> {
    try {
      await this.vehicleDecodeService.decodeVin(vin, organizationId, userId);
    } catch (err) {
      this.logger.warn(`OBD VIN decode unavailable for ${vin}: ${(err as Error).message}`);
    }
  }

  private async findCachedDecodedVehicle(
    vin: string | null,
  ): Promise<VehicleDecodeResponseDto | null> {
    if (!vin) {
      return null;
    }
    const cached = await this.vehicleDecodeRepository.findByVin(vin.trim().toUpperCase());
    return cached ? VehicleDecodeResponseDto.fromEntity(cached, 'cache') : null;
  }

  private validateTransition(current: ScanJobStatus, next: ScanJobStatus): void {
    const allowed: Record<ScanJobStatus, ScanJobStatus[]> = {
      [ScanJobStatus.PENDING]: [ScanJobStatus.RUNNING, ScanJobStatus.CANCELLED],
      [ScanJobStatus.RUNNING]: [
        ScanJobStatus.NEEDS_VEHICLE_CONFIRMATION,
        ScanJobStatus.COMPLETED,
        ScanJobStatus.FAILED,
        ScanJobStatus.CANCELLED,
      ],
      [ScanJobStatus.NEEDS_VEHICLE_CONFIRMATION]: [ScanJobStatus.RUNNING, ScanJobStatus.CANCELLED],
      [ScanJobStatus.COMPLETED]: [],
      [ScanJobStatus.FAILED]: [],
      [ScanJobStatus.CANCELLED]: [],
    };

    if (!allowed[current].includes(next)) {
      throw new ConflictException({
        code: 'SCAN_JOB_INVALID_STATE',
        message: `Cannot transition scan from ${current} to ${next}.`,
      });
    }
  }

  private buildSessionNumber(): string {
    const prefix = 'DS';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const suffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}-${timestamp}-${suffix}`;
  }
}
