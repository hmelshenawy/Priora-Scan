import { FaultCodeSystem } from '@prisma/client';
import { inferSystem } from '../../../src/fault-codes/rules/system-prefix.rules';

describe('inferSystem (system-prefix.rules)', () => {
  it.each([
    ['P0301', FaultCodeSystem.POWERTRAIN],
    ['P0001', FaultCodeSystem.POWERTRAIN],
    ['P30FF', FaultCodeSystem.POWERTRAIN],
    ['B1001', FaultCodeSystem.BODY],
    ['C0035', FaultCodeSystem.CHASSIS],
    ['U0100', FaultCodeSystem.NETWORK],
  ])('maps %s to %s', (code, expected) => {
    expect(inferSystem(code)).toBe(expected);
  });

  it('uppercases lowercase input', () => {
    expect(inferSystem('p0301')).toBe(FaultCodeSystem.POWERTRAIN);
    expect(inferSystem('b1001')).toBe(FaultCodeSystem.BODY);
    expect(inferSystem('u0100')).toBe(FaultCodeSystem.NETWORK);
  });

  it('returns UNKNOWN for unrecognized prefix', () => {
    expect(inferSystem('X9999')).toBe(FaultCodeSystem.UNKNOWN);
    expect(inferSystem('Z1234')).toBe(FaultCodeSystem.UNKNOWN);
  });

  it('returns UNKNOWN for empty or null input', () => {
    expect(inferSystem('')).toBe(FaultCodeSystem.UNKNOWN);
    expect(inferSystem(null as unknown as string)).toBe(FaultCodeSystem.UNKNOWN);
    expect(inferSystem(undefined as unknown as string)).toBe(
      FaultCodeSystem.UNKNOWN,
    );
  });

  it('returns UNKNOWN when only a non-PBCU character is present', () => {
    expect(inferSystem('1')).toBe(FaultCodeSystem.UNKNOWN);
    expect(inferSystem('!')).toBe(FaultCodeSystem.UNKNOWN);
  });

  it('handles full-length OBD-II codes', () => {
    expect(inferSystem('P12345678')).toBe(FaultCodeSystem.POWERTRAIN);
  });
});
