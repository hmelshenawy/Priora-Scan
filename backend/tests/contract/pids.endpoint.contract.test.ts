import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AuthGuard } from '../../src/guards/auth.guard';
import { TenantGuard } from '../../src/guards/tenant.guard';
import { RbacGuard } from '../../src/guards/rbac.guard';
import { PidsController } from '../../src/live-data/controllers/pids.controller';
import { PidDefinitionRepository } from '../../src/live-data/repositories/pid-definition.repository';
import { PIDDefinition } from '@prisma/client';

const STD_RPM: PIDDefinition = {
  id: '00000000-0000-0000-0000-00000000000c',
  namespace: 'STD_OBD2',
  mode: '01',
  pid: '0C',
  name: 'Engine RPM',
  unit: 'RPM',
  formula: '(A * 256 + B) / 4',
  min: null,
  max: null,
  source: 'built-in-mvp',
  createdAt: new Date('2026-06-11T00:00:00Z'),
  updatedAt: new Date('2026-06-11T00:00:00Z'),
};

const STD_COOLANT: PIDDefinition = {
  id: '00000000-0000-0000-0000-000000000005',
  namespace: 'STD_OBD2',
  mode: '01',
  pid: '05',
  name: 'Engine Coolant Temperature',
  unit: '°C',
  formula: 'A - 40',
  min: null,
  max: null,
  source: 'built-in-mvp',
  createdAt: new Date('2026-06-11T00:00:00Z'),
  updatedAt: new Date('2026-06-11T00:00:00Z'),
};

const GME_RPM: PIDDefinition = {
  id: '00000000-0000-0000-0000-00000002200c',
  namespace: 'GME',
  mode: '22',
  pid: '220C',
  name: 'GM Engine RPM',
  unit: 'RPM',
  formula: '(A * 256 + B) / 4',
  min: null,
  max: null,
  source: 'model-pids-sqlite',
  createdAt: new Date('2026-06-11T00:00:00Z'),
  updatedAt: new Date('2026-06-11T00:00:00Z'),
};

