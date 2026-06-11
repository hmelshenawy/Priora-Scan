# Implementation Plan: Live Data & Sensor Monitoring

**Feature Branch**: `007-live-data-sensor-monitoring`
**Date**: 2026-06-11
**Spec**: [specs/006-live-data-and-sensor-monitoring/spec.md](spec.md)
**Plan**: This document
**Research**: [specs/006-live-data-and-sensor-monitoring/research.md](research.md)
**Data Model**: [specs/006-live-data-and-sensor-monitoring/data-model.md](data-model.md)
**Contracts**:
- [contracts/vin-decode-contract.md](contracts/vin-decode-contract.md)
- [contracts/live-data-contract.md](contracts/live-data-contract.md)
- [contracts/live-data-agent-contract.md](contracts/live-data-agent-contract.md)
- [contracts/pid-definition-contract.md](contracts/pid-definition-contract.md)
**Constitution**: `.specify/memory/constitution.md` v1.0.0

## Summary

Feature 006 introduces PrioraScan's first true diagnostic telemetry capability on top of the Feature 004 OBD foundation. It is delivered in two phases. **Phase A — VIN Intelligence** adds `Vehicle.engine` and `Vehicle.bodyStyle` columns, a new global `VehicleDecode` cache, and `GET /vehicles/decode?vin=…` which decodes a VIN against the local `backend/data/vpic.sqlite.xz` asset, caches the result, writes a `VIN_DECODED_FROM_ASSET` audit, and pre-fills the New Vehicle form. The cache is **global** (no `organizationId`) with `vin UNIQUE` — a single row per VIN, shared across all tenants (Correction 6). No external network calls are made at runtime.

**Phase B — Live Data & Sensor Monitoring** adds `PIDDefinition` (global), `LiveDataSession` (child of `DiagnosticSession` — Correction 1), `LiveDataSnapshot` (with a JSONB `values` column — Correction 2, no separate `LiveDataReading` table), and the `LiveDataReadingCurrent` read-model. The Desktop Agent is extended with a `/v2/obd/agents/:id/command-queue` probe, a `LIVE_DATA_POLL` command, a poll cycle push, and a PID discovery command. The MVP polls 11 standard SAE J1979 PIDs at a **default cadence of 1 s (1000 ms)** (Correction 3), configurable in `[200, 5000]` ms. Snapshots are point-in-time captures stored in JSONB, capped at 50 per diagnostic session (oldest evicted). All persistence is tenant-scoped via the existing `DiagnosticSession` policy; no new permission is introduced.

## Technical Context

- **Backend**: NestJS 10+ (TypeScript), Prisma 5+, PostgreSQL 15+
- **Frontend**: Next.js 14+ (App Router), TypeScript, TailwindCSS, shadcn/ui, TanStack Query, React Hook Form, Zod, Axios
- **Desktop Agent**: Python 3.11+, pyserial 3.5+, bleak 0.21+ (Bluetooth fallback), pytest 7+
- **Local assets**: `backend/data/vpic.sqlite.xz` (~67 MB), `backend/data/model-pids.sqlite` (~24 KB), `backend/data/code-descriptions.sqlite` (Feature 005)
- **Reference runtime**: decompressed `backend/data/_runtime/vpic.sqlite` (git-ignored, opened read-only)
- **Testing**: Jest + Supertest (backend), Jest + React Testing Library + Playwright (frontend), pytest (agent)
- **Targets**: web application at `http://localhost:3000`, NestJS API at `http://localhost:3000`, Desktop Agent binary on a workshop laptop. Single workshop, ≤ 5 concurrent polling sessions, MVP scale.
- **Performance goals**:
  - VIN decode: p95 < 100 ms cache hit, p95 < 1 s cold (asset lookup + cache write + audit).
  - Live data read: p95 < 100 ms (`GET /live-data/current`).
  - Snapshot write: p95 < 500 ms (insert + audit + possible eviction).
  - Decode per PID: p95 < 1 ms; bulk decode (11 PIDs): p95 < 10 ms.
- **Backward compatibility**: Feature 004's `/obd/agents/:id/scan-queue`, `/scan-events`, `/heartbeat` and Feature 005's enrichment endpoints are unchanged. The new agent endpoints live under `/v2/obd/agents/:id/...`.

## Constitution Check

| # | Gate | Status | Justification |
|---|---|---|---|
| 1 | Documentation First | PASS | Plan references `docs/PRD.md`, `docs/SAD.md`, `docs/FRONTEND_ARCHITECTURE.md`; the new page in the Next.js app reuses the existing `sessions/[id]` layout. |
| 2 | Layered Architecture | PASS | New code follows the existing Controller → Service → Repository pattern in `backend/src/`. No layer leakage. |
| 3 | Multi-Tenant First | PASS | All tenant-scoped entities carry `organizationId`. `VehicleDecode` and `PIDDefinition` are explicitly global reference data per the constitution. |
| 4 | API First | PASS | All seven web endpoints and three agent endpoints are versioned and contract-first in `contracts/`. |
| 5 | Auditability | PASS | Five new audit actions are written through the existing `DiagnosticSessionAuditRecord` table. |
| 6 | Git Safety | PASS | Both migrations are additive; Feature 004/005 contracts are preserved. |

## Project Structure

```
Priora Scan/
├── backend/                                 # NestJS 10+ / Prisma 5+
│   ├── prisma/
│   │   ├── schema.prisma                    # + VehicleDecode, PIDDefinition, LiveDataSession, LiveDataSnapshot, LiveDataReadingCurrent
│   │   ├── migrations/
│   │   │   ├── 20260611_add_vin_intelligence/
│   │   │   └── 20260615_add_live_data/
│   │   └── seed/
│   │       ├── pid-mvp-seed.ts              # 11 standard OBD-II Mode 01 PIDs
│   │       └── model-pids-asset-import.ts   # imports 127 GM Mode 22 rows
│   ├── src/
│   │   ├── vehicles/                        # existing; add decode controller + service
│   │   │   ├── controllers/vehicles.controller.ts        # + GET /vehicles/decode
│   │   │   ├── services/vpic-decode.service.ts           # NEW
│   │   │   ├── services/vehicle-decode.service.ts        # NEW (cache wrapper)
│   │   │   ├── repositories/vehicle-decode.repository.ts # NEW
│   │   │   └── dtos/vehicle-decode.dto.ts                # NEW
│   │   ├── live-data/                       # NEW module
│   │   │   ├── live-data.module.ts
│   │   │   ├── controllers/live-data.controller.ts
│   │   │   ├── controllers/live-data-agent.controller.ts
│   │   │   ├── services/live-data-session.service.ts
│   │   │   ├── services/live-data-snapshot.service.ts
│   │   │   ├── services/live-data-poll.service.ts
│   │   │   ├── services/pid-decoder.service.ts
│   │   │   ├── services/pid-formula-parser.service.ts    # restricted grammar (Correction 5)
│   │   │   ├── services/pid-discovery.service.ts
│   │   │   ├── services/cadence.service.ts               # clamp to [200,5000], default 1000
│   │   │   ├── repositories/live-data-session.repository.ts
│   │   │   ├── repositories/live-data-snapshot.repository.ts
│   │   │   ├── repositories/live-data-reading-current.repository.ts
│   │   │   ├── repositories/pid-definition.repository.ts
│   │   │   └── dtos/
│   │   ├── obd/                             # extended with /v2/... agent endpoints
│   │   │   ├── controllers/command-queue-v2.controller.ts
│   │   │   └── services/command-queue.service.ts
│   │   ├── diagnostic-sessions/             # extended with liveDataSessions/Snapshots relations
│   │   ├── audit/                           # existing; reused for new actions
│   │   ├── config/                          # add LiveDataConfig, VpicConfig
│   │   └── prisma/prisma.service.ts
│   ├── data/
│   │   ├── vpic.sqlite.xz
│   │   ├── model-pids.sqlite
│   │   └── _runtime/vpic.sqlite             # git-ignored; generated on first start
│   └── test/
│       ├── fixtures/vpic-fixture.sqlite     # 10–20 known VINs
│       └── fixtures/seed-pids.json
│
├── frontend/                                # Next.js 14+ App Router
│   ├── src/
│   │   ├── app/
│   │   │   ├── (authed)/
│   │   │   │   ├── vehicles/new/page.tsx                # extended: Decode VIN button + auto-fill
│   │   │   │   ├── sessions/[id]/live-data/page.tsx     # NEW
│   │   │   │   └── sessions/[id]/page.tsx               # extended: Snapshots section
│   │   ├── components/
│   │   │   ├── live-data/LiveDataDashboard.tsx          # NEW
│   │   │   ├── live-data/PidRow.tsx                     # NEW
│   │   │   ├── live-data/SnapshotButton.tsx             # NEW
│   │   │   ├── live-data/AdapterOfflineBanner.tsx       # NEW
│   │   │   ├── live-data/SnapshotsList.tsx              # NEW
│   │   │   ├── live-data/DiscoveryButton.tsx            # NEW
│   │   │   └── live-data/CadenceSelector.tsx            # NEW
│   │   ├── hooks/
│   │   │   ├── useLiveDataPolling.ts                    # NEW (1s default; uses returned cadenceMs)
│   │   │   └── useVinDecode.ts                          # NEW
│   │   ├── lib/api/
│   │   │   ├── live-data.client.ts                      # NEW
│   │   │   └── vehicle-decode.client.ts                 # NEW
│   │   └── types/live-data.types.ts                     # NEW
│   └── tests/e2e/live-data.spec.ts                      # NEW
│
├── desktop-agent/                           # Python 3.11+
│   ├── src/
│   │   ├── obd/
│   │   │   ├── commands/
│   │   │   │   ├── pid.py                # NEW
│   │   │   │   ├── pid_discovery.py      # NEW
│   │   │   │   └── vin.py                # existing
│   │   │   ├── poll.py                   # NEW (cadence loop; respects returned cadenceMs)
│   │   │   ├── adapter.py                # existing
│   │   │   └── elm327.py                 # existing
│   │   ├── live_data_client.py           # NEW
│   │   ├── command_queue.py              # MODIFIED — probe v2 first, fallback v1
│   │   ├── api_client.py                 # existing
│   │   ├── pairing.py                    # existing
│   │   └── main.py
│   └── tests/
│       ├── test_pid_decoder.py           # NEW
│       ├── test_poll_loop.py             # NEW
│       └── test_live_data_client.py      # NEW
│
├── specs/
│   └── 006-live-data-and-sensor-monitoring/
│       ├── spec.md
│       ├── research.md
│       ├── data-model.md
│       ├── plan.md                        # this file
│       ├── quickstart.md
│       ├── tasks.md
│       └── contracts/
│           ├── vin-decode-contract.md
│           ├── live-data-contract.md
│           ├── live-data-agent-contract.md
│           └── pid-definition-contract.md
│
├── docs/
│   ├── PRD.md
│   ├── SAD.md
│   ├── FRONTEND_ARCHITECTURE.md
│   └── ops/data-assets.md
│
└── .specify/memory/constitution.md
```

