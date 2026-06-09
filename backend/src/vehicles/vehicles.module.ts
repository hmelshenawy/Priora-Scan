import { Module } from '@nestjs/common';
import { VehicleController } from './controllers/vehicle.controller';
import { VehicleService } from './services/vehicle.service';
import { VehicleRepository } from './repositories/vehicle.repository';
import { VehicleAuditRepository } from './repositories/vehicle-audit.repository';
import { PrismaService } from '../prisma/prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [VehicleController],
  providers: [
    VehicleService,
    VehicleRepository,
    VehicleAuditRepository,
    PrismaService,
  ],
})
export class VehiclesModule {}
