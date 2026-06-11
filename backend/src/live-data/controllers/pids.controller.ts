import '../../types/auth.types';
import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PidDefinitionRepository } from '../repositories/pid-definition.repository';
import { PidResponseDto } from '../dtos/pid-response.dto';
import { AuthGuard } from '../../guards/auth.guard';
import { TenantGuard } from '../../guards/tenant.guard';
import { RbacGuard } from '../../guards/rbac.guard';

const KNOWN_NAMESPACES = new Set(['STD_OBD2', 'GME']);
const KNOWN_MODES = new Set(['01', '22']);
const DEFAULT_NAMESPACE_BY_MODE: Record<string, string> = {
  '01': 'STD_OBD2',
};

@Controller('/api/v1/pids')
@UseGuards(AuthGuard, TenantGuard, RbacGuard)
export class PidsController {
  constructor(private readonly repo: PidDefinitionRepository) {}

  /**
   * List all PID definitions. Optional `?namespace=STD_OBD2` or
   * `?mode=01` filters.
   */
  @Get()
  async list(
    @Query('namespace') namespace: string | undefined,
    @Query('mode') mode: string | undefined,
  ): Promise<{ data: PidResponseDto[]; total: number }> {
    const normalizedNamespace = namespace?.toUpperCase();
    const normalizedMode = mode?.toUpperCase();
    if (normalizedNamespace !== undefined && !KNOWN_NAMESPACES.has(normalizedNamespace)) {
      throw new BadRequestException({
        code: 'INVALID_NAMESPACE',
        message: `Unknown namespace '${namespace}'. Expected one of: ${[...KNOWN_NAMESPACES].join(', ')}.`,
      });
    }
    if (normalizedMode !== undefined && !KNOWN_MODES.has(normalizedMode)) {
      throw new BadRequestException({
        code: 'INVALID_MODE',
        message: `Unknown mode '${mode}'. Expected one of: ${[...KNOWN_MODES].join(', ')}.`,
      });
    }

    const rows = normalizedNamespace
      ? await this.repo.findByNamespace(normalizedNamespace)
      : normalizedMode
        ? await this.repo.findByMode(normalizedMode)
        : await this.repo.list();
    return {
      data: rows.map(PidResponseDto.fromEntity),
      total: rows.length,
    };
  }

  /**
   * Lookup a PID definition by its primary key.
   */
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<PidResponseDto> {
    const entity = await this.repo.findById(id);
    if (!entity) {
      throw new NotFoundException({
        code: 'PID_NOT_DEFINED',
        message: `PID definition with id ${id} not found.`,
      });
    }
    return PidResponseDto.fromEntity(entity);
  }

  /**
   * Lookup a PID definition by OBD mode and PID. Namespace may be
   * supplied as a query parameter when multiple namespaces define the
   * same mode + PID.
   */
  @Get('mode/:mode/pid/:pid')
  async findByModeAndPid(
    @Param('mode') mode: string,
    @Param('pid') pid: string,
    @Query('namespace') namespace?: string,
  ): Promise<PidResponseDto> {
    const normalizedMode = mode.toUpperCase();
    if (!KNOWN_MODES.has(normalizedMode)) {
      throw new BadRequestException({
        code: 'INVALID_MODE',
        message: `Unknown mode '${mode}'. Expected one of: ${[...KNOWN_MODES].join(', ')}.`,
      });
    }
    const normalizedPid = pid.toUpperCase();
    if (!/^[0-9A-F]{2,8}$/.test(normalizedPid)) {
      throw new BadRequestException({
        code: 'INVALID_PID',
        message: `PID '${pid}' must be 2-8 hex characters.`,
      });
    }
    const normalizedNamespace =
      namespace?.toUpperCase() ?? DEFAULT_NAMESPACE_BY_MODE[normalizedMode];
    if (normalizedNamespace !== undefined) {
      if (!KNOWN_NAMESPACES.has(normalizedNamespace)) {
        throw new BadRequestException({
          code: 'INVALID_NAMESPACE',
          message: `Unknown namespace '${namespace}'. Expected one of: ${[...KNOWN_NAMESPACES].join(', ')}.`,
        });
      }
      const entity = await this.repo.findByNamespaceModeAndPid(
        normalizedNamespace,
        normalizedMode,
        normalizedPid,
      );
      if (!entity) {
        throw new NotFoundException({
          code: 'PID_NOT_DEFINED',
          message: `PID ${normalizedNamespace}/${normalizedMode}/${normalizedPid} is not defined.`,
        });
      }
      return PidResponseDto.fromEntity(entity);
    }

    const matches = await this.repo.findByModeAndPid(normalizedMode, normalizedPid);
    if (matches.length > 1) {
      throw new BadRequestException({
        code: 'PID_NAMESPACE_REQUIRED',
        message: `PID ${normalizedMode}/${normalizedPid} exists in multiple namespaces. Supply ?namespace=...`,
      });
    }
    const entity = matches[0];
    if (!entity) {
      throw new NotFoundException({
        code: 'PID_NOT_DEFINED',
        message: `PID ${normalizedMode}/${normalizedPid} is not defined.`,
      });
    }
    return PidResponseDto.fromEntity(entity);
  }
}
