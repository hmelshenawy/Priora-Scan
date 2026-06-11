# Data Model: Live Data & Sensor Monitoring

**Feature**: 006-live-data-and-sensor-monitoring
**Branch**: `007-live-data-sensor-monitoring`
**Date**: 2026-06-11
**Spec**: [spec.md](spec.md)
**Plan**: [plan.md](plan.md)

This document describes the Prisma schema additions and modifications required for Feature 006. All new business entities respect multi-tenant isolation via `organizationId`. Global reference tables (`VehicleDecode`, `PIDDefinition`) are explicitly **not** tenant-scoped because the data they hold is industry-standard and identical across tenants.

The feature is delivered in two migrations:

- **Phase A migration** (`20260611_add_vin_intelligence`): adds `Vehicle.engine`, `Vehicle.bodyStyle`, and the new global `VehicleDecode` table.
- **Phase B migration** (`20260615_add_live_data`): adds `PIDDefinition`, `LiveDataSession`, `LiveDataSnapshot` (with a `values JSONB` column — no separate `LiveDataReading` table, Correction 2), `LiveDataReadingCurrent` (the read-model), and new relations on `DiagnosticSession`.

---

## Phase A — New Models

### `VehicleDecode` (GLOBAL — not tenant-scoped)

Cached successful VPIC decode result. Created on the first successful decode of a given VIN; reused for subsequent decodes of the same VIN. The cache is global because VPIC data is industry-standard and identical across tenants.

| Field | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Unique row identifier |
| `vin` | VarChar(17) | Unique, NOT NULL, indexed | The 17-character VIN (ISO 3779) |
| `make` | VarChar(100) | Nullable | Decoded Make |
| `model` | VarChar(100) | Nullable | Decoded Model |
| `year` | Integer | Nullable | Decoded Model Year |
| `engine` | VarChar(100) | Nullable | Decoded Engine Configuration |
| `bodyStyle` | VarChar(100) | Nullable | Decoded Body Style |
| `manufacturer` | VarChar(100) | Nullable | Decoded Manufacturer |
| `decodedAt` | Timestamp | NOT NULL, default now | When the decode was performed |
| `source` | VarChar(50) | NOT NULL, default `'vpic.sqlite.xz'` | Asset identifier |

**Indexes**:
- `vin` (unique)

**Audit**: A `DiagnosticSessionAuditRecord` with action `VIN_DECODED_FROM_ASSET` is written on every successful decode (cache miss → asset). Cache hits also write the audit record (with `metadata.cached: true`) so the audit trail captures every decode that the user observed.

---

## Phase A — Updated Models

### `Vehicle` (additive)

| Field | Type | Constraints | Description |
|---|---|---|---|
| `engine` | VarChar(100) | Nullable | Persisted Engine (may be edited by user after auto-fill) |
| `bodyStyle` | VarChar(100) | Nullable | Persisted Body Style (may be edited by user after auto-fill) |

The new columns are populated by the auto-fill flow when the user confirms the Vehicle form. The user may edit them. Existing Vehicle rows have nulls.

---

### `LiveDataSnapshot` → corrections applied (Correction 2)

The MVP collapses the snapshot value model to a single JSONB column. There is **no separate `LiveDataReading` / `LiveDataSnapshotValue` table** in the MVP. With only 11 standard PIDs, per-PID rows are unnecessary; the `values` JSONB keeps retention, query, and eviction simple.

| Field | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Unique row identifier |
| `organizationId` | UUID | NOT NULL, indexed | Tenant scope |
| `diagnosticSessionId` | UUID | NOT NULL, FK → DiagnosticSession | The parent diagnostic session (for fast lookup and 50-cap eviction) |
| `liveDataSessionId` | UUID | NOT NULL, FK → LiveDataSession | The session that produced the snapshot |
| `capturedAt` | Timestamp | NOT NULL, default now | Capture time |
| `createdBy` | UUID | NOT NULL | User who pressed Save |
| `values` | **Json (JSONB)** | NOT NULL | The captured readings, keyed by hex PID. Example: `{"0C": {"name": "Engine RPM", "value": 850, "unit": "RPM", "rawValue": "12 38"}, "0D": {"name": "Vehicle Speed", "value": 0, "unit": "km/h", "rawValue": "00"}, "05": {"name": "Engine Coolant Temperature", "value": 92, "unit": "°C", "rawValue": "84"}, "42": {"name": "Control Module Voltage", "value": 13.9, "unit": "V", "rawValue": "21 49"}}` |
| `createdAt` | Timestamp | NOT NULL, default now | |

