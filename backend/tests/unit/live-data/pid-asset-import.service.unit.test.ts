import { toCreateInput } from '../../../src/live-data/services/pid-asset-import.service';

describe('PidAssetImportService row mapping', () => {
  it('maps GM model-pids.sqlite rows to GME namespace and Mode 22', () => {
    const row = {
      model: 'GME',
      pid: '221101',
      equation: 'A - 40',
      unit: 'deg',
      description: 'Engine Coolant Temperature',
    };

    expect(toCreateInput(row, row.equation, 'model-pids-sqlite')).toEqual({
      namespace: 'GME',
      mode: '22',
      pid: '221101',
      name: 'Engine Coolant Temperature',
      unit: 'deg',
      formula: 'A - 40',
      min: null,
      max: null,
      source: 'model-pids-sqlite',
    });
  });
});
