import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PidsController } from './controllers/pids.controller';
import { PidDefinitionRepository } from './repositories/pid-definition.repository';
import { PidAssetImportService } from './services/pid-asset-import.service';
import { PidDecoderService } from './services/pid-decoder.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * LiveDataModule — Feature 006 Phase B.1 (and B.2+).
 *
 * Phase B.1 ships the PID foundation:
 *   - `PIDDefinition` table (GLOBAL, no organizationId)
 *   - `pid-mvp-seed` script (11 standard Mode 01 PIDs)
 *   - `model-pids.sqlite` asset import (GME namespace, Mode 22 PIDs,
 *     idempotent)
 *   - `PidDecoderService` (restricted-grammar formula evaluator)
 *   - `GET /api/v1/pids` + `GET /api/v1/pids/:id` +
 *     `GET /api/v1/pids/mode/:mode/pid/:pid`
 *
 * Phase B.2+ will add `LiveDataSession`, `LiveDataSnapshot`,
 * `LiveDataReadingCurrent`, and the agent command-queue endpoints.
 * This module's public surface is intentionally small in B.1.
 */
@Module({
  imports: [AuthModule],
  controllers: [PidsController],
  providers: [PidDefinitionRepository, PidAssetImportService, PidDecoderService, PrismaService],
  exports: [PidDefinitionRepository, PidDecoderService],
})
export class LiveDataModule {}