### `LiveDataSession` → correction applied (Correction 1)

`LiveDataSession` belongs to **`DiagnosticSession`** (one DiagnosticSession → many LiveDataSessions). The hierarchy is:

```
DiagnosticSession
└── LiveDataSession (one → many)
    └── LiveDataSnapshot (one → many)
```

All live-data history remains attached to the originating `DiagnosticSession`. The `LiveDataSnapshot.diagnosticSessionId` FK enforces the link explicitly so the 50-snapshot cap can be enforced per-diagnostic-session.

## Phase B — New Models

### `PIDDefinition` (GLOBAL — not tenant-scoped)

Definition of an OBD-II PID, including its decode formula, unit, and valid range. The MVP set is seeded from a built-in TypeScript file; additional PIDs are imported from `backend/data/model-pids.sqlite` (GM Mode 22) on first backend startup.

| Field | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Unique row identifier |
| `model` | VarChar(20) | NOT NULL | Identifier of the model family: `'STD_OBD2'` for standard OBD-II Mode 01 PIDs; `'GME'` for GM-Extended Mode 22 PIDs |
| `pid` | VarChar(8) | NOT NULL | Hex PID, e.g., `0C` (Mode 01) or `221108` (Mode 22) |
| `name` | VarChar(100) | NOT NULL | Human-readable name (e.g., `'Engine RPM'`) |
| `unit` | VarChar(20) | NOT NULL | Unit string (e.g., `'RPM'`, `'%'`, `'°C'`, `'V'`, `'g/s'`) |
| `formula` | VarChar(200) | NOT NULL | Decode formula. Grammar: `A`, `B`, integer literals, `+`, `-`, `*`, `/`, `(`, `)`, with `A` and `B` substituted with the response bytes |
| `min` | Decimal(10,3) | Nullable | Valid range minimum (informational; not enforced at decode time) |
| `max` | Decimal(10,3) | Nullable | Valid range maximum (informational) |
| `source` | VarChar(50) | NOT NULL | Origin: `'built-in-mvp'` or `'model-pids-sqlite'` |
| `createdAt` | Timestamp | NOT NULL, default now | |
| `updatedAt` | Timestamp | NOT NULL, auto-update | |

**Indexes**:
- `(model, pid)` (unique)

**Notes**:
- The MVP set is 11 rows with `model = 'STD_OBD2'` (Mode 01 PIDs: `0C`, `0D`, `05`, `42`, `11`, `04`, `06`, `07`, `10`, `0F`, `14`).
- The asset import contributes up to 127 rows with `model = 'GME'` (Mode 22 PIDs starting with `22`).
- The formula is interpreted by a small vetted expression evaluator; arbitrary `eval` is forbidden. The evaluator supports: `A`, `B`, integer literals, `+`, `-`, `*`, `/`, `(`, `)`. Whitespace is ignored.

---

### `LiveDataSession` (TENANT-SCOPED)

One row per active polling session. **Linked to a `DiagnosticSession`** (one-to-many: a diagnostic session can have many live data sessions over its lifetime — Correction 1). The hierarchy is `DiagnosticSession → LiveDataSession → LiveDataSnapshot`. All live-data history is anchored to the originating `DiagnosticSession`; a new `LiveDataSession` is created on reconnect after 30 s, but the prior session's snapshots remain linked to the same `DiagnosticSession`. Linked to a `DesktopAgent` (one-to-many: an agent can serve many live data sessions).

| Field | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Unique row identifier |
| `organizationId` | UUID | NOT NULL, indexed | Tenant scope |
| `diagnosticSessionId` | UUID | NOT NULL, FK → DiagnosticSession | Parent diagnostic session |
| `agentId` | UUID | NOT NULL, FK → DesktopAgent | The agent executing the polling |
| `status` | LiveDataSessionStatus | NOT NULL, default `ACTIVE` | `ACTIVE` \| `STOPPED` \| `STALE` |
| `supportedPidMask` | Json | Nullable | Map of hex PID → boolean; populated by discovery |
| `cadenceMs` | Integer | NOT NULL, default `1000` | Polling cadence in milliseconds |
| `startedAt` | Timestamp | NOT NULL, default now | |
| `lastPolledAt` | Timestamp | Nullable | Updated by each successful cycle |
| `endedAt` | Timestamp | Nullable | Set on Stop or timeout |
| `createdAt` | Timestamp | NOT NULL, default now | |
| `updatedAt` | Timestamp | NOT NULL, auto-update | |

