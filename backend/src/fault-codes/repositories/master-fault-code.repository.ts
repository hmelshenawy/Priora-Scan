import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, MasterFaultCode } from '@prisma/client';

@Injectable()
export class MasterFaultCodeRepository {
  constructor(private prisma: PrismaService) {}

  async findByCode(code: string): Promise<MasterFaultCode | null> {
    return this.prisma.masterFaultCode.findUnique({
      where: { code: code.toUpperCase() },
    });
  }

  async findManyByCodes(codes: string[]): Promise<MasterFaultCode[]> {
    if (codes.length === 0) {
      return [];
    }
    return this.prisma.masterFaultCode.findMany({
      where: { code: { in: codes.map((c) => c.toUpperCase()) } },
    });
  }

  async upsertMany(
    rows: Prisma.MasterFaultCodeCreateManyInput[],
    tx?: Prisma.TransactionClient,
  ): Promise<{ created: number; updated: number }> {
    const client = tx ?? this.prisma;
    let created = 0;
    let updated = 0;
    for (const row of rows) {
      const result = await client.masterFaultCode.upsert({
        where: { code: row.code },
        create: row,
        update: {
          title: row.title,
          description: row.description,
          source: row.source,
          isGeneric: row.isGeneric,
          manufacturer: row.manufacturer,
        },
      });
      if (result.createdAt.getTime() === result.updatedAt.getTime()) {
        created += 1;
      } else {
        updated += 1;
      }
    }
    return { created, updated };
  }

  async count(): Promise<number> {
    return this.prisma.masterFaultCode.count();
  }
}
