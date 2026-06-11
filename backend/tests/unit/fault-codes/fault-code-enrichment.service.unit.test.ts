import { FaultCodeSystem, FaultSeverity } from '@prisma/client';
import { DefaultFaultCodeEnrichmentService } from '../../../src/fault-codes/services/default-fault-code-enrichment.service';
import { MasterFaultCodeRepository } from '../../../src/fault-codes/repositories/master-fault-code.repository';

describe('DefaultFaultCodeEnrichmentService', () => {
  let service: DefaultFaultCodeEnrichmentService;
  let repository: jest.Mocked<MasterFaultCodeRepository>;

  beforeEach(() => {
    repository = {
      findByCode: jest.fn(),
      findManyByCodes: jest.fn(),
      upsertMany: jest.fn(),
      count: jest.fn(),
    } as any;
    service = new DefaultFaultCodeEnrichmentService(repository);
  });

  describe('enrichOne', () => {
    it('returns an unknown fallback when the repository has no row', async () => {
      repository.findByCode.mockResolvedValue(null);
      const result = await service.enrichOne('X9999');
      expect(result).toEqual({
        code: 'X9999',
        title: null,
        description: null,
        system: FaultCodeSystem.UNKNOWN,
        severity: FaultSeverity.UNKNOWN,
        commonCauses: [],
        recommendedChecks: [],
        isGeneric: false,
        manufacturer: null,
        source: null,
        hasDescription: false,
      });
    });

    it('uppercases the code before lookup', async () => {
      repository.findByCode.mockResolvedValue(null);
      await service.enrichOne('p0301');
      expect(repository.findByCode).toHaveBeenCalledWith('P0301');
    });

    it('builds the enriched payload from a known row', async () => {
      repository.findByCode.mockResolvedValue({
        id: 'row-1',
        code: 'P0301',
        title: 'Cylinder 1 Misfire Detected',
        description: 'Cylinder 1 Misfire Detected',
        system: FaultCodeSystem.POWERTRAIN,
        severity: FaultSeverity.UNKNOWN,
        commonCauses: null,
        recommendedChecks: null,
        source: 'code-descriptions.sqlite',
        manufacturer: null,
        isGeneric: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const result = await service.enrichOne('P0301');
      expect(result.code).toBe('P0301');
      expect(result.title).toBe('Cylinder 1 Misfire Detected');
      expect(result.description).toBe('Cylinder 1 Misfire Detected');
      expect(result.system).toBe(FaultCodeSystem.POWERTRAIN);
      expect(result.severity).toBe(FaultSeverity.UNKNOWN);
      expect(result.hasDescription).toBe(true);
      expect(result.isGeneric).toBe(true);
      expect(result.manufacturer).toBeNull();
      expect(result.source).toBe('code-descriptions.sqlite');
      expect(result.commonCauses).toEqual([]);
      expect(result.recommendedChecks).toEqual([]);
    });

    it('returns hasDescription=false when title is empty string', async () => {
      repository.findByCode.mockResolvedValue({
        id: 'row-1',
        code: 'P0301',
        title: '',
        description: '',
        system: FaultCodeSystem.POWERTRAIN,
        severity: FaultSeverity.UNKNOWN,
        commonCauses: null,
        recommendedChecks: null,
        source: 'code-descriptions.sqlite',
        manufacturer: null,
        isGeneric: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const result = await service.enrichOne('P0301');
      expect(result.hasDescription).toBe(false);
    });

    it('normalizes JSONB commonCauses to a string array', async () => {
      repository.findByCode.mockResolvedValue({
        id: 'row-1',
        code: 'P0301',
        title: 'Cylinder 1 Misfire Detected',
        description: null,
        system: FaultCodeSystem.POWERTRAIN,
        severity: FaultSeverity.UNKNOWN,
        commonCauses: ['Bad spark plug', 'Faulty ignition coil'],
        recommendedChecks: null,
        source: 'code-descriptions.sqlite',
        manufacturer: null,
        isGeneric: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const result = await service.enrichOne('P0301');
      expect(result.commonCauses).toEqual([
        'Bad spark plug',
        'Faulty ignition coil',
      ]);
    });
  });

  describe('enrichMany', () => {
    it('returns an empty map for an empty input list', async () => {
      const result = await service.enrichMany([]);
      expect(result.size).toBe(0);
      expect(repository.findManyByCodes).not.toHaveBeenCalled();
    });

    it('deduplicates codes and looks them up once', async () => {
      repository.findManyByCodes.mockResolvedValue([
        {
          id: 'r-1',
          code: 'P0301',
          title: 'Cylinder 1 Misfire Detected',
          description: null,
          system: FaultCodeSystem.POWERTRAIN,
          severity: FaultSeverity.UNKNOWN,
          commonCauses: null,
          recommendedChecks: null,
          source: 'code-descriptions.sqlite',
          manufacturer: null,
          isGeneric: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      const result = await service.enrichMany([
        { code: 'p0301', status: 'ACTIVE' },
        { code: 'P0301', status: 'PENDING' },
        { code: 'X9999', status: 'ACTIVE' },
      ]);
      expect(repository.findManyByCodes).toHaveBeenCalledWith([
        'P0301',
        'X9999',
      ]);
      expect(result.size).toBe(2);
      expect(result.get('P0301')?.hasDescription).toBe(true);
      expect(result.get('X9999')?.hasDescription).toBe(false);
    });
  });
});
