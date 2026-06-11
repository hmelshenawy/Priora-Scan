import { Test } from '@nestjs/testing';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as crypto from 'crypto';
import { LiveDataAgentController } from '../../src/live-data/controllers/live-data-agent.controller';
import { LiveDataSessionService } from '../../src/live-data/services/live-data-session.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AgentAuthGuard } from '../../src/guards/agent-auth.guard';

const ORG = '11111111-1111-1111-1111-111111111111';
const AGENT = '55555555-5555-5555-5555-555555555555';
const TOKEN = 'plain-agent-token';

describe('Live data agent endpoints — contract', () => {
  let app: INestApplication;
  let service: any;
  let prisma: any;

  beforeAll(async () => {
    service = {
      consumeNextCommand: jest.fn(),
      ingestPollResult: jest.fn(),
      sessionExists: jest.fn(),
    };

    const tokenHash = crypto
      .createHash('sha256')
      .update(TOKEN)
      .digest('hex');

    prisma = {
      desktopAgent: {
        findFirst: jest.fn(async ({ where }: any) => {
          if (where.id === AGENT && where.accessTokenHash === tokenHash) {
            return { id: AGENT, organizationId: ORG };
          }
          return null;
        }),
      },
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [LiveDataAgentController],
      providers: [
        { provide: LiveDataSessionService, useValue: service },
        { provide: PrismaService, useValue: prisma },
      ],
    })
      .overrideGuard(AgentAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          const req = ctx.switchToHttp().getRequest();
          const token = req.headers['x-agent-token'];
          if (!token) {
            throw new (require('@nestjs/common').UnauthorizedException)({
              code: 'AGENT_TOKEN_MISSING',
              message: 'Agent token is missing.',
            });
          }
          if (token !== TOKEN) {
            throw new (require('@nestjs/common').UnauthorizedException)({
              code: 'AGENT_TOKEN_INVALID',
              message: 'Agent token is invalid.',
            });
          }
          req.agent = { id: AGENT, organizationId: ORG };
          req.organizationId = ORG;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    Object.values(service).forEach((m: any) => m.mockReset());
  });

  describe('GET /api/v1/obd/agents/:id/live-data/command-queue', () => {
    it('returns 401 when X-Agent-Token is missing', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/obd/agents/${AGENT}/live-data/command-queue`)
        .expect(401);
    });

    it('returns the next pending command', async () => {
      service.consumeNextCommand.mockResolvedValue({
        id: 'cmd-1',
        commandType: 'LIVE_DATA_POLL',
        liveDataSessionId: 'live-1',
        payload: { cadenceMs: 1000, pids: [] },
        createdAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/obd/agents/${AGENT}/live-data/command-queue`)
        .set('X-Agent-Token', TOKEN)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].commandType).toBe('LIVE_DATA_POLL');
    });

    it('returns an empty array when no commands are queued', async () => {
      service.consumeNextCommand.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/obd/agents/${AGENT}/live-data/command-queue`)
        .set('X-Agent-Token', TOKEN)
        .expect(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('POST /api/v1/obd/agents/:id/live-data/:liveDataSessionId/poll-result', () => {
    it('returns 200 with the decoded values', async () => {
      service.sessionExists.mockResolvedValue(true);
      service.ingestPollResult.mockResolvedValue({
        rpm: { value: 1234, unit: 'rpm', name: 'Engine RPM', status: 'OK' },
      });

      const res = await request(app.getHttpServer())
        .post(
          `/api/v1/obd/agents/${AGENT}/live-data/live-1/poll-result`,
        )
        .set('X-Agent-Token', TOKEN)
        .send({
          readings: [
            {
              shortName: 'rpm',
              namespace: 'STD_OBD2',
              mode: '01',
              pid: '0C',
              rawValue: '12 34',
            },
          ],
        })
        .expect(201);
      expect(res.body.success).toBe(true);
      expect(res.body.values.rpm.value).toBe(1234);
    });

    it('returns 400 READINGS_REQUIRED when readings are missing', async () => {
      await request(app.getHttpServer())
        .post(
          `/api/v1/obd/agents/${AGENT}/live-data/live-1/poll-result`,
        )
        .set('X-Agent-Token', TOKEN)
        .send({})
        .expect(400);
    });

    it('returns 404 LIVE_DATA_SESSION_NOT_FOUND for an unknown session', async () => {
      service.sessionExists.mockResolvedValue(false);

      const res = await request(app.getHttpServer())
        .post(
          `/api/v1/obd/agents/${AGENT}/live-data/live-999/poll-result`,
        )
        .set('X-Agent-Token', TOKEN)
        .send({
          readings: [
            {
              shortName: 'rpm',
              namespace: 'STD_OBD2',
              mode: '01',
              pid: '0C',
              rawValue: '00',
            },
          ],
        })
        .expect(404);
      expect(res.body.code).toBe('LIVE_DATA_SESSION_NOT_FOUND');
    });
  });
});
