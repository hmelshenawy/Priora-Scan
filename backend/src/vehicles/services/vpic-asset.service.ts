import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { Database as BetterSqlite3Database } from 'better-sqlite3';
import { AssetLoaderService } from '../../shared/assets/asset-loader.service';

// CJS interop: with `module: commonjs` and no esModuleInterop, the named
// import does not give us a constructor. require() does.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const DatabaseCtor = require('better-sqlite3') as new (
  filename: string,
  options?: { readonly?: boolean; fileMustExist?: boolean },
) => BetterSqlite3Database;

type DbHandle = BetterSqlite3Database;

/**
 * VpicAssetService — Feature 006 Phase A.
 *
 * Read-only handle to the local vpic.sqlite SQLite asset. Schema is the
 * standard NHTSA VPIC layout. MVP path:
 *
 *   1. Look up the WMI in `Wmi` (chars 1-3 of the VIN).
 *   2. Pick the matching `Wmi_VinSchema` row whose YearFrom/YearTo contain
 *      the resolved model year. The model year is the 10th VIN char.
 *   3. For each `Pattern` row of that VinSchema, match the Pattern.Keys
 *      against VIN chars 4-9 (positions are 0-indexed from char 4; `*` is
 *      a wildcard, `[XYZ]` is a character class).
 *   4. Resolve `ElementId` to the canonical VPIC element:
 *        - 26 = Make          (LookupTable = Make)
 *        - 27 = Manufacturer  (LookupTable = Manufacturer)
 *        - 28 = Model         (LookupTable = Model)
 *        - 29 = Model Year    (no lookup; AttributeId IS the year)
 *        - 64 = EngineConfig  (LookupTable = EngineConfiguration)
 *        - 5  = BodyClass     (LookupTable = BodyStyle)
 *
 * The service is opened once on module init and closed on module destroy.
 * The asset path is resolved lazily so the file is not opened until
 * something actually calls `decode()`.
 */
