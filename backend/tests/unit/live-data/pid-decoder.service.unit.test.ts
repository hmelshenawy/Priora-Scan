import {
  PidDecoderService,
  evaluateFormula,
  parseHexBytes,
} from '../../../src/live-data/services/pid-decoder.service';
import { PidDefinitionRepository } from '../../../src/live-data/repositories/pid-definition.repository';

const STD_DEFS: Record<string, { id: string; name: string; unit: string; formula: string }> = {
  '0C': { id: 'pid-0c', name: 'Engine RPM', unit: 'RPM', formula: '(A * 256 + B) / 4' },
  '0D': { id: 'pid-0d', name: 'Vehicle Speed', unit: 'km/h', formula: 'A' },
  '05': { id: 'pid-05', name: 'Engine Coolant Temperature', unit: '°C', formula: 'A - 40' },
  '42': {
    id: 'pid-42',
    name: 'Control Module Voltage',
    unit: 'V',
    formula: '(A * 256 + B) / 1000',
  },
  '11': { id: 'pid-11', name: 'Throttle Position', unit: '%', formula: 'A * 100 / 255' },
  '04': { id: 'pid-04', name: 'Calculated Engine Load', unit: '%', formula: 'A * 100 / 255' },
  '06': {
    id: 'pid-06',
    name: 'Short Term Fuel Trim Bank 1',
    unit: '%',
    formula: '(A - 128) * 100 / 128',
  },
  '07': {
    id: 'pid-07',
    name: 'Long Term Fuel Trim Bank 1',
    unit: '%',
    formula: '(A - 128) * 100 / 128',
  },
  '10': { id: 'pid-10', name: 'MAF Air Flow', unit: 'g/s', formula: '(A * 256 + B) / 100' },
  '0F': { id: 'pid-0f', name: 'Intake Air Temperature', unit: '°C', formula: 'A - 40' },
  '14': { id: 'pid-14', name: 'O2 Sensor Bank 1 Sensor 1 Voltage', unit: 'V', formula: 'A / 200' },
};