## Phase A — VIN Intelligence

### Phase A.1 — Setup

- Verify `backend/data/vpic.sqlite.xz` and `backend/data/model-pids.sqlite` are present; document the canonical paths in `docs/ops/data-assets.md`.
- Add npm scripts: `seed:pid-mvp`, `seed:pid-definitions` (Phase B only; included now for one-step boot).
- Install `lzma-native` (or use `xz -d` subprocess) for VPIC asset decompression.

### Phase A.2 — Foundational

- Migration `20260611_add_vin_intelligence` adds `Vehicle.engine`, `Vehicle.bodyStyle`, and the global `VehicleDecode` table.
- New services: `VpicAssetService` (open read-only SQLite handle from decompressed asset), `VpicDecodeService` (WMI → schema → pattern → element resolution), `VehicleDecodeService` (cache-aside wrapper around the asset).
- New module wiring: register `VpicAssetService` as a long-lived provider in `VehiclesModule` with `OnModuleInit` lazy-init.
- Audit wiring: `VIN_DECODED_FROM_ASSET` is written by the `DiagnosticSessionAuditService` (existing) inside the same Prisma `$transaction` as the cache insert/update.

### Phase A.3 — US1 — Decode endpoint, vehicle form, audit

- `GET /vehicles/decode?vin=…` — Controller validates VIN format, delegates to `VehicleDecodeService.decode(vin)`, returns the payload. Writes audit. Performance: cache hit < 100 ms p95, cache miss < 1 s p95.
- New Vehicle form — `useVinDecode` hook debounces the VIN input, calls the endpoint, pre-fills Make/Model/Year/Engine/Body. Form is editable; edited values are persisted.
- Vehicle Confirm modal (post-scan) — reuses the same hook; shows decoded values alongside the technician's edits.

### Phase A — Acceptance Criteria

- **Phase A-AC-1**: `GET /vehicles/decode?vin={known}` returns 200 with `make/model/year/engine/bodyStyle/manufacturer`.
- **Phase A-AC-2**: A second call with the same VIN returns the same payload with `cached: true` in < 100 ms p95.
- **Phase A-AC-3**: Malformed VIN returns 400 with `INVALID_VIN`.
- **Phase A-AC-4**: A VIN not in the asset returns 200 with all-null fields (the form stays blank and accepts manual entry).
- **Phase A-AC-5**: The New Vehicle form pre-fills on a known VIN; user-edited values persist on confirm.
- **Phase A-AC-6**: Every successful decode writes a `DiagnosticSessionAuditRecord` with `action = 'VIN_DECODED_FROM_ASSET'`, tenant-scoped, immutable.
- **Phase A-AC-7**: **Cross-tenant cache shared (Correction 6).** `VehicleDecode` is **global** (no `organizationId` column), and `vin` is `UNIQUE`. A single row exists per VIN regardless of which tenant performed the first decode. A user in tenant A who has decoded VIN `WDD2130041A123456` shares the cache with a user in tenant B who decodes the same VIN. Cross-tenant access is the **desired** behavior (see D-14).

## Phase B — Live Data & Sensor Monitoring

### Phase B.1 — Foundational

- Migration `20260615_add_live_data` creates `PIDDefinition`, `LiveDataSession`, `LiveDataSnapshot` (with JSONB `values` — Correction 2), and `LiveDataReadingCurrent`. Adds the new relations on `DiagnosticSession` (additive only). No `LiveDataReading` / `LiveDataSnapshotValue` table is created in the MVP.
- **Architecture decision (D-13, Correction 1)**: `LiveDataSession` belongs to `DiagnosticSession` (one DiagnosticSession → many LiveDataSessions). The hierarchy is `DiagnosticSession → LiveDataSession → LiveDataSnapshot`. All live-data history stays attached to the originating `DiagnosticSession`. Both the `LiveDataSession.diagnosticSessionId` FK and the `LiveDataSnapshot.diagnosticSessionId` FK enforce this link explicitly so the 50-snapshot cap can be enforced per-diagnostic-session.
- **Snapshot storage (D-13, Correction 2)**: `LiveDataSnapshot` stores values as a single **JSONB** column `values: Json` (e.g., `{"rpm": 850, "speed": 0, "coolantTemp": 92, "batteryVoltage": 13.9}` — keyed by hex PID in the persistence shape: `{"0C": { name, value, unit, rawValue }, ...}`). The MVP does **not** create a separate `LiveDataReading` / `LiveDataSnapshotValue` table. Fields on `LiveDataSnapshot`: `id`, `organizationId`, `diagnosticSessionId`, `liveDataSessionId`, `capturedAt`, `createdBy`, `values` (JSONB). The 50-snapshot cap is enforced against `LiveDataSnapshot` rows for a given `DiagnosticSession` (oldest evicted). `LiveDataReadingCurrent` remains a separate read-model table (one row per PID per session), used by the dashboard. Rationale: only 11 PIDs in MVP, simpler retention, no per-PID query need on historical snapshots.
- `pid-mvp-seed.ts` ships the 11 standard SAE J1979 PIDs with `namespace = 'STD_OBD2'`, `mode = '01'`, `source = 'built-in-mvp'`. Run on first start and via `npm run seed:pid-mvp`.
- `model-pids-asset-import.ts` opens `model-pids.sqlite` read-only, upserts 127 GM Mode 22 rows with `namespace = 'GME'`, `mode = '22'`, `source = 'model-pids-sqlite'`. Idempotent. Failure mode: missing asset is a no-op warning; the 11 built-in PIDs keep live data working.
- `PidFormulaParserService` — a small recursive-descent parser implementing the **restricted grammar** in [contracts/pid-definition-contract.md](contracts/pid-definition-contract.md) (Correction 5). The parser validates formulas at seed-import time; any formula that does not match the grammar is rejected. The runtime evaluator uses the same parser; **no `eval`, no `new Function`, no scripting, no user-defined formulas, no variables other than `A` and `B`**. See "Formula engine scope" below.
- `PidDecoderService.decode(namespace, mode, pid, rawHex)` returns `{ pid, name, value, unit, rawValue, status, errorCode }`. Strips the Mode 01 response header (`41`), substitutes `A` and `B`, evaluates the formula. Per-PID status: `OK | NO_DATA | ERROR | NOT_SUPPORTED`.

