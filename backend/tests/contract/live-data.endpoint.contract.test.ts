import { Test } from '@nestjs/testing';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AuthGuard } from '../../src/guards/auth.guard';
import { TenantGuard } from '../../src/guards/tenant.guard';
import { CsrfGuard } from '../../src/guards/csrf.guard';
import { LiveDataController } from '../../src/live-data/controllers/live-data.controller';
import { LiveDataSessionService } from '../../src/live-data/services/live-data-session.service';

const ORG = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const SESSION = '33333333-3333-3333-3333-333333333333';
const AGENT = '44444444-4444-4444-4444-444444444444';

describe('Live data web endpoints — contract', () => {
  let app: INestApplication;
  let service: {
    start: jest.Mock;
    stop: jest.Mock;
    getCurrent: jest.Mock;
    toStartPayload: jest.Mock;
    toCurrentPayload: jest.Mock;
  };

  beforeAll(async () => {
    service = {
      start: jest.fn(),
      stop: jest.fn(),
      getCurrent: jest.fn(),
      toStartPayload: jest.fn(),
      toCurrentPayload: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [LiveDataController],
      providers: [{ provide: LiveDataSessionService, useValue: service }],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = {
            sub: USER,
            organizationId: ORG,
            email: 't@x',
            roles: ['user'],
            permissions: ['read:diagnostic-session', 'update:diagnostic-session'],
            iat: 0,
            exp: 0,
          };
          return true;
        },
      })
      .overrideGuard(TenantGuard)
      .useValue({
        canActivate: (ctx: any) => {
          const req = ctx.switchToHttp().getRequest();
          req.organizationId = ORG;
          return true;
        },
      })
      .overrideGuard(CsrfGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    Object.values(service).forEach((m) => m.mockReset());
  });

  describe('POST /api/v1/diagnostic-sessions/:id/live-data/start', () => {
    it('returns 200 with liveDataSessionId / status / cadenceMs', async () => {
      const created = { id: 'live-1', status: 'ACTIVE', cadenceMs: 1000 };
      service.start.mockResolvedValue(created);
      service.toStartPayload.mockReturnValue({
        liveDataSessionId: 'live-1',
        status: 'ACTIVE',
        cadenceMs: 1000,
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/diagnostic-sessions/${SESSION}/live-data/start`)
        .send({ agentId: AGENT })
        .expect(200);

      expect(res.body).toEqual({
        liveDataSessionId: 'live-1',
        status: 'ACTIVE',
        cadenceMs: 1000,
      });
      expect(service.start).toHaveBeenCalledWith({
        diagnosticSessionId: SESSION,
        organizationId: ORG,
        userId: USER,
        agentId: AGENT,
        cadenceMs: undefined,
      });
    });

    it('passes cadenceMs when supplied', async () => {
      service.start.mockResolvedValue({});
      service.toStartPayload.mockReturnValue({
        liveDataSessionId: 'live-1',
        status: 'ACTIVE',
        cadenceMs: 500,
      });

      await request(app.getHttpServer())
        .post(`/api/v1/diagnostic-sessions/${SESSION}/live-data/start`)
        .send({ agentId: AGENT, cadenceMs: 500 })
        .expect(200);

      expect(service.start).toHaveBeenCalledWith(expect.objectContaining({ cadenceMs: 500 }));
    });

    it('returns 400 AGENT_ID_REQUIRED when agentId is missing', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/diagnostic-sessions/${SESSION}/live-data/start`)
        .send({})
        .expect(400);
      expect(res.body.code).toBe('AGENT_ID_REQUIRED');
    });

    it('propagates 404 AGENT_NOT_FOUND from the service', async () => {
      service.start.mockRejectedValue(
        Object.assign(new Error('not found'), {
          response: { code: 'AGENT_NOT_FOUND' },
        }),
      );
      // Wire a real Nest HttpException
      const { NotFoundException } = await import('@nestjs/common');
      service.start.mockRejectedValue(
        new NotFoundException({
          code: 'AGENT_NOT_FOUND',
          message: 'no agent',
        }),
      );

      const res = await request(app.getHttpServer())
        .post(`/api/v1/diagnostic-sessions/${SESSION}/live-data/start`)
        .send({ agentId: AGENT })
        .expect(404);
      expect(res.body.code).toBe('AGENT_NOT_FOUND');
    });
  });

  describe('POST /api/v1/diagnostic-sessions/:id/live-data/stop', () => {
    it('returns 200 with the stopped session payload', async () => {
      service.stop.mockResolvedValue({ id: 'live-1' });
      service.toCurrentPayload.mockReturnValue({
        sessionId: 'live-1',
        status: 'STOPPED',
        cadenceMs: 1000,
        lastActivityAt: null,
        values: {},
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/diagnostic-sessions/${SESSION}/live-data/stop`)
        .send({ liveDataSessionId: 'live-1' })
        .expect(200);
      expect(res.body.status).toBe('STOPPED');
      expect(service.stop).toHaveBeenCalledWith('live-1', ORG);
    });

    it('returns 400 LIVE_DATA_SESSION_ID_REQUIRED when missing', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/diagnostic-sessions/${SESSION}/live-data/stop`)
        .send({})
        .expect(400);
      expect(res.body.code).toBe('LIVE_DATA_SESSION_ID_REQUIRED');
    });
  });

  describe('GET /api/v1/diagnostic-sessions/:id/live-data/current', () => {
    it('returns the current values payload for an ACTIVE session', async () => {
      service.getCurrent.mockResolvedValue({
        sessionId: 'live-1',
        status: 'ACTIVE',
        cadenceMs: 1000,
        lastActivityAt: new Date('2026-06-11T12:00:00Z'),
        values: { rpm: { value: 850, unit: 'rpm', name: 'Engine RPM' } },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/diagnostic-sessions/${SESSION}/live-data/current`)
        .expect(200);
      expect(res.body.values.rpm.value).toBe(850);
    });

    it('returns null when no live data session is active', async () => {
      service.getCurrent.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/diagnostic-sessions/${SESSION}/live-data/current`)
        .expect(200);
      // JSON null serializes to the empty body; either is acceptable
      expect(res.body === null || Object.keys(res.body).length === 0).toBe(true);
    });
  });
});