describe('PidDecoderService', () => {
  let service: PidDecoderService;
  let repo: jest.Mocked<PidDefinitionRepository>;

  beforeEach(() => {
    repo = {
      findByNamespaceModeAndPid: jest.fn(async (namespace, mode, pid) => {
        if (namespace !== 'STD_OBD2' || mode !== '01') return null;
        const def = STD_DEFS[pid];
        if (!def) return null;
        return {
          id: def.id,
          namespace,
          mode,
          pid,
          name: def.name,
          unit: def.unit,
          formula: def.formula,
          min: null,
          max: null,
          source: 'built-in-mvp',
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any;
      }),
    } as unknown as jest.Mocked<PidDefinitionRepository>;
    service = new PidDecoderService(repo);
  });

  describe('11 MVP happy paths', () => {
    const cases: Array<{
      pid: string;
      raw: string;
      expected: number | null;
      status: 'OK' | 'NO_DATA' | 'NOT_SUPPORTED' | 'ERROR';
    }> = [
      { pid: '0C', raw: '12 38', expected: 1166, status: 'OK' }, // (0x12*256 + 0x38) / 4 = 1166 RPM
      { pid: '0D', raw: '00', expected: 0, status: 'OK' },
      { pid: '05', raw: '84', expected: 92, status: 'OK' }, // 0x84 = 132, -40 = 92 °C
      { pid: '42', raw: '21 49', expected: 8.521, status: 'OK' }, // (0x21*256 + 0x49) / 1000 = 8.521 V
      { pid: '11', raw: 'B4', expected: 70.58823529411765, status: 'OK' }, // 180*100/255 ≈ 70.59 %
      { pid: '04', raw: 'B4', expected: 70.58823529411765, status: 'OK' },
      { pid: '06', raw: 'B0', expected: 37.5, status: 'OK' }, // (176-128)*100/128 = 37.5 %
      { pid: '07', raw: 'B0', expected: 37.5, status: 'OK' },
      { pid: '10', raw: '00 64', expected: 1, status: 'OK' }, // (0*256+100)/100 = 1
      { pid: '0F', raw: '50', expected: 40, status: 'OK' }, // 80-40 = 40
      { pid: '14', raw: 'A0', expected: 0.8, status: 'OK' }, // 160/200 = 0.8 V
    ];

    for (const tc of cases) {
      it(`decodes PID ${tc.pid} from raw ${tc.raw} -> ${tc.expected}`, async () => {
        const out = await service.decode('STD_OBD2', '01', tc.pid, tc.raw);
        expect(out.status).toBe(tc.status);
        expect(out.value).toBe(tc.expected);
        expect(out.errorCode).toBeNull();
      });
    }
  });

  describe('real adapter live-data payloads', () => {
    const cases: Array<{
      shortName: string;
      pid: string;
      raw: string;
      expected: number;
      unit: string;
    }> = [
      { shortName: 'rpm', pid: '0C', raw: '0E 35', expected: 909.25, unit: 'RPM' },
      { shortName: 'speed', pid: '0D', raw: '00', expected: 0, unit: 'km/h' },
      { shortName: 'coolantTemp', pid: '05', raw: '7E', expected: 86, unit: '°C' },
      { shortName: 'batteryVoltage', pid: '42', raw: '34 1B', expected: 13.339, unit: 'V' },
      { shortName: 'engineLoad', pid: '04', raw: '79', expected: 47.450980392156865, unit: '%' },
    ];

    for (const tc of cases) {
      it(`decodes ${tc.shortName} ${tc.raw} as OK`, async () => {
        const out = await service.decode('STD_OBD2', '01', tc.pid, tc.raw);
        expect(out.status).toBe('OK');
        expect(out.errorCode).toBeNull();
        expect(out.value).toBeCloseTo(tc.expected, 6);
        expect(out.unit).toBe(tc.unit);
      });
    }
  });

  describe('edge cases', () => {
    it('strips a leading 41 (Mode 01 response header) from the payload', async () => {
      const out = await service.decode('STD_OBD2', '01', '0C', '41 12 38');
      expect(out.status).toBe('OK');
      expect(out.value).toBe(1166);
    });

    it('returns NO_DATA for an empty raw payload', async () => {
      const out = await service.decode('STD_OBD2', '01', '0C', '');
      expect(out.status).toBe('NO_DATA');
      expect(out.value).toBeNull();
      expect(out.errorCode).toBeNull();
    });

    it('returns NO_DATA for whitespace-only raw payload', async () => {
      const out = await service.decode('STD_OBD2', '01', '0C', '   ');
      expect(out.status).toBe('NO_DATA');
    });

    it('returns NOT_SUPPORTED when the PID is not defined', async () => {
      const out = await service.decode('STD_OBD2', '01', 'FF', '00');
      expect(out.status).toBe('NOT_SUPPORTED');
      expect(out.errorCode).toBe('PID_NOT_DEFINED');
    });

    it('returns ERROR with B_UNDEFINED for 1-byte PIDs that need B', async () => {
      const out = await service.decode('STD_OBD2', '01', '0C', '12');
      expect(out.status).toBe('ERROR');
      expect(out.errorCode).toBe('B_UNDEFINED');
    });

    it('returns ERROR with INVALID_HEX for malformed hex', async () => {
      const out = await service.decode('STD_OBD2', '01', '0D', 'ZZ');
      expect(out.status).toBe('ERROR');
      expect(out.errorCode).toBe('INVALID_HEX');
    });

    it('returns ERROR with PID_FORMULA_INVALID for a stored formula outside the grammar', async () => {
      repo.findByNamespaceModeAndPid.mockResolvedValueOnce({
        id: 'x',
        namespace: 'STD_OBD2',
        mode: '01',
        pid: '0C',
        name: 'Bad',
        unit: 'RPM',
        // Identifiers that the parser must reject.
        formula: 'Math.PI',
        min: null,
        max: null,
        source: 'built-in-mvp',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      const out = await service.decode('STD_OBD2', '01', '0C', '12 38');
      expect(out.status).toBe('ERROR');
      expect(out.errorCode).toBe('PID_FORMULA_INVALID');
    });
  });

  describe('formula grammar — negative cases (Correction 5)', () => {
    const badFormulas = [
      'Math.PI', // identifier other than A / B
      'A.B', // property access
      'A + process.exit(0)', // function call + identifier
      'function() { return 1; }', // script
      'eval("1")', // eval
      'new Function("return 1")', // Function constructor
      'A + B +', // trailing operator
      '(A + B', // unbalanced paren
      'A ** B', // unsupported operator
      'A + 1.', // malformed decimal
      '.5 + A', // decimals must start with a digit
      'true', // boolean literal
      '"hello"', // string literal
      "import('x')", // dynamic import
    ];

    for (const formula of badFormulas) {
      it(`rejects: ${formula}`, () => {
        expect(() => evaluateFormula(formula, 0, 0)).toThrow();
      });
    }

    it('rejects identifiers other than A or B (e.g. C, X, Y, Z)', () => {
      try {
        evaluateFormula('C + 1', 0, 0);
        throw new Error('expected throw');
      } catch (err) {
        expect((err as { code?: string }).code).toBe('PID_FORMULA_INVALID');
      }
      try {
        evaluateFormula('X', 0, 0);
        throw new Error('expected throw');
      } catch (err) {
        expect((err as { code?: string }).code).toBe('PID_FORMULA_INVALID');
      }
    });

    it('rejects A1 as a single identifier (A followed by digit)', () => {
      try {
        evaluateFormula('A1', 0, 0);
        throw new Error('expected throw');
      } catch (err) {
        expect((err as { code?: string }).code).toBe('PID_FORMULA_INVALID');
      }
    });
  });

  describe('formula grammar — positive cases', () => {
    it('evaluates A + B', () => {
      expect(evaluateFormula('A + B', 2, 3)).toBe(5);
    });
    it('evaluates A - 40', () => {
      expect(evaluateFormula('A - 40', 92, 0)).toBe(52);
    });
    it('evaluates (A * 256 + B) / 4', () => {
      expect(evaluateFormula('(A * 256 + B) / 4', 0x12, 0x38)).toBe(1166);
    });
    it('evaluates (A * 100) / 255', () => {
      expect(evaluateFormula('(A * 100) / 255', 180, 0)).toBeCloseTo(70.5882, 3);
    });
    it('evaluates A / 200', () => {
      expect(evaluateFormula('A / 200', 160, 0)).toBe(0.8);
    });
    it('uses real (floating-point) division', () => {
      expect(evaluateFormula('A / 4', 5, 0)).toBe(1.25);
      expect(evaluateFormula('A / 4', -5, 0)).toBe(-1.25);
    });
    it('evaluates decimal constants from model-pids.sqlite formulas', () => {
      expect(evaluateFormula('(A*0.065)-17.5', 100, 0)).toBeCloseTo(-11, 6);
    });
    it('ignores whitespace', () => {
      expect(evaluateFormula('  A  +  B  ', 1, 2)).toBe(3);
    });
    it('rejects division by zero', () => {
      expect(() => evaluateFormula('A / 0', 1, 0)).toThrow();
    });
  });

  describe('validateFormula', () => {
    it('returns null for a valid formula', () => {
      expect(service.validateFormula('A - 40')).toBeNull();
    });
    it('returns null for a valid formula with decimal constants', () => {
      expect(service.validateFormula('(A*0.065)-17.5')).toBeNull();
    });
    it('returns PID_FORMULA_INVALID for a bad formula', () => {
      expect(service.validateFormula('Math.PI')).toBe('PID_FORMULA_INVALID');
    });
  });

  describe('parseHexBytes', () => {
    it('parses space-separated hex into a byte array', () => {
      const out = parseHexBytes('12 38');
      expect(Array.from(out as Uint8Array)).toEqual([0x12, 0x38]);
    });
    it('tolerates lowercase and leading-zero-less tokens', () => {
      const out = parseHexBytes('ab cd');
      expect(Array.from(out as Uint8Array)).toEqual([0xab, 0xcd]);
    });
    it('returns null for an invalid token', () => {
      expect(parseHexBytes('12 ZZ')).toBeNull();
    });
    it('returns null for a too-long token', () => {
      expect(parseHexBytes('123')).toBeNull();
    });
  });
});
