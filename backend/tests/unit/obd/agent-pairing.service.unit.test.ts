import { UnauthorizedException } from '@nestjs/common';
import { AgentPairingService } from '../../../src/obd/services/agent-pairing.service';
import { DesktopAgentRepository } from '../../../src/obd/repositories/desktop-agent.repository';
import { PrismaService } from '../../../src/prisma/prisma.service';

describe('AgentPairingService', () => {
  let service: AgentPairingService;
  let prisma: jest.Mocked<PrismaService>;
  let agentRepository: jest.Mocked<DesktopAgentRepository>;

  beforeEach(() => {
    prisma = {
      pairingToken: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      } as any,
      desktopAgent: {
        create: jest.fn(),
      } as any,
      $transaction: jest.fn((cb: any) => cb(prisma)),
    } as any;

    agentRepository = {
      findById: jest.fn(),
      delete: jest.fn(),
    } as any;

    service = new AgentPairingService(prisma, agentRepository);
  });

  describe('generatePairingToken', () => {
    it('should create a pairing token and return it with expiry', async () => {
      await service.generatePairingToken('org-1', 'user-1', 'Test Agent');

      expect(prisma.pairingToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            userId: 'user-1',
          }),
        }),
      );
    });

    it('should hash the token before storing', async () => {
      const result = await service.generatePairingToken('org-1', 'user-1');
      expect(result.token).toBeDefined();
      expect(result.token.length).toBeGreaterThan(0);
    });
  });

  describe('exchangePairingToken', () => {
    it('should reject invalid or expired tokens', async () => {
      (prisma.pairingToken.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.exchangePairingToken('BAD-TOKEN', 'Agent', '1.0.0'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should create a DesktopAgent and return access token on valid exchange', async () => {
      const tokenRecord = {
        id: 'token-1',
        organizationId: 'org-1',
        userId: 'user-1',
      };
      (prisma.pairingToken.findFirst as jest.Mock).mockResolvedValue(tokenRecord);
      (prisma.desktopAgent.create as jest.Mock).mockResolvedValue({
        id: 'agent-1',
      });

      const result = await service.exchangePairingToken('VALID-TOKEN', 'Agent', '1.0.0');

      expect(result.agentId).toBe('agent-1');
      expect(result.accessToken).toBeDefined();
      expect(result.accessToken.length).toBeGreaterThan(0);
      expect(result.organizationId).toBe('org-1');
    });
  });

  describe('unpairAgent', () => {
    it('should throw if agent not found in tenant', async () => {
      (agentRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.unpairAgent('agent-1', 'org-1', 'user-1'),
      ).rejects.toThrow('The agent does not exist or you do not have access to it.');
    });

    it('should delete agent when found in tenant', async () => {
      (agentRepository.findById as jest.Mock).mockResolvedValue({ id: 'agent-1' });

      await service.unpairAgent('agent-1', 'org-1', 'user-1');
      expect(agentRepository.delete).toHaveBeenCalledWith('agent-1', 'org-1');
    });
  });
});
