import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaService } from './prisma/prisma.service';
import { VehiclesModule } from './vehicles/vehicles.module';
import { AuthModule } from './auth/auth.module';
import { DiagnosticSessionsModule } from './diagnostic-sessions/diagnostic-sessions.module';
import { securityConfig } from './config/security.config';

@Module({
  imports: [
    JwtModule.register({
      secret: securityConfig.jwt.secret,
      signOptions: { expiresIn: securityConfig.jwt.accessTokenExpiry },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
    VehiclesModule,
    AuthModule,
    DiagnosticSessionsModule,
  ],
  providers: [PrismaService],
})
export class AppModule {}
