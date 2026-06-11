# Contract: PID Definitions

**Service**: PrioraScan Backend
**Auth**: This is not an API contract — it documents the contents and contract of the `PIDDefinition` table and the related decode service.
**Source spec**: [spec.md](../spec.md) FR-006 … FR-010
**Source plan**: [plan.md §4, R-002](../plan.md)

This contract specifies the data shape and behavior of the `PIDDefinition` table, the built-in seed (`pid-mvp-seed.ts`), the asset import (`model-pids-asset-import.ts`), and the `PidDecoderService`.

---

## `PIDDefinition` table

| Column | Type | Description |
|---|---|---|
| `id` | UUID | PK |
| `namespace` | VarChar(20) | PID namespace/source family: `'STD_OBD2'` or `'GME'` |
| `mode` | VarChar(2) | OBD service/mode, e.g. `'01'` or `'22'` |
| `pid` | VarChar(8) | Hex PID, e.g., `0C` (Mode 01) or `221108` (Mode 22) |
| `name` | VarChar(100) | Human-readable name |
| `unit` | VarChar(20) | Unit string |
| `formula` | VarChar(200) | Decode formula (see grammar below) |
| `min` | Decimal(10,3) | Optional informational minimum |
| `max` | Decimal(10,3) | Optional informational maximum |
| `source` | VarChar(50) | `'built-in-mvp'` or `'model-pids-sqlite'` |

Unique: `(namespace, mode, pid)`.

---

## Formula Grammar (MVP-safe expressions only — Correction 5)

The formula is a small, restricted expression. The MVP evaluator supports **only** the following tokens:

| Token | Description |
|---|---|
| `A` | First data byte (decimal) |
| `B` | Second data byte (decimal). For 1-byte PIDs, B is undefined and any reference returns an error. |
| integer literal | e.g., `0`, `100`, `255` |
| `+`, `-`, `*`, `/` | Arithmetic (integer; division is integer division) |
| `(`, `)` | Grouping |
| whitespace | Ignored |

**Scope (Correction 5) — explicit non-goals**:

- **No generic scripting engine.** The MVP does not use `eval`, `new Function`, or any other dynamic-eval primitive. The parser is the sole evaluator.
- **No arbitrary code execution.** Tokens outside the grammar (`Math.PI`, `process.exit()`, function-call syntax, property access, string literals) are rejected at the parser level.
- **No custom user-defined formulas.** The MVP does not expose a "create your own formula" UI. All formulas come from the built-in MVP seed or the `model-pids.sqlite` asset import. The `PIDDefinition.formula` column is write-protected from the API.
- **No variables other than `A` and `B`.** The parser does not introduce any other identifier. A formula like `X * 2` or `Math.sqrt(A)` is rejected.
- **No comparison, assignment, or statement operators.** `==`, `=`, `;`, `?:` are not in the grammar.

**Implementation**: the backend implements a small recursive-descent parser. The MVP does not use `eval` or `new Function`. The parser produces a syntax error (not an exception) on any forbidden input; this is a hard fail at seed-import time and at lookup time.

**Rejection points** (Correction 5):

- **Seed-import time** (`pid-mvp-seed.ts` and `model-pids-asset-import.ts`): any formula that does not match the grammar is rejected. The import log shows `Skipping row (namespace, pid) — formula does not match grammar` and the row is not inserted.
- **Lookup time** (`PidDecoderService.decode`): a corrupt formula in the DB (e.g., edited outside the parser) returns a `PID_FORMULA_INVALID` server-side error and the reading is marked `ERROR`.

### Example formulas

| Formula | Meaning | Example raw bytes → value |
|---|---|---|
| `A` | Identity (single byte) | `B0` → `176` (0xB0) |
| `A - 40` | Single byte offset by -40 | `84` → `92` (°C coolant temp) |
| `(A * 256 + B) / 4` | Two bytes, big-endian, divided by 4 | `12 38` → `(0x12 * 256 + 0x38) / 4 = 1155` (RPM) |
| `(A * 256 + B) / 1000` | Two bytes, big-endian, in volts | `21 49` → `(0x21 * 256 + 0x49) / 1000 = 8.521` (V) |
| `A * 100 / 255` | Single byte as percent of 255 | `B4` → `180 * 100 / 255 = 70.59` (% throttle) |
| `(A - 128) * 100 / 128` | Single byte offset by 128 as percent | `B0` → `(176 - 128) * 100 / 128 = 37.5` (% fuel trim) |
| `A / 200` | Single byte as fraction of 200 | `A0` → `160 / 200 = 0.8` (V O2 sensor) |

---

## Built-in MVP Seed (`pid-mvp-seed.ts`)

Run via `npm run seed:pid-mvp`. Idempotent: re-running the seed updates existing rows by `(namespace, mode, pid)`.