**Indexes**:
- `organizationId`
- `organizationId, status`
- `diagnosticSessionId`
- `agentId`

**Status transitions**:
- `ACTIVE → STOPPED` (user pressed Stop, or diagnostic session closed)
- `ACTIVE → STALE` (no agent activity for > 30 s; closed by sweep)

---

### `LiveDataSnapshot` (TENANT-SCOPED)

Point-in-time capture of the live data values during a session. Stores the readings in a single JSONB `values` column — the MVP does **not** create a separate `LiveDataReading` / `LiveDataSnapshotValue` table (Correction 2). Capped at 50 per `DiagnosticSession`; on the 51st, the oldest is evicted in the same transaction.

| Field | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Unique row identifier |
| `organizationId` | UUID | NOT NULL, indexed | Tenant scope |
| `diagnosticSessionId` | UUID | NOT NULL, FK → DiagnosticSession | The parent diagnostic session (Correction 1: snapshot is anchored to the DiagnosticSession) |
| `liveDataSessionId` | UUID | NOT NULL, FK → LiveDataSession | The session that produced the snapshot |
| `capturedAt` | Timestamp | NOT NULL, default now | Capture time |
| `createdBy` | UUID | NOT NULL | User who pressed Save |
| `values` | **Json (JSONB)** | NOT NULL | Captured readings, keyed by hex PID. Shape: `{ "0C": { "name": "Engine RPM", "value": 850, "unit": "RPM", "rawValue": "12 38" }, ... }` |
| `createdAt` | Timestamp | NOT NULL, default now | |

**Indexes**:
- `organizationId`
- `diagnosticSessionId, capturedAt` (composite, for 50-cap eviction queries)
- `liveDataSessionId`

**Unique**: none (multiple snapshots per `liveDataSessionId` are allowed).

> **Correction 2 rationale**: with only 11 supported standard PIDs in the MVP, per-PID rows are unnecessary for historical snapshots. The JSONB `values` map keeps retention simple (count rows for eviction), keeps query complexity low (one row per snapshot), and avoids a join on the snapshot detail view. A future freeze-frame or per-PID analytics feature may add per-PID rows; the MVP does not.

---

## Phase B — Read-Model Tables

### `LiveDataReadingCurrent` (TENANT-SCOPED — read-model, not a domain entity)

The most-recent reading per PID for an active `LiveDataSession`. Populated by the agent's poll-cycle push. Read by the dashboard via `GET /sessions/:id/live-data/current`.

| Field | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | |
| `organizationId` | UUID | NOT NULL, indexed | Tenant scope |
| `liveDataSessionId` | UUID | NOT NULL, FK → LiveDataSession | Parent session |
| `pid` | VarChar(8) | NOT NULL | Hex PID |
| `name` | VarChar(100) | NOT NULL | Human-readable name |
| `value` | Decimal(12,4) | Nullable | Decoded value |
| `unit` | VarChar(20) | NOT NULL | Unit |
| `rawValue` | VarChar(100) | NOT NULL | Raw hex |
| `errorCode` | VarChar(20) | Nullable | OBD-II error code, if any (e.g., `'12'` for Service Not Supported) |
| `updatedAt` | Timestamp | NOT NULL, auto-update | When the most-recent cycle for this PID arrived |

**Indexes**:
- `organizationId`
- `(liveDataSessionId, pid)` (unique)
- `liveDataSessionId, updatedAt`

**Lifecycle**: rows are upserted (delete + insert) on each poll cycle. When a `LiveDataSession` is closed, all rows for that session are deleted in the same transaction.

**Alternative considered**: a single `Json` column on `LiveDataSession` holding the latest readings map. Rejected for query ergonomics and the desire to support "show me the most recent value of PID X across all sessions in this tenant" queries.

---

## Phase B — Updated Models

### `DiagnosticSession` (additive relations)

