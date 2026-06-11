/**
 * End-to-end seed test against the actual code-descriptions.sqlite asset.
 * Skips gracefully when the asset is not present.
 *
 * Verifies the spec's most important properties:
 *   - ~4,000+ rows can be normalized
 *   - P/B/C/U prefixes infer to the right system
 *   - P0301 has a non-empty description
 *   - No duplicate codes (after normalization)
 */
import { existsSync } from 'fs';
import { resolve } from 'path';
import {
  inferSystemForCode,
  normalizeRows,
  readSourceRows,
} from '../../../prisma/seed/seed-master-fault-codes';

const SQLITE_PATH = resolve(
  __dirname,
  '..',
  '..',
  '..',
  'data',
  'code-descriptions.sqlite',
);

const describeIfAsset = existsSync(SQLITE_PATH) ? describe : describe.skip;

describeIfAsset('seed against code-descriptions.sqlite (end-to-end)', () => {
  it('reads the source file and produces >= 4,000 rows', () => {
    const rows = readSourceRows(SQLITE_PATH);
    const normalized = normalizeRows(rows);
    expect(normalized.length).toBeGreaterThanOrEqual(4000);
  });

  it('contains P0301 with a non-empty description', () => {
    const rows = readSourceRows(SQLITE_PATH);
    const normalized = normalizeRows(rows);
    const p0301 = normalized.find((r) => r.code === 'P0301');
    expect(p0301).toBeDefined();
    expect(p0301!.title).toBeTruthy();
    expect(p0301!.description).toBeTruthy();
  });

  it('infers the correct system for P/B/C/U codes', () => {
    const rows = readSourceRows(SQLITE_PATH);
    const normalized = normalizeRows(rows);
    expect(inferSystemForCode('P0301')).toBe('POWERTRAIN');
    const firstB = normalized.find((r) => r.code.startsWith('B'));
    const firstC = normalized.find((r) => r.code.startsWith('C'));
    const firstU = normalized.find((r) => r.code.startsWith('U'));
    if (firstB) expect(inferSystemForCode(firstB.code)).toBe('BODY');
    if (firstC) expect(inferSystemForCode(firstC.code)).toBe('CHASSIS');
    if (firstU) expect(inferSystemForCode(firstU.code)).toBe('NETWORK');
  });

  it('produces no duplicate codes after normalization', () => {
    const rows = readSourceRows(SQLITE_PATH);
    const normalized = normalizeRows(rows);
    const codes = normalized.map((r) => r.code);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });
});
