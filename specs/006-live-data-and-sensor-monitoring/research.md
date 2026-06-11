# Research: Live Data & Sensor Monitoring (Feature 006)

**Feature**: 006-live-data-and-sensor-monitoring
**Branch**: `007-live-data-sensor-monitoring`
**Date**: 2026-06-11
**Spec**: [spec.md](spec.md)

This document records the Phase 0 research decisions for Feature 006. The Open Questions raised in the spec have been resolved by the user before this plan was generated; this document captures the implementation-level rationale and the additional research that informed the design.

---

## R-001 — VPIC asset storage and lookup path

**Decision**: Use the local `backend/data/vpic.sqlite.xz` asset as the single source of truth for VIN decoding. Open it as a read-only SQLite handle in a long-lived `VpicAssetService`. Cache successful decode summaries in a new global `VehicleDecode` table for repeated lookups of the same VIN. The full VPIC corpus is **not** imported into PostgreSQL.

**Rationale**:
- The full VPIC database is ~67 MB compressed and contains ~100 tables, of which only a handful are needed for VIN → Make/Model/Year/Engine/BodyStyle lookups. Importing the full corpus would bloat PostgreSQL with mostly-unused reference data.
- A read-only SQLite handle is a single-process resource shared by NestJS workers (or per-worker with a single connection per process) and is sufficient for the read-only VIN lookup pattern.
- The `VehicleDecode` cache table stores only the summary fields the UI needs (`make`, `model`, `year`, `engine`, `bodyStyle`, `manufacturer`), avoiding re-querying the asset for repeat decodes of the same VIN. Caching is global because VPIC data is industry-standard and identical across tenants.

**VPIC lookup path (verified against `backend/data/vpic.sqlite.xz`)**:
1. `Pattern` (1.6M rows) holds the decode rules. Each pattern has `Keys` (a 4–5 character template with `*` as wildcard), `VinSchemaId`, `ElementId`, and `AttributeId`.
2. `Wmi` (12K rows) links the VIN's WMI (first 3 characters) to one or more `VinSchema`s via `WMI_VinSchema` (40K rows).
3. For each candidate `VinSchema`, the relevant `Pattern.Keys` are evaluated against the VIN's positions 4–8 (model year + attributes). The `*` in `Keys` matches any character; non-`*` characters must match exactly.
4. The `Element` table (160 rows) defines the attribute labels (e.g., "Make", "Model", "Model Year", "Body Style", "Engine Configuration", "Manufacturer Name"). The `AttributeId` in `Pattern` is a comma-separated list of element IDs to populate.
5. Each populated attribute resolves through the lookup tables: `Make` (Name), `Model` (Name), `BodyStyle` (Name), `EngineConfiguration` (Name), `Manufacturer` (Name), `Country` (Name), `VehicleType` (Name).

**MVP lookup query** (implemented in `VpicDecodeService`):
```sql
-- 1) Find candidate VinSchemas for the WMI (first 3 chars of VIN)
SELECT vs.Id
FROM Wmi w
JOIN WMI_VinSchema wv ON wv.WmiId = w.Id
JOIN VinSchema vs ON vs.Id = wv.VinSchemaId
WHERE w.Wmi = :wmiPrefix;

-- 2) For each candidate, match Patterns by Keys
SELECT p.Keys, p.ElementId, p.AttributeId
FROM Pattern p
WHERE p.VinSchemaId IN (:schemaIds)
  AND :vinPatternGlob MATCHES p.Keys;
  -- (Implemented as: SUBSTR(:vin, 4, LENGTH(p.Keys) - COUNT(*)) with '*' expansion.
  --   SQLite supports GLOB on text columns; the implementation uses a generated column
  --   or in-process wildcard expansion since GLOB does not support runtime patterns.)

-- 3) Resolve Elements
SELECT e.Name AS elementName
FROM Element e
WHERE e.Id IN (:elementIds);
```

