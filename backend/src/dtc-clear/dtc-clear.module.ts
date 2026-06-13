import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { LiveDataCommandRepository } from '../live-data/repositories/live-data-command.repository';
import { SessionFaultCodeRepository } from '../obd/repositories/session-fault-code.repository';
import { VehicleDataRepository } from '../vehicle-data/repositories/vehicle-data.repository';
import { DtcClearController } from './controllers/dtc-clear.controller';
import { DtcClearService } from './services/dtc-clear.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * DtcClearModule — Feature 009 Phase B.
 *
 * Provides safe DTC clearing for a Diagnostic Session:
 *   - `DtcClearController` — POST /fault-codes/clear, GET /fault-codes/clear-status
 *   - `DtcClearService` — queue clear, process agent events, prevent concurrent clears
 *   - `DtcClearResponseDto` — response shape with validation
 *
 * Agent pushes DTC_CLEARED / DTC_CLEAR_FAILED events via the existing ObdModule webhook.
 * Tracking uses DiagnosticSessionAuditRecord (no dedicated table).
 */
@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [DtcClearController],
  providers: [
    DtcClearService,
    LiveDataCommandRepository,
    SessionFaultCodeRepository,
    VehicleDataRepository,
    PrismaService,
  ],
  exports: [DtcClearService],
})
export class DtcClearModule {}
