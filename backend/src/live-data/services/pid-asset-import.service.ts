import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { Database as BetterSqlite3Database } from 'better-sqlite3';
import { existsSync } from 'fs';
import { join } from 'path';
import { PidDefinitionRepository } from '../repositories/pid-definition.repository';
import { PidDecoderService } from './pid-decoder.service';

// CJS interop: with `module: commonjs` and no esModuleInterop, the named
// import does not give us a constructor. require() does.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const DatabaseCtor = require('better-sqlite3') as new (
  filename: string,
  options?: { readonly?: boolean; fileMustExist?: boolean },
) => BetterSqlite3Database;

export interface VehiclePidRow {
  model: string;
  pid: string;
  equation: string;
  unit: string;
  description: string;
}

/**
 * PidAssetImportService — Feature 006 Phase B.1.
 *
 * On application bootstrap, opens
 * `backend/data/model-pids.sqlite` read-only, selects all rows from
 * the `vehicle_pids` table, and upserts each one into `PIDDefinition`
 * keyed by `(namespace, mode, pid)`. Sets `source = 'model-pids-sqlite'`.
 *
 * The import is **idempotent**: re-running the import updates existing
 * rows in place; no duplicates are created.
 *
 * Rows whose `equation` does not match the restricted grammar
 * (Correction 5) are **skipped with a warning**. The MVP requires
 * only the 11 built-in Mode 01 PIDs to be present; the asset is a
 * future-facing enhancement.
 */
@Injectable()
export class PidAssetImportService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PidAssetImportService.name);
  private readonly assetRelativePath = 'model-pids.sqlite';
  private readonly source = 'model-pids-sqlite';

  constructor(
    private readonly repo: PidDefinitionRepository,
    private readonly decoder: PidDecoderService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.run();
  }

  /**
   * Public entry point so the seed script / tests can invoke the
   * import without going through Nest's lifecycle.
   */
  async run(): Promise<{ imported: number; skipped: number }> {
    const assetPath = this.resolveAssetPath();
    if (!existsSync(assetPath)) {
      this.logger.warn(
        `PID asset not present at ${assetPath} — skipping import (MVP requires only built-in seed).`,
      );
      return { imported: 0, skipped: 0 };
    }

    const db = new DatabaseCtor(assetPath, {
      readonly: true,
      fileMustExist: true,
    });
    db.pragma('query_only = true');

    try {
      const rows = db
        .prepare('SELECT model, pid, equation, unit, description FROM vehicle_pids')
        .all() as VehiclePidRow[];

      const valid: ReturnType<typeof toCreateInput>[] = [];
      let skipped = 0;
      for (const row of rows) {
        const formula = (row.equation ?? '').trim();
        if (!formula) {
          this.logger.warn(`Skipping row (${row.model}, ${row.pid}) — empty equation`);
          skipped++;
          continue;
        }
        const errCode = this.decoder.validateFormula(formula);
        if (errCode) {
          this.logger.warn(
            `Skipping row (${row.model}, ${row.pid}) — formula does not match grammar: ${errCode}`,
          );
          skipped++;
          continue;
        }
        valid.push(toCreateInput(row, formula, this.source));
      }

      if (valid.length === 0) {
        return { imported: 0, skipped };
      }

      // Idempotent bulk upsert in a single transaction.
      await this.repo.upsertMany(valid);

      this.logger.log(
        `Imported ${valid.length} PIDs from ${assetPath} (skipped ${skipped} with invalid grammar).`,
      );
      return { imported: valid.length, skipped };
    } finally {
      db.close();
    }
  }

  private resolveAssetPath(): string {
    return join(process.cwd(), 'data', this.assetRelativePath);
  }
}

export function toCreateInput(row: VehiclePidRow, formula: string, source: string) {
  return {
    namespace: row.model,
    mode: '22',
    pid: row.pid,
    name: row.description,
    unit: row.unit,
    formula,
    min: null,
    max: null,
    source,
  };
}