**Alternatives considered**:
- **Import the whole VPIC corpus into PostgreSQL**: rejected for size and maintenance reasons. The asset is read-only; re-importing on every update is unnecessary.
- **Import only the decode-summary projection (Make/Model/Year/Engine/Body) for all known VINs into PostgreSQL**: rejected because the corpus is 1.6M patterns × 67 model years; even a pre-computed table would be tens of millions of rows. A point-lookup against the asset + a small in-memory or `VehicleDecode` cache for *successful* decodes is sufficient.
- **NHTSA VPIC REST API (https://vpic.nhtsa.dot.gov/api/)**: explicitly out of scope. The user description and constitution both prefer local reference data; runtime external calls would also violate the "no external network at runtime" principle inherited from Feature 005.

**Implementation notes**:
- The asset file path is `backend/data/vpic.sqlite.xz`. On first use, the service decompresses it to a cache location (e.g., `backend/data/_runtime/vpic.sqlite`) using `lzma` (Node's `lzma-native` or `lzma-purejs` package, or `child_process` invoking `xz -d`). The runtime file is locked read-only via SQLite's `mode=ro` URI.
- The service is registered as a NestJS provider with `scope: DEFAULT` and lazy-initialized in `OnModuleInit`. The `VehicleDecodeService` is the only public surface.
- VIN is validated as exactly 17 characters, `[A-HJ-NPR-Z0-9]{17}` (ISO 3779: no I, O, Q), and uppercased before lookup. A negative cache (VIN not in VPIC) is **not** stored — to keep the asset as the source of truth, missing-VIN lookups always consult the asset.

---

## R-002 — `model-pids.sqlite` import

**Decision**: Import the 127 rows of `backend/data/model-pids.sqlite` into a new global `PIDDefinition` table on first backend startup (idempotent upsert). Standard OBD-II Mode 01 PIDs in the MVP set are seeded from a built-in TypeScript file `pid-mvp.ts` that ships with the application (not from the asset), since the asset does not contain them.

**Rationale**:
- The asset has 127 rows and is 24 KB; importing it is essentially free and avoids the operational complexity of a per-process read-only handle for a frequently-accessed lookup table.
- The asset's coverage is GM-Extended Mode 22 PIDs only (verified: 100% of rows have `pid LIKE '22%'` and `model = 'GME'`). The asset does **not** cover the standard OBD-II Mode 01 PIDs (`0C`, `0D`, `05`, `10`, `11`, `0B`, `2F`, etc.) the spec's MVP set requires.
- The standard PIDs are well-known, public, and stable (SAE J1979). A built-in TypeScript seed file is the right place for them: it is versioned with the code, it is reviewable, and it does not require an asset update cycle.

**Built-in MVP PID set (seeded in `pid-mvp.ts`)**:

| Hex PID | Name | Unit | Formula | Min | Max |
|---|---|---|---|---|---|
| 0C | Engine RPM | RPM | `(A * 256 + B) / 4` | 0 | 16383.75 |
| 0D | Vehicle Speed | km/h | `A` | 0 | 255 |
| 05 | Engine Coolant Temperature | °C | `A - 40` | -40 | 215 |
| 42 | Control Module Voltage | V | `(A * 256 + B) / 1000` | 0 | 65.535 |
| 11 | Throttle Position | % | `A * 100 / 255` | 0 | 100 |
| 04 | Calculated Engine Load | % | `A * 100 / 255` | 0 | 100 |
| 06 | Short Term Fuel Trim Bank 1 | % | `(A - 128) * 100 / 128` | -100 | 99.22 |
| 07 | Long Term Fuel Trim Bank 1 | % | `(A - 128) * 100 / 128` | -100 | 99.22 |
| 10 | MAF Air Flow | g/s | `(A * 256 + B) / 100` | 0 | 655.35 |
| 0F | Intake Air Temperature | °C | `A - 40` | -40 | 215 |
| 14 | O2 Sensor Bank 1 Sensor 1 Voltage | V | `A / 200` | 0 | 1.275 |

**Import logic for `model-pids.sqlite`**:
- A one-shot seed command `npm run seed:pid-definitions` (and an idempotent first-use hook in the backend's `OnModuleInit`) opens `backend/data/model-pids.sqlite` read-only, selects `(model, pid, equation, unit, description)`, and upserts into `PIDDefinition` keyed by `(model, pid)`.
- `PIDDefinition` is global reference data — no `organizationId`.
- The `model` column distinguishes GM-Extended Mode 22 PIDs (one row per (model, pid)) from standard Mode 01 PIDs (one row per pid with `model = 'STD_OBD2'`).
- A `source` column records whether the row came from `model-pids.sqlite` (`source = 'model-pids-sqlite'`) or the built-in seed (`source = 'built-in-mvp'`).

**Alternatives considered**:
- **Read `model-pids.sqlite` from disk on every lookup**: rejected because (a) the standard PIDs are not in the file, and (b) shipping the same data twice (built-in + asset) is confusing.
- **Use only the built-in seed, drop the asset**: rejected because the asset's GM-Extended Mode 22 PIDs are valuable for future GM-specific work; loading them now keeps the door open.

---

## R-003 — Polling architecture: agent-initiated

**Decision**: The Desktop Agent is the only process that holds the ELM327 connection. The backend never opens its own connection to the adapter. Polling is **agent-initiated** in the same way Feature 004's scan command queue is agent-initiated. The MVP transport is HTTPS REST polling. No WebSockets or SSE in Feature 006.

**Topology**:
```
┌────────────────┐  poll-cycle result   ┌──────────────────┐  read / start / stop   ┌────────────────┐
│ Desktop Agent  │ ──────────────────►  │  NestJS Backend  │ ◄──────────────────── │ Next.js Web App│
│ (owns ELM327)  │                      │ (state of truth) │                       │ (dashboard)    │
└────────────────┘                      └──────────────────┘                       └────────────────┘
```

**Command queue extension**:
- Feature 004's `obd.agents.{id}.scan-queue` endpoint is renamed to `obd.agents.{id}.command-queue` (versioned as `/v2/...` to preserve Feature 004 contracts) and accepts `commandType: 'SCAN' | 'LIVE_DATA_DISCOVERY' | 'LIVE_DATA_POLL' | 'LIVE_DATA_STOP'`.
- The agent continues to poll this queue every 2 seconds when idle. When the backend has a pending command for the agent (a scan, a discovery, or a live poll), the response is the next command; otherwise 204.
- A new endpoint `obd.agents.{id}.live-cycles` accepts `POST` with a `cycleId`, `commandType: 'LIVE_DATA_POLL'`, and a list of `readings: { pid, rawValue, ecu, errorCode? }`.

**Dashboard read path**:
- The Next.js dashboard polls `GET /sessions/{id}/live-data/current` every 1 second (configurable) to retrieve the most recent reading per PID. The endpoint reads from the persisted "most-recent-per-PID" state stored in the backend.
- Backend persists the most recent reading per `(liveDataSessionId, pid)` to a `LiveDataReadingCurrent` (read-model) view, populated by the agent's push endpoint.

**Why agent-initiated**:
- Honors the constitution's "Desktop Agent is a bridge only" and "Backend-Centric Business Logic" principles: the agent does not know about Diagnostic Sessions; the backend does not know about OBD-II frames.
- The existing Feature 004 command-queue pattern is reused, not replaced.
- Polling is REST, matching the MVP constraint; a future WebSocket upgrade is a transport swap that does not require re-planning the data flow.

**Alternatives considered**:
- **Backend-initiated polling (backend holds the connection to the agent over a long-lived socket)**: rejected because the agent is a local process behind a NAT/firewall in most workshop networks; a backend-initiated push is unreliable.
- **WebSockets in MVP**: deferred. The current pattern works for ≤ 5 sessions per workshop; scaling beyond that is a future concern.
- **Server-Sent Events (SSE) for the dashboard**: deferred. Polling the dashboard at 1 s is good enough for the MVP and keeps the contract simple.

---

## R-004 — Live data session lifecycle

**Decision**: A new `LiveDataSession` table holds the per-session state, linked to a `DiagnosticSession`. The `LiveDataSession` is created on first "Start Polling" for a diagnostic session and is updated by each agent cycle. It is closed when the diagnostic session closes, when polling is stopped, or when no readings have been received for > 30 s (timeout).

**Lifecycle**:
```
                   create
   (none) ─────────────────────► ACTIVE ──timeout / stop──► CLOSED
                                     │
                                     │      create new
                                     └──────────────► ACTIVE
```

**Why a separate table**:
- A diagnostic session may have many polling sessions (e.g., the technician starts and stops several times).
- Concurrent polling on different agents for different diagnostic sessions in the same tenant must not interfere.
- Snapshots are linked to the `LiveDataSession` that captured them, but can be viewed from the `DiagnosticSession` detail page regardless of which live data session captured them.
- The supported-PID mask is per live data session (it is vehicle- and adapter-specific, not diagnostic-session-specific).

---

## R-005 — Snapshot retention

**Decision**: Cap at 50 snapshots per `DiagnosticSession`. When a 51st snapshot is created, the oldest snapshot is deleted in the same Prisma transaction as the new snapshot's insert.

**Rationale**:
- The spec scopes snapshots as point-in-time captures, not recordings. A 50-snapshot cap is more than enough for typical diagnostic workflows (5–10 captures per session is common).
- Unbounded growth would risk disk pressure and slow the diagnostic-session detail page.
- A cap is enforced at the service layer (not just a database constraint) so a clear error can be returned and the eviction policy is documented in the audit trail.

**Eviction policy**:
- On the 51st snapshot, the snapshot with the oldest `capturedAt` is deleted, and a `DiagnosticSessionAuditRecord` with action `LIVE_DATA_SNAPSHOT_EVICTED` is written (with `metadata` referencing the evicted snapshot id).
- The cap is configurable via an environment variable `LIVE_DATA_SNAPSHOT_CAP` (default 50).

---

## R-006 — Vehicle schema extension

**Decision**: Add nullable `engine` (VarChar 100) and `bodyStyle` (VarChar 100) columns to the `Vehicle` model. The migration is additive — no existing column is altered, no existing data is migrated. The fields are optional in DTOs and on the form.

**Rationale**:
- The spec is explicit that VPIC-decoded values are a starting point the technician may edit; persisting the full VPIC decode on the Vehicle record is desirable so subsequent vehicle loads do not need to re-decode.
- A separate `VehicleMetadata` JSONB column was considered but rejected: it would split related fields across two locations and make the form rendering more complex.

---

## R-007 — Permissions and RBAC

**Decision**: No new permission is introduced. The new endpoints inherit the existing read/write access to Diagnostic Sessions in the tenant, which is the policy already enforced for `SessionFaultCode` (Feature 004) and `MasterFaultCode` (Feature 005).

**Rationale**:
- The spec explicitly states this in FR-022.
- Adding a new permission (e.g., `livedata:read`) would create a configuration change requirement on the existing role-permission matrix; the inheritance approach is consistent with the rest of the codebase.

---

## R-008 — Audit logging

**Decision**: Reuse the existing `DiagnosticSessionAuditRecord` table for all new audit events. New `action` strings:
- `VIN_DECODED_FROM_ASSET` — written when a `GET /vehicles/decode?vin=` returns a successful decode (in the same transaction as the `VehicleDecode` row insert).
- `LIVE_DATA_POLL_STARTED` — written when a `LiveDataSession` is created.
- `LIVE_DATA_POLL_STOPPED` — written when a `LiveDataSession` is closed (via Stop, timeout, or session close).
- `LIVE_DATA_SNAPSHOT_CAPTURED` — written when a snapshot is created.
- `LIVE_DATA_SNAPSHOT_EVICTED` — written when an old snapshot is evicted by the retention cap.

**Rationale**: Aligns with the constitution's "immutable audit trail" principle and the existing `DiagnosticSessionAuditRecord` pattern from Feature 004. No new audit table is needed.

---

## R-009 — Test data and acceptance verification

**Decision**: For automated tests, ship a small VPIC fixture (10–20 known VINs with expected decode results) used by integration tests. For local development and CI, the runtime SQLite file is checked into the repo as a small fixture (`backend/test/fixtures/vpic-fixture.sqlite`) so tests do not require the 67 MB asset.

**Rationale**:
- The full VPIC asset is 67 MB; checking it into git is undesirable.
- A small fixture covers all branches of the VPIC decode logic (WMI match, model year, attribute resolution, not-found).
- The production code path uses the real asset; tests use the fixture.

---

## R-010 — Backward compatibility

**Decision**: No existing public contract is altered. Specifically:
- The `ScanJob`, `SessionFaultCode`, `MasterFaultCode` Prisma models are unchanged (only new tables are added).
- The `DiagnosticSession`, `Vehicle` Prisma models gain optional nullable columns and an optional relation; both are backward-compatible.
- Feature 004's `obd.agents.{id}.scan-queue` endpoint is preserved as-is; the new command types are added under a new `/v2/...` route or a unified command-queue endpoint that the agent probes by sending an `acceptVersions` header.
- Feature 005's enrichment endpoint and `MasterFaultCode` flow is unchanged.

**Rationale**: Constitution principle XIV (Git & Change Safety) prohibits breaking existing public contracts without approval. The additive-only approach satisfies this.
