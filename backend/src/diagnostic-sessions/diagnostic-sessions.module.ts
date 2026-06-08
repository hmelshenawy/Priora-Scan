import { Module } from '@nestjs/common';
import { DiagnosticSessionsController } from './controllers/diagnostic-sessions.controller';
import { DiagnosticSessionsService } from './services/diagnostic-sessions.service';
import { DiagnosticSessionRepository } from './repositories/diagnostic-session.repository';
import { DiagnosticSessionAuditRepository } from './repositories/diagnostic-session-audit.repository';
import { PrismaService } from '../prisma/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { AuthGuard } from '../guards/auth.guard';
import { TenantGuard } from '../guards/tenant.guard';
import { RbacGuard } from '../guards/rbac.guard';
import { CsrfGuard } from '../guards/csrf.guard';

@Module({
  imports: [AuthModule],
  controllers: [DiagnosticSessionsController],
  providers: [
    DiagnosticSessionsService,
    DiagnosticSessionRepository,
    DiagnosticSessionAuditRepository,
    PrismaService,
    AuthGuard,
    TenantGuard,
    RbacGuard,
    CsrfGuard,
  ],
  exports: [DiagnosticSessionsService],
})
export class DiagnosticSessionsModule {}
