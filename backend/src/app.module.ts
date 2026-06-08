import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from './prisma/prisma.service';
import { VehiclesModule } from './vehicles/vehicles.module';
import { securityConfig } from './config/security.config';

@Module({
  imports: [
    JwtModule.register({
      secret: securityConfig.jwt.secret,
      signOptions: { expiresIn: securityConfig.jwt.accessTokenExpiry },
    }),
    VehiclesModule,
  ],
  providers: [PrismaService],
})
export class AppModule {}