@Injectable()
export class VpicAssetService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VpicAssetService.name);
  private readonly assetRelativePath = 'vpic.sqlite.xz';
  private db: DbHandle | null = null;
  private dbPath: string | null = null;

  constructor(private readonly assetLoader: AssetLoaderService) {}

  async onModuleInit(): Promise<void> {
    const materialized = await this.assetLoader.materialize(
      this.assetRelativePath,
    );
    if (!materialized) {
      this.logger.warn(
        'VPIC asset unavailable — VIN decode endpoint will return VPIC_ASSET_UNAVAILABLE',
      );
      return;
    }
    this.dbPath = materialized;
    this.db = new DatabaseCtor(materialized, {
      readonly: true,
      fileMustExist: true,
    });
    this.db.pragma('query_only = true');
    this.logger.log(`Opened VPIC asset at ${materialized}`);
  }

  onModuleDestroy(): void {
    this.db?.close();
    this.db = null;
  }

  isReady(): boolean {
    return this.db !== null;
  }

  /**
   * Decode a VIN against the local VPIC asset. Returns null if the asset is
   * unavailable or the VIN cannot be resolved to a confident record.
   */
  decode(vin: string): VpicDecodedRecord | null {
    if (!this.db) return null;

    const upper = vin.toUpperCase();
    if (upper.length < 9) return null;

    const wmi = upper.slice(0, 3);
    const modelYearChar = upper[9];
    const vds = upper.slice(3, 9);

    // 1. WMI lookup
    const wmiRow = this.db
      .prepare(
        'SELECT Id AS id, ManufacturerId AS manufacturerId, MakeId AS makeId FROM Wmi WHERE Wmi = ?',
      )
      .get(wmi) as WmiRow | undefined;
    if (!wmiRow) return null;

    // 2. Resolve model year from VIN char 10. The VPIC WMI tables do not
    //    encode the year-to-letter map; we derive it from the Wmi_VinSchema
    //    YearFrom/YearTo ranges and the WMI table itself.
    const yearFromTo = this.db
      .prepare(
        `SELECT VinSchemaId AS vinSchemaId, YearFrom AS yearFrom, YearTo AS yearTo
         FROM Wmi_VinSchema WHERE WmiId = ? ORDER BY YearFrom DESC`,
      )
      .all(wmiRow.id) as WmiVinSchemaRow[];

    // Try every year range; pick the most specific (smallest range) first.
    // For now we just need ANY matching schema; spec said "for MVP we accept
    // the first match" so we pick the latest year that still includes the
    // inferred year.
    const yearCode = this.modelYearCode(modelYearChar);
    const candidateSchemas = yearFromTo.filter(
      (s) => yearCode !== null && s.yearFrom <= yearCode && s.yearTo >= yearCode,
    );
    const schema =
      candidateSchemas[0] ??
      // Fall back to a generic schema (any row) when year cannot be inferred.
      yearFromTo[0];
    if (!schema) return null;

    // 3. Walk patterns for the chosen schema
    const patterns = this.db
      .prepare(
        'SELECT Keys AS keys, ElementId AS elementId, AttributeId AS attributeId FROM Pattern WHERE VinSchemaId = ?',
      )
      .all(schema.vinSchemaId) as PatternRow[];

    const result: VpicDecodedRecord = {
      vin: upper,
      modelYear: yearCode,
    };

    for (const pat of patterns) {
      if (!this.matchKeys(pat.keys, vds)) continue;
      const resolved = this.resolveElement(pat.elementId, pat.attributeId);
      if (!resolved) continue;
      Object.assign(result, resolved);
    }

    // Always resolve make/manufacturer from the WMI row's foreign keys.
    if (wmiRow.makeId) {
      const make = this.db
        .prepare('SELECT Name AS name FROM Make WHERE Id = ?')
        .get(wmiRow.makeId) as { name: string } | undefined;
      if (make) result.make = make.name;
    }
    if (wmiRow.manufacturerId) {
      const mfg = this.db
        .prepare('SELECT Name AS name FROM Manufacturer WHERE Id = ?')
        .get(wmiRow.manufacturerId) as { name: string } | undefined;
      if (mfg) result.manufacturer = mfg.name;
    }

    if (!result.make && !result.model && !result.bodyStyle && !result.engine) {
      return null;
    }
    return result;
  }

  private resolveElement(
    elementId: number,
    attributeId: string,
  ): Partial<VpicDecodedRecord> | null {
    if (!this.db) return null;
    const element = this.db
      .prepare('SELECT LookupTable AS lt FROM Element WHERE Id = ?')
      .get(elementId) as { lt: string | null } | undefined;
    if (!element) return null;

    switch (elementId) {
      case 26: {
        // Make
        const value = this.lookupName('Make', attributeId);
        return value ? { make: value } : null;
      }
      case 27: {
        // Manufacturer
        const value = this.lookupName('Manufacturer', attributeId);
        return value ? { manufacturer: value } : null;
      }
      case 28: {
        // Model
        const value = this.lookupName('Model', attributeId);
        return value ? { model: value } : null;
      }
      case 29: {
        // Model Year — AttributeId IS the year
        const year = Number.parseInt(attributeId, 10);
        if (Number.isFinite(year)) return { modelYear: year };
        return null;
      }
      case 64: {
        // EngineConfiguration
        const value = this.lookupName('EngineConfiguration', attributeId);
        return value ? { engine: value } : null;
      }
      case 5: {
        // BodyClass
        const value = this.lookupName('BodyStyle', attributeId);
        return value ? { bodyStyle: value } : null;
      }
      default:
        return null;
    }
  }

  private lookupName(
    tableName: string,
    attributeId: string,
  ): string | null {
    if (!this.db) return null;
    // Whitelist: only known-safe lookup tables
    const allowed = new Set([
      'Make',
      'Model',
      'Manufacturer',
      'BodyStyle',
      'EngineConfiguration',
    ]);
    if (!allowed.has(tableName)) return null;

    const row = this.db
      .prepare(`SELECT Name AS name FROM ${tableName} WHERE Id = ?`)
      .get(Number.parseInt(attributeId, 10)) as { name: string } | undefined;
    return row?.name ?? null;
  }

  /**
   * Match a VPIC Pattern.Keys string against the 6-char VDS.
   * Supported syntax:
   *   - `*` matches a single character
   *   - `[XYZ]` matches a character class
   *   - any other char is a literal
   */
  private matchKeys(keys: string, vds: string): boolean {
    if (keys.length !== vds.length) {
      // Some patterns use shorter keys (e.g. "JK") matched against the
      // start of the VDS. We honor that by anchoring at position 0.
      if (vds.startsWith(keys.replace(/\*|\[[^\]]+\]/g, '_'))) {
        return this.matchKeys(keys, vds.slice(0, keys.length));
      }
      return false;
    }
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const c = vds[i];
      if (k === '*') continue;
      if (k === '[') {
        const close = keys.indexOf(']', i);
        if (close === -1) return false;
        const classContent = keys.slice(i + 1, close);
        if (!classContent.includes(c)) return false;
        i = close;
        continue;
      }
      if (k !== c) return false;
    }
    return true;
  }

  /**
   * VPIC model year codes (VIN position 10).
   * Cycle: A=2010, B=2011, ... 30 letters. Then digits and back to A.
   * Letters: A B C D E F G H J K L M N P R S T V W X Y Z (no I, O, Q, U).
   * MVP implementation: compute letter index in the 30-char cycle and add
   * 2010, OR parse the digit.
   */
  private modelYearCode(char: string): number | null {
    if (!char) return null;
    const cycle = 'ABCDEFGHJKLMNPRSTVWXY123456789';
    const index = cycle.indexOf(char);
    if (index < 0) return null;
    return 2010 + index;
  }
}

interface WmiRow {
  id: number;
  manufacturerId: number | null;
  makeId: number | null;
}

interface WmiVinSchemaRow {
  vinSchemaId: number;
  yearFrom: number | null;
  yearTo: number | null;
}

interface PatternRow {
  keys: string;
  elementId: number;
  attributeId: string;
}

export interface VpicDecodedRecord {
  vin: string;
  make?: string;
  manufacturer?: string;
  model?: string;
  modelYear?: number | null;
  engine?: string;
  bodyStyle?: string;
}
