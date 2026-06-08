import { Module } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { VehiclesModule } from './vehicles/vehicles.module';

@Module({
  imports: [VehiclesModule],
  providers: [PrismaService],
})
export class AppModule {}