| PID  | Name | Unit | Formula | Min | Max | namespace | mode | source |
|------|------|------|---------|-----|-----|-----------|------|--------|
| 0C   | Engine RPM | RPM | `(A * 256 + B) / 4` | 0 | 16383.75 | STD_OBD2 | 01 | built-in-mvp |
| 0D   | Vehicle Speed | km/h | `A` | 0 | 255 | STD_OBD2 | 01 | built-in-mvp |
| 05   | Engine Coolant Temperature | °C | `A - 40` | -40 | 215 | STD_OBD2 | 01 | built-in-mvp |
| 42   | Control Module Voltage | V | `(A * 256 + B) / 1000` | 0 | 65.535 | STD_OBD2 | 01 | built-in-mvp |
| 11   | Throttle Position | % | `A * 100 / 255` | 0 | 100 | STD_OBD2 | 01 | built-in-mvp |
| 04   | Calculated Engine Load | % | `A * 100 / 255` | 0 | 100 | STD_OBD2 | 01 | built-in-mvp |
| 06   | Short Term Fuel Trim Bank 1 | % | `(A - 128) * 100 / 128` | -100 | 99.22 | STD_OBD2 | 01 | built-in-mvp |
| 07   | Long Term Fuel Trim Bank 1 | % | `(A - 128) * 100 / 128` | -100 | 99.22 | STD_OBD2 | 01 | built-in-mvp |
| 10   | MAF Air Flow | g/s | `(A * 256 + B) / 100` | 0 | 655.35 | STD_OBD2 | 01 | built-in-mvp |
| 0F   | Intake Air Temperature | °C | `A - 40` | -40 | 215 | STD_OBD2 | 01 | built-in-mvp |
| 14   | O2 Sensor Bank 1 Sensor 1 Voltage | V | `A / 200` | 0 | 1.275 | STD_OBD2 | 01 | built-in-mvp |

---

## Asset Import (`model-pids-asset-import.ts`)

Run on first backend startup (idempotent). Opens `backend/data/model-pids.sqlite` read-only and upserts each row into `PIDDefinition` keyed by `(namespace, mode, pid)`.

| Source column | Target column | Notes |
|---|---|---|
| `model` | `namespace` | Verbatim; currently `GME` |
| — | `mode` | Hardcoded to `'22'` for the GM Mode 22 asset |
| `pid` | `pid` | Verbatim |
| `description` | `name` | Verbatim |
| `unit` | `unit` | Verbatim |
| `equation` | `formula` | Verbatim (assumed to be the same grammar; if parsing fails, the row is skipped with a warning) |
| — | `source` | Hardcoded to `'model-pids-sqlite'` |
| — | `min` | null (not in asset) |
| — | `max` | null (not in asset) |

### Idempotency

The import uses `INSERT ... ON CONFLICT (namespace, mode, pid) DO UPDATE`. Re-running the import updates existing rows; new rows are inserted; no duplicates.

### Failure Mode

If the asset file is missing, the import is a no-op (warning logged, no error). The MVP requires only the 11 built-in PIDs to be present. The asset is a future-facing enhancement; missing the asset does not break live data.

If a row's `equation` fails the formula grammar, that row is skipped with a warning. The rest of the import continues.

---

## `PidDecoderService.decode(namespace, mode, pid, rawHex)`

### Signature

```typescript
class PidDecoderService {
  decode(namespace: 'STD_OBD2' | 'GME', mode: '01' | '22', pid: string, rawHex: string): DecodedReading;
}

interface DecodedReading {
  pid: string;
  name: string;
  value: number | null;
  unit: string;
  rawValue: string;
  status: 'OK' | 'NO_DATA' | 'ERROR' | 'NOT_SUPPORTED';
  errorCode: string | null;
}
```

### Behavior

1. Look up `PIDDefinition.findByNamespaceModeAndPid(namespace, mode, pid)`.
2. If not found, return `{ status: 'NOT_SUPPORTED', value: null, ... }`.
3. If `rawHex` is empty or all whitespace, return `{ status: 'NO_DATA', value: null, ... }`.
4. Parse `rawHex` into a byte array. Strip whitespace and any leading `41` (the Mode 01 response header).
5. Run the **formula through the restricted-grammar parser** (Correction 5). The parser substitutes `A` = first byte (or 0 if absent), `B` = second byte (or 0 if absent), and evaluates the parsed AST. The backend never calls `eval`, `new Function`, or any other dynamic-eval primitive.
6. If the formula references `B` but only one byte is present, return `{ status: 'ERROR', value: null, errorCode: 'B_UNDEFINED', ... }`.
7. If the formula is present but fails the grammar check (e.g., a corrupt DB row), return `{ status: 'ERROR', value: null, errorCode: 'PID_FORMULA_INVALID', ... }`.
8. Round the result to the precision implied by the unit:
   - RPM, km/h, %, g/s, °C: 0 decimals
   - V: 2 decimals
   - (Future: configurable per PID)
9. Return `{ status: 'OK', value, ... }`.

### Example

```typescript
decoder.decode('STD_OBD2', '01', '0C', '12 38')
// → { pid: '0C', name: 'Engine RPM', value: 1155, unit: 'RPM', rawValue: '12 38', status: 'OK', errorCode: null }

decoder.decode('STD_OBD2', '01', '05', '84')
// → { pid: '05', name: 'Engine Coolant Temperature', value: 92, unit: '°C', rawValue: '84', status: 'OK', errorCode: null }

decoder.decode('STD_OBD2', '01', '0C', '')
// → { pid: '0C', name: 'Engine RPM', value: null, unit: 'RPM', rawValue: '', status: 'NO_DATA', errorCode: null }
```

---

## Performance Targets

- Lookup: p95 < 5 ms (indexed unique key)
- Decode: p95 < 1 ms per reading
- Bulk decode (11 PIDs in one cycle): p95 < 10 ms
