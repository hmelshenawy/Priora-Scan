// Mock better-sqlite3 at the module level so the VpicAssetService constructor
// can be called with a stub. The service uses `require('better-sqlite3')`
// (CJS-style) for interop, so the mock factory must return a function
// constructor (not an object with a default property).
const fakeDbHandle = {
  prepare: jest.fn(),
  pragma: jest.fn(),
  close: jest.fn(),
};

jest.mock('better-sqlite3', () => jest.fn(() => fakeDbHandle));

import { VpicAssetService } from '../../../src/vehicles/services/vpic-asset.service';
import { AssetLoaderService } from '../../../src/shared/assets/asset-loader.service';

const fakeDb = fakeDbHandle as unknown as {
  prepare: jest.Mock;
  pragma: jest.Mock;
  close: jest.Mock;
};

describe('VpicAssetService', () => {
  let assetLoader: jest.Mocked<AssetLoaderService>;
  let service: VpicAssetService;

  beforeEach(() => {
    fakeDb.prepare.mockReset();
    fakeDb.pragma.mockReset();
    fakeDb.close.mockReset();
    assetLoader = {
      materialize: jest.fn(),
    } as unknown as jest.Mocked<AssetLoaderService>;
    service = new VpicAssetService(assetLoader);
  });

  describe('lifecycle', () => {
    it('is not ready when the asset is missing', async () => {
      assetLoader.materialize.mockResolvedValue(null);
      await service.onModuleInit();
      expect(service.isReady()).toBe(false);
    });

    it('opens the database read-only when the asset is present', async () => {
      assetLoader.materialize.mockResolvedValue('C:/data/_runtime/vpic.sqlite');
      await service.onModuleInit();
      expect(service.isReady()).toBe(true);
      expect(fakeDb.pragma).toHaveBeenCalledWith('query_only = true');
    });

    it('closes the database on module destroy', async () => {
      assetLoader.materialize.mockResolvedValue('C:/data/_runtime/vpic.sqlite');
      await service.onModuleInit();
      service.onModuleDestroy();
      expect(fakeDb.close).toHaveBeenCalled();
      expect(service.isReady()).toBe(false);
    });
  });

  describe('decode', () => {
    it('returns null when the service is not ready', () => {
      const out = service.decode('WDD2130041A123456');
      expect(out).toBeNull();
    });

    it('returns null for short VINs', async () => {
      assetLoader.materialize.mockResolvedValue('C:/data/_runtime/vpic.sqlite');
      await service.onModuleInit();
      const out = service.decode('WB');
      expect(out).toBeNull();
    });

    it('returns null when the WMI is not in the asset', async () => {
      assetLoader.materialize.mockResolvedValue('C:/data/_runtime/vpic.sqlite');
      await service.onModuleInit();
      const wmiStmt = {
        get: jest.fn().mockReturnValue(undefined),
        all: jest.fn().mockReturnValue([]),
      };
      fakeDb.prepare.mockReturnValue(wmiStmt as any);
      const out = service.decode('XXX00000000000000');
      expect(out).toBeNull();
    });

    it('decodes a real WMI to a record (smoke)', async () => {
      assetLoader.materialize.mockResolvedValue('C:/data/_runtime/vpic.sqlite');
      await service.onModuleInit();

      // Simulate VPIC rows for a minimal happy path.
      const wmiRow = { id: 1, manufacturerId: 10, makeId: 20 };
      const schemaRow = { vinSchemaId: 100, yearFrom: 2010, yearTo: 2030 };
      // pattern: Make via element 26, Model via element 28
      const patterns = [
        { keys: '******', elementId: 26, attributeId: '20' },
        { keys: '******', elementId: 28, attributeId: '300' },
      ];
      const makeRow = { name: 'Mercedes-Benz' };
      const modelRow = { name: 'C-Class' };
      const mfgRow = { name: 'Daimler AG' };

      let callIndex = 0;
      fakeDb.prepare.mockImplementation((sql: string) => {
        callIndex++;
        if (sql.includes('FROM Wmi WHERE Wmi')) {
          return { get: () => wmiRow, all: () => [] };
        }
        if (sql.includes('FROM Wmi_VinSchema')) {
          return { get: () => undefined, all: () => [schemaRow] };
        }
        if (sql.includes('FROM Pattern')) {
          return { get: () => undefined, all: () => patterns };
        }
        if (sql.includes('FROM Element')) {
          return { get: () => ({ lt: null }), all: () => [] };
        }
        if (sql.includes('FROM Make')) {
          return { get: () => makeRow, all: () => [] };
        }
        if (sql.includes('FROM Model')) {
          return { get: () => modelRow, all: () => [] };
        }
        if (sql.includes('FROM Manufacturer')) {
          return { get: () => mfgRow, all: () => [] };
        }
        if (sql.includes('FROM BodyStyle')) {
          return { get: () => undefined, all: () => [] };
        }
        if (sql.includes('FROM EngineConfiguration')) {
          return { get: () => undefined, all: () => [] };
        }
        return { get: () => undefined, all: () => [] };
      });

      const out = service.decode('WDD2130041A123456');
      expect(out).toMatchObject({
        vin: 'WDD2130041A123456',
        make: 'Mercedes-Benz',
        model: 'C-Class',
        manufacturer: 'Daimler AG',
      });
    });
  });
});
