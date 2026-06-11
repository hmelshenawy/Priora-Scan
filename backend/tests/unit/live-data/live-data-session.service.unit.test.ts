import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { LiveDataSessionService } from '../../../src/live-data/services/live-data-session.service';
import { LiveDataSessionRepository } from '../../../src/live-data/repositories/live-data-session.repository';
import { LiveDataCommandRepository } from '../../../src/live-data/repositories/live-data-command.repository';
import { PidDefinitionRepository } from '../../../src/live-data/repositories/pid-definition.repository';
import { PidDecoderService } from '../../../src/live-data/services/pid-decoder.service';
import { DesktopAgentRepository } from '../../../src/obd/repositories/desktop-agent.repository';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { LiveDataSessionStatus, AgentStatus } from '@prisma/client';

const ORG_A = '11111111-1111-1111-1111-111111111111';
const ORG_B = '22222222-2222-2222-2222-222222222222';
const USER_ID = '33333333-3333-3333-3333-333333333333';
const DIAG_ID = '44444444-4444-4444-4444-444444444444';
const AGENT_ID = '55555555-5555-5555-5555-555555555555';

function makeLiveDataSession(overrides: Partial<any> = {}) {
  return {
    id: 'live-1',
    organizationId: ORG_A,
    diagnosticSessionId: DIAG_ID,
    agentId: AGENT_ID,
    status: LiveDataSessionStatus.ACTIVE,
    cadenceMs: 1000,
    startedAt: new Date(),
    stoppedAt: null,
    lastActivityAt: null,
    latestValues: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('LiveDataSessionService', () => {
  let service: LiveDataSessionService;
  let prisma: any;
  let sessions: jest.Mocked<LiveDataSessionRepository>;
  let commands: jest.Mocked<LiveDataCommandRepository>;
  let agents: jest.Mocked<DesktopAgentRepository>;
  let pidRepo: jest.Mocked<PidDefinitionRepository>;
  let decoder: jest.Mocked<PidDecoderService>;

  beforeEach(() => {
    sessions = {
      create: jest.fn(),
      findById: jest.fn(),
      findActiveByDiagnosticSession: jest.fn(),
      listByDiagnosticSession: jest.fn(),
      stopActiveForDiagnosticSession: jest.fn(),
      stop: jest.fn(),
      recordPollResult: jest.fn(),
    } as any;

    commands = {
      enqueue: jest.fn(),
      findNextPendingForAgent: jest.fn(),
      markConsumed: jest.fn(),
      countPendingForSession: jest.fn(),
      findByTypeAndSession: jest.fn(),
    } as any;

    agents = {
      findById: jest.fn(),
    } as any;

    pidRepo = {
      findByNamespaceModeAndPid: jest.fn(),
    } as any;

    decoder = {
      decode: jest.fn(),
    } as any;

    prisma = {
      $transaction: jest.fn((cb: any) => cb(prisma)),
      diagnosticSession: {
        findFirst: jest.fn(),
      },
      liveDataSession: {
        updateMany: jest.fn(),
      },
      liveDataCommand: {
        create: jest.fn(),
      },
    } as any;

    service = new LiveDataSessionService(
      prisma as unknown as PrismaService,
      sessions,
      commands,
      agents,
      pidRepo,
      decoder,
    );
  });

  describe('start', () => {
    it('creates an ACTIVE LiveDataSession and queues a LIVE_DATA_POLL command', async () => {
      (agents.findById as jest.Mock).mockResolvedValue({
        id: AGENT_ID,
        status: AgentStatus.ONLINE,
      });
      (prisma.diagnosticSession.findFirst as jest.Mock).mockResolvedValue({
        id: DIAG_ID,
        organizationId: ORG_A,
      });
      (sessions.create as jest.Mock).mockResolvedValue(makeLiveDataSession());
      (commands.enqueue as jest.Mock).mockResolvedValue({ id: 'cmd-1' });

      const result = await service.start({
        diagnosticSessionId: DIAG_ID,
        organizationId: ORG_A,
        userId: USER_ID,
        agentId: AGENT_ID,
      });

      expect(result.status).toBe(LiveDataSessionStatus.ACTIVE);
      expect(result.cadenceMs).toBe(1000);
      expect(commands.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: AGENT_ID,
          liveDataSessionId: 'live-1',
          commandType: 'LIVE_DATA_POLL',
        }),
        prisma,
      );
    });

    it('returns 404 AGENT_NOT_FOUND when the agent is unknown or in another tenant', async () => {
      (agents.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.start({
          diagnosticSessionId: DIAG_ID,
          organizationId: ORG_A,
          userId: USER_ID,
          agentId: AGENT_ID,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns 409 AGENT_OFFLINE when the agent is not ONLINE', async () => {
      (agents.findById as jest.Mock).mockResolvedValue({
        id: AGENT_ID,
        status: AgentStatus.OFFLINE,
      });

      await expect(
        service.start({
          diagnosticSessionId: DIAG_ID,
          organizationId: ORG_A,
          userId: USER_ID,
          agentId: AGENT_ID,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('returns 404 DIAGNOSTIC_SESSION_NOT_FOUND when the session does not belong to the tenant', async () => {
      (agents.findById as jest.Mock).mockResolvedValue({
        id: AGENT_ID,
        status: AgentStatus.ONLINE,
      });
      (prisma.diagnosticSession.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.start({
          diagnosticSessionId: DIAG_ID,
          organizationId: ORG_A,
          userId: USER_ID,
          agentId: AGENT_ID,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('clamps cadenceMs below the minimum to 200', async () => {
      (agents.findById as jest.Mock).mockResolvedValue({
        id: AGENT_ID,
        status: AgentStatus.ONLINE,
      });
      (prisma.diagnosticSession.findFirst as jest.Mock).mockResolvedValue({
        id: DIAG_ID,
        organizationId: ORG_A,
      });
      (sessions.create as jest.Mock).mockResolvedValue(
        makeLiveDataSession({ cadenceMs: 200 }),
      );
      (commands.enqueue as jest.Mock).mockResolvedValue({ id: 'cmd-1' });

      await service.start({
        diagnosticSessionId: DIAG_ID,
        organizationId: ORG_A,
        userId: USER_ID,
        agentId: AGENT_ID,
        cadenceMs: 50,
      });

      expect(sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({ cadenceMs: 200 }),
        prisma,
      );
    });
  });

  describe('stop', () => {
    it('marks an ACTIVE session STOPPED and queues a LIVE_DATA_STOP command', async () => {
      (sessions.findById as jest.Mock).mockResolvedValue(
        makeLiveDataSession(),
      );
      (prisma.liveDataSession.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      });
      (prisma.liveDataCommand.create as jest.Mock).mockResolvedValue({});
      (sessions.findById as jest.Mock)
        .mockResolvedValueOnce(makeLiveDataSession())
        .mockResolvedValueOnce(
          makeLiveDataSession({ status: LiveDataSessionStatus.STOPPED }),
        );

      const result = await service.stop('live-1', ORG_A);

      expect(result.status).toBe(LiveDataSessionStatus.STOPPED);
      expect(prisma.liveDataCommand.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ commandType: 'LIVE_DATA_STOP' }),
        }),
      );
    });

    it('is idempotent on an already-STOPPED session', async () => {
      (sessions.findById as jest.Mock).mockResolvedValue(
        makeLiveDataSession({ status: LiveDataSessionStatus.STOPPED }),
      );

      const result = await service.stop('live-1', ORG_A);

      expect(result.status).toBe(LiveDataSessionStatus.STOPPED);
      expect(prisma.liveDataCommand.create).not.toHaveBeenCalled();
    });

    it('returns 404 when the session is unknown or in another tenant', async () => {
      (sessions.findById as jest.Mock).mockResolvedValue(null);

      await expect(service.stop('live-1', ORG_A)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('ingestPollResult', () => {
    it('decodes raw bytes through PidDecoderService and persists latestValues', async () => {
      (sessions.findById as jest.Mock).mockResolvedValue(
        makeLiveDataSession(),
      );
      (decoder.decode as jest.Mock).mockImplementation(
        async (ns: string, mode: string, pid: string) => ({
          pid,
          name: 'Engine RPM',
          value: 1234,
          unit: 'rpm',
          rawValue: '12 34',
          status: 'OK',
          errorCode: null,
        }),
      );
      (sessions.recordPollResult as jest.Mock).mockResolvedValue({});

      const values = await service.ingestPollResult(
        'live-1',
        AGENT_ID,
        ORG_A,
        [
          {
            shortName: 'rpm',
            namespace: 'STD_OBD2',
            mode: '01',
            pid: '0C',
            rawValue: '12 34',
          },
        ],
      );

      expect(values.rpm.value).toBe(1234);
      expect(decoder.decode).toHaveBeenCalledWith('STD_OBD2', '01', '0C', '12 34');
      expect(sessions.recordPollResult).toHaveBeenCalledWith(
        'live-1',
        ORG_A,
        expect.objectContaining({
          rpm: expect.objectContaining({ value: 1234, status: 'OK' }),
        }),
      );
    });

    it('rejects posts to sessions belonging to a different agent', async () => {
      (sessions.findById as jest.Mock).mockResolvedValue(
        makeLiveDataSession({ agentId: 'other-agent' }),
      );

      await expect(
        service.ingestPollResult('live-1', AGENT_ID, ORG_A, []),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects posts when the session is no longer ACTIVE', async () => {
      (sessions.findById as jest.Mock).mockResolvedValue(
        makeLiveDataSession({ status: LiveDataSessionStatus.STOPPED }),
      );

      await expect(
        service.ingestPollResult('live-1', AGENT_ID, ORG_A, []),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('tenant isolation', () => {
    it('findById is called with the caller organizationId', async () => {
      // simulate a tenant-mismatch — the repository returns null
      (sessions.findById as jest.Mock).mockResolvedValue(null);

      await expect(service.stop('live-1', ORG_A)).rejects.toThrow(
        NotFoundException,
      );
      expect(sessions.findById).toHaveBeenCalledWith('live-1', ORG_A);
    });
  });

  describe('consumeNextCommand', () => {
    it('returns null when no commands are queued', async () => {
      (commands.findNextPendingForAgent as jest.Mock).mockResolvedValue(null);

      const result = await service.consumeNextCommand(AGENT_ID, ORG_A);

      expect(result).toBeNull();
      expect(commands.markConsumed).not.toHaveBeenCalled();
    });

    it('returns the next command and marks it consumed', async () => {
      (commands.findNextPendingForAgent as jest.Mock).mockResolvedValue({
        id: 'cmd-1',
      });

      const result = await service.consumeNextCommand(AGENT_ID, ORG_A);

      expect(result).toEqual({ id: 'cmd-1' });
      expect(commands.markConsumed).toHaveBeenCalledWith('cmd-1');
    });
  });

  describe('toCurrentPayload', () => {
    it('serializes the live data session into the dashboard shape', () => {
      const session = makeLiveDataSession({
        lastActivityAt: new Date('2026-06-11T12:00:00Z'),
        latestValues: { rpm: { value: 850, unit: 'rpm', name: 'Engine RPM' } },
      });
      const payload = service.toCurrentPayload(session);
      expect(payload.sessionId).toBe('live-1');
      expect(payload.status).toBe('ACTIVE');
      expect(payload.values).toEqual({
        rpm: { value: 850, unit: 'rpm', name: 'Engine RPM' },
      });
    });
  });
});
