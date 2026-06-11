import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { VehicleDecodeRepository } from '../repositories/vehicle-decode.repository';
import { VpicAssetService } from './vpic-asset.service';
import { VehicleDecodeResponseDto } from '../dtos/vehicle-decode-response.dto';

export interface VinValidationResult {
  ok: boolean;
  reason?: string;
}

/**
 * VehicleDecodeService — Feature 006 Phase A, US1.
 *
 * Cache-aside VIN decode:
 *   1. Look up `VehicleDecode` by VIN.
 *   2. On miss, call the local VPIC asset.
 *   3. On miss-also (asset returned no record), return 404 NOT_DECODED.
 *   4. On hit, persist the asset response to the cache (idempotent upsert).
 *   5. Write a `VIN_DECODED_FROM_ASSET` audit record in the same transaction
 *      as the upsert. The audit is global (no organizationId) but uses the
 *      caller's organizationId when available for cross-tenant observability.
 *
 * Note on tenant scope (Correction 6): the cache is shared across all
 * organizations. We DO NOT include organizationId in the cache key, and we
 * do not filter queries by organizationId.
 */
@Injectable()
export class VehicleDecodeService {
  private readonly logger = new Logger(VehicleDecodeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: VehicleDecodeRepository,
    private readonly vpic: VpicAssetService,
  ) {}

  validateVin(vin: string): VinValidationResult {
    const cleaned = vin.trim().toUpperCase();
    if (cleaned.length < 3) {
      return { ok: false, reason: 'VIN must be at least 3 characters.' };
    }
    if (cleaned.length > 25) {
      return { ok: false, reason: 'VIN must be at most 25 characters.' };
    }
    if (!/^[A-Z0-9]+$/.test(cleaned)) {
      return {
        ok: false,
        reason: 'VIN must contain only letters and digits (no I, O, Q).',
      };
    }
    return { ok: true };
  }

  /**
   * Decodes a VIN, using the cache when present and the local VPIC asset
   * otherwise. Persists the asset response in the cache (audit included).
   */
  async decodeVin(
    vin: string,
    organizationId: string,
    userId: string,
  ): Promise<VehicleDecodeResponseDto> {
    const validation = this.validateVin(vin);
    if (!validation.ok) {
      throw new InvalidVinException(validation.reason ?? 'Invalid VIN.');
    }
    const normalized = vin.trim().toUpperCase();

    const cached = await this.repo.findByVin(normalized);
    if (cached) {
      return VehicleDecodeResponseDto.fromEntity(cached, 'cache');
    }

    if (!this.vpic.isReady()) {
      throw new ServiceUnavailableException({
        code: 'VPIC_ASSET_UNAVAILABLE',
        message:
          'The VIN-decoding data asset is not currently available. Please try again later.',
      });
    }

    const decoded = this.vpic.decode(normalized);
    if (!decoded) {
      throw new VehicleNotDecodedException(normalized);
    }

    const persisted = await this.prisma.$transaction(async (tx) => {
      const row = await tx.vehicleDecode.upsert({
        where: { vin: normalized },
        create: {
          vin: normalized,
          make: decoded.make ?? null,
          model: decoded.model ?? null,
          year: decoded.modelYear ?? null,
          engine: decoded.engine ?? null,
          bodyStyle: decoded.bodyStyle ?? null,
          manufacturer: decoded.manufacturer ?? null,
          source: 'vpic-asset',
        },
        update: {
          make: decoded.make ?? null,
          model: decoded.model ?? null,
          year: decoded.modelYear ?? null,
          engine: decoded.engine ?? null,
          bodyStyle: decoded.bodyStyle ?? null,
          manufacturer: decoded.manufacturer ?? null,
          source: 'vpic-asset',
        },
      });

      // The VIN decode audit is global (no vehicle entity yet). We attach
      // organizationId/userId as metadata for cross-tenant observability.
      await tx.vehicleAuditRecord.create({
        data: {
          organizationId,
          userId,
          // entityId is required by the schema; we use the cache row id as a
          // synthetic anchor. The action name disambiguates it.
          entityId: row.id,
          action: 'VIN_DECODED_FROM_ASSET',
          metadata: {
            vin: normalized,
            source: 'vpic-asset',
            make: decoded.make ?? null,
            model: decoded.model ?? null,
            year: decoded.modelYear ?? null,
            engine: decoded.engine ?? null,
            bodyStyle: decoded.bodyStyle ?? null,
            manufacturer: decoded.manufacturer ?? null,
          },
        },
      });
      return row;
    });

    return VehicleDecodeResponseDto.fromEntity(persisted, 'asset');
  }
}

export class InvalidVinException extends Error {
  readonly code = 'INVALID_VIN';
  constructor(message: string) {
    super(message);
    this.name = 'InvalidVinException';
  }
}

export class VehicleNotDecodedException extends Error {
  readonly code = 'VIN_NOT_DECODED';
  constructor(public readonly vin: string) {
    super(`VIN ${vin} could not be decoded against the local VPIC asset.`);
    this.name = 'VehicleNotDecodedException';
  }
}
