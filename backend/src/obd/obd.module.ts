import { Module } from '@nestjs/common';
import { AgentPairingController } from './controllers/agent-pairing.controller';
import { AgentWebhookController } from './controllers/agent-webhook.controller';
import { ObdScanController } from './controllers/obd-scan.controller';
import { AgentPairingService } from './services/agent-pairing.service';
import { AgentHeartbeatService } from './services/agent-heartbeat.service';
import { ObdScanService } from './services/obd-scan.service';
import { VinResolutionService } from './services/vin-resolution.service';
import { FaultCodeImportService } from './services/fault-code-import.service';
import { DesktopAgentRepository } from './repositories/desktop-agent.repository';
import { ScanJobRepository } from './repositories/scan-job.repository';
import { SessionFaultCodeRepository } from './repositories/session-fault-code.repository';
import { AdapterConnectionRepository } from './repositories/adapter-connection.repository';
import { VehicleDataModule } from '../vehicle-data/vehicle-data.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { DtcClearModule } from '../dtc-clear/dtc-clear.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { FaultCodesModule } from '../fault-codes/fault-codes.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    FaultCodesModule,
    VehicleDataModule,
    VehiclesModule,
    DtcClearModule,
  ],
  controllers: [AgentPairingController, AgentWebhookController, ObdScanController],
  providers: [
    AgentPairingService,
    AgentHeartbeatService,
    ObdScanService,
    VinResolutionService,
    FaultCodeImportService,
    DesktopAgentRepository,
    ScanJobRepository,
    SessionFaultCodeRepository,
    AdapterConnectionRepository,
  ],
  exports: [AgentPairingService, PrismaModule, DesktopAgentRepository],
})
export class ObdModule {}
