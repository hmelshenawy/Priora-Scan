/**
 * Seed script: import `code-descriptions.sqlite` into MasterFaultCode.
 *
 * Run with: `npm run db:seed:fault-codes`
 *   (or `ts-node prisma/seed/seed-master-fault-codes.ts`)
 *
 * Source asset: backend/data/code-descriptions.sqlite
 *   - Table: codes
 *   - Columns: id (VARCHAR(5)), desc (VARCHAR(128))
 *
 * Behavior:
 *   - Maps id -> MasterFaultCode.code (uppercase)
 *   - Maps desc -> MasterFaultCode.title and description
 *   - Inferred system from first letter (P/B/C/U -> POWERTRAIN/BODY/CHASSIS/NETWORK)
 *   - severity: UNKNOWN (per Feature 005 — no severity classification in v1)
 *   - commonCauses, recommendedChecks: NULL
 *   - source: 'code-descriptions.sqlite'
 *   - manufacturer: NULL
 *   - isGeneric: true
 *
 * The import is idempotent: re-running the script updates existing rows
 * (preserving createdAt on unchanged rows) and adds new ones.
 *
 * The host database is reached through a pooled Prisma Postgres
 * connection that drops interactive transactions on long-running
 * batches, so the import uses one statement per row (no explicit
 * transaction wrapper). The work is split into bulk `createMany`
 * for new rows and individual `upsert`s for existing rows, which
 * keeps each round-trip short and connection-friendly.
 *
 * A failure mid-import leaves the table in a partially-updated state
 * (any rows processed before the failure are committed). Re-running
 * the script is safe — it reconciles by code (the unique key).
 *
 * Exit codes:
 *   0 — success
 *   1 — missing SQLite file, missing codes table, missing required
 *       columns, empty source data, or any other failure
 */
import { existsSync } from 'fs';
import { resolve } from 'path';
import * as BetterSqlite3 from 'better-sqlite3';
import { FaultCodeSystem, PrismaClient } from '@prisma/client';

type SqliteDatabase = BetterSqlite3.Database;

type PrismaTxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export const SOURCE = 'code-descriptions.sqlite';
const DEFAULT_SQLITE_PATH = resolve(
  process.cwd(),
  'data',
  'code-descriptions.sqlite',
);

export function getSqlitePath(): string {
  return process.env.FAULT_CODE_SQLITE_PATH
    ? resolve(process.env.FAULT_CODE_SQLITE_PATH)
    : DEFAULT_SQLITE_PATH;
}

export interface SourceCodeRow {
  id: string;
  description: string | null;
}

export interface NormalizedCodeRow {
  code: string;
  title: string | null;
  description: string | null;
  system: FaultCodeSystem;
}

export function inferSystemForCode(code: string): FaultCodeSystem {
  if (!code || code.length === 0) return FaultCodeSystem.UNKNOWN;
  switch (code.charAt(0).toUpperCase()) {
    case 'P':
      return FaultCodeSystem.POWERTRAIN;
    case 'B':
      return FaultCodeSystem.BODY;
    case 'C':
      return FaultCodeSystem.CHASSIS;
    case 'U':
      return FaultCodeSystem.NETWORK;
    default:
      return FaultCodeSystem.UNKNOWN;
  }
}

/**
 * Normalize raw SQLite rows to uppercase, deduplicated, length-bounded
 * entries. Returns rows in the shape the repository expects.
 */
export function normalizeRows(rows: SourceCodeRow[]): NormalizedCodeRow[] {
  const byCode = new Map<string, NormalizedCodeRow>();
  for (const row of rows) {
    const code = String(row.id ?? '').trim().toUpperCase();
    if (code.length === 0 || code.length > 10) {
      continue;
    }
    const description = row.description?.trim() || null;
    byCode.set(code, {
      code,
      title: description,
      description,
      system: inferSystemForCode(code),
    });
  }
  return Array.from(byCode.values());
}

/**
 * Verify the SQLite file exists, is openable, and contains a `codes`
 * table with `id` and `desc` columns. Throws on any structural problem.
 */
