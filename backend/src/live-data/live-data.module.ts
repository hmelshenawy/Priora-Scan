import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DesktopAgentRepository } from '../obd/repositories/desktop-agent.repository';
import { PidsController } from './controllers/pids.controller';
import { LiveDataController } from './controllers/live-data.controller';
import { LiveDataAgentController } from './controllers/live-data-agent.controller';
import { PidDefinitionRepository } from './repositories/pid-definition.repository';
import { LiveDataSessionRepository } from './repositories/live-data-session.repository';
import { LiveDataCommandRepository } from './repositories/live-data-command.repository';
import { PidAssetImportService } from './services/pid-asset-import.service';
import { PidBuiltInSeedService } from './services/pid-built-in-seed.service';
import { PidDecoderService } from './services/pid-decoder.service';
import { LiveDataSessionService } from './services/live-data-session.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * LiveDataModule — Feature 006 Phase B.1 + Phase B.2.
 *
 * Phase B.1 ships the PID foundation:
 *   - `PIDDefinition` table (GLOBAL, no organizationId)
 *   - `pid-mvp-seed` script (11 standard Mode 01 PIDs)
 *   - `model-pids.sqlite` asset import (idempotent)
 *   - `PidDecoderService` (restricted-grammar formula evaluator)
 *   - `GET /api/v1/pids` + `GET /api/v1/pids/:id` +
 *     `GET /api/v1/pids/mode/:mode/pid/:pid`
 *
 * Phase B.2 ships the live-data thin vertical slice:
 *   - `LiveDataSession` table (tenant-scoped; child of DiagnosticSession)
 *   - `LiveDataCommand` table (FIFO queue for the Desktop Agent)
 *   - `LiveDataSessionService` (start / stop / ingest poll result)
 *   - `LiveDataController` — three web endpoints under
 *     `/api/v1/diagnostic-sessions/:id/live-data/...`
 *   - `LiveDataAgentController` — two agent endpoints under
 *     `/api/v1/obd/agents/:id/...`
 *
 * Phase B.3+ will add `LiveDataSnapshot` JSONB persistence and the
 * dashboard. The agent command-queue v2 path lands in a later sub-phase.
 */
@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [PidsController, LiveDataController, LiveDataAgentController],
  providers: [
    PidDefinitionRepository,
    LiveDataSessionRepository,
    LiveDataCommandRepository,
    DesktopAgentRepository,
    PidBuiltInSeedService,
    PidAssetImportService,
    PidDecoderService,
    LiveDataSessionService,
    PrismaService,
  ],
  exports: [
    PidDefinitionRepository,
    PidDecoderService,
    LiveDataSessionRepository,
    LiveDataCommandRepository,
    LiveDataSessionService,
  ],
})
export class LiveDataModule {}
