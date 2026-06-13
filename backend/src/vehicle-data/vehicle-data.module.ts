import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { LiveDataModule } from '../live-data/live-data.module';
import { VehicleDataController } from './controllers/vehicle-data.controller';
import { VehicleDataService } from './services/vehicle-data.service';
import { VehicleDataRepository } from './repositories/vehicle-data.repository';
import { PrismaService } from '../prisma/prisma.service';

/**
 * VehicleDataModule — Feature 009 Phase A.
 *
 * Provides one-shot vehicle health data reads for a Diagnostic Session:
 *   - `VehicleDataController` — POST /vehicle-data/read, GET /vehicle-data
 *   - `VehicleDataService` — queue read, process agent events, get data
 *   - `VehicleDataRepository` — read/write vehicleDataJson on DiagnosticSession
 *   - `VehicleDataResponseDto` — response shape with class-validator validation
 *
 * Agent pushes VEHICLE_DATA_READ events via the existing ObdModule webhook.
 * Commands are enqueued via LiveDataCommandRepository (imported from LiveDataModule).
 */
@Module({
  imports: [AuthModule, PrismaModule, LiveDataModule],
  controllers: [VehicleDataController],
  providers: [VehicleDataService, VehicleDataRepository, PrismaService],
  exports: [VehicleDataService, VehicleDataRepository],
})
export class VehicleDataModule {}