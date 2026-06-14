import {
  PidDefinitionRepository,
  normalizePidKey,
} from '../../../src/live-data/repositories/pid-definition.repository';
import { PrismaService } from '../../../src/prisma/prisma.service';

describe('PidDefinitionRepository', () => {
  let prisma: jest.Mocked<PrismaService>;
  let repo: PidDefinitionRepository;

  beforeEach(() => {
    prisma = {
      pIDDefinition: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        upsert: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    } as unknown as jest.Mocked<PrismaService>;
    repo = new PidDefinitionRepository(prisma);
  });

  it('findById uses primary key', async () => {
    await repo.findById('abc');
    expect(prisma.pIDDefinition.findUnique).toHaveBeenCalledWith({
      where: { id: 'abc' },
    });
  });

  it('findByNamespaceModeAndPid uses the composite unique key (GLOBAL — no organizationId)', async () => {
    await repo.findByNamespaceModeAndPid('STD_OBD2', '01', '0C');
    expect(prisma.pIDDefinition.findUnique).toHaveBeenCalledWith({
      where: {
        namespace_mode_pid: {
          namespace: 'STD_OBD2',
          mode: '01',
          pid: '0C',
        },
      },
    });
  });

  it('findByNamespaceModeAndPid normalizes namespace, mode, and pid casing', async () => {
    await repo.findByNamespaceModeAndPid(' std_obd2 ', '1', ' c ');
    expect(prisma.pIDDefinition.findUnique).toHaveBeenCalledWith({
      where: {
        namespace_mode_pid: {
          namespace: 'STD_OBD2',
          mode: '01',
          pid: '0C',
        },
      },
    });
  });

  it('normalizes accidental combined standard PID values without looking up 010C', () => {
    expect(normalizePidKey('std_obd2', '01', '010C')).toEqual({
      namespace: 'STD_OBD2',
      mode: '01',
      pid: '0C',
    });
  });

  it('findByNamespace orders by mode then pid asc', async () => {
    await repo.findByNamespace('STD_OBD2');
    expect(prisma.pIDDefinition.findMany).toHaveBeenCalledWith({
      where: { namespace: 'STD_OBD2' },
      orderBy: [{ mode: 'asc' }, { pid: 'asc' }],
    });
  });

  it('findByModeAndPid returns all namespace matches', async () => {
    await repo.findByModeAndPid('22', '221101');
    expect(prisma.pIDDefinition.findMany).toHaveBeenCalledWith({
      where: { mode: '22', pid: '221101' },
      orderBy: { namespace: 'asc' },
    });
  });

  it('list returns every row ordered by namespace then mode then pid', async () => {
    await repo.list();
    expect(prisma.pIDDefinition.findMany).toHaveBeenCalledWith({
      orderBy: [{ namespace: 'asc' }, { mode: 'asc' }, { pid: 'asc' }],
    });
  });

  it('upsert uses the composite unique key', async () => {
    await repo.upsert({
      namespace: 'STD_OBD2',
      mode: '01',
      pid: '0C',
      name: 'Engine RPM',
      unit: 'RPM',
      formula: '(A * 256 + B) / 4',
    } as any);
    expect(prisma.pIDDefinition.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          namespace_mode_pid: {
            namespace: 'STD_OBD2',
            mode: '01',
            pid: '0C',
          },
        },
      }),
    );
  });

  it('upsertMany batches via $transaction', async () => {
    prisma.$transaction.mockResolvedValue([] as any);
    await repo.upsertMany([
      {
        namespace: 'GME',
        mode: '22',
        pid: '221101',
        name: 'ECT',
        unit: 'deg',
        formula: 'A - 40',
      } as any,
      {
        namespace: 'GME',
        mode: '22',
        pid: '221102',
        name: 'IAT',
        unit: 'deg',
        formula: 'A - 40',
      } as any,
    ]);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.pIDDefinition.upsert).toHaveBeenCalledTimes(2);
  });

  it('allows the same mode + pid across different namespaces', async () => {
    prisma.$transaction.mockResolvedValue([] as any);
    await repo.upsertMany([
      {
        namespace: 'GME',
        mode: '22',
        pid: '221101',
        name: 'GME ECT',
        unit: 'deg',
        formula: 'A - 40',
      } as any,
      {
        namespace: 'OTHER',
        mode: '22',
        pid: '221101',
        name: 'Other ECT',
        unit: 'deg',
        formula: 'A - 40',
      } as any,
    ]);

    expect(prisma.pIDDefinition.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          namespace_mode_pid: {
            namespace: 'GME',
            mode: '22',
            pid: '221101',
          },
        },
      }),
    );
    expect(prisma.pIDDefinition.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          namespace_mode_pid: {
            namespace: 'OTHER',
            mode: '22',
            pid: '221101',
          },
        },
      }),
    );
  });

  it('count delegates to prisma', async () => {
    await repo.count();
    expect(prisma.pIDDefinition.count).toHaveBeenCalled();
  });
});