| New Relation | Description |
|---|---|
| `liveDataSessions` | `1 → Many LiveDataSession` |
| `liveDataSnapshots` | `1 → Many LiveDataSnapshot` |

Both are nullable/empty by default; they do not change existing fields on `DiagnosticSession`.

---

## New Enums

### `LiveDataSessionStatus`

| Value | Meaning |
|---|---|
| `ACTIVE` | Polling is in progress |
| `STOPPED` | Polling was stopped (by user or session close) |
| `STALE` | No agent activity for > 30 s; closed by the sweep |

### `PidSource` (informational, stored as a string column on `PIDDefinition`)

Values: `'built-in-mvp'`, `'model-pids-sqlite'`, (future: `'oem-extension'`, `'user-defined'`).

---

## Seed Data

### `pid-mvp-seed.ts`

A TypeScript file that ships with the backend. Run via `npm run seed:pid-mvp`. The seed inserts the 11 standard OBD-II Mode 01 PIDs in the MVP set (with `model = 'STD_OBD2'`, `source = 'built-in-mvp'`). Idempotent: re-running the seed updates existing rows by `(model, pid)`.

| PID  | Name | Unit | Formula | Min | Max |
|------|------|------|---------|-----|-----|
| 0C   | Engine RPM | RPM | `(A * 256 + B) / 4` | 0 | 16383.75 |
| 0D   | Vehicle Speed | km/h | `A` | 0 | 255 |
| 05   | Engine Coolant Temperature | °C | `A - 40` | -40 | 215 |
| 42   | Control Module Voltage | V | `(A * 256 + B) / 1000` | 0 | 65.535 |
| 11   | Throttle Position | % | `A * 100 / 255` | 0 | 100 |
| 04   | Calculated Engine Load | % | `A * 100 / 255` | 0 | 100 |
| 06   | Short Term Fuel Trim Bank 1 | % | `(A - 128) * 100 / 128` | -100 | 99.22 |
| 07   | Long Term Fuel Trim Bank 1 | % | `(A - 128) * 100 / 128` | -100 | 99.22 |
| 10   | MAF Air Flow | g/s | `(A * 256 + B) / 100` | 0 | 655.35 |
| 0F   | Intake Air Temperature | °C | `A - 40` | -40 | 215 |
| 14   | O2 Sensor Bank 1 Sensor 1 Voltage | V | `A / 200` | 0 | 1.275 |

### `model-pids-asset-import.ts` (first-use hook)

A startup hook in `VpicAssetService`-adjacent code that opens `backend/data/model-pids.sqlite` read-only, selects `(model, pid, equation, unit, description)`, and upserts each row into `PIDDefinition` keyed by `(model, pid)`. Sets `source = 'model-pids-sqlite'`. Idempotent. The `equation` column maps to `formula`; the `description` column maps to `name`. The MVP does not enforce `min`/`max` for asset-derived rows (they are null).

---

## Migration Impact

### Phase A: `20260611_add_vin_intelligence`

1. `ALTER TABLE "Vehicle" ADD COLUMN "engine" VARCHAR(100);`
2. `ALTER TABLE "Vehicle" ADD COLUMN "bodyStyle" VARCHAR(100);`
3. `CREATE TABLE "VehicleDecode" (`id` UUID PK, `vin` VARCHAR(17) UNIQUE, `make` VARCHAR(100) NULL, `model` VARCHAR(100) NULL, `year` INTEGER NULL, `engine` VARCHAR(100) NULL, `bodyStyle` VARCHAR(100) NULL, `manufacturer` VARCHAR(100) NULL, `decodedAt` TIMESTAMP NOT NULL DEFAULT now, `source` VARCHAR(50) NOT NULL DEFAULT 'vpic.sqlite.xz');`

### Phase B: `20260615_add_live_data`