export function assertCodesTable(db: SqliteDatabase): void {
  const table = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'codes'",
    )
    .get();
  if (!table) {
    throw new Error('SQLite asset is missing required table: codes');
  }
  const columns = db
    .prepare("PRAGMA table_info('codes')")
    .all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));
  for (const required of ['id', 'desc']) {
    if (!names.has(required)) {
      throw new Error(
        `SQLite codes table is missing required column: ${required}`,
      );
    }
  }
}

export function readSourceRows(sqlitePath: string): SourceCodeRow[] {
  if (!existsSync(sqlitePath)) {
    throw new Error(
      `SQLite asset not found at ${sqlitePath}. Add backend/data/code-descriptions.sqlite or set FAULT_CODE_SQLITE_PATH.`,
    );
  }
  const db = new BetterSqlite3(sqlitePath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    assertCodesTable(db);
    return db
      .prepare(
        'SELECT id, "desc" AS description FROM codes WHERE id IS NOT NULL',
      )
      .all() as SourceCodeRow[];
  } finally {
    db.close();
  }
}

export interface SeedSummary {
  sourceRows: number;
  normalizedRows: number;
  inserted: number;
  updated: number;
  totalAfter: number;
}

/**
 * Idempotent import. Splits `rows` into existing vs. missing codes
 * (relative to what's already in the database) and runs a single
 * `createMany` for the missing set plus one `update` per existing
 * row. Returns the summary so the CLI can print it and so tests can
 * assert.
 *
 * The `client` parameter is typed as `PrismaTxClient` (any Prisma
 * client or transaction client) so this can be called from tests with
 * either a real client or a transaction wrapper.
 *
 * Note: each individual call is its own short statement, so the
 * import is connection-pool friendly. There is no outer transaction —
 * a failure mid-import leaves the table partially updated, but a
 * re-run reconciles everything by code (the unique key).
 */
export async function importRows(
  client: PrismaTxClient,
  rows: NormalizedCodeRow[],
): Promise<Omit<SeedSummary, 'sourceRows' | 'totalAfter'>> {
  const codes = rows.map((r) => r.code);
  // findMany with `in` works in chunks internally; for 4,000+ rows
  // the resulting array still fits comfortably in one round-trip.
  const existing = await client.masterFaultCode.findMany({
    where: { code: { in: codes } },
    select: { code: true },
  });
  const existingSet = new Set(existing.map((e) => e.code));
  const toCreate = rows.filter((r) => !existingSet.has(r.code));
  const toUpdate = rows.filter((r) => existingSet.has(r.code));

  let inserted = 0;
  let updated = 0;

  if (toCreate.length > 0) {
    // createMany does not return rows, so we count client-side.
    await client.masterFaultCode.createMany({
      data: toCreate.map((row) => ({
        code: row.code,
        title: row.title,
        description: row.description,
        system: row.system,
        source: SOURCE,
        manufacturer: null,
        isGeneric: true,
      })),
      skipDuplicates: true,
    });
    inserted = toCreate.length;
  }

  for (const row of toUpdate) {
    await client.masterFaultCode.update({
      where: { code: row.code },
      data: {
        title: row.title,
        description: row.description,
        system: row.system,
        source: SOURCE,
        manufacturer: null,
        isGeneric: true,
      },
    });
    updated += 1;
  }

  return { normalizedRows: rows.length, inserted, updated };
}

export function fail(message: string): never {
  console.error(`[fault-code-seed] ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const sqlitePath = getSqlitePath();
    const sourceRows = readSourceRows(sqlitePath);
    const normalized = normalizeRows(sourceRows);
    if (normalized.length === 0) {
      fail('SQLite codes table contains no importable rows.');
    }
    const beforeCount = await prisma.masterFaultCode.count();
    const { inserted, updated } = await importRows(prisma, normalized);
    const totalAfter = await prisma.masterFaultCode.count();

    const summary: SeedSummary = {
      sourceRows: sourceRows.length,
      normalizedRows: normalized.length,
      inserted,
      updated,
      totalAfter,
    };
    console.log(
      `[fault-code-seed] source_rows=${summary.sourceRows} ` +
        `normalized=${summary.normalizedRows} ` +
        `inserted=${summary.inserted} ` +
        `updated=${summary.updated} ` +
        `total_after=${summary.totalAfter} ` +
        `total_before=${beforeCount}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Only run main() when this file is executed directly (not when imported
// by tests). The `require.main === module` check works under ts-node.
if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    fail(message);
  });
}
