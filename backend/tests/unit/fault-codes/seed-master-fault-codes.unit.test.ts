import { FaultCodeSystem, FaultSeverity } from '@prisma/client';
import {
  importRows,
  inferSystemForCode,
  normalizeRows,
  SOURCE,
  type SourceCodeRow,
} from '../../../prisma/seed/seed-master-fault-codes';

describe('seed-master-fault-codes', () => {
  describe('inferSystemForCode', () => {
    it.each([
      ['P0301', FaultCodeSystem.POWERTRAIN],
      ['B1001', FaultCodeSystem.BODY],
      ['C0035', FaultCodeSystem.CHASSIS],
      ['U0100', FaultCodeSystem.NETWORK],
    ])('maps %s to %s', (code, expected) => {
      expect(inferSystemForCode(code)).toBe(expected);
    });

    it('maps unrecognized prefixes to UNKNOWN', () => {
      expect(inferSystemForCode('X9999')).toBe(FaultCodeSystem.UNKNOWN);
      expect(inferSystemForCode('1')).toBe(FaultCodeSystem.UNKNOWN);
    });

    it('returns UNKNOWN for empty string', () => {
      expect(inferSystemForCode('')).toBe(FaultCodeSystem.UNKNOWN);
    });
  });

  describe('normalizeRows', () => {
    it('uppercases codes and dedupes', () => {
      const input: SourceCodeRow[] = [
        { id: 'p0301', description: 'Misfire' },
        { id: 'P0301', description: 'Misfire dup' },
      ];
      const result = normalizeRows(input);
      expect(result).toHaveLength(1);
      expect(result[0].code).toBe('P0301');
      expect(result[0].title).toBe('Misfire dup');
      expect(result[0].system).toBe(FaultCodeSystem.POWERTRAIN);
    });

    it('skips empty or too-long codes', () => {
      const input: SourceCodeRow[] = [
        { id: '', description: 'empty' },
        { id: 'TOOLONGCODENAME', description: 'too long' },
        { id: 'P0001', description: 'valid' },
      ];
      const result = normalizeRows(input);
      expect(result).toHaveLength(1);
      expect(result[0].code).toBe('P0001');
    });

    it('trims descriptions and uses null for empty descriptions', () => {
      const input: SourceCodeRow[] = [
        { id: 'P0001', description: '  hello  ' },
        { id: 'P0002', description: '   ' },
        { id: 'P0003', description: null },
      ];
      const result = normalizeRows(input);
      const p0001 = result.find((r) => r.code === 'P0001')!;
      const p0002 = result.find((r) => r.code === 'P0002')!;
      const p0003 = result.find((r) => r.code === 'P0003')!;
      expect(p0001.title).toBe('hello');
      expect(p0001.description).toBe('hello');
      expect(p0002.title).toBeNull();
      expect(p0003.title).toBeNull();
    });

    it('sets system on every normalized row', () => {
      const result = normalizeRows([
        { id: 'P0001', description: 'a' },
        { id: 'B0001', description: 'b' },
        { id: 'C0001', description: 'c' },
        { id: 'U0001', description: 'u' },
        { id: 'X9999', description: 'x' },
      ]);
      const byCode = new Map(result.map((r) => [r.code, r]));
      expect(byCode.get('P0001')!.system).toBe(FaultCodeSystem.POWERTRAIN);
      expect(byCode.get('B0001')!.system).toBe(FaultCodeSystem.BODY);
      expect(byCode.get('C0001')!.system).toBe(FaultCodeSystem.CHASSIS);
      expect(byCode.get('U0001')!.system).toBe(FaultCodeSystem.NETWORK);
      expect(byCode.get('X9999')!.system).toBe(FaultCodeSystem.UNKNOWN);
    });
  });

  describe('importRows', () => {
    type FindManyArgs = { where: { code: { in: string[] } }; select: unknown };
    type CreateManyArgs = { data: Array<Record<string, unknown>>; skipDuplicates?: boolean };
    type UpdateArgs = { where: { code: string }; data: Record<string, unknown> };

    function makeMockClient(opts: { existing?: string[] } = {}) {
      const existing = new Set(opts.existing ?? []);
      const findManyCalls: FindManyArgs[] = [];
      const createManyCalls: CreateManyArgs[] = [];
      const updateCalls: UpdateArgs[] = [];
      const client = {
        masterFaultCode: {
          findMany: jest.fn(async (args: FindManyArgs) => {
            findManyCalls.push(args);
            const wanted = args.where.code.in;
            return wanted
              .filter((c) => existing.has(c))
              .map((code) => ({ code }));
          }),
          createMany: jest.fn(async (args: CreateManyArgs) => {
            createManyCalls.push(args);
            return { count: args.data.length };
          }),
          update: jest.fn(async (args: UpdateArgs) => {
            updateCalls.push(args);
            return {
              code: args.where.code,
              createdAt: new Date(0),
              updatedAt: new Date(),
            };
          }),
        },
      };
      return { client, findManyCalls, createManyCalls, updateCalls };
    }

    it('queries existing rows by code list, then bulk-inserts new ones', async () => {
      const { client, findManyCalls, createManyCalls, updateCalls } =
        makeMockClient({ existing: ['P0301'] });
      const rows = normalizeRows([
        { id: 'P0301', description: 'Misfire' },
        { id: 'U0100', description: 'Lost comms' },
      ]);
      const result = await importRows(client as any, rows);
      expect(findManyCalls).toHaveLength(1);
      expect(findManyCalls[0].where.code.in.sort()).toEqual(
        ['P0301', 'U0100'].sort(),
      );
      expect(createManyCalls).toHaveLength(1);
      expect(createManyCalls[0].data).toEqual([
        {
          code: 'U0100',
          title: 'Lost comms',
          description: 'Lost comms',
          system: FaultCodeSystem.NETWORK,
          source: SOURCE,
          manufacturer: null,
          isGeneric: true,
        },
      ]);
      expect(createManyCalls[0].skipDuplicates).toBe(true);
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0].where).toEqual({ code: 'P0301' });
      expect(result.inserted).toBe(1);
      expect(result.updated).toBe(1);
    });

    it('does not write severity, commonCauses, or recommendedChecks (owned by enrichment)', async () => {
      const { client, createManyCalls, updateCalls } = makeMockClient({
        existing: ['P0301'],
      });
      // Mix one pre-existing code (update path) with one new (create path)
      // so the test exercises both branches.
      const rows = normalizeRows([
        { id: 'P0301', description: 'Misfire' },
        { id: 'U0100', description: 'Lost comms' },
      ]);
      await importRows(client as any, rows);
      const created = createManyCalls[0].data[0];
      const updated = updateCalls[0].data;
      expect(created).not.toHaveProperty('severity');
      expect(created).not.toHaveProperty('commonCauses');
      expect(created).not.toHaveProperty('recommendedChecks');
      expect(updated).not.toHaveProperty('severity');
      expect(updated).not.toHaveProperty('commonCauses');
      expect(updated).not.toHaveProperty('recommendedChecks');
    });

    it('reports all-new as inserted when no codes pre-exist', async () => {
      const { client } = makeMockClient();
      const rows = normalizeRows([
        { id: 'P0301', description: 'Misfire' },
        { id: 'P0302', description: 'Misfire 2' },
      ]);
      const result = await importRows(client as any, rows);
      expect(result.inserted).toBe(2);
      expect(result.updated).toBe(0);
    });

    it('reports all-existing as updated when all codes pre-exist', async () => {
      const { client } = makeMockClient({
        existing: ['P0301', 'P0302'],
      });
      const rows = normalizeRows([
        { id: 'P0301', description: 'Misfire' },
        { id: 'P0302', description: 'Misfire 2' },
      ]);
      const result = await importRows(client as any, rows);
      expect(result.inserted).toBe(0);
      expect(result.updated).toBe(2);
    });

    it('returns a normalizedRows count equal to input', async () => {
      const { client } = makeMockClient();
      const rows = normalizeRows([
        { id: 'P0301', description: 'a' },
        { id: 'P0302', description: 'b' },
        { id: 'P0303', description: 'c' },
      ]);
      const result = await importRows(client as any, rows);
      expect(result.normalizedRows).toBe(3);
    });

    it('sets manufacturer=null, isGeneric=true, source=code-descriptions.sqlite on every row', async () => {
      const { client, createManyCalls, updateCalls } = makeMockClient({
        existing: ['B0001'],
      });
      const rows = normalizeRows([
        { id: 'P0301', description: 'a' },
        { id: 'B0001', description: 'b' },
      ]);
      await importRows(client as any, rows);
      const created = createManyCalls[0].data[0];
      const updated = updateCalls[0].data;
      expect(created.manufacturer).toBeNull();
      expect(created.isGeneric).toBe(true);
      expect(created.source).toBe(SOURCE);
      expect(updated.manufacturer).toBeNull();
      expect(updated.isGeneric).toBe(true);
      expect(updated.source).toBe(SOURCE);
    });

    it('skips createMany when every code already exists', async () => {
      const { client, createManyCalls, updateCalls } = makeMockClient({
        existing: ['P0301'],
      });
      const rows = normalizeRows([{ id: 'P0301', description: 'Misfire' }]);
      await importRows(client as any, rows);
      expect(createManyCalls).toHaveLength(0);
      expect(updateCalls).toHaveLength(1);
    });
  });
});