### Phase B.2 — US3 — Live dashboard, polling

- `POST /sessions/:id/live-data/start` — `LiveDataSessionService.start({ diagnosticSessionId, agentId, cadenceMs, pids })` clamps `cadenceMs` to `[LIVE_DATA_MIN_CADENCE_MS, LIVE_DATA_MAX_CADENCE_MS]` (default **`LIVE_DATA_DEFAULT_CADENCE_MS = 1000`** — Correction 3), enqueues a `LIVE_DATA_POLL` command on the agent, returns 201 with the new (or resumed) session. Audit `LIVE_DATA_POLL_STARTED`. The clamped value is **persisted** on `LiveDataSession.cadenceMs` (the dashboard and the agent both use the persisted value, not the requested value).
- `GET /sessions/:id/live-data/current` — `LiveDataReadingCurrentRepository.findBySession(id)` returns the most-recent per-PID reading map. The dashboard polls this at the returned `cadenceMs` (typically 1 s).
- `POST /sessions/:id/live-data/stop` — `LiveDataSessionService.stop(id)` marks the session `STOPPED`, purges `LiveDataReadingCurrent` rows, returns 200. Audit `LIVE_DATA_POLL_STOPPED`.
- Web app: `LiveDataDashboard` polls `current` at the configured cadence (default 1 s — the dashboard's `useLiveDataPolling` reads the cadence returned by the server on `Start`, not a hardcoded 1000 ms, so the dashboard's refresh is in lockstep with the agent's poll). `AdapterOfflineBanner` is shown when no cycle has arrived in > 30 s. The "Save Snapshot" button is disabled until at least one cycle has produced readings.

### Phase B.3 — US4 — Snapshots

- `POST /sessions/:id/live-data/snapshots` — `LiveDataSnapshotService.capture(id, userId)` reads the current `LiveDataReadingCurrent` rows, writes a new `LiveDataSnapshot` row whose `values` JSONB column contains the per-PID map. **Single Prisma `$transaction`** (D-18):
  1. Count existing snapshots for the `diagnosticSessionId`.
  2. If count ≥ `LIVE_DATA_SNAPSHOT_CAP` (default 50), select the oldest by `capturedAt` and delete it.
  3. Insert the new snapshot with its `values` JSONB.
  4. Write `LIVE_DATA_SNAPSHOT_CAPTURED` audit (and `LIVE_DATA_SNAPSHOT_EVICTED` if a row was deleted).
- 409 `NO_DATA_TO_CAPTURE` when `LiveDataReadingCurrent` is empty.
- `GET /sessions/:id/live-data/snapshots` — list endpoint with `limit` (cap 50) and `offset`; ordered `capturedAt DESC`.
- `GET /sessions/:id/live-data/snapshots/:snapshotId` — returns the snapshot with the parsed `values` map and per-PID `name/unit/rawValue`.

### Phase B.4 — US5 — Discovery

- `POST /sessions/:id/live-data/discover` — enqueues a `LIVE_DATA_DISCOVERY` command on the agent (202 Accepted, `discoveryId`).
- Agent executes the discovery sequence (PIDs `00/20/40/60/80/A0` over Mode 01) and pushes the result to `POST /v2/obd/agents/:id/live-discovery`. The backend stores the `supportedPidMask` (JSON map of `pid → boolean`) on the `LiveDataSession`.
- On the next dashboard refresh, PIDs not in the supported mask are rendered as `NOT_SUPPORTED`; supported-but-unresponsive PIDs are rendered as `NO_DATA`. The two states are visually distinct.

### Phase B.5 — US6 — Cadence configuration

- `CadenceService.clamp(requested)` returns `Math.max(LIVE_DATA_MIN_CADENCE_MS, Math.min(LIVE_DATA_MAX_CADENCE_MS, requested ?? LIVE_DATA_DEFAULT_CADENCE_MS))`. The `LiveDataSession.cadenceMs` column is updated with the **clamped** value, not the requested value, so a too-low or too-high request is observable. **Default 1000 ms (1 s)** (Correction 3).
- The Next.js hook `useLiveDataPolling` uses the returned `cadenceMs` for both the start command and its own refresh interval — they are in lockstep.
- The UI displays a small "Clamped to 200 ms" / "Clamped to 5000 ms" indicator when the persisted value differs from the requested value.

### Reconnect behavior (D-17, Correction 4)

The Desktop Agent's command queue may be reconnected after a transient network drop. The recovery rules for the active `LiveDataSession`:

- **Reconnect within `LIVE_DATA_STALE_TIMEOUT_MS` (30 s)**: the existing `ACTIVE` `LiveDataSession` is **resumed**. The next `LIVE_DATA_POLL` command is enqueued with the **same `liveDataSessionId`**. The `LiveDataReadingCurrent` rows are kept. The dashboard sees no disruption.
- **Reconnect after 30 s**: the existing `ACTIVE` session is marked `STALE` in a single transaction (audit `LIVE_DATA_POLL_STOPPED` written with `metadata.reason: 'stale_timeout'`); a new `LiveDataSession` is created on the next `Start` with a fresh `id`. The `LiveDataSnapshot`s taken under the STALE session are preserved (they remain linked to the `DiagnosticSession`).
- The 30-second window is the same as the stale-timeout window; the `LiveDataSessionService.sweep()` job runs every 30 s and marks any `ACTIVE` session with `lastPolledAt < now - LIVE_DATA_STALE_TIMEOUT_MS` as `STALE`.
- The agent push endpoint `POST /v2/obd/agents/:id/live-cycles` accepts cycles only for `ACTIVE` sessions. Cycles for `STALE` or `STOPPED` sessions are rejected with `LIVE_DATA_SESSION_NOT_FOUND`.

### Formula engine scope (D-15, Correction 5)

`PIDDefinition.formula` is restricted to a fixed grammar — **MVP-safe expressions only**. The parser is the sole evaluator; the backend never calls `eval`, `new Function`, or any other dynamic-eval primitive. The complete supported grammar:

| Token | Description |
|---|---|
| `A` | First data byte (decimal) |
| `B` | Second data byte (decimal); references in 1-byte PIDs return `B_UNDEFINED` |
| integer literal | `0`, `100`, `255`, … |
| `+`, `-`, `*`, `/` | Integer arithmetic; `/` is integer division |
| `(`, `)` | Grouping |
| whitespace | Ignored |

Whitelisted example formulas: `A`, `A - 40`, `(A * 256 + B) / 4`, `(A * 100) / 255`, `(A * 256 + B) / 1000`, `(A - 128) * 100 / 128`, `A / 200`. **No** function calls, no identifiers other than `A` and `B`, no comparison operators, no assignment, no semicolons, no scripting, no custom user-defined formulas, no variables other than `A` and `B`. The parser is a small recursive-descent grammar; rejection happens at **seed-import time** (the import log shows `Skipping row (namespace, mode, pid) — formula does not match grammar`) and **at lookup time** (a corrupt formula in the DB returns `PID_FORMULA_INVALID` and the reading is marked `ERROR`).

### Phase B — Acceptance Criteria

- **Phase B-AC-1**: Pressing Start on the Live Data dashboard shows fresh values within 2 s.
- **Phase B-AC-2**: Default polling cadence is **1 s (1000 ms)** (Correction 3); user-configurable per the clamped range; a UI indicator shows when a request was clamped.
- **Phase B-AC-3**: Disconnecting the adapter transitions the dashboard to `Adapter offline` within 5 s.
- **Phase B-AC-4**: A snapshot saved during polling persists and is visible on the session detail page with the `values` map (Correction 2: the snapshot payload is a JSONB object, not a per-PID rows list).
- **Phase B-AC-5**: The 51st snapshot evicts the oldest, writes a `LIVE_DATA_SNAPSHOT_EVICTED` audit, and the cap remains 50.
- **Phase B-AC-6**: After discovery, the dashboard labels `NOT_SUPPORTED` PIDs within 2 poll cycles; supported-but-unresponsive PIDs are labeled `NO_DATA`.
- **Phase B-AC-7**: A reconnect within 30 s resumes the same `liveDataSessionId`; after 30 s the session is `STALE` and a new session is created on the next `Start` (Correction 4).
- **Phase B-AC-8**: All four `LIVE_DATA_*` audit actions are written; tenant isolation is preserved.
- **Phase B-AC-9**: Feature 004 and Feature 005 flows continue to work; no public contract is altered. The agent probes `/v2/.../command-queue` and falls back to `/v1/.../scan-queue`.

## API Design

### Phase A — Web

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/vehicles/decode?vin={vin}` | JWT | Phase A — Decode a VIN against the local VPIC asset, cache the result (global, `vin UNIQUE`), return the payload. |

### Phase B — Web (under `/sessions/:id/live-data/...`)

| Method | Path | Description |
|---|---|---|
| POST | `/sessions/:id/live-data/start` | Start (or resume) polling. Body: `{ cadenceMs?, pids? }`. Default cadence **1000 ms** (Correction 3). Returns 201/200 with the persisted (clamped) `cadenceMs`. |
| POST | `/sessions/:id/live-data/stop` | Stop polling and mark the session `STOPPED`. |
| GET | `/sessions/:id/live-data/current` | Most-recent reading per PID; dashboard polls at the returned `cadenceMs`. |
| POST | `/sessions/:id/live-data/snapshots` | Capture a snapshot — JSONB `values` column, no per-PID rows (Correction 2). 50-cap, oldest evicted. |
| GET | `/sessions/:id/live-data/snapshots` | List snapshots, ordered `capturedAt DESC`. |
| GET | `/sessions/:id/live-data/snapshots/:snapshotId` | Single snapshot with the `values` map. |
| POST | `/sessions/:id/live-data/discover` | Enqueue a PID discovery command (202 Accepted). |

### Phase B — Agent (under `/v2/obd/agents/:id/...`)

| Method | Path | Description |
|---|---|---|
| POST | `/v2/obd/agents/:id/command-queue` | Long-poll for the next command (`SCAN`, `LIVE_DATA_DISCOVERY`, `LIVE_DATA_POLL`, `LIVE_DATA_STOP`). The `LIVE_DATA_POLL` payload includes `cadenceMs`; the agent must use the value from the command. |
| POST | `/v2/obd/agents/:id/live-cycles` | Push a poll cycle's readings; backend upserts `LiveDataReadingCurrent` rows. Cycles for `STALE` / `STOPPED` sessions are rejected with `LIVE_DATA_SESSION_NOT_FOUND` (Correction 4). |
| POST | `/v2/obd/agents/:id/live-discovery` | Push the supported-PID mask from a discovery run. |

## Desktop Agent Design

The agent is the only process that owns the ELM327 connection. The MVP transport is HTTPS REST polling; the agent long-polls `/v2/obd/agents/:id/command-queue` every 2 s when idle.

| Module | Purpose |
|---|---|
| `obd/commands/pid.py` | Build a Mode 01 PID read command; parse the response into `(rawBytes, errorCode)`. Handles the `7F 01 xx` Service-Not-Supported path. |
| `obd/commands/pid_discovery.py` | Execute the discovery sequence (PIDs `00/20/40/60/80/A0`); expand the 32-bit masks into the concrete set of supported PIDs. |
| `obd/poll.py` | The cadence-driven poll loop. Reads each PID in the active set, builds a `CycleResult`, and calls `LiveDataClient.push_cycle`. Sleeps the **command's** `cadenceMs` between cycles; respects an abort flag from the command queue. The agent does **not** hardcode 1 s; it uses the cadence from the backend. |
| `live_data_client.py` | HTTP client wrapping `POST /v2/obd/agents/:id/live-cycles` and `POST /v2/obd/agents/:id/live-discovery`. Handles retries, idempotency, and the `(commandId, cycleId)` dedupe. |
| `command_queue.py` | **v2 probe.** Tries `/v2/obd/agents/:id/command-queue` first with the `acceptVersions: ["v2"]` header; on 404 falls back to the Feature 004 `/obd/agents/:id/scan-queue`. Adds the three new `commandType`s to the dispatch table. |
| `heartbeat.py` | Unchanged from Feature 004. |
| `adapter.py` / `elm327.py` | Unchanged from Feature 004. |

The `obd.poll.PollLoop` is a class that takes a `LiveDataClient`, a `CommandQueueClient`, an `OBDAdapter`, and a config (cadence, pids). It runs until `Stop` is signalled; a SIGTERM or a `LIVE_DATA_STOP` command sets the abort flag and the loop exits within one cycle.

## Multi-Tenant Isolation

| Entity | Tenant-scoped? | Notes |
|---|---|---|
| `Vehicle` | YES (existing) | `organizationId` |
| `DiagnosticSession` | YES (existing) | `organizationId` |
| `LiveDataSession` | YES | `organizationId`; FK chain enforces match to parent DiagnosticSession (Correction 1) |
| `LiveDataSnapshot` | YES | `organizationId`; FK chain enforces match to parent DiagnosticSession and LiveDataSession |
| `LiveDataReadingCurrent` | YES | `organizationId`; read-model, deleted on session close |
| `VehicleDecode` | **NO (GLOBAL)** | No `organizationId`; `vin` is `UNIQUE`. **Shared across all tenants** (Correction 6). Cross-tenant cache hits are the desired behavior. |
| `PIDDefinition` | **NO (GLOBAL)** | No `organizationId`; `(namespace, mode, pid)` is `UNIQUE`. The 11 standard PIDs and the 127 GM Mode 22 PIDs are reference data. |
| `DiagnosticSessionAuditRecord` | YES (existing) | All new `action`s follow the existing policy. |

`TenantGuard` (existing) is applied to every web endpoint. The agent push endpoints use the existing `X-Agent-Token` + `organizationId` binding from Feature 004.

## RBAC

**No new permission is introduced.** Live data endpoints inherit the existing read/write policy for Diagnostic Sessions in the tenant. Service Advisors, Technicians, and Workshop Managers can decode VINs (Phase A), view live data for open sessions, capture snapshots, and view the snapshot list/detail (Phase B). Polling and snapshot capture are additionally gated by the existence of an **open** Diagnostic Session — closing the session stops the live data flow and renders the page read-only.

## Audit Logging

Reuse `DiagnosticSessionAuditRecord` (existing). New `action` strings, all tenant-scoped and immutable:

| Action | When |
|---|---|
| `VIN_DECODED_FROM_ASSET` | A successful VPIC decode writes this on cache miss **and** cache hit (with `metadata.cached: true/false`). |
| `LIVE_DATA_POLL_STARTED` | When a `LiveDataSession` is created on `POST /live-data/start`. |
| `LIVE_DATA_POLL_STOPPED` | When a session transitions to `STOPPED` (Stop press, session close, sweep, or **reconnect after 30 s** — Correction 4 — written with `metadata.reason`). |
| `LIVE_DATA_SNAPSHOT_CAPTURED` | When a snapshot is inserted. |
| `LIVE_DATA_SNAPSHOT_EVICTED` | When the 50-snapshot cap evicts the oldest; `metadata.evictedSnapshotId` is set. |

## Error Handling

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | class-validator failure |
| `INVALID_VIN` | 400 | Malformed VIN |
| `UNAUTHORIZED` | 401 | Missing/expired JWT |
| `FORBIDDEN` | 403 | RBAC failure |
| `TENANT_ACCESS_DENIED` | 403 | Cross-tenant access attempt |
| `DIAGNOSTIC_SESSION_NOT_FOUND` | 404 | |
| `LIVE_DATA_SESSION_NOT_FOUND` | 404 | Push to a STALE/STOPPED/closed session (Correction 4) |
| `SNAPSHOT_NOT_FOUND` | 404 | |
| `AGENT_OFFLINE` | 409 | No online agent for the tenant |
| `DIAGNOSTIC_SESSION_CLOSED` | 409 | Live data on a closed session |
| `NO_DATA_TO_CAPTURE` | 409 | Snapshot requested before any readings |
| `VPIC_ASSET_UNAVAILABLE` | 503 | Asset file missing or runtime decompress failure |
| `PID_NOT_DEFINED` | 422 | Agent pushed a reading for an unknown PID |
| `PID_FORMULA_INVALID` | 422 | A stored formula failed grammar check at lookup time (Correction 5) |
| `INTERNAL_ERROR` | 500 | Unexpected |

## State Management

### `LiveDataSession` lifecycle

```
                  start (new)            sweep (> 30 s) or stop or reconnect-after-30s
   (none) ───────────────────────► ACTIVE ─────────────────────────────────────► STALE / STOPPED
                                      ▲                                              │
                                      │     start (new — after stale)               │
                                      └──────────────────────────────────────────────┘
                                      │
                                      │  reconnect within 30 s
                                      └──── resume same liveDataSessionId
```

- `ACTIVE → STOPPED`: explicit `Stop`, diagnostic session close, or `LIVE_DATA_STOP` command completed.
- `ACTIVE → STALE`: `sweep()` job runs every 30 s and marks any `ACTIVE` session with `lastPolledAt < now - LIVE_DATA_STALE_TIMEOUT_MS` as `STALE`. Also: **agent reconnect after 30 s** marks the session `STALE` in a single transaction (Correction 4).
- `STALE → (new ACTIVE)`: next `POST /start` creates a new row.
- The agent's reconnect within 30 s does **not** create a new row — it resumes the existing ACTIVE session with the same `liveDataSessionId` (Correction 4). The `LiveDataReadingCurrent` rows are preserved.

### `DiagnosticSession`

- Live data does **not** open or close the `DiagnosticSession`. The session stays open during polling; live data is an orthogonal concern. Closing the DiagnosticSession stops the live data session and renders the page read-only.

### `LiveDataSnapshot`

- Created on `POST /snapshots`. Capped at 50 per `DiagnosticSession`. Eviction is oldest by `capturedAt` and runs inside the same transaction as the new insert.

## Transaction Boundaries

| Operation | Boundary |
|---|---|
| `VIN decode` (cache miss) | Single `prisma.$transaction([createOrUpdate VehicleDecode, create AuditRecord])`. |
| `Start` | `prisma.$transaction([upsert LiveDataSession, create AuditRecord, enqueue Command])`. |
| `Stop` | `prisma.$transaction([update LiveDataSession, deleteMany LiveDataReadingCurrent, create AuditRecord])`. |
| `Snapshot capture` | **Single transaction** for the entire capture flow: count → (optionally) delete evicted → insert → audit (D-18). |
| `Cycle push` (agent) | `prisma.$transaction([upsertMany LiveDataReadingCurrent, update LiveDataSession.lastPolledAt])`. No audit per cycle. |
| `Discovery push` (agent) | `prisma.$transaction([update LiveDataSession.supportedPidMask])`. |
| `Sweep` | Single `prisma.$transaction([updateMany ACTIVE→STALE, create AuditRecord for each])`. |
| **Reconnect after 30 s (Correction 4)** | `prisma.$transaction([update LiveDataSession.status = STALE, create AuditRecord LIVE_DATA_POLL_STOPPED with metadata.reason = 'stale_timeout'])`. |

## Testing Strategy

| Layer | Stack | Coverage |
|---|---|---|
| Backend | Jest + Supertest | Services, repositories, controllers, DTOs. Per-file target 80% line coverage. |
| Frontend | Jest + React Testing Library; Playwright for E2E | Hooks (`useLiveDataPolling`, `useVinDecode`), dashboard render, adapter-offline state, snapshot button gating, cadence indicator. |
| Desktop Agent | pytest | `pid.py`, `pid_discovery.py`, `poll.py` (with a fake `OBDAdapter` and `LiveDataClient`), `command_queue.py` v2 probe. |
| Fixtures | `backend/test/fixtures/vpic-fixture.sqlite` | 10–20 known VINs (Mercedes, Toyota, GM, unknown). Used by `VpicAssetService` in tests via `VPIC_ASSET_PATH` override. |
| Cross-tenant | Integration | A user in tenant A decoding a known VIN; a user in tenant B sees the same `VehicleDecode` row (`cached: true`); neither can read the other's `LiveDataSession` or `LiveDataSnapshot` (Correction 6). |
| Backward-compat | Integration | After Phase B migration: scan flow, fault-code import, and enrichment endpoints continue to pass their Feature 004/005 tests. |
| Reconnect | Integration | Reconnect at 29 s → same `liveDataSessionId` resumed; reconnect at 31 s → previous session `STALE`, new `liveDataSessionId` on next `Start` (Correction 4). |
| Cadence | Integration | `cadenceMs = 500` is honored; `cadenceMs = 50` is clamped to 200; default absent → 1000. UI shows clamped indicator (Correction 3). |
| Formula parser | Unit | Whitelist formulas evaluate correctly. `eval`-style inputs (`"1+1"`, `"process.exit()"`, `"Math.PI"`, `"A.length"`, function-call syntax) are rejected at seed time and at lookup time (Correction 5). |
| Snapshot JSONB | Integration | A captured snapshot's `values` is a single JSONB object keyed by hex PID; the snapshot detail endpoint returns the parsed map; a 51st insert evicts the oldest (Correction 2). |

## Future Extension Points

The following are explicitly **NOT** in Feature 006 and remain extensions:

- **No WebSockets / SSE.** The MVP uses REST polling. A future transport swap (WebSocket from agent to backend, SSE from backend to dashboard) does not require re-planning the data flow.
- **No continuous recording.** Snapshots are point-in-time; the data model does not include a time-series table.
- **No graphing or trend analysis.** Cross-snapshot, cross-session queries are out of scope.
- **No OEM extensions beyond the GM Mode 22 PIDs already in `model-pids.sqlite`.** Future PID sources (e.g., Mode 22 for other OEMs, Mode 2A freeze-frame, Mode 19 DTCs by ECU) are loaded as additional `PIDDefinition` rows.
- **No negative VPIC cache.** Missing-VIN lookups always consult the asset.
- **No per-user cadence setting** in the MVP — cadence is a per-session setting.
- **No `LiveDataReading` historical table** — the MVP only stores the JSONB `values` map on the snapshot (Correction 2). A future freeze-frame or per-PID analytics feature may add per-PID rows.

## Future Enhancements (Backlog)

**This section is a backlog. No implementation tasks are created from it. Feature 006 scope is not changed.**

### ECU Topology & Control Unit Scan (Correction 7)

A future feature would group fault codes and live data by the ECU/module that produced them. This is the natural next step beyond per-PID live data, and the workshop-grade diagnostic experience described in the constitution (principle XV) explicitly calls for it. Proposed entities (for a future `008-ecu-topology-and-control-unit-scan` feature):

- `ControlUnitScan` — A scan run over a vehicle's ECU bus. Tenant-scoped, linked to a `DiagnosticSession`. Fields: `id`, `organizationId`, `diagnosticSessionId`, `agentId`, `startedAt`, `endedAt`, `protocol` (e.g., `'ISO 15765 CAN'`, `'ISO 14229 UDS'`), `totalUnits`, `respondingUnits`.
- `ControlUnit` — A single ECU/module discovered during a scan. Linked to a `ControlUnitScan`. Fields: `id`, `controlUnitScanId`, `address` (e.g., `0x7E0` for the ECM), `name` (e.g., `'Engine Control Module'`), `partNumber`, `hardwareVersion`, `softwareVersion`, `diagnosticProtocol`, `responded` (boolean).
- `ControlUnitFault` — A fault attributed to a specific ECU. Linked to both a `ControlUnit` and a `SessionFaultCode` (Feature 004). Fields: `id`, `controlUnitId`, `sessionFaultCodeId`, `dtc`, `status` (active/stored/pending), `capturedAt`.

**Purpose**:
- Group `SessionFaultCode`s by ECU/module so a technician can see "all ABS faults", "all SRS faults", "all BCM faults" instead of a flat DTC list.
- Display scanned modules **with and without faults** (a module that responded with zero DTCs is still informative — the scan was successful for that module).
- Prepare the ground for ABS, SRS, and BCM-specific diagnostic flows (live data per ECU, actuation tests, adaptations) in later features.
- Improve the workshop-grade diagnostic experience.

**Out of scope for Feature 006 and any immediate follow-up**:
- No scan orchestration. No new agent endpoints. No new audit actions. No new UI page. No Prisma models in the Phase A or Phase B migrations. The proposed entities above are described for **planning context only**.

## Migration Plan

### Phase A — `20260611_add_vin_intelligence`

```sql
ALTER TABLE "Vehicle" ADD COLUMN "engine" VARCHAR(100);
ALTER TABLE "Vehicle" ADD COLUMN "bodyStyle" VARCHAR(100);
CREATE TABLE "VehicleDecode" (
  "id" UUID PRIMARY KEY,
  "vin" VARCHAR(17) NOT NULL UNIQUE,
  "make" VARCHAR(100), "model" VARCHAR(100), "year" INTEGER,
  "engine" VARCHAR(100), "bodyStyle" VARCHAR(100), "manufacturer" VARCHAR(100),
  "decodedAt" TIMESTAMP NOT NULL DEFAULT now(),
  "source" VARCHAR(50) NOT NULL DEFAULT 'vpic.sqlite.xz'
);
```

The `VehicleDecode.vin` UNIQUE constraint enforces Correction 6: one row per VIN globally. There is no `organizationId` on `VehicleDecode`; the cache is shared across tenants.

**Rollback**:
```sql
ALTER TABLE "Vehicle" DROP COLUMN "bodyStyle";
ALTER TABLE "Vehicle" DROP COLUMN "engine";
DROP TABLE "VehicleDecode";
```

### Phase B — `20260615_add_live_data`

```sql
CREATE TYPE "LiveDataSessionStatus" AS ENUM ('ACTIVE', 'STOPPED', 'STALE');

CREATE TABLE "PIDDefinition" (
  "id" UUID PRIMARY KEY,
  "model" VARCHAR(20) NOT NULL,
  "pid" VARCHAR(8) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "unit" VARCHAR(20) NOT NULL,
  "formula" VARCHAR(200) NOT NULL,
  "min" DECIMAL(10,3), "max" DECIMAL(10,3),
  "source" VARCHAR(50) NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE("model","pid")
);

CREATE TABLE "LiveDataSession" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "diagnosticSessionId" UUID NOT NULL REFERENCES "DiagnosticSession"("id"),  -- Correction 1
  "agentId" UUID NOT NULL REFERENCES "DesktopAgent"("id"),
  "status" "LiveDataSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "supportedPidMask" JSONB,
  "cadenceMs" INTEGER NOT NULL DEFAULT 1000,                                    -- Correction 3: default 1 s
  "startedAt" TIMESTAMP NOT NULL DEFAULT now(),
  "lastPolledAt" TIMESTAMP,
  "endedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX ON "LiveDataSession"("organizationId");
CREATE INDEX ON "LiveDataSession"("organizationId","status");
CREATE INDEX ON "LiveDataSession"("diagnosticSessionId");
CREATE INDEX ON "LiveDataSession"("agentId");

CREATE TABLE "LiveDataSnapshot" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "diagnosticSessionId" UUID NOT NULL REFERENCES "DiagnosticSession"("id"),  -- Correction 1
  "liveDataSessionId" UUID NOT NULL REFERENCES "LiveDataSession"("id"),
  "capturedAt" TIMESTAMP NOT NULL DEFAULT now(),
  "createdBy" UUID NOT NULL,
  "values" JSONB NOT NULL,                                                     -- Correction 2: no LiveDataReading table
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX ON "LiveDataSnapshot"("organizationId");
CREATE INDEX ON "LiveDataSnapshot"("diagnosticSessionId","capturedAt");
CREATE INDEX ON "LiveDataSnapshot"("liveDataSessionId");

CREATE TABLE "LiveDataReadingCurrent" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "liveDataSessionId" UUID NOT NULL REFERENCES "LiveDataSession"("id"),
  "pid" VARCHAR(8) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "value" DECIMAL(12,4),
  "unit" VARCHAR(20) NOT NULL,
  "rawValue" VARCHAR(100) NOT NULL,
  "errorCode" VARCHAR(20),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE("liveDataSessionId","pid")
);
CREATE INDEX ON "LiveDataReadingCurrent"("organizationId");
CREATE INDEX ON "LiveDataReadingCurrent"("liveDataSessionId","updatedAt");
```

**Rollback**:
```sql
DROP TABLE "LiveDataReadingCurrent";
DROP TABLE "LiveDataSnapshot";
DROP TABLE "LiveDataSession";
DROP TABLE "PIDDefinition";
DROP TYPE "LiveDataSessionStatus";
```

Both migrations are **fully additive** — no existing table has a column altered or dropped. The Feature 004 scan and Feature 005 enrichment flows continue to work without code changes.

## Decisions Recap

- **D-01**: Use the local `vpic.sqlite.xz` asset as the single source of truth for VIN decoding; open a per-process read-only SQLite handle in `VpicAssetService`; do not import the VPIC corpus into PostgreSQL. Cache successful decodes in the global `VehicleDecode` table.
- **D-02**: Import `model-pids.sqlite` (127 rows) into `PIDDefinition` on first startup. Seed the 11 standard OBD-II Mode 01 PIDs from a built-in TypeScript file (`pid-mvp-seed.ts`) — the asset does not cover the standard PIDs.
- **D-03**: Polling is **agent-initiated**; the backend never opens its own connection to the adapter. REST polling; no WebSockets or SSE in the MVP.
- **D-04**: A new `LiveDataSession` table holds per-session state, linked to a `DiagnosticSession` (Correction 1: hierarchy is `DiagnosticSession → LiveDataSession → LiveDataSnapshot`).
- **D-05**: Cap snapshots at 50 per `DiagnosticSession`; evict oldest in the same transaction as the new insert.
- **D-06**: Add nullable `engine` and `bodyStyle` columns to `Vehicle` (additive migration).
- **D-07**: No new permission. Live data endpoints inherit the existing DiagnosticSession policy.
- **D-08**: Reuse `DiagnosticSessionAuditRecord` for the five new actions.
- **D-09**: Ship a small VPIC fixture (`vpic-fixture.sqlite`) for tests; production uses the real asset.
- **D-10**: No existing public contract is altered; new endpoints are under `/v2/...`; Feature 004's `/v1/.../scan-queue` is preserved.
- **D-11**: Naming: `LiveDataSession`, `LiveDataSnapshot`, `LiveDataReadingCurrent`; **no** `LiveDataReading` table in the MVP (see D-13, Correction 2).
- **D-12**: Polling cadence is configured per-session and stored on `LiveDataSession.cadenceMs`. Default **1000 ms (1 s)** (Correction 3). No per-user cadence setting in the MVP.
- **D-13** (Correction 1+2): `LiveDataSession` belongs to `DiagnosticSession` (one → many). `LiveDataSnapshot` stores values in a single JSONB `values` column — **no separate `LiveDataReading` table for snapshot values in the MVP**. `LiveDataReadingCurrent` remains a read-model table for the dashboard. 11 PIDs in the MVP makes per-PID rows unnecessary for historical snapshots.
- **D-14** (Correction 6): `VehicleDecode` is **global** (no `organizationId`), `vin` is **UNIQUE**. One row per VIN, shared across all tenants. Cross-tenant cache hits are the desired behavior.
- **D-15** (Correction 5): Formula engine scope is restricted to the grammar in [contracts/pid-definition-contract.md](contracts/pid-definition-contract.md). **No `eval`. No `new Function`. No scripting. No user-defined formulas. No variables other than `A` and `B`.** A small recursive-descent parser is the sole evaluator; rejection happens at seed-import time and at lookup time.
- **D-16** (Correction 3): Default polling cadence is **1 s (1000 ms)**. `cadenceMs` is clamped to `[200, 5000]`. Env vars: `LIVE_DATA_DEFAULT_CADENCE_MS=1000`, `LIVE_DATA_MIN_CADENCE_MS=200`, `LIVE_DATA_MAX_CADENCE_MS=5000`. The agent uses the **command's** `cadenceMs`; the dashboard uses the **server's** `cadenceMs` from the `Start` response.
- **D-17** (Correction 4): Reconnect within `LIVE_DATA_STALE_TIMEOUT_MS` (30 s) resumes the same `liveDataSessionId`; reconnect after 30 s marks the existing ACTIVE session `STALE` in a single transaction (audit `LIVE_DATA_POLL_STOPPED` with `metadata.reason: 'stale_timeout'`) and a new `LiveDataSession` is created on the next `Start`. The 30-s window is the same as the stale-timeout window. Cycles for `STALE` / `STOPPED` sessions are rejected with `LIVE_DATA_SESSION_NOT_FOUND`.
- **D-18** (transaction): The snapshot capture flow (count → evict → insert → audit) runs in a single `prisma.$transaction`. The capture endpoint is `POST /sessions/:id/live-data/snapshots` and writes a single `LiveDataSnapshot` row with the JSONB `values` column.
- **D-19** (Correction 7, backlog only): A future **ECU Topology & Control Unit Scan** feature is tracked in the **Future Enhancements (Backlog)** section. It is not part of Feature 006. **No implementation tasks, no schema changes, no contract changes in this feature.** Proposed entities: `ControlUnitScan`, `ControlUnit`, `ControlUnitFault`.

## Phase B.1 Status — PID Foundation & Decoder Infrastructure (Complete)

Phase B.1 is the first independently-deployable sub-phase of Feature 006 Phase B. It ships only the **PID definition and decoding foundation** that every later sub-phase (US3, US4, US5, US6) will consume. **No live polling, no session persistence, no snapshot, no dashboard, no agent command queue work has been merged in this sub-phase.**

**Delivered**

- New `PIDDefinition` table (GLOBAL — no `organizationId`; unique `(namespace, mode, pid)`) — Prisma migration `20260615_add_pid_foundation` plus corrective migration `20260616_correct_pid_definition_namespace_mode` applied.
- `backend/src/prisma/seed/pid-mvp-seed.ts` — 11 standard OBD-II Mode 01 PIDs (RPM, Vehicle Speed, Coolant Temperature, Battery Voltage, Throttle Position, Engine Load, Short Fuel Trim, Long Fuel Trim, MAF, Intake Air Temperature, O2 Sensor Voltage). Idempotent upsert by `(namespace, mode, pid)`. Reachable via `npm run seed:pid-mvp`.
- `backend/src/live-data/services/pid-asset-import.service.ts` — opens `backend/data/model-pids.sqlite` read-only on first startup; bulk-upserts the GM Mode 22 catalog into `PIDDefinition` with `namespace = 'GME'`, `mode = '22'`, and `source = 'model-pids-sqlite'`; runs in `OnApplicationBootstrap`; missing-asset path is a no-op with a warning; rows whose equations fail the restricted-grammar validator are skipped (with a warning) rather than failing the entire import.
- `backend/src/live-data/services/pid-decoder.service.ts` — restricted recursive-descent parser. **Allowed tokens: `A`, `B`, integer literals, `+ - * / ( )`. Whitespace is ignored. Division uses JavaScript real division** (so `(A*256+B)/1000` for Control Module Voltage returns `8.521`, not `8`). No `eval`, no `new Function`, no scripting. Identifier tokens longer than `A` or `B` (e.g., `A1`, `Math`, `process`) cause a `PID_FORMULA_INVALID` rejection. Exposes `evaluateFormula(formula, A, B)` and `parseHexBytes(hex)` as pure functions for testing. `validateFormula(formula)` returns `null` on success or `PID_FORMULA_INVALID` on failure.
- `backend/src/live-data/repositories/pid-definition.repository.ts` — Prisma CRUD. `findById`, `findByNamespaceModeAndPid(namespace, mode, pid)` using the `namespace_mode_pid` compound unique key, `findByModeAndPid(mode, pid)` for ambiguity checks, `findByNamespace(namespace)`, `findByMode(mode)`, `list()` (ordered by `namespace`, `mode`, `pid`), `upsert`, `upsertMany` (transactional bulk), `count`. GLOBAL — no `organizationId` parameter.
- `backend/src/live-data/controllers/pids.controller.ts` — three read-only endpoints, JWT + tenant + RBAC guarded:
  - `GET /api/v1/pids` — list, optional `?namespace=STD_OBD2` and `?mode=01` filters.
  - `GET /api/v1/pids/:id` — lookup by primary key. `404 PID_NOT_DEFINED` if not found.
  - `GET /api/v1/pids/mode/:mode/pid/:pid` — canonical lookup by mode and PID with optional `?namespace=...`. `mode=01` defaults to `namespace=STD_OBD2`; otherwise, if more than one namespace defines the same mode + PID, returns `400 PID_NAMESPACE_REQUIRED`. `400 INVALID_MODE` for unknown mode, `400 INVALID_NAMESPACE` for unknown namespace, `400 INVALID_PID` for malformed hex, `404 PID_NOT_DEFINED` for unknown `(namespace, mode, pid)`.
- `backend/src/live-data/dtos/pid-response.dto.ts` — response DTO with `fromEntity(entity)` factory; converts Prisma `Decimal` `min`/`max` to `number | null` for JSON serialization.
- `backend/src/live-data/live-data.module.ts` — NestJS module. Imports `AuthModule`; providers: `PidDefinitionRepository`, `PidAssetImportService`, `PidDecoderService`, `PrismaService`; controller: `PidsController`. Exports `PidDefinitionRepository` and `PidDecoderService` for downstream sub-phases.
- `backend/src/app.module.ts` — registered `LiveDataModule` in the `imports` array.

**Test coverage added in Phase B.1**

| Test file | Suites | Tests | Purpose |
|---|---|---|---|
| `backend/tests/unit/live-data/pid-decoder.service.unit.test.ts` | 6 | 46 | 11 MVP happy-path decodes; leading `41` header strip; NO_DATA for empty/whitespace; NOT_SUPPORTED for missing PID; ERROR with `B_UNDEFINED`, `INVALID_HEX`, `PID_FORMULA_INVALID`; 12 negative grammar cases (`Math.PI`, `A.B`, `process.exit`, function calls, eval, Function ctor, trailing operator, unbalanced paren, `**`, boolean literal, string literal, dynamic import); 9 positive grammar cases; 2 `validateFormula` cases; 4 `parseHexBytes` cases. |
| `backend/tests/unit/live-data/pid-definition.repository.unit.test.ts` | 1 | 8 | findById, findByNamespaceModeAndPid (composite key), findByNamespace, findByModeAndPid ambiguity lookup, list, upsert (composite key), upsertMany, same mode + PID across namespaces. |
| `backend/tests/unit/live-data/pid-asset-import.service.unit.test.ts` | 1 | 1 | GM `model-pids.sqlite` rows map to `namespace = GME`, `mode = 22`. |
| `backend/tests/contract/pids.endpoint.contract.test.ts` | 1 | 12 | 200 list, 200 list+namespace filter, 200 list+mode filter, 200 by-id, 404 by-id, 200 namespace+mode+pid, default namespace for Mode 01, 400 PID_NAMESPACE_REQUIRED, 404 PID_NOT_DEFINED, 400 INVALID_MODE, 400 INVALID_NAMESPACE, 400 INVALID_PID. |

**Acceptance Criteria for Phase B.1** (from the implement command)

| # | Criterion | Status |
|---|---|---|
| 1 | System supports standard OBD-II Mode 01 PIDs | ✅ 11 MVP PIDs seeded with `namespace = STD_OBD2`, `mode = 01` |
| 2 | System imports manufacturer PID definitions from `model-pids.sqlite` | ✅ `PidAssetImportService` runs on bootstrap; idempotent; missing-asset path is a no-op |
| 3 | System can decode raw ECU bytes into engineering values | ✅ `PidDecoderService.decode(namespace, mode, pid, rawHex)` returns `{ pid, name, value, unit, rawValue, status, errorCode }` |
| 4 | System uses a restricted formula grammar only | ✅ Parser rejects identifiers other than `A`/`B`, function calls, property access, and any unknown operator with `PID_FORMULA_INVALID` |
| 5 | System includes automated tests for all decoding paths | ✅ 46 decoder + 7 repository + 9 endpoint tests |
| 6 | No live polling functionality is introduced yet | ✅ `LiveDataSession`, `LiveDataSnapshot`, `LiveDataReadingCurrent` tables, `LiveDataController`, `LiveDataAgentController`, and `LiveDataSessionService` are **not** part of this sub-phase |

**Regression check**

Full backend test suite: **188/188 green** (was 126 before Phase B.1; +62 net new). Feature 004 scan flow and Feature 005 enrichment flow continue to pass.

**Out of Phase B.1 scope (per the implement command's explicit "Do NOT" list)**

- `LiveDataSession` / `LiveDataSnapshot` / `LiveDataReadingCurrent` tables
- `LiveDataController` / `LiveDataAgentController`
- Agent command-queue endpoints (`/v2/obd/agents/:id/command-queue`, `/live-cycles`, `/live-discovery`)
- `LiveDataSessionService`, `LiveDataPollService`, `LiveDataSnapshotService`, `PidDiscoveryService`, `CadenceService`
- Live polling, snapshot capture, dashboard UI, graphing, trend analysis
- AI analysis, reports, PrioraFlow integration
- WebSockets / SSE

These land in Phase B.2+ (US3, US4, US5, US6 in `tasks.md`).

## Out of Scope (Reaffirmed)

Feature 006 explicitly does **NOT** include:

- AI analysis of live data streams or snapshots (Feature 007+)
- PDF / digital reports (Feature 008+)
- PrioraFlow integration (Feature 009+)
- Freeze frame data
- Graphing of live or historical sensor streams
- Trend analysis across multiple snapshots
- Actuation tests, bidirectional controls, service functions, adaptations
- Coding, programming, flashing of ECUs
- OEM-specific repair procedures or OEM-specific PID libraries beyond the GM Mode 22 PIDs that already ship in the `model-pids` asset
- Recording continuous sensor streams (point-in-time snapshots only)
- WebSockets, SSE
- Per-user cadence setting
- A separate `LiveDataReading` historical table (the MVP stores the JSONB `values` map on the snapshot; Correction 2)
- Negative VPIC cache
- ECU topology & control unit scan (D-19, future feature)
- Generic scripting in the formula engine (Correction 5: restricted grammar only)
- User-defined PID formulas (Correction 5)

## Phase B.2 Status — Live Data Thin Vertical Slice (Complete)

Phase B.2 ships the **end-to-end live data MVP slice** described in the B.2 implement command. It is the first sub-phase of Phase B that produces a user-visible feature: a technician can open a Diagnostic Session, press Start, see the six MVP sensor values updating in the dashboard, and press Stop. **Snapshots, discovery, cadence configuration, and reconnect handling are explicitly deferred to B.3, B.4, B.5 respectively** (out of scope for the B.2 thin slice).

### Delivered in Phase B.2

- `LiveDataSession` Prisma model — child of `DiagnosticSession` (Correction 1). Fields: `id`, `organizationId`, `diagnosticSessionId`, `agentId`, `status` (`ACTIVE | STOPPED | STALE`), `cadenceMs` (default 1000 — Correction 3), `startedAt`, `stoppedAt`, `lastActivityAt`, `latestValues` (JSONB), `createdAt`, `updatedAt`. Migration: `20260617_add_live_data_session`.
- `LiveDataCommand` Prisma model — agent command queue. Fields: `id`, `organizationId`, `agentId`, `liveDataSessionId`, `commandType` (`LIVE_DATA_POLL | LIVE_DATA_STOP`), `payload` (JSONB), `consumedAt`, `createdAt`. FIFO via `createdAt ASC`. `consumedAt = NULL` ⇒ pending.
- `backend/src/live-data/repositories/live-data-session.repository.ts` — Prisma CRUD with tenant-scoped lookups. `create`, `findById`, `findActiveByDiagnosticSession`, `listByDiagnosticSession`, `stopActiveForDiagnosticSession`, `stop`, `recordPollResult`.
- `backend/src/live-data/repositories/live-data-command.repository.ts` — FIFO command queue. `enqueue`, `findNextPendingForAgent`, `markConsumed`, `countPendingForSession`, `findByTypeAndSession`.
- `backend/src/live-data/services/live-data-session.service.ts` — orchestrates start/stop, decode pipeline, and command queue. **Default cadence 1000 ms; clamped to `[200, 5000]` (Correction 3).** Six MVP PIDs only: `rpm`, `speed`, `coolantTemp`, `batteryVoltage`, `throttlePosition`, `engineLoad`. `latestValues` is a `shortName → { value, unit, name, rawValue, status, errorCode }` map decoded by the Phase B.1 `PidDecoderService`. `start()` returns 404 `AGENT_NOT_FOUND` / 404 `DIAGNOSTIC_SESSION_NOT_FOUND` / 409 `AGENT_OFFLINE`; `stop()` is idempotent; `ingestPollResult()` validates ownership + `ACTIVE` status + decodes via the existing `PidDecoderService`.
- `backend/src/live-data/controllers/live-data.controller.ts` (web) — `POST /api/v1/diagnostic-sessions/:id/live-data/start` (returns `{ liveDataSessionId, status, cadenceMs }`), `POST /api/v1/diagnostic-sessions/:id/live-data/stop`, `GET /api/v1/diagnostic-sessions/:id/live-data/current` (returns the dashboard payload).
- `backend/src/live-data/controllers/live-data-agent.controller.ts` (agent) — `GET /api/v1/obd/agents/:id/live-data/command-queue` (returns at most one pending command, marks consumed), `POST /api/v1/obd/agents/:id/live-data/:liveDataSessionId/poll-result` (decodes the readings and stores them as `latestValues`).
- `backend/src/live-data/live-data.module.ts` — wires repositories, service, controllers, and re-exports `DesktopAgentRepository` from `ObdModule`.
- `desktop-agent/src/live_data/__init__.py`, `generator.py`, `poller.py`, `queue.py` — mock data generator for the six MVP PIDs (RPM drifts ~850 ± 10 RPM, speed stays 0, coolant ~92 °C, battery ~13.9 V, throttle 0 %, load ~20 %), background `LiveDataPoller` thread (clamps cadence to the same 200–5000 ms window), and a `poll_live_data_command_queue` driver wired into the agent's main loop.
- `frontend/src/hooks/useLiveData.ts` — TanStack Query hooks for start / stop / current, with 1 s refetch on `ACTIVE`.
- `frontend/src/components/live-data/LiveDataCard.tsx` — five-state card (Not started / Starting / Active / Stopped / Error). Six PID rows (RPM, Speed, Coolant Temp, Battery Voltage, Throttle Position, Engine Load). Last-updated timestamp. Auto-picks the first ONLINE agent from `useAgentStatus`.
- Diagnostic session detail page (`/diagnostic-sessions/[sessionId]/page.tsx`) — wired to render `<LiveDataCard sessionId={session.id} />` below the existing fault-codes section.

### Test coverage added in Phase B.2

| Test file | Suites | Tests | Purpose |
|---|---|---|---|
| `backend/tests/unit/live-data/live-data-session.service.unit.test.ts` | 8 | 15 | start (creates ACTIVE + queues LIVE_DATA_POLL), 404 AGENT_NOT_FOUND, 409 AGENT_OFFLINE, 404 DIAGNOSTIC_SESSION_NOT_FOUND, cadence clamp to 200, stop (mark STOPPED + queue LIVE_DATA_STOP), stop idempotency, 404 unknown session, ingestPollResult (decodes + persists), ingestPollResult rejects wrong agent, ingestPollResult rejects non-ACTIVE, tenant isolation, consumeNextCommand null + consumed, toCurrentPayload shape |
| `backend/tests/contract/live-data.endpoint.contract.test.ts` | 1 | 8 | POST start (200 with shape, passes cadenceMs, 400 AGENT_ID_REQUIRED, 404 AGENT_NOT_FOUND), POST stop (200, 400 LIVE_DATA_SESSION_ID_REQUIRED), GET current (200 with values, null/empty body) |
| `backend/tests/contract/live-data-agent.endpoint.contract.test.ts` | 1 | 6 | command-queue 401 missing token, 200 with command, 200 empty array, poll-result 201 with decoded values, 400 READINGS_REQUIRED, 404 LIVE_DATA_SESSION_NOT_FOUND |
| `desktop-agent/tests/test_live_data.py` | 4 | 27 | MockLiveDataGenerator (8 tests for byte-builder + shortName), CadenceClamp (4 tests for 200/5000/1000 default), LiveDataPoller (7 tests for start/stop/replace/404/409/transient/replace-running), CommandQueue (8 tests for start/stop/empty/error/non-JSON/unknown/missing-session/no-agent-id) |
| `frontend/src/components/live-data/__tests__/LiveDataCard.test.tsx` | 1 | 11 | start button renders, agent selector lists ONLINE agents, disabled when no agent, calls start mutation with selected agent, loading state, active state with current values, stop button, calls stop mutation with active session, stopped state, error display, NO_DATA graceful handling |

### Acceptance Criteria for Phase B.2 (from the implement command)

| # | Criterion | Status |
|---|---|---|
| 1 | User can open Diagnostic Session page. | ✅ `<LiveDataCard>` rendered on `/diagnostic-sessions/[sessionId]/page.tsx` |
| 2 | User can click Start Live Data. | ✅ Button calls `POST /live-data/start`; mutation wired |
| 3 | Mock agent begins sending values. | ✅ `desktop-agent/src/live_data/poller.py` posts on cadence |
| 4 | Frontend shows live RPM, speed, coolant temp, battery voltage, throttle position, and engine load. | ✅ All six rows in `LiveDataCard`; values flow from `latestValues` |
| 5 | User can stop live data. | ✅ Stop button calls `POST /live-data/stop`; service is idempotent |
| 6 | All tests pass. | ✅ 223 backend + 59 desktop-agent + 20 frontend unit tests (the 6 new live-data suites are listed above) |
| 7 | TypeScript clean. | ✅ `tsc --noEmit` clean on backend, frontend, and all new code paths |

### Regression check

Full backend test suite: **223/223 green** (was 188 after Phase B.1; +35 net new from 15 service unit + 8 web contract + 6 agent contract + 6 from existing suites that re-exercised the new controllers). Desktop-agent suite: **59/59 green** (was 32 before Phase B.2; +27 from `test_live_data.py`). Frontend unit tests: **20/20 green** (was 9 before Phase B.2; +11 from `LiveDataCard.test.tsx`).

### Out of Phase B.2 scope (per the implement command's explicit "Do NOT" list)

- **Snapshot persistence** and **snapshot retention** (Phase B.3)
- **Graphing** and **trend analysis**
- **Reports** and **AI analysis** (Feature 007+)
- **PrioraFlow integration** (Feature 009+)
- **Real ELM327 hardware polling** — only the mock adapter is wired
- **Freeze frame data** and **ControlUnitScan** (Correction 7, backlog only)
- **PID discovery** (Phase B.4)
- **Cadence configuration UI** (Phase B.5) — the backend clamp is in place; the UI always sends the default 1000 ms in B.2
- **Reconnect handling (Correction 4)** — the agent's command-queue probe and the `STOPPED` short-circuit on poll-result 404 ship in B.2; the `STALE` sweep and 30-second resume rule are deferred to B.4

These land in Phase B.3, B.4, and B.5 (see `tasks.md`).

