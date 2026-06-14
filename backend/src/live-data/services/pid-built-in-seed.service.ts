import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BUILT_IN_MVP_PIDS } from '../constants/built-in-pids';
import { PidDefinitionRepository } from '../repositories/pid-definition.repository';

@Injectable()
export class PidBuiltInSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PidBuiltInSeedService.name);

  constructor(private readonly repo: PidDefinitionRepository) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.run();
  }

  async run(): Promise<{ upserted: number }> {
    for (const pid of BUILT_IN_MVP_PIDS) {
      await this.repo.upsert({
        namespace: pid.namespace,
        mode: pid.mode,
        pid: pid.pid,
        name: pid.name,
        unit: pid.unit,
        formula: pid.formula,
        min: pid.min === null ? null : new Prisma.Decimal(pid.min),
        max: pid.max === null ? null : new Prisma.Decimal(pid.max),
        source: pid.source,
      });
    }

    this.logger.log(`Ensured ${BUILT_IN_MVP_PIDS.length} built-in STD_OBD2 PID definitions.`);
    return { upserted: BUILT_IN_MVP_PIDS.length };
  }
}