1. `CREATE TYPE "LiveDataSessionStatus" AS ENUM ('ACTIVE', 'STOPPED', 'STALE');`
2. `CREATE TABLE "PIDDefinition" (`id` UUID PK, `model` VARCHAR(20) NOT NULL, `pid` VARCHAR(8) NOT NULL, `name` VARCHAR(100) NOT NULL, `unit` VARCHAR(20) NOT NULL, `formula` VARCHAR(200) NOT NULL, `min` DECIMAL(10,3) NULL, `max` DECIMAL(10,3) NULL, `source` VARCHAR(50) NOT NULL, `createdAt` TIMESTAMP NOT NULL DEFAULT now, `updatedAt` TIMESTAMP NOT NULL DEFAULT now, UNIQUE(`model`, `pid`));`
3. `CREATE TABLE "LiveDataSession" (`id` UUID PK, `organizationId` UUID NOT NULL, `diagnosticSessionId` UUID NOT NULL, `agentId` UUID NOT NULL, `status` "LiveDataSessionStatus" NOT NULL DEFAULT 'ACTIVE', `supportedPidMask` JSONB NULL, `cadenceMs` INTEGER NOT NULL DEFAULT 1000, `startedAt` TIMESTAMP NOT NULL DEFAULT now, `lastPolledAt` TIMESTAMP NULL, `endedAt` TIMESTAMP NULL, `createdAt` TIMESTAMP NOT NULL DEFAULT now, `updatedAt` TIMESTAMP NOT NULL DEFAULT now);`
4. `CREATE TABLE "LiveDataSnapshot" (`id` UUID PK, `organizationId` UUID NOT NULL, `diagnosticSessionId` UUID NOT NULL, `liveDataSessionId` UUID NOT NULL, `capturedAt` TIMESTAMP NOT NULL DEFAULT now, `createdBy` UUID NOT NULL, `values` JSONB NOT NULL, `createdAt` TIMESTAMP NOT NULL DEFAULT now);` — Correction 2: snapshot values are stored as a single JSONB column. No `LiveDataReading` table.
5. `CREATE TABLE "LiveDataReadingCurrent" (`id` UUID PK, `organizationId` UUID NOT NULL, `liveDataSessionId` UUID NOT NULL, `pid` VARCHAR(8) NOT NULL, `name` VARCHAR(100) NOT NULL, `value` DECIMAL(12,4) NULL, `unit` VARCHAR(20) NOT NULL, `rawValue` VARCHAR(100) NOT NULL, `errorCode` VARCHAR(20) NULL, `updatedAt` TIMESTAMP NOT NULL DEFAULT now, UNIQUE(`liveDataSessionId`, `pid`));` — read-model for the dashboard.
6. Add Prisma relations: `DiagnosticSession.liveDataSessions` and `DiagnosticSession.liveDataSnapshots` (Correction 1: a DiagnosticSession can have many LiveDataSessions, all linked back through the FK).
7. Add foreign keys: `LiveDataSession.diagnosticSessionId` → `DiagnosticSession.id`; `LiveDataSession.agentId` → `DesktopAgent.id`; `LiveDataSnapshot.diagnosticSessionId` → `DiagnosticSession.id`; `LiveDataSnapshot.liveDataSessionId` → `LiveDataSession.id`; `LiveDataReadingCurrent.liveDataSessionId` → `LiveDataSession.id`.

### Backward Compatibility

- Phase A is fully additive. No existing table is altered (only optional columns are added). The new `VehicleDecode` table is global reference data; it does not participate in any existing query.
- Phase B is fully additive. No existing table is altered. The new tables are tenant-scoped and use the existing `organizationId` pattern. The new agent endpoints are under `/v2/...`; the old `/v1/.../scan-queue` is preserved.
- All new entities use UUID primary keys (consistent with Feature 004 and Feature 005).
- `VehicleDecode` is global (Correction 6): a single `vin UNIQUE` row shared across tenants. A user in tenant A who decodes a VIN today shares the row with a user in tenant B tomorrow.

### Rollback Plan

- Phase A: `ALTER TABLE "Vehicle" DROP COLUMN "bodyStyle"; ALTER TABLE "Vehicle" DROP COLUMN "engine"; DROP TABLE "VehicleDecode";`
- Phase B: `DROP TYPE "LiveDataSessionStatus"; DROP TABLE "LiveDataReadingCurrent"; DROP TABLE "LiveDataSnapshot"; DROP TABLE "LiveDataSession"; DROP TABLE "PIDDefinition";` — no `LiveDataReading` table to drop.

---

## Entity Relationship Diagram (Phase A + Phase B)