describe('PIDs endpoints — contract', () => {
  let app: INestApplication;
  let repo: {
    findById: jest.Mock;
    findByNamespaceModeAndPid: jest.Mock;
    findByModeAndPid: jest.Mock;
    findByNamespace: jest.Mock;
    findByMode: jest.Mock;
    list: jest.Mock;
    upsert: jest.Mock;
    upsertMany: jest.Mock;
    count: jest.Mock;
  };

  const orgId = '11111111-1111-1111-1111-111111111111';
  const userId = '22222222-2222-2222-2222-222222222222';

  beforeAll(async () => {
    repo = {
      findById: jest.fn(),
      findByNamespaceModeAndPid: jest.fn(),
      findByModeAndPid: jest.fn(),
      findByNamespace: jest.fn(),
      findByMode: jest.fn(),
      list: jest.fn(),
      upsert: jest.fn(),
      upsertMany: jest.fn(),
      count: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [PidsController],
      providers: [{ provide: PidDefinitionRepository, useValue: repo }],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = {
            sub: userId,
            organizationId: orgId,
            email: 't@x',
            roles: ['user'],
            permissions: ['read:pid'],
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
          req.organizationId = orgId;
          return true;
        },
      })
      .overrideGuard(RbacGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  beforeEach(() => {
    Object.values(repo).forEach((mock) => mock.mockReset());
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/pids', () => {
    it('returns 200 with the full list when no filter is supplied', async () => {
      repo.list.mockResolvedValue([STD_RPM, STD_COOLANT]);
      const res = await request(app.getHttpServer()).get('/api/v1/pids').expect(200);
      expect(res.body.total).toBe(2);
      expect(res.body.data[0]).toMatchObject({
        namespace: 'STD_OBD2',
        mode: '01',
        pid: '0C',
        name: 'Engine RPM',
      });
      expect(repo.list).toHaveBeenCalledTimes(1);
    });

    it('returns 200 filtered by ?namespace=STD_OBD2', async () => {
      repo.findByNamespace.mockResolvedValue([STD_RPM, STD_COOLANT]);
      const res = await request(app.getHttpServer())
        .get('/api/v1/pids')
        .query({ namespace: 'STD_OBD2' })
        .expect(200);
      expect(res.body.total).toBe(2);
      expect(repo.findByNamespace).toHaveBeenCalledWith('STD_OBD2');
    });

    it('returns 200 filtered by ?mode=22', async () => {
      repo.findByMode.mockResolvedValue([GME_RPM]);
      await request(app.getHttpServer()).get('/api/v1/pids').query({ mode: '22' }).expect(200);
      expect(repo.findByMode).toHaveBeenCalledWith('22');
    });
  });

  describe('GET /api/v1/pids/:id', () => {
    it('returns 200 with the matching PID definition', async () => {
      repo.findById.mockResolvedValue(STD_RPM);
      const res = await request(app.getHttpServer()).get(`/api/v1/pids/${STD_RPM.id}`).expect(200);
      expect(res.body).toMatchObject({
        id: STD_RPM.id,
        namespace: 'STD_OBD2',
        mode: '01',
        pid: '0C',
      });
      expect(repo.findById).toHaveBeenCalledWith(STD_RPM.id);
    });

    it('returns 404 PID_NOT_DEFINED for an unknown id', async () => {
      repo.findById.mockResolvedValue(null);
      const res = await request(app.getHttpServer())
        .get('/api/v1/pids/00000000-0000-0000-0000-000000000000')
        .expect(404);
      expect(res.body.code).toBe('PID_NOT_DEFINED');
    });
  });

  describe('GET /api/v1/pids/mode/:mode/pid/:pid', () => {
    it('returns 200 with namespace + mode + pid lookup', async () => {
      repo.findByNamespaceModeAndPid.mockResolvedValue(GME_RPM);
      const res = await request(app.getHttpServer())
        .get('/api/v1/pids/mode/22/pid/220C')
        .query({ namespace: 'GME' })
        .expect(200);
      expect(res.body).toMatchObject({
        namespace: 'GME',
        mode: '22',
        pid: '220C',
      });
      expect(repo.findByNamespaceModeAndPid).toHaveBeenCalledWith('GME', '22', '220C');
    });

    it('defaults mode 01 lookup to STD_OBD2 when namespace is omitted', async () => {
      repo.findByNamespaceModeAndPid.mockResolvedValue(STD_RPM);
      await request(app.getHttpServer()).get('/api/v1/pids/mode/01/pid/0c').expect(200);
      expect(repo.findByNamespaceModeAndPid).toHaveBeenCalledWith('STD_OBD2', '01', '0C');
    });

    it('returns PID_NAMESPACE_REQUIRED when mode + pid is ambiguous', async () => {
      repo.findByModeAndPid.mockResolvedValue([
        { ...GME_RPM, namespace: 'GME' },
        { ...GME_RPM, id: 'other', namespace: 'OTHER' },
      ]);
      const res = await request(app.getHttpServer())
        .get('/api/v1/pids/mode/22/pid/220C')
        .expect(400);
      expect(res.body.code).toBe('PID_NAMESPACE_REQUIRED');
    });

    it('returns 404 PID_NOT_DEFINED when the PID is not in the catalog', async () => {
      repo.findByNamespaceModeAndPid.mockResolvedValue(null);
      const res = await request(app.getHttpServer()).get('/api/v1/pids/mode/01/pid/FF').expect(404);
      expect(res.body.code).toBe('PID_NOT_DEFINED');
    });

    it('returns 400 INVALID_MODE for an unknown mode', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/pids/mode/99/pid/0C').expect(400);
      expect(res.body.code).toBe('INVALID_MODE');
    });

    it('returns 400 INVALID_NAMESPACE for an unknown namespace', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/pids/mode/22/pid/220C')
        .query({ namespace: 'UNKNOWN' })
        .expect(400);
      expect(res.body.code).toBe('INVALID_NAMESPACE');
    });

    it('returns 400 INVALID_PID for a malformed PID', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/pids/mode/01/pid/ZZZ')
        .expect(400);
      expect(res.body.code).toBe('INVALID_PID');
    });
  });
});
