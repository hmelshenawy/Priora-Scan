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
    const key = normalizePidKey(namespace, mode, pid);
    return this.prisma.pIDDefinition.findUnique({
      where: { namespace_mode_pid: key },
    });
  }

  async findByModeAndPid(mode: string, pid: string) {
    const key = normalizePidKey('', mode, pid);
    return this.prisma.pIDDefinition.findMany({
      where: { mode: key.mode, pid: key.pid },
      orderBy: { namespace: 'asc' },
    });
  }

  async findByNamespace(namespace: string) {
    return this.prisma.pIDDefinition.findMany({
      where: { namespace: normalizeNamespace(namespace) },
      orderBy: [{ mode: 'asc' }, { pid: 'asc' }],
    });
  }

  async findByMode(mode: string) {
    return this.prisma.pIDDefinition.findMany({
      where: { mode: normalizeMode(mode) },
      orderBy: [{ namespace: 'asc' }, { pid: 'asc' }],
    });
  }

  async list() {
    return this.prisma.pIDDefinition.findMany({
      orderBy: [{ namespace: 'asc' }, { mode: 'asc' }, { pid: 'asc' }],
    });
  }

  async upsert(data: Prisma.PIDDefinitionUncheckedCreateInput) {
    const key = normalizePidKey(
      String(data.namespace),
      String(data.mode),
      String(data.pid),
    );
    const normalizedData = { ...data, ...key };
    return this.prisma.pIDDefinition.upsert({
      where: {
        namespace_mode_pid: key,
      },
      create: normalizedData,
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
      rows.map((row) => {
        const key = normalizePidKey(
          String(row.namespace),
          String(row.mode),
          String(row.pid),
        );
        const normalizedRow = { ...row, ...key };
        return this.prisma.pIDDefinition.upsert({
          where: {
            namespace_mode_pid: key,
          },
          create: normalizedRow,
          update: {
            name: row.name,
            unit: row.unit,
            formula: row.formula,
            min: row.min,
            max: row.max,
            source: row.source ?? 'model-pids-sqlite',
          },
        });
      }),
    );
  }

  async count() {
    return this.prisma.pIDDefinition.count();
  }
}

export function normalizePidKey(namespace: string, mode: string, pid: string) {
  const normalizedMode = normalizeMode(mode);
  let normalizedPid = normalizePid(pid);
  const normalizedNamespace = normalizeNamespace(namespace);
  if (
    normalizedNamespace === 'STD_OBD2' &&
    normalizedMode === '01' &&
    normalizedPid.length > 2 &&
    normalizedPid.startsWith(normalizedMode) &&
    normalizedMode.length === 2
  ) {
    normalizedPid = normalizePid(normalizedPid.slice(normalizedMode.length));
  }
  if (normalizedPid.length === 1) {
    normalizedPid = normalizedPid.padStart(2, '0');
  }

  return {
    namespace: normalizedNamespace,
    mode: normalizedMode,
    pid: normalizedPid,
  };
}

export function normalizeNamespace(namespace: string) {
  return (namespace ?? '').trim().toUpperCase();
}

export function normalizeMode(mode: string) {
  return normalizePid(mode).padStart(2, '0');
}

export function normalizePid(pid: string) {
  return (pid ?? '').trim().replace(/\s+/g, '').toUpperCase();
}
