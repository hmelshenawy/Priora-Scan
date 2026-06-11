import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { FaultCodesController } from './controllers/fault-codes.controller';
import { MasterFaultCodeRepository } from './repositories/master-fault-code.repository';
import { DefaultFaultCodeEnrichmentService } from './services/default-fault-code-enrichment.service';
import { FAULT_CODE_ENRICHMENT } from './services/fault-code-enrichment.service';

/**
 * Fault Code Intelligence module.
 *
 * Exposes:
 *  - GET /fault-codes/:code  (enriched fault code lookup)
 *  - FAULT_CODE_ENRICHMENT token (for use by other modules that
 *    need to attach enrichment to their own responses, e.g. OBD
 *    scan results and Diagnostic Session responses).
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [FaultCodesController],
  providers: [
    MasterFaultCodeRepository,
    DefaultFaultCodeEnrichmentService,
    {
      provide: FAULT_CODE_ENRICHMENT,
      useClass: DefaultFaultCodeEnrichmentService,
    },
  ],
  exports: [FAULT_CODE_ENRICHMENT, MasterFaultCodeRepository],
})
export class FaultCodesModule {}