```
┌─────────────────┐                    ┌────────────────────────┐
│   Organization  │                    │   Organization         │
│        │        │                    │        │               │
│        ▼        │                    │        ▼               │
│  ┌───────────┐  │                    │  │ LiveDataSession  │   │
│  │  Vehicle  │  │                    │  │  + supportedMask │   │
│  │  +engine  │  │                    │  │  + cadenceMs     │   │
│  │  +bodyStyle│ │                    │  └────┬─────────────┘   │
│  └───────────┘  │                    │       │                 │
│                 │                    │       ▼                 │
│  ┌───────────┐  │                    │  ┌──────────────────┐   │
│  │VehicleAudit│ │                    │  │ LiveDataSnapshot │   │
│  └───────────┘  │                    │  │  + values (JSONB)│   │
│                 │                    │  └──────────────────┘   │
│  ┌───────────┐  │                    │                          │
│  │VehicleDec.│  │ (GLOBAL)           │  ┌──────────────────┐   │
│  │ (cache)   │  │                    │  │ LiveDataReading- │   │
│  │ unique(vin)│ │                    │  │ Current (RM)     │   │
│  └───────────┘  │                    │  └──────────────────┘   │
│                 │                    │                          │
│  ┌───────────┐  │                    │                          │
│  │PIDDef.    │  │ (GLOBAL)           │                          │
│  │ (built-in │  │                    │                          │
│  │  + asset) │  │                    │                          │
│  └───────────┘  │                    │                          │
│                 │                    │                          │
│  ┌───────────┐  │                    │                          │
│  │ Diagnostic│  │                    │                          │
│  │ Session   │  │                    │                          │
│  │ Audit Log │  │                    │                          │
│  └───────────┘  │                    │                          │
└─────────────────┘                    └──────────────────────────┘

Hierarchy (Correction 1):

  DiagnosticSession  1 ──→ many  LiveDataSession  1 ──→ many  LiveDataSnapshot
                                                               (+ values JSONB)
```

---

## Validation Rules

| Entity | Field | Rule |
|---|---|---|
| `Vehicle` | `engine` | 0–100 characters (VarChar 100) |
| `Vehicle` | `bodyStyle` | 0–100 characters (VarChar 100) |
| `VehicleDecode` | `vin` | 17 characters, `[A-HJ-NPR-Z0-9]{17}`, uppercase, **UNIQUE**, **GLOBAL** (no `organizationId`) — Correction 6 |
| `PIDDefinition` | `model` | One of `'STD_OBD2'`, `'GME'`, or future values |
| `PIDDefinition` | `pid` | Hex string; for `model = 'STD_OBD2'`, exactly 2 hex chars (e.g., `0C`); for `model = 'GME'`, exactly 6 hex chars (e.g., `221108`) |
| `PIDDefinition` | `formula` | Restrictive grammar (Correction 5 — see [pid-definition-contract.md](contracts/pid-definition-contract.md)): only `A`, `B`, integer literals, `+`, `-`, `*`, `/`, `(`, `)`. **No `eval`. No scripting. No user-defined formulas.** |
| `LiveDataSession` | `cadenceMs` | 200–5000, **default 1000 (1 s)** — Correction 3. Clamped at the service layer. |
| `LiveDataSession` | `diagnosticSessionId` | NOT NULL, FK → DiagnosticSession — Correction 1 |
| `LiveDataSnapshot` | `diagnosticSessionId` | NOT NULL, FK → DiagnosticSession — Correction 1 |
| `LiveDataSnapshot` | `capturedAt` | Within 5 minutes of server time at insert (informational only) |
| `LiveDataSnapshot` | `values` | JSONB; keyed by hex PID; shape: `{ "0C": { name, value, unit, rawValue }, ... }` — Correction 2. No separate `LiveDataReading` table. |

### Cross-Model

- `LiveDataSession.organizationId` must equal `DiagnosticSession.organizationId`, `DesktopAgent.organizationId`, and any `LiveDataSnapshot.organizationId` produced under it.
- `LiveDataSnapshot.organizationId` must equal its parent `DiagnosticSession.organizationId`.
- `LiveDataSnapshot.diagnosticSessionId` must equal the `diagnosticSessionId` of its parent `LiveDataSession` (or the session's parent diagnostic session).
- Snapshot cap: at most 50 `LiveDataSnapshot` rows per `DiagnosticSession` at any time (enforced at the service layer, not as a DB constraint).
