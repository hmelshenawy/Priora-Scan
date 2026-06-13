import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LiveDataSessionRepository } from '../repositories/live-data-session.repository';
import { LiveDataCommandRepository } from '../repositories/live-data-command.repository';
import { PidDefinitionRepository } from '../repositories/pid-definition.repository';
import { PidDecoderService } from '../services/pid-decoder.service';
import { DesktopAgentRepository } from '../../obd/repositories/desktop-agent.repository';
import { LiveDataSession, LiveDataSessionStatus, AgentStatus } from '@prisma/client';

/**
 * LiveDataSessionService — Feature 006 Phase B.2.
 *
 * Orchestrates the start/stop lifecycle of a LiveDataSession and the
 * decode pipeline that turns the agent's raw PID responses into the
 * JSONB `latestValues` map the dashboard reads.
 *
 * MVP PID set (correction: 6 PIDs are surfaced; the full 11 are
 * available via the Phase B.1 PidDefinitionRepository). The short
 * names are the contract used by the frontend and the mock agent.
 */
const MVP_PIDS: ReadonlyArray<{
  shortName: string;
  namespace: string;
  mode: string;
  pid: string;
}> = [
  { shortName: 'rpm', namespace: 'STD_OBD2', mode: '01', pid: '0C' },
  { shortName: 'speed', namespace: 'STD_OBD2', mode: '01', pid: '0D' },
  { shortName: 'coolantTemp', namespace: 'STD_OBD2', mode: '01', pid: '05' },
  { shortName: 'batteryVoltage', namespace: 'STD_OBD2', mode: '01', pid: '42' },
  { shortName: 'throttlePosition', namespace: 'STD_OBD2', mode: '01', pid: '11' },
  { shortName: 'engineLoad', namespace: 'STD_OBD2', mode: '01', pid: '04' },
];

export interface LiveDataReading {
  value: number | null;
  unit: string | null;
  name: string | null;
  rawValue: string;
  status: 'OK' | 'NO_DATA' | 'NOT_SUPPORTED' | 'ERROR';
  errorCode: string | null;
}

export interface LiveDataCurrentValues {
  [shortName: string]: LiveDataReading;
}

export interface StartLiveDataInput {
  diagnosticSessionId: string;
  organizationId: string;
  userId: string;
  agentId: string;
  cadenceMs?: number;
}

@Injectable()
export class LiveDataSessionService {
  private readonly logger = new Logger(LiveDataSessionService.name);

