import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AuthGuard } from '../../src/guards/auth.guard';
import { TenantGuard } from '../../src/guards/tenant.guard';
import { RbacGuard } from '../../src/guards/rbac.guard';
import { VehicleController } from '../../src/vehicles/controllers/vehicle.controller';
import { VehicleService } from '../../src/vehicles/services/vehicle.service';
import { VehicleDecodeService } from '../../src/vehicles/services/vehicle-decode.service';
import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

describe('GET /api/v1/vehicles/decode — contract', () => {
  let app: INestApplication;
  let vehicleDecodeService: {
    decodeVin: jest.Mock;
    validateVin: jest.Mock;
  };

  const orgId = '11111111-1111-1111-1111-111111111111';
  const userId = '22222222-2222-2222-2222-222222222222';

  beforeAll(async () => {
    vehicleDecodeService = {
      decodeVin: jest.fn(),
      validateVin: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [VehicleController],
      providers: [
        { provide: VehicleService, useValue: {} },
        { provide: VehicleDecodeService, useValue: vehicleDecodeService },
      ],
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
            permissions: ['read:vehicle'],
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
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with the decoded record on a valid VIN (cache hit)', async () => {
    vehicleDecodeService.decodeVin.mockResolvedValue({
      vin: 'WDD2130041A123456',
      make: 'Mercedes-Benz',
      model: 'C-Class',
      year: 2020,
      engine: '3.0L V6',
      bodyStyle: 'Sedan',
      manufacturer: 'Daimler AG',
      source: 'vpic-asset',
      decodedAt: new Date('2026-06-11T00:00:00Z'),
      cacheHit: true,
    });
    const res = await request(app.getHttpServer())
      .get('/api/v1/vehicles/decode')
      .query({ vin: 'WDD2130041A123456' })
      .expect(200);
    expect(res.body).toMatchObject({
      vin: 'WDD2130041A123456',
      make: 'Mercedes-Benz',
      cacheHit: true,
    });
  });

  it('returns 400 INVALID_VIN when the service rejects the VIN', async () => {
    const err: any = new BadRequestException({
      code: 'INVALID_VIN',
      message: 'Invalid VIN.',
    });
    err.code = 'INVALID_VIN';
    vehicleDecodeService.decodeVin.mockImplementation(() => {
      throw err;
    });
    const res = await request(app.getHttpServer())
      .get('/api/v1/vehicles/decode')
      .query({ vin: 'WB' })
      .expect(400);
    expect(res.body.code).toBe('INVALID_VIN');
  });

  it('returns 404 VIN_NOT_DECODED when the asset returns nothing', async () => {
    const err: any = new NotFoundException({
      code: 'VIN_NOT_DECODED',
      message: 'VIN not found',
    });
    err.code = 'VIN_NOT_DECODED';
    vehicleDecodeService.decodeVin.mockImplementation(() => {
      throw err;
    });
    const res = await request(app.getHttpServer())
      .get('/api/v1/vehicles/decode')
      .query({ vin: 'XXX00000000000000' })
      .expect(404);
    expect(res.body.code).toBe('VIN_NOT_DECODED');
  });

  it('returns 503 VPIC_ASSET_UNAVAILABLE when the asset is not loaded', async () => {
    const err: any = new ServiceUnavailableException({
      code: 'VPIC_ASSET_UNAVAILABLE',
      message: 'Asset not loaded',
    });
    err.code = 'VPIC_ASSET_UNAVAILABLE';
    vehicleDecodeService.decodeVin.mockImplementation(() => {
      throw err;
    });
    const res = await request(app.getHttpServer())
      .get('/api/v1/vehicles/decode')
      .query({ vin: 'WDD2130041A123456' })
      .expect(503);
    expect(res.body.code).toBe('VPIC_ASSET_UNAVAILABLE');
  });
});
