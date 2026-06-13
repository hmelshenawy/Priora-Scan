import { Module } from '@nestjs/common';
import { VehicleController } from './controllers/vehicle.controller';
import { VehicleService } from './services/vehicle.service';
import { VehicleDecodeService } from './services/vehicle-decode.service';
import { VpicAssetService } from './services/vpic-asset.service';
import { VehicleRepository } from './repositories/vehicle.repository';
import { VehicleAuditRepository } from './repositories/vehicle-audit.repository';
import { VehicleDecodeRepository } from './repositories/vehicle-decode.repository';
import { PrismaService } from '../prisma/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [AuthModule, SharedModule],
  controllers: [VehicleController],
  providers: [
    VehicleService,
    VehicleDecodeService,
    VpicAssetService,
    VehicleRepository,
    VehicleAuditRepository,
    VehicleDecodeRepository,
    PrismaService,
  ],
  exports: [VehicleDecodeService, VehicleDecodeRepository],
})
export class VehiclesModule {}