  static readonly DEFAULT_CADENCE_MS = 1000;
  static readonly MIN_CADENCE_MS = 200;
  static readonly MAX_CADENCE_MS = 5000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: LiveDataSessionRepository,
    private readonly commands: LiveDataCommandRepository,
    private readonly agents: DesktopAgentRepository,
    private readonly pidRepo: PidDefinitionRepository,
    private readonly decoder: PidDecoderService,
  ) {}

  /**
   * Start a live data session for a diagnostic session. If a previous
   * ACTIVE session exists, it is closed first (Phase B.2 only ships the
   * single-session-per-diagnostic-session slice; reconnect/resume
   * logic lands in a later sub-phase).
   */
  async start(input: StartLiveDataInput): Promise<LiveDataSession> {
    const cadence = this.clampCadence(input.cadenceMs);

    // Validate agent exists and is online. Use the repo for tenant
    // scoping; if the agent belongs to another tenant, this returns
    // null and we 404.
    const agent = await this.agents.findById(
      input.agentId,
      input.organizationId,
    );
    if (!agent) {
      throw new NotFoundException({
        code: 'AGENT_NOT_FOUND',
        message: 'The agent does not exist or you do not have access to it.',
      });
    }
    if (agent.status !== AgentStatus.ONLINE) {
      throw new ConflictException({
        code: 'AGENT_OFFLINE',
        message: 'Your Desktop Agent is offline. Please ensure it is running.',
      });
    }

    // Confirm the diagnostic session exists and belongs to the tenant.
    const session = await this.prisma.diagnosticSession.findFirst({
      where: {
        id: input.diagnosticSessionId,
        organizationId: input.organizationId,
      },
    });
    if (!session) {
      throw new NotFoundException({
        code: 'DIAGNOSTIC_SESSION_NOT_FOUND',
        message:
          'The requested diagnostic session does not exist or you do not have access to it.',
      });
    }

    // Close any prior ACTIVE session and create a new one + queue the
    // LIVE_DATA_POLL command, all in a single transaction.
    const liveDataSession = await this.prisma.$transaction(async (tx) => {
      await tx.liveDataSession.updateMany({
        where: {
          diagnosticSessionId: input.diagnosticSessionId,
          organizationId: input.organizationId,
          status: LiveDataSessionStatus.ACTIVE,
        },
        data: {
          status: LiveDataSessionStatus.STOPPED,
          stoppedAt: new Date(),
        },
      });

      const created = await this.sessions.create(
        {
          organizationId: input.organizationId,
          diagnosticSessionId: input.diagnosticSessionId,
          agentId: input.agentId,
          status: LiveDataSessionStatus.ACTIVE,
          cadenceMs: cadence,
          startedAt: new Date(),
        },
        tx,
      );

      await this.commands.enqueue(
        {
          organizationId: input.organizationId,
          agentId: input.agentId,
          liveDataSessionId: created.id,
          commandType: 'LIVE_DATA_POLL',
          payload: {
            liveDataSessionId: created.id,
            diagnosticSessionId: input.diagnosticSessionId,
            cadenceMs: cadence,
            pids: MVP_PIDS.map((p) => ({
              shortName: p.shortName,
              namespace: p.namespace,
              mode: p.mode,
              pid: p.pid,
            })),
          },
        },
        tx,
      );

      return created;
    });

    this.logger.log(
      `LiveDataSession ${liveDataSession.id} ACTIVE for diagnostic session ${input.diagnosticSessionId} (cadence ${cadence}ms)`,
    );
    return liveDataSession;
  }

  /**
   * Stop a live data session. Idempotent: stopping an already-STOPPED
   * session is a no-op that returns the existing row.
   */
  async stop(
    liveDataSessionId: string,
    organizationId: string,
  ): Promise<LiveDataSession> {
    const existing = await this.sessions.findById(
      liveDataSessionId,
      organizationId,
    );
    if (!existing) {
      throw new NotFoundException({
        code: 'LIVE_DATA_SESSION_NOT_FOUND',
        message:
          'The live data session does not exist or you do not have access to it.',
      });
    }
    if (existing.status === LiveDataSessionStatus.STOPPED) {
      return existing;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.liveDataSession.updateMany({
        where: { id: liveDataSessionId, organizationId },
        data: {
          status: LiveDataSessionStatus.STOPPED,
          stoppedAt: new Date(),
        },
      });
      await this.commands.enqueue(
        {
          organizationId,
          agentId: existing.agentId,
          liveDataSessionId,
          commandType: 'LIVE_DATA_STOP',
        },
        tx,
      );
    });
    return this.sessions.findById(liveDataSessionId, organizationId) as Promise<LiveDataSession>;
  }

  /**
   * Return the current values for a diagnostic session's active
   * live data session. The frontend polls this every `cadenceMs`.
   */
  async getCurrent(diagnosticSessionId: string, organizationId: string) {
    const session = await this.sessions.findActiveByDiagnosticSession(
      diagnosticSessionId,
      organizationId,
    );
    if (!session) {
      return null;
    }
    return this.toCurrentPayload(session);
  }

  /**
   * Decode the agent's raw poll payload, update the session's
   * `latestValues` + `lastActivityAt`, and return the new values.
   *
   * The agent posts the same shortName-keyed shape it received in the
   * LIVE_DATA_POLL command payload. For each entry, we look up the
   * PIDDefinition and decode the raw bytes through the
   * PidDecoderService.
   */
  async ingestPollResult(
    liveDataSessionId: string,
    agentId: string,
    organizationId: string,
    readings: Array<{
      shortName: string;
      namespace: string;
      mode: string;
      pid: string;
      rawValue: string;
    }>,
  ): Promise<LiveDataCurrentValues> {
    const session = await this.sessions.findById(
      liveDataSessionId,
      organizationId,
    );
    if (!session) {
      throw new NotFoundException({
        code: 'LIVE_DATA_SESSION_NOT_FOUND',
        message:
          'The live data session does not exist or you do not have access to it.',
      });
    }
    if (session.agentId !== agentId) {
      throw new ConflictException({
        code: 'LIVE_DATA_SESSION_AGENT_MISMATCH',
        message: 'This session belongs to a different agent.',
      });
    }
    if (session.status !== LiveDataSessionStatus.ACTIVE) {
      throw new ConflictException({
        code: 'LIVE_DATA_SESSION_NOT_ACTIVE',
        message: `Cannot post a poll result to a ${session.status} session.`,
      });
    }

    const decoded: LiveDataCurrentValues = {};
    for (const r of readings) {
      const reading = await this.decoder.decode(
        r.namespace,
        r.mode,
        r.pid,
        r.rawValue,
      );
      decoded[r.shortName] = {
        value: reading.value,
        unit: reading.unit,
        name: reading.name,
        rawValue: reading.rawValue,
        status: reading.status,
        errorCode: reading.errorCode,
      };
    }

    await this.sessions.recordPollResult(
      liveDataSessionId,
      organizationId,
      decoded as unknown as Prisma.InputJsonValue,
    );

    return decoded;
  }

  /**
   * Pop the next pending command for an agent (used by the agent's
   * command-queue endpoint). Marks it consumed in the same call.
   */
  async consumeNextCommand(agentId: string, organizationId: string) {
    const cmd = await this.commands.findNextPendingForAgent(
      agentId,
      organizationId,
    );
    if (!cmd) {
      return null;
    }
    await this.commands.markConsumed(cmd.id);
    return cmd;
  }

  /**
   * True if a live data session exists in the agent's organization.
   * Used by the agent controller to fail fast with 404 before
   * running decode work.
   */
  async sessionExists(
    liveDataSessionId: string,
    organizationId: string,
  ): Promise<boolean> {
    const s = await this.sessions.findById(
      liveDataSessionId,
      organizationId,
    );
    return s !== null;
  }

  /**
   * Public read-only helper for the controller's start response.
   */
  toStartPayload(session: LiveDataSession) {
    return {
      liveDataSessionId: session.id,
      status: session.status,
      cadenceMs: session.cadenceMs,
    };
  }

  toCurrentPayload(session: LiveDataSession) {
    return {
      sessionId: session.id,
      status: session.status,
      cadenceMs: session.cadenceMs,
      lastActivityAt: session.lastActivityAt,
      values:
        (session.latestValues as unknown as LiveDataCurrentValues | null) ??
        {},
    };
  }

  private clampCadence(input: number | undefined): number {
    if (input === undefined || input === null) {
      return LiveDataSessionService.DEFAULT_CADENCE_MS;
    }
    if (input < LiveDataSessionService.MIN_CADENCE_MS) {
      return LiveDataSessionService.MIN_CADENCE_MS;
    }
    if (input > LiveDataSessionService.MAX_CADENCE_MS) {
      return LiveDataSessionService.MAX_CADENCE_MS;
    }
    return input;
  }
}
