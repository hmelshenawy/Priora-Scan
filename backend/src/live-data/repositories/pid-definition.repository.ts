import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * PIDDefinitionRepository — Feature 006 Phase B.1.
 *
 * The PIDDefinition table is GLOBAL — there is no organizationId column.
 * The metadata (decoding formula, unit, range) is industry-standard and
 * identical across all tenants (Correction 6, same rationale as
 * VehicleDecodeRepository).
 */
@Injectable()
export class PidDefinitionRepository {
  constructor(private prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.pIDDefinition.findUnique({ where: { id } });
  }

  async findByNamespaceModeAndPid(namespace: string, mode: string, pid: string) {
    return this.prisma.pIDDefinition.findUnique({
      where: { namespace_mode_pid: { namespace, mode, pid } },
    });
  }

  async findByModeAndPid(mode: string, pid: string) {
    return this.prisma.pIDDefinition.findMany({
      where: { mode, pid },
      orderBy: { namespace: 'asc' },
    });
  }

  async findByNamespace(namespace: string) {
    return this.prisma.pIDDefinition.findMany({
      where: { namespace },
      orderBy: [{ mode: 'asc' }, { pid: 'asc' }],
    });
  }

  async findByMode(mode: string) {
    return this.prisma.pIDDefinition.findMany({
      where: { mode },
      orderBy: [{ namespace: 'asc' }, { pid: 'asc' }],
    });
  }

  async list() {
    return this.prisma.pIDDefinition.findMany({
      orderBy: [{ namespace: 'asc' }, { mode: 'asc' }, { pid: 'asc' }],
    });
  }

  async upsert(data: Prisma.PIDDefinitionUncheckedCreateInput) {
    return this.prisma.pIDDefinition.upsert({
      where: {
        namespace_mode_pid: {
          namespace: data.namespace,
          mode: data.mode,
          pid: data.pid,
        },
      },
      create: data,
      update: {
        name: data.name,
        unit: data.unit,
        formula: data.formula,
        min: data.min,
        max: data.max,
        source: data.source ?? 'built-in-mvp',
      },
    });
  }

  /**
   * Bulk upsert used by the asset import path. Wrapped in a single
   * transaction so the import is atomic.
   */
  async upsertMany(rows: Prisma.PIDDefinitionUncheckedCreateInput[]) {
    return this.prisma.$transaction(
      rows.map((row) =>
        this.prisma.pIDDefinition.upsert({
          where: {
            namespace_mode_pid: {
              namespace: row.namespace,
              mode: row.mode,
              pid: row.pid,
            },
          },
          create: row,
          update: {
            name: row.name,
            unit: row.unit,
            formula: row.formula,
            min: row.min,
            max: row.max,
            source: row.source ?? 'model-pids-sqlite',
          },
        }),
      ),
    );
  }

  async count() {
    return this.prisma.pIDDefinition.count();
  }
}
