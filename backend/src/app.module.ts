import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaService } from './prisma/prisma.service';
import { VehiclesModule } from './vehicles/vehicles.module';
import { AuthModule } from './auth/auth.module';
import { DiagnosticSessionsModule } from './diagnostic-sessions/diagnostic-sessions.module';
import { ObdModule } from './obd/obd.module';
import { FaultCodesModule } from './fault-codes/fault-codes.module';
import { LiveDataModule } from './live-data/live-data.module';
import { VehicleDataModule } from './vehicle-data/vehicle-data.module';
import { DtcClearModule } from './dtc-clear/dtc-clear.module';
import { securityConfig } from './config/security.config';

@Module({
  imports: [
    JwtModule.register({
      secret: securityConfig.jwt.secret,
      signOptions: { expiresIn: securityConfig.jwt.accessTokenExpiry },
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
    VehiclesModule,
    AuthModule,
    DiagnosticSessionsModule,
    ObdModule,
    FaultCodesModule,
    LiveDataModule,
    VehicleDataModule,
    DtcClearModule,
  ],
  providers: [PrismaService],
})
export class AppModule {}
