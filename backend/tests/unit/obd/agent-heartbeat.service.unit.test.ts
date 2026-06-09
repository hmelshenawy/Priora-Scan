import { AgentHeartbeatService } from '../../../src/obd/services/agent-heartbeat.service';
import { DesktopAgentRepository } from '../../../src/obd/repositories/desktop-agent.repository';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { AgentStatus } from '../../../src/obd/types/agent-status.enum';

describe('AgentHeartbeatService', () => {
  let service: AgentHeartbeatService;
  let prisma: jest.Mocked<PrismaService>;
  let agentRepository: jest.Mocked<DesktopAgentRepository>;

  beforeEach(() => {
    prisma = {
      desktopAgent: {
        updateMany: jest.fn(),
        findFirst: jest.fn(),
      } as any,
      adapterConnection: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      } as any,
    } as any;

    agentRepository = {
      findOfflineAgents: jest.fn(),
      updateStatus: jest.fn(),
    } as any;

    service = new AgentHeartbeatService(prisma, agentRepository);
  });

  describe('processHeartbeat', () => {
    it('should update agent status and create a connected adapter status', async () => {
      (prisma.desktopAgent.findFirst as jest.Mock).mockResolvedValue({
        organizationId: 'org-1',
      });
      (prisma.adapterConnection.findFirst as jest.Mock).mockResolvedValue(null);

      await service.processHeartbeat('agent-1', {
        version: '2.1.0',
        adapterConnected: true,
        adapterType: 'MOCK',
        protocol: 'MOCK',
      });

      expect(prisma.desktopAgent.updateMany).toHaveBeenCalledWith({
        where: { id: 'agent-1' },
        data: {
          version: '2.1.0',
          status: AgentStatus.ONLINE,
          lastSeenAt: expect.any(Date),
        },
      });
      expect(prisma.adapterConnection.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          agentId: 'agent-1',
          adapterType: 'MOCK',
          connectionType: 'MOCK',
          protocol: 'MOCK',
          status: 'CONNECTED',
          endedAt: null,
          errorMessage: null,
        },
      });
    });

    it('should mark an active adapter connection disconnected', async () => {
      (prisma.desktopAgent.findFirst as jest.Mock).mockResolvedValue({
        organizationId: 'org-1',
      });
      (prisma.adapterConnection.findFirst as jest.Mock).mockResolvedValue({
        id: 'connection-1',
      });

      await service.processHeartbeat('agent-1', {
        version: '2.1.0',
        adapterConnected: false,
      });

      expect(prisma.adapterConnection.update).toHaveBeenCalledWith({
        where: { id: 'connection-1' },
        data: {
          status: 'DISCONNECTED',
          endedAt: expect.any(Date),
        },
      });
    });
  });

  describe('markOfflineAgents', () => {
    it('should mark stale agents as OFFLINE', async () => {
      const staleAgents = [
        { id: 'agent-1', organizationId: 'org-1' },
        { id: 'agent-2', organizationId: 'org-2' },
      ];
      (agentRepository.findOfflineAgents as jest.Mock).mockResolvedValue(
        staleAgents,
      );

      await service.markOfflineAgents();

      expect(agentRepository.findOfflineAgents).toHaveBeenCalledWith(60000);
      expect(agentRepository.updateStatus).toHaveBeenCalledTimes(2);
      expect(agentRepository.updateStatus).toHaveBeenCalledWith(
        'agent-1',
        'org-1',
        AgentStatus.OFFLINE,
      );
      expect(agentRepository.updateStatus).toHaveBeenCalledWith(
        'agent-2',
        'org-2',
        AgentStatus.OFFLINE,
      );
    });
  });
});
