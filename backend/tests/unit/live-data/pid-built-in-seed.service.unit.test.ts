import { PidBuiltInSeedService } from '../../../src/live-data/services/pid-built-in-seed.service';
import { BUILT_IN_MVP_PIDS } from '../../../src/live-data/constants/built-in-pids';
import { PidDefinitionRepository } from '../../../src/live-data/repositories/pid-definition.repository';

describe('PidBuiltInSeedService', () => {
  it('upserts the built-in STD_OBD2 MVP PID definitions on bootstrap', async () => {
    const repo = {
      upsert: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<PidDefinitionRepository>;
    const service = new PidBuiltInSeedService(repo);

    const result = await service.run();

    expect(result.upserted).toBe(BUILT_IN_MVP_PIDS.length);
    expect(repo.upsert).toHaveBeenCalledTimes(BUILT_IN_MVP_PIDS.length);
    expect(repo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'STD_OBD2',
        mode: '01',
        pid: '0C',
        name: 'Engine RPM',
        formula: '(A * 256 + B) / 4',
        source: 'built-in-mvp',
      }),
    );
  });

  it('runs from the Nest application bootstrap hook', async () => {
    const repo = {
      upsert: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<PidDefinitionRepository>;
    const service = new PidBuiltInSeedService(repo);

    await service.onApplicationBootstrap();

    expect(repo.upsert).toHaveBeenCalledTimes(BUILT_IN_MVP_PIDS.length);
  });
});
