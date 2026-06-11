# Tasks: Live Data & Sensor Monitoring

**Input**: Design documents from `/specs/006-live-data-and-sensor-monitoring/`
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Research**: [research.md](research.md) | **Data model**: [data-model.md](data-model.md) | **Contracts**: [contracts/](contracts/)

## Implementation Strategy

Feature 006 ships in two **independently-deployable phases**:

- **Phase A — VIN Intelligence**: implements US1 (decode + auto-fill) and lays the foundation for US2 (the existing `VehicleConfirmModal` already exists from Feature 004; Phase A extends it). **`VehicleDecode` is global with `vin UNIQUE`** — the cache is shared across tenants (Correction 6).
- **Phase B — Live Data & Sensor Monitoring**: implements US3 (live dashboard), US4 (snapshot capture), US5 (PID discovery), US6 (cadence config). **`LiveDataSession` belongs to `DiagnosticSession`** (Correction 1); **`LiveDataSnapshot` stores values as JSONB** with **no separate `LiveDataReading` table** (Correction 2); **default polling cadence is 1 s** (Correction 3); **reconnect within 30 s resumes the same session, after 30 s a new session is created** (Correction 4); **formula engine is restricted to the MVP-safe grammar** (Correction 5).

Each phase is independently testable. Phase B MUST NOT begin until Phase A is accepted.

**Test convention**: Tests are **required** for this feature (Feature 004 and Feature 005 both ship comprehensive test suites; the same standard applies). The "OPTIONAL" caveat in the template does not apply.

**Path conventions**: `backend/`, `frontend/`, `desktop-agent/` at the repository root (per the project's web-app + desktop-connector layout).

---

## Format

- `[ID] [P?] [Phase/Story] Description` — `[P]` means parallelizable
- `[Phase]` is one of: `PA` (Phase A — VIN Intelligence), `PB` (Phase B — Live Data)
- `[Story]` is the user story label: `US1` … `US6` (see spec.md)
- Each task includes the exact file path
- Each user story includes an explicit **Acceptance Verification** task

---

# PHASE A — VIN INTELLIGENCE

## Phase A.1: Setup

- [ ] T001 [PA] Verify local asset `backend/data/vpic.sqlite.xz` is present; document its absence path in `backend/README.md`
- [ ] T002 [PA] Add `lzma-native` (or chosen lzma package) to `backend/package.json`; run `npm install`
- [ ] T003 [PA] Add `better-sqlite3` to `backend/package.json`; run `npm install`

## Phase A.2: Foundational (Blocking Prerequisites)

- [ ] T004 [PA] Apply Prisma migration `20260611_add_vin_intelligence` adding `Vehicle.engine` and `Vehicle.bodyStyle` (VarChar 100, nullable) and creating `VehicleDecode` table with **`vin VARCHAR(17) NOT NULL UNIQUE`** and **no `organizationId`** (Correction 6 — global cache)
- [ ] T005 [PA] Implement `backend/src/shared/assets/asset-loader.service.ts` — generic `.xz` → `.sqlite` decompressor with idempotent first-use behavior; takes source path and target path; emits a structured log on first decompress
- [ ] T006 [PA] Implement `backend/src/vehicles/services/vpic-asset.service.ts` — opens the decompressed VPIC file in read-only mode (`mode=ro` URI); exposes a typed `query(sql, params)` method; closes the connection in `OnModuleDestroy`
- [ ] T007 [PA] Register the new services in `backend/src/vehicles/vehicles.module.ts` and add the `VIN_DECODED_FROM_ASSET` action string to `backend/src/shared/audit/diagnostic-session-audit.service.ts`

**Checkpoint A.2**: Migration applied; `VpicAssetService` opens the asset read-only; `VehicleDecode` table exists.

---

## Phase A.3: User Story 1 — Decode VIN and Auto-fill Vehicle Form (P1)

**Goal**: `GET /vehicles/decode?vin=...` returns Make/Model/Year/Engine/BodyStyle/Manufacturer. The New Vehicle form pre-fills from the response. The post-scan `VehicleConfirmModal` pre-fills from the response. The user can edit; the edited values persist on the `Vehicle` record.

**Independent Test**: With a known VIN, the form pre-fills; with an unknown VIN, the form remains blank; the audit record is written; the cache hit responds in < 100 ms p95.

### Tests for US1 (write first; ensure they FAIL)

- [ ] T008 [P] [PA] [US1] Contract test: `GET /vehicles/decode?vin=...` returns 200 with the expected DTO shape for a VIN in `backend/test/fixtures/vpic-fixture.sqlite` — `backend/test/contract/vehicles-decode.spec.ts`
- [ ] T009 [P] [PA] [US1] Unit test: `VpicDecodeService` returns the expected Make/Model/Year for a known VIN — `backend/test/unit/vpic-decode.service.spec.ts`
- [ ] T010 [P] [PA] [US1] Unit test: `VehicleDecodeService` writes the cache row on miss, returns the cached row on hit, and writes the audit record on both paths — `backend/test/unit/vehicle-decode.service.spec.ts`
- [ ] T011 [P] [PA] [US1] Unit test: malformed VIN returns 400 with `INVALID_VIN` — `backend/test/unit/vehicles-decode.controller.spec.ts`
- [ ] T012 [P] [PA] [US1] Cross-tenant test: user in tenant A gets the same global-cached result as user in tenant B for the same VIN — `backend/test/integration/vehicles-decode.cross-tenant.spec.ts`
- [ ] T013 [P] [PA] [US1] Frontend test: `VinDecodeButton` calls `useVinDecode` and pre-fills the form on success — `frontend/src/components/vehicles/__tests__/VinDecodeButton.test.tsx`
- [ ] T014 [P] [PA] [US1] Frontend test: `VehicleConfirmModal` auto-decodes on open with a VIN and pre-fills the form — `frontend/src/components/obd/__tests__/VehicleConfirmModal.test.tsx`
- [ ] T015 [P] [PA] [US1] Frontend test: `useVinDecode` hook returns loading → success/error transitions and surfaces error messages — `frontend/src/hooks/__tests__/useVinDecode.test.ts`

### Implementation for US1

- [ ] T016 [PA] [US1] Add `VehicleDecode` model to `backend/prisma/schema.prisma` — **no `organizationId`**; `vin` is `VARCHAR(17) NOT NULL UNIQUE` (Correction 6: global, VIN-unique, shared across tenants)
- [ ] T017 [PA] [US1] Add `Vehicle.engine` and `Vehicle.bodyStyle` (VarChar 100, nullable) to `backend/prisma/schema.prisma`
- [ ] T018 [PA] [US1] Generate Prisma client (`npx prisma generate`); verify migration `20260611_add_vin_intelligence` is created and applies cleanly
- [ ] T019 [PA] [US1] Implement `backend/src/vehicles/repositories/vehicle-decode.repository.ts` — Prisma CRUD on `VehicleDecode`; `findByVin(vin)`, `upsert(payload)`
- [ ] T020 [PA] [US1] Implement `backend/src/vehicles/services/vpic-decode.service.ts` — pattern-matching logic over VPIC `Pattern` and `Element` tables; returns `{ make, model, year, engine, bodyStyle, manufacturer } | null`
- [ ] T021 [PA] [US1] Implement `backend/src/vehicles/services/vehicle-decode.service.ts` — public service: cache lookup → asset lookup → cache write → audit; depends on `VehicleDecodeRepository`, `VpicDecodeService`, `DiagnosticSessionAuditService`
- [ ] T022 [PA] [US1] Implement `backend/src/vehicles/dtos/vehicle-decode-response.dto.ts` — DTO shape per [vin-decode-contract.md](contracts/vin-decode-contract.md)
- [ ] T023 [PA] [US1] Add `GET /vehicles/decode` endpoint to `backend/src/vehicles/controllers/vehicles.controller.ts` — JWT auth, `INVALID_VIN` validation, `VPIC_ASSET_UNAVAILABLE` mapping
- [ ] T024 [PA] [US1] Update `backend/src/vehicles/vehicles.module.ts` to register the new providers and import `SharedModule` (audit service)
- [ ] T025 [PA] [US1] Frontend: implement `frontend/src/services/vin-decode.service.ts` — Axios call to `GET /vehicles/decode`
- [ ] T026 [PA] [US1] Frontend: implement `frontend/src/hooks/useVinDecode.ts` — TanStack Query mutation with loading/error states
- [ ] T027 [PA] [US1] Frontend: implement `frontend/src/components/vehicles/VinDecodeButton.tsx` — "Decode VIN" button next to the VIN field; on click, calls `useVinDecode` and pre-fills via a callback prop
- [ ] T028 [PA] [US1] Frontend: extend `frontend/src/components/vehicles/vehicle-form.tsx` to include the new `engine` and `bodyStyle` fields and the `VinDecodeButton`
- [ ] T029 [PA] [US1] Frontend: extend `frontend/src/app/vehicles/new/page.tsx` to wire `useVinDecode` and pre-fill on success
- [ ] T030 [PA] [US1] Frontend: extend `frontend/src/components/obd/VehicleConfirmModal.tsx` — auto-decode on modal open with a non-empty VIN; pre-fill; show "Decoded from vehicle database" badge; user edits persist
- [ ] T031 [PA] [US1] Frontend: update the existing `POST /vehicles` payload type in `frontend/src/services/vehicles.service.ts` and `frontend/src/hooks/use-vehicles.ts` to include `engine` and `bodyStyle`
- [ ] T032 [PA] [US1] Backward-compat: verify the existing `POST /vehicles` accepts the new optional fields without breaking; add a server-side test

### Acceptance Verification for US1

- [ ] T033 [PA] [US1] Manual verification per [quickstart.md §6 Phase A](quickstart.md) — all 7 go/no-go items pass
- [ ] T034 [PA] [US1] CI verification: `npm test` (backend) and `npm test` (frontend) all green; cross-tenant and backward-compat tests included
- [ ] T035 [PA] [US1] Documentation: update `docs/SAD.md` with the new `/vehicles/decode` endpoint and the new `VehicleDecode` table reference
- [ ] T036 [PA] [US1] Documentation: update `docs/PRD.md` roadmap table — Phase A complete

**Checkpoint A.3**: US1 is independently testable and deployable. Phase A is complete. Merge Phase A before starting Phase B.

---

# PHASE B — LIVE DATA & SENSOR MONITORING

## Phase B.1: Foundational (Blocking Prerequisites)

- [ ] T037 [PB] Apply Prisma migration `20260615_add_live_data` creating `PIDDefinition`, `LiveDataSession`, `LiveDataSnapshot` (with **`values JSONB NOT NULL`**, no per-PID rows — Correction 2), and `LiveDataReadingCurrent`. Add new relations on `DiagnosticSession` (Correction 1: `LiveDataSession` belongs to `DiagnosticSession`; `LiveDataSnapshot` is anchored to `DiagnosticSession` via FK). **No `LiveDataReading` / `LiveDataSnapshotValue` table is created in the MVP.**
- [ ] T038 [PB] Add the new audit action strings (`LIVE_DATA_POLL_STARTED`, `LIVE_DATA_POLL_STOPPED`, `LIVE_DATA_SNAPSHOT_CAPTURED`, `LIVE_DATA_SNAPSHOT_EVICTED`) to `backend/src/shared/audit/diagnostic-session-audit.service.ts`
- [ ] T039 [PB] Implement `backend/src/prisma/seed/pid-mvp-seed.ts` — inserts the 11 standard OBD-II Mode 01 PIDs from [pid-definition-contract.md](contracts/pid-definition-contract.md) into `PIDDefinition`; idempotent upsert by `(model, pid)`
- [ ] T040 [PB] Add `npm run seed:pid-mvp` script to `backend/package.json`; run it; verify 11 rows present
- [ ] T041 [PB] Implement `backend/src/live-data/services/pid-asset-import.service.ts` — opens `backend/data/model-pids.sqlite` read-only on first startup; upserts each row into `PIDDefinition` with `source = 'model-pids-sqlite'`; idempotent; runs in `OnApplicationBootstrap`
- [ ] T042 [PB] Implement `backend/src/live-data/repositories/pid-definition.repository.ts` — Prisma CRUD on `PIDDefinition`; `findByModelAndPid(model, pid)`, `findByModel(model)`, `upsert(payload)`
- [ ] T043 [PB] Implement `backend/src/live-data/services/pid-decoder.service.ts` — small recursive-descent formula parser (restricted grammar per [pid-definition-contract.md](contracts/pid-definition-contract.md) and Correction 5: A, B, integer literals, + - * / ( ) only; **no eval, no Function constructor, no scripting, no user-defined formulas, no variables other than A and B**); `decode(model, pid, rawHex)` returns `DecodedReading`. The decoder must reject any formula that does not match the grammar at lookup time and emit `PID_FORMULA_INVALID`.
- [ ] T044 [PB] Create the new `live-data` module: `backend/src/live-data/live-data.module.ts` — registers controllers, services, repositories; imports `PrismaModule` and `SharedModule` (audit)
- [ ] T045 [PB] Verify Feature 004 scan flow and Feature 005 enrichment flow still pass their existing test suites (no regression)

**Checkpoint B.1**: New tables exist; the 11 MVP PIDs are seeded; the asset import runs once on first startup; the `PidDecoderService` decodes a sample input correctly.

---

## Phase B.2: User Story 3 — Live Sensor Telemetry Dashboard (P1)

**Goal**: A technician opens a Diagnostic Session and starts polling. The dashboard shows fresh values for the 11 standard PIDs every 1 s. The technician can stop polling. Disconnection is handled safely.

**Independent Test**: With a paired online agent and a connected adapter, pressing Start shows values within 2 s; p95 refresh latency ≤ 1 s; disconnecting the adapter transitions to "Adapter offline" within 5 s.

### Tests for US3 (write first; ensure they FAIL)

- [ ] T046 [P] [PB] [US3] Unit test: `LiveDataSessionService` start/stop lifecycle — `backend/test/unit/live-data-session.service.spec.ts`
- [ ] T047 [P] [PB] [US3] Unit test: `LiveDataPollService` persists cycle results and updates `lastPolledAt` — `backend/test/unit/live-data-poll.service.spec.ts`
- [ ] T048 [P] [PB] [US3] Unit test: `LiveDataReadingCurrent` repository upsert (delete + insert) on each cycle — `backend/test/unit/live-data-reading.repository.spec.ts`
- [ ] T049 [P] [PB] [US3] Unit test: `PidDecoderService` decodes each of the 11 MVP PIDs from a known raw input AND rejects `eval`-style inputs at lookup time with `PID_FORMULA_INVALID` (Correction 5) — `backend/test/unit/pid-decoder.service.spec.ts` (parameterized, 11 happy-path + 5 negative cases)
- [ ] T049a [P] [PB] [US3] Unit test: `PidDecoderService` grammar parser rejects `Math.PI`, `process.exit()`, function-call syntax, property access, and any identifier other than `A` or `B` — same test file, additional cases
- [ ] T050 [P] [PB] [US3] Integration test: `POST /v2/obd/agents/:id/command-queue` returns a `LIVE_DATA_POLL` command when one is enqueued — `backend/test/integration/live-data-agent-command-queue.spec.ts`
- [ ] T051 [P] [PB] [US3] Integration test: `POST /v2/obd/agents/:id/live-cycles` persists the cycle, updates `LiveDataSession.lastPolledAt`, and returns 202 — `backend/test/integration/live-data-agent-cycles.spec.ts`
- [ ] T052 [P] [PB] [US3] Controller test: `POST /sessions/:id/live-data/start` creates a session and enqueues the command; returns 409 if no agent online — `backend/test/integration/live-data-start.spec.ts`
- [ ] T053 [P] [PB] [US3] Controller test: `GET /sessions/:id/live-data/current` returns the most-recent reading per PID — `backend/test/integration/live-data-current.spec.ts`
- [ ] T054 [P] [PB] [US3] Frontend test: `LiveDataDashboard` shows rows on poll and transitions to "Adapter offline" after stale — `frontend/src/components/live-data/__tests__/LiveDataDashboard.test.tsx`
- [ ] T055 [P] [PB] [US3] Frontend test: `useLiveDataCurrent` polls at 1 s and stops on session close — `frontend/src/hooks/__tests__/useLiveDataCurrent.test.ts`
- [ ] T056 [P] [PB] [US3] Desktop agent test: `obd/commands/pid.py` reads each of the 11 MVP PIDs from a mock ELM327 — `desktop-agent/tests/test_pid.py` (parameterized, 11 cases)
- [ ] T057 [P] [PB] [US3] Desktop agent test: `obd/poll.py` runs the poll loop at the configured cadence and stops on `LIVE_DATA_STOP` — `desktop-agent/tests/test_poll.py`
- [ ] T058 [P] [PB] [US3] Desktop agent test: `live_data_client.py` posts cycle results to the backend with retries — `desktop-agent/tests/test_live_data_client.py`
- [ ] T059 [P] [PB] [US3] Desktop agent test: `command_queue.py` probes `/v2/.../command-queue` and routes `LIVE_DATA_*` commands — `desktop-agent/tests/test_command_queue.py`

### Implementation for US3 — Backend

- [ ] T060 [PB] [US3] Add `LiveDataSessionStatus` enum to `backend/prisma/schema.prisma` (`ACTIVE | STOPPED | STALE`)
- [ ] T061 [PB] [US3] Add `LiveDataSession` model to `backend/prisma/schema.prisma` (tenant-scoped; fk to DiagnosticSession and DesktopAgent; supportedPidMask JSON, cadenceMs, startedAt, lastPolledAt, endedAt)
- [ ] T062 [PB] [US3] Add `LiveDataReadingCurrent` model to `backend/prisma/schema.prisma` (read-model; tenant-scoped; `(liveDataSessionId, pid)` unique)
- [ ] T063 [PB] [US3] Generate Prisma client; apply migration `20260615_add_live_data`
- [ ] T064 [PB] [US3] Implement `backend/src/live-data/repositories/live-data-session.repository.ts` — `create`, `findActiveByDiagnosticSession(diagnosticSessionId)`, `findById`, `update(id, payload)`, `findStale(thresholdMs)`
- [ ] T065 [PB] [US3] Implement `backend/src/live-data/repositories/live-data-reading.repository.ts` (current read-model) — `upsertCurrent(payload)`, `findCurrentBySession(liveDataSessionId)`, `deleteBySession(liveDataSessionId)`
- [ ] T066 [PB] [US3] Implement `backend/src/live-data/services/live-data-session.service.ts` — start (create or resume; **reconnect within 30 s = resume same `liveDataSessionId`**; reconnect-after-30 s = mark previous `STALE` and create a new one — Correction 4), stop, timeout sweep; writes `LIVE_DATA_POLL_STARTED` / `LIVE_DATA_POLL_STOPPED` audits in the same transaction. **Cadence is clamped to `[LIVE_DATA_MIN_CADENCE_MS, LIVE_DATA_MAX_CADENCE_MS]`; default `LIVE_DATA_DEFAULT_CADENCE_MS = 1000` (1 s — Correction 3);** the **persisted (clamped) value** is what the agent and the dashboard use.
- [ ] T067 [PB] [US3] Implement `backend/src/live-data/services/live-data-poll.service.ts` — `processCycle(commandId, payload)` persists the cycle to `LiveDataReadingCurrent`, updates `lastPolledAt`; `enqueue(liveDataSessionId, commandType, payload)` writes the command to the agent's command queue
- [ ] T068 [PB] [US3] Implement `backend/src/live-data/dtos/live-data-cycle-push.dto.ts` — request DTO per [live-data-agent-contract.md](contracts/live-data-agent-contract.md)
- [ ] T069 [PB] [US3] Implement `backend/src/live-data/dtos/live-data-control.dto.ts` — request DTO for start/stop; **cadenceMs clamped to `[200, 5000]`, default 1000 (1 s — Correction 3)**; response DTO includes `cadenceMs` (persisted) and `cadenceClamped: boolean`
- [ ] T070 [PB] [US3] Implement `backend/src/live-data/dtos/live-data-reading.dto.ts` — response DTO
- [ ] T071 [PB] [US3] Implement `backend/src/live-data/types/live-data-session-status.enum.ts` and `backend/src/live-data/types/pid-source.enum.ts`
- [ ] T072 [PB] [PB] [US3] Extend `backend/src/obd/services/obd-command-queue.service.ts` — add `commandType: 'LIVE_DATA_DISCOVERY' | 'LIVE_DATA_POLL' | 'LIVE_DATA_STOP'`; route to `LiveDataSessionService` or `LiveDataPollService` based on type
- [ ] T073 [PB] [US3] Implement `backend/src/live-data/controllers/live-data-agent.controller.ts` — `POST /v2/obd/agents/:id/command-queue`, `POST /v2/obd/agents/:id/live-cycles`; `X-Agent-Token` auth; idempotent on `(commandId, cycleId)`
- [ ] T074 [PB] [US3] Implement `backend/src/live-data/controllers/live-data.controller.ts` — `POST /sessions/:id/live-data/start`, `POST /sessions/:id/live-data/stop`, `GET /sessions/:id/live-data/current`
- [ ] T075 [PB] [US3] Wire the new controllers in `backend/src/live-data/live-data.module.ts` and `backend/src/app.module.ts` (or equivalent root module)
- [ ] T076 [PB] [US3] Implement the stale-session sweep — `@Cron` job in `LiveDataSessionService` that closes `STALE` sessions (no activity for > 30 s) and writes `LIVE_DATA_POLL_STOPPED` audits. **Reconnect-after-30 s flow (Correction 4)**: when the agent's `command-queue` poll arrives and the previous `liveDataSessionId` has been marked `STALE`, return 204 (no command) and let the web app's `Start` create a new session.
- [ ] T076a [PB] [US3] **Reconnect behavior unit test (Correction 4)** — `LiveDataSessionService.reconnect(agentId, previousLiveDataSessionId)`:
  - If `lastPolledAt` is within `LIVE_DATA_STALE_TIMEOUT_MS` (30 s): return the existing ACTIVE session id.
  - If `lastPolledAt` is older than 30 s: in a single transaction, mark the previous session `STALE` (audit `LIVE_DATA_POLL_STOPPED` with `metadata.reason: 'stale_timeout'`); return `null` so the web app can call `Start` to create a new session. — `backend/test/unit/live-data-session.service.spec.ts` (extend)
- [ ] T076b [PB] [US3] **Reconnect integration test (Correction 4)** — reconnect at 29 s returns the same `liveDataSessionId`; reconnect at 31 s marks the previous `STALE` and a new `Start` returns a different `liveDataSessionId`. — `backend/test/integration/live-data-reconnect.spec.ts`

### Implementation for US3 — Desktop Agent

- [ ] T077 [PB] [US3] Implement `desktop-agent/src/obd/commands/pid.py` — single-PID Mode 01 read; multi-PID read; response parsing (strips leading `41` Mode 01 header); raises on `7F` negative response
- [ ] T078 [PB] [US3] Implement `desktop-agent/src/obd/commands/pid_discovery.py` — reads PIDs 00/20/40/60/80/A0; assembles the 6-bank supported-PID mask
- [ ] T079 [PB] [US3] Implement `desktop-agent/src/obd/poll.py` — `LiveDataPoller` class with `start(liveDataSessionId, diagnosticSessionId, cadenceMs, pids)`, `stop()`, `_tick()`; **the cadence sleep uses the `cadenceMs` from the command** (do not hardcode 1 s — Correction 3); tracks per-PID `lastSeenAt` for disconnect detection. **If a `/live-cycles` push returns 404 `LIVE_DATA_SESSION_NOT_FOUND` (the session was marked `STALE` after a > 30 s disconnect — Correction 4), the poller stops gracefully and signals the command queue to await a new `LIVE_DATA_POLL` command for a new `liveDataSessionId`.**
- [ ] T080 [PB] [US3] Implement `desktop-agent/src/live_data_client.py` — `push_cycle(command_id, live_data_session_id, readings)`; uses `requests.Session`; retries on 5xx with exponential backoff; pushes to `POST /v2/obd/agents/:id/live-cycles`
- [ ] T081 [PB] [US3] Extend `desktop-agent/src/command_queue.py` — probe `/v2/obd/agents/:id/command-queue` first; fall back to `/v1/.../scan-queue` if v2 returns 404; route `LIVE_DATA_*` commands to `obd.poll.LiveDataPoller`
- [ ] T082 [PB] [US3] Update `desktop-agent/src/main.py` to register the new poll handler and start the v2 queue loop

### Implementation for US3 — Frontend

- [ ] T083 [PB] [US3] Implement `frontend/src/services/live-data.service.ts` — Axios wrappers for all 7 new endpoints
- [ ] T084 [PB] [US3] Implement `frontend/src/hooks/useLiveDataSession.ts` — TanStack Query for the active session; refetch on focus; mutations for start/stop
- [ ] T085 [PB] [US3] Implement `frontend/src/hooks/useLiveDataCurrent.ts` — TanStack Query that polls `GET /.../current` at the **cadence returned by the `Start` response** (typically 1 s — Correction 3); pauses on stale. The hook must use the `cadenceMs` from the server, not a hardcoded 1000 ms.
- [ ] T086 [PB] [US3] Implement `frontend/src/components/live-data/AdapterStatusPill.tsx` — small status indicator (Online / Offline / Stale)
- [ ] T087 [PB] [US3] Implement `frontend/src/components/live-data/LiveDataOfflineBanner.tsx` — full-width banner with "Adapter offline" + Retry button
- [ ] T088 [PB] [US3] Implement `frontend/src/components/live-data/LiveDataRow.tsx` — single PID row: name, value, unit, timestamp, status badge (OK / No data / Not supported / Error)
- [ ] T089 [PB] [US3] Implement `frontend/src/components/live-data/LiveDataControls.tsx` — Start / Stop / Save Snapshot buttons; disabled states
- [ ] T090 [PB] [US3] Implement `frontend/src/components/live-data/LiveDataDashboard.tsx` — composes the above; subscribes to `useLiveDataCurrent`; transitions to offline state when stale
- [ ] T091 [PB] [US3] Implement `frontend/src/app/diagnostic-sessions/[sessionId]/live-data/page.tsx` — new route; renders `<LiveDataDashboard sessionId={sessionId} />`; redirects to session detail if session is closed
- [ ] T092 [PB] [US3] Update `frontend/src/components/obd/ScanControlPanel.tsx` — add a "Start Live Data" button that navigates to `/sessions/:id/live-data`
- [ ] T093 [PB] [US3] Update `frontend/src/app/obd/page.tsx` — add a link to the new Live Data page (only shown when the user has an open diagnostic session)

### Acceptance Verification for US3

- [ ] T094 [PB] [US3] Manual verification per [quickstart.md §6 Phase B](quickstart.md) — Start shows values within 2 s, polling at 1 s default (Correction 3), disconnect → offline within 5 s
- [ ] T094a [PB] [US3] **Reconnect verification (Correction 4)** — start polling; disconnect agent for 25 s; reconnect: dashboard shows no disruption, the same `liveDataSessionId` is reused. Disconnect for 35 s; reconnect: dashboard shows "Adapter offline" → "Live data session ended" → Start creates a new `liveDataSessionId`; the prior session's snapshots are still visible on the session detail page.
- [ ] T094b [PB] [US3] **Cadence verification (Correction 3)** — request `cadenceMs = 500`; verify the persisted value is 500 and the agent's poll loop sleeps 500 ms between cycles. Request `cadenceMs = 50`; verify the persisted value is 200 (clamped to `LIVE_DATA_MIN_CADENCE_MS`) and the dashboard shows a "Clamped" indicator. Default absent `cadenceMs` → 1000 (1 s).
- [ ] T095 [PB] [US3] CI verification: `npm test` (backend), `npm test` (frontend), `pytest` (agent) all green
- [ ] T095a [PB] [US3] **Formula grammar verification (Correction 5)** — the parameterized unit test for `PidDecoderService` (T049/T049a) covers all whitelisted formulas and rejects `Math.PI`, `process.exit()`, function-call syntax, and any non-`A`/`B` identifier.
- [ ] T096 [PB] [US3] Backward-compat verification: Feature 004 scan flow (start a scan, read fault codes, view enriched results) still works end-to-end
- [ ] T097 [PB] [US3] Backward-compat verification: Feature 005 enrichment endpoint (`GET /fault-codes/:code`) still responds

**Checkpoint B.2**: US3 is independently testable and deployable. The live data dashboard works for a single user with a paired agent and adapter.

---

## Phase B.3: User Story 4 — Save Live Data Snapshot (P1)

**Goal**: While polling, the technician presses "Save Snapshot". A `LiveDataSnapshot` is created, linked to the open `DiagnosticSession`, and visible on the session detail page. The 51st snapshot evicts the oldest.

**Independent Test**: With polling active and at least one reading, pressing Save Snapshot creates a snapshot visible on the session detail page with captured values, units, and timestamps. A 51st snapshot evicts the oldest and writes an `EVICTED` audit.

### Tests for US4 (write first; ensure they FAIL)

- [ ] T098 [P] [PB] [US4] Unit test: `LiveDataSnapshotService.capture()` inserts the snapshot, the readings, and the `LIVE_DATA_SNAPSHOT_CAPTURED` audit in a single transaction — `backend/test/unit/live-data-snapshot.service.spec.ts`
- [ ] T099 [P] [PB] [US4] Unit test: snapshot eviction at cap — when count is 50, the 51st insert evicts the oldest and writes `LIVE_DATA_SNAPSHOT_EVICTED` — `backend/test/unit/live-data-snapshot.service.spec.ts` (same file, separate test)
- [ ] T100 [P] [PB] [US4] Unit test: `NO_DATA_TO_CAPTURE` is returned when the active session has no readings — `backend/test/unit/live-data-snapshot.service.spec.ts` (same file)
- [ ] T101 [P] [PB] [US4] Controller test: `POST /sessions/:id/live-data/snapshots` returns 201 with the snapshot payload — `backend/test/integration/live-data-snapshots.spec.ts`
- [ ] T102 [P] [PB] [US4] Controller test: `GET /sessions/:id/live-data/snapshots` returns the list (newest first) — `backend/test/integration/live-data-snapshots-list.spec.ts`
- [ ] T103 [P] [PB] [US4] Controller test: `GET /sessions/:id/live-data/snapshots/:snapshotId` returns the snapshot with all readings — `backend/test/integration/live-data-snapshot-detail.spec.ts`
- [ ] T104 [P] [PB] [US4] Cross-tenant test: a user in tenant A cannot read or write snapshots for a session in tenant B — `backend/test/integration/live-data-snapshots.cross-tenant.spec.ts`
- [ ] T105 [P] [PB] [US4] Frontend test: `LiveDataControls` enables the Save Snapshot button only when readings are present — `frontend/src/components/live-data/__tests__/LiveDataControls.test.tsx`
- [ ] T106 [P] [PB] [US4] Frontend test: `LiveDataSnapshotPanel` renders the snapshot list with timestamps and reading counts — `frontend/src/components/live-data/__tests__/LiveDataSnapshotPanel.test.tsx`
- [ ] T107 [P] [PB] [US4] Frontend test: the `DiagnosticSession` detail page shows the "Live Data Snapshots" section with the latest snapshots — `frontend/src/app/diagnostic-sessions/__tests__/[sessionId]-page.test.tsx` (or new test file)

### Implementation for US4 — Backend

- [ ] T108 [PB] [US4] Add `LiveDataSnapshot` model to `backend/prisma/schema.prisma` (tenant-scoped; **FK to `DiagnosticSession.id` directly** — Correction 1; FK to `LiveDataSession.id`; `capturedAt`, `createdBy`, **`values Json` (JSONB) — Correction 2**). **No `LiveDataReading` / `LiveDataSnapshotValue` table.**
- [ ] T109 [PB] [US4] **REMOVED — Correction 2**: the MVP does not create a `LiveDataReading` table. Snapshot values are stored as a single JSONB `values` object keyed by hex PID. Per-PID rows remain only in the read-model `LiveDataReadingCurrent`.
- [ ] T110 [PB] [US4] Generate Prisma client; apply migration (the new tables are added to the same migration as US3 since they share the live-data module)
- [ ] T111 [PB] [US4] Implement `backend/src/live-data/repositories/live-data-snapshot.repository.ts` — `create(payload)` (with `values: Json`), `findById(id)`, `findByDiagnosticSession(diagnosticSessionId, limit, offset)`, `countByDiagnosticSession(diagnosticSessionId)`, `findOldestForEviction(diagnosticSessionId)`, `deleteById(id)`
- [ ] T111a [PB] [US4] **REMOVED — Correction 2**: there is no `live-data-reading.repository.ts` (per-snapshot). The dashboard's read-model `LiveDataReadingCurrent` already has its own repository (T065).
- [ ] T112a [PB] [US4] Unit test: the `values` JSONB payload round-trips correctly through Postgres JSONB serialization (no string-key mangling) — `backend/test/unit/live-data-snapshot.service.spec.ts` (extend)
- [ ] T113 [PB] [US4] Implement `backend/src/live-data/services/live-data-snapshot.service.ts` — `capture(diagnosticSessionId, liveDataSessionId, userId)` in a single Prisma transaction: count → evict if at cap → insert snapshot (with `values` JSONB built from `LiveDataReadingCurrent`) → write `LIVE_DATA_SNAPSHOT_CAPTURED` audit; `list`, `getById`
- [ ] T114 [PB] [US4] Implement `backend/src/live-data/dtos/live-data-snapshot.dto.ts` — request and response DTOs; response DTO exposes `values: { [pid: string]: { name, value, unit, rawValue } }` (Correction 2)
- [ ] T115 [PB] [US4] Add `POST /sessions/:id/live-data/snapshots`, `GET /sessions/:id/live-data/snapshots`, `GET /sessions/:id/live-data/snapshots/:snapshotId` to `LiveDataController`
- [ ] T116 [PB] [US4] Cap env var: read `LIVE_DATA_SNAPSHOT_CAP` (default 50) at service construction; reject or evict based on count

### Implementation for US4 — Frontend

- [ ] T117 [PB] [US4] Implement `frontend/src/hooks/useLiveDataSnapshots.ts` — TanStack Query for the snapshot list; refetch on focus and after capture
- [ ] T118 [PB] [US4] Implement `frontend/src/components/live-data/LiveDataSnapshotPanel.tsx` — list of snapshots with timestamps and reading counts; click → expand to show the `values` map (per-PID `name`, `value`, `unit`, `rawValue`)
- [ ] T119 [PB] [US4] Extend `frontend/src/components/live-data/LiveDataControls.tsx` — wire the Save Snapshot button to call the service
- [ ] T120 [PB] [US4] Update `frontend/src/app/diagnostic-sessions/[sessionId]/page.tsx` — add a "Live Data Snapshots" section that renders `<LiveDataSnapshotPanel sessionId={sessionId} />` if any snapshots exist
- [ ] T121 [PB] [US4] Update `frontend/src/services/live-data.service.ts` — add the three new snapshot endpoints

### Acceptance Verification for US4

- [ ] T122 [PB] [US4] Manual verification: with polling active, save a snapshot; verify it appears on the session detail page; create 51 snapshots and verify the oldest is evicted and the eviction audit is written
- [ ] T123 [PB] [US4] CI verification: all unit and integration tests pass
- [ ] T124 [PB] [US4] Cross-tenant verification: a user in tenant A cannot see, read, or create snapshots for a session in tenant B

**Checkpoint B.3**: US4 is independently testable and deployable. Snapshots are persisted and visible.

---

## Phase B.4: User Story 5 — PID Discovery on First Connection (P2)

**Goal**: The first time a vehicle is connected, the system runs PID discovery (Service 01 PIDs 00/20/40/60/80/A0) and stores the supported mask. The Live Data page uses this mask to label unsupported PIDs as "Not supported".

**Independent Test**: With a paired agent and adapter, pressing "Discover PIDs" stores the mask; subsequent Live Data loads label unsupported PIDs as "Not supported" within 2 poll cycles.

### Tests for US5 (write first; ensure they FAIL)

- [ ] T125 [P] [PB] [US5] Unit test: `PidDiscoveryService` builds the discovery command sequence and validates the result mask — `backend/test/unit/pid-discovery.service.spec.ts`
- [ ] T126 [P] [PB] [US5] Unit test: the agent controller persists the supported-PID mask on the `LiveDataSession` and updates `current` readings' status to `NOT_SUPPORTED` for PIDs not in the mask — `backend/test/unit/pid-discovery.service.spec.ts` (same file)
- [ ] T127 [P] [PB] [US5] Controller test: `POST /sessions/:id/live-data/discover` enqueues the discovery command; returns 409 if no agent online — `backend/test/integration/live-data-discover.spec.ts`
- [ ] T128 [P] [PB] [US5] Desktop agent test: `obd/commands/pid_discovery.py` reads all 6 banks and assembles the supported-PID mask — `desktop-agent/tests/test_pid_discovery.py`
- [ ] T129 [P] [PB] [US5] Desktop agent test: the agent pushes the discovery result to `POST /v2/obd/agents/:id/live-discovery` — `desktop-agent/tests/test_live_data_client.py` (extend)
- [ ] T130 [P] [PB] [US5] Frontend test: the Live Data dashboard shows "Not supported" for PIDs absent from the mask within 2 poll cycles — `frontend/src/components/live-data/__tests__/LiveDataDashboard.test.tsx` (extend)

### Implementation for US5 — Backend

- [ ] T131 [PB] [US5] Implement `backend/src/live-data/services/pid-discovery.service.ts` — `buildCommandSequence()` returns the 6 PID reads; `processResult(liveDataSessionId, supportedPids)` stores the mask and tags the corresponding `LiveDataReadingCurrent` rows as `NOT_SUPPORTED` for missing PIDs
- [ ] T132 [PB] [US5] Implement `backend/src/live-data/dtos/pid-discovery-result.dto.ts` — request DTO for the agent's discovery push
- [ ] T133 [PB] [US5] Add `POST /v2/obd/agents/:id/live-discovery` to `LiveDataAgentController`
- [ ] T134 [PB] [US5] Add `POST /sessions/:id/live-data/discover` to `LiveDataController` — enqueues `LIVE_DATA_DISCOVERY` command
- [ ] T135 [PB] [US5] Extend `ObdCommandQueueService` to handle `LIVE_DATA_DISCOVERY` — route to `PidDiscoveryService`

### Implementation for US5 — Frontend / Agent

- [ ] T136 [PB] [US5] Add a "Discover PIDs" button to `frontend/src/components/live-data/LiveDataControls.tsx`; visible only when the supported-PID mask is null
- [ ] T137 [PB] [US5] Wire the "Discover PIDs" mutation in `frontend/src/hooks/useLiveDataSession.ts`
- [ ] T138 [PB] [US5] Extend `desktop-agent/src/obd/poll.py` — when a `LIVE_DATA_DISCOVERY` command arrives, instantiate a `PidDiscovery` runner, execute the 6-bank sequence, push the result to the backend, and then start polling (if a `LIVE_DATA_POLL` follows)

### Acceptance Verification for US5

- [ ] T139 [PB] [US5] Manual verification: with a paired agent and adapter, press "Discover PIDs"; verify the mask is stored and the dashboard shows "Not supported" for PIDs not in the mask within 2 poll cycles
- [ ] T140 [PB] [US5] CI verification: all unit and integration tests pass

**Checkpoint B.5**: US5 is independently testable and deployable. Discovery is a polish item; the Live Data dashboard is functional without it.

---

## Phase B.5: User Story 6 — Polling Cadence Configuration (P3)

**Goal**: The cadence is configurable from a default of 1 second to other supported values (200 ms to 5 s). The setting is per-user and persisted between sessions. Values below the safe minimum are clamped.

**Independent Test**: Change the cadence to 2 s; verify updates occur at ~2 s intervals (within ± 20%). Set to 100 ms; verify it is clamped to 200 ms with a visible indicator.

### Tests for US6 (write first; ensure they FAIL)

- [ ] T141 [P] [PB] [US6] Unit test: `LiveDataSessionService.start()` clamps `cadenceMs` to [200, 5000] — `backend/test/unit/live-data-session.service.spec.ts` (extend)
- [ ] T142 [P] [PB] [US6] Unit test: the configuration endpoint persists the user-level cadence preference — `backend/test/unit/live-data-cadence-preference.spec.ts` (new test file)
- [ ] T143 [P] [PB] [US6] Desktop agent test: the poll loop respects the configured cadence and emits cycles at the right interval — `desktop-agent/tests/test_poll.py` (extend)
- [ ] T144 [P] [PB] [US6] Frontend test: `LiveDataControls` clamps the cadence input and shows a clear indicator when clamping occurs — `frontend/src/components/live-data/__tests__/LiveDataControls.test.tsx` (extend)
- [ ] T145 [P] [PB] [US6] Frontend test: `useLiveDataSession` restores the cadence preference on subsequent visits — `frontend/src/hooks/__tests__/useLiveDataSession.test.ts` (extend)

### Implementation for US6

- [ ] T146 [PB] [US6] Add a `UserPreference` (or extend an existing user-settings table) with `key = 'liveData.cadenceMs'` and `value` as Integer; tenant-scoped; unique by `(userId, key)`
- [ ] T147 [PB] [US6] Implement `GET /users/me/preferences/live-data` and `PUT /users/me/preferences/live-data` in `LiveDataController` (or a new `UsersController`); cadence is clamped server-side
- [ ] T148 [PB] [US6] Update `LiveDataSessionService.start()` to read the user's preference when no `cadenceMs` is supplied; clamp to [200, 5000]; return the clamped value in the response with a `clamped: true` flag if applicable
- [ ] T149 [PB] [US6] Update `desktop-agent/src/obd/poll.py` — the poll loop reads `cadenceMs` from the command and sleeps for the right interval between cycles
- [ ] T150 [PB] [US6] Update `frontend/src/components/live-data/LiveDataControls.tsx` — add a cadence selector (default 1 s; options 200 ms, 500 ms, 1 s, 2 s, 5 s); show a clamped indicator if the persisted preference is outside the safe range

### Acceptance Verification for US6

- [ ] T151 [PB] [US6] Manual verification: change the cadence to 2 s; verify updates at ~2 s intervals; set to 100 ms; verify clamping to 200 ms with a visible indicator
- [ ] T152 [PB] [US6] CI verification: all unit and integration tests pass

**Checkpoint B.5**: US6 is independently testable and deployable. The cadence is now configurable; the MVP default (1 s) is unchanged.

---

## Phase B.6: Polish & Cross-Cutting

- [ ] T153 [P] [PB] Performance pass: benchmark `GET /live-data/current` (target p95 < 100 ms); add a single composite index on `(liveDataSessionId, pid)` for `LiveDataReadingCurrent` if needed
- [ ] T154 [P] [PB] Performance pass: benchmark the VPIC decode endpoint (target cache hit p95 < 100 ms; cold p95 < 1 s); **confirm `VehicleDecode.vin` is `UNIQUE` and that the table has no `organizationId`** (Correction 6 verification)
- [ ] T154a [P] [PB] **JSONB perf pass (Correction 2)** — benchmark `LiveDataSnapshot.values` round-trip (capture → write → read) at the 50-snapshot cap; the JSONB shape is small (~11 PIDs per snapshot) and Postgres JSONB GIN is not required for the MVP, but document the access pattern.
- [ ] T155 [P] [PB] Update `docs/SAD.md` with the new module, entities, and endpoints
- [ ] T156 [P] [PB] Update `docs/PRD.md` roadmap table — Feature 006 complete
- [ ] T157 [P] [PB] Update `docs/PRD_ADDENDUM_001_OBD_VISION.md` to note the live-data capability is now available
- [ ] T158 [P] [PB] Add a `/api/live-data/openapi` (or equivalent) OpenAPI fragment for the new endpoints
- [ ] T158a [P] [PB] Update `specs/006-live-data-and-sensor-monitoring/plan.md` and `data-model.md` and `contracts/` to reflect the **live-data-row archive**: mark any leftover `LiveDataReading` references in the codebase as **REMOVED (Correction 2)**; this task is the sweeper.
- [ ] T158b [P] [PB] **Future backlog pointer (Correction 7)** — add a one-paragraph note in `specs/006-live-data-and-sensor-monitoring/plan.md`'s "Future Enhancements (Backlog)" section pointing at the future **ECU Topology & Control Unit Scan** feature (entities: `ControlUnitScan`, `ControlUnit`, `ControlUnitFault`). **No implementation tasks; do not change Feature 006 scope.**
- [ ] T159 [P] [PB] Code cleanup: run `npm run lint` and `npm run format` on all new files; ensure no file exceeds 300 lines or function exceeds 30 lines
- [ ] T160 [P] [PB] Security review: confirm the agent endpoints enforce `X-Agent-Token`; confirm the web endpoints enforce JWT and tenant isolation; confirm the VPIC asset is opened in read-only mode
- [ ] T161 [PB] Run the full [quickstart.md](quickstart.md) end-to-end with a real agent and adapter
- [ ] T162 [PB] Cross-feature smoke test: pair agent → connect adapter → start scan → vehicle confirm with VIN decode → open live data → poll → save snapshot → view snapshot on session detail. All in a single workshop session, all green.
- [ ] T163 [PB] Add a release note: "Feature 006 — Live Data & Sensor Monitoring shipped. VIN auto-fill, live PID polling, snapshot capture."

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase A (T001–T036)**: independent of Phase B. Can be merged and deployed as soon as US1 is accepted.
- **Phase B (T037–T163)**:
  - **B.1 (T037–T045)**: must complete before any Phase B user story.
  - **B.2 (US3, T046–T097)**: must complete before B.3.
  - **B.3 (US4, T098–T124)**: depends on B.2 (the snapshot capture depends on the live session infrastructure).
  - **B.4 (US5, T125–T140)**: depends on B.2 (discovery is part of the live data session).
  - **B.5 (US6, T141–T152)**: depends on B.2 (cadence config is part of the live data session).
  - **B.4 and B.5 are independent of each other**; they can be developed in parallel.
  - **B.6 (Polish, T153–T163)**: depends on all of B.2, B.3, B.4, B.5.

### Within Each User Story

- Tests MUST be written and FAIL before implementation.
- Models before repositories before services before controllers.
- Backend before desktop-agent before frontend (frontend consumes the contracts).
- Story complete (all tasks T0XX) before moving to the next story.

### Parallel Opportunities

- Phase A: T002 and T003 can run in parallel (different package.json entries).
- Phase A: T008–T015 (tests) can be written in parallel.
- Phase A: T019 and T020 (repository and vpic-decode service) can be developed in parallel.
- Phase A: T025 and T026 (frontend service and hook) can be developed in parallel with T019–T024 (backend).
- Phase B.1: T041 and T043 can be developed in parallel.
- Phase B.2: T046–T059 (tests) can be written in parallel.
- Phase B.2: T060–T062 (schema additions) are sequential; T064 and T065 (repositories) can be developed in parallel; T077–T082 (agent) can be developed in parallel with T060–T076 (backend).
- Phase B.4 and Phase B.5 can be developed in parallel by different developers.
- Phase B.6: T155, T156, T157, T158 can run in parallel.

### Cross-Phase Constraints

- Phase A MUST be merged and accepted before Phase B begins (per the user's explicit instruction).
- Phase B MUST NOT alter any existing Feature 004 or Feature 005 contracts (R-010 in research.md). The `/v1/.../scan-queue` endpoint and the existing fault-code enrichment endpoint must continue to work.
- The Desktop Agent's command queue is versioned as `/v2/...`. The agent probes v2 first and falls back to v1; both must continue to work in the MVP.
- **Correction 6 (Phase A):** `VehicleDecode` is global. There is no `organizationId` column; `vin` is `UNIQUE`. A user in tenant A shares the cache with a user in tenant B for the same VIN. Any task that would add an `organizationId` to `VehicleDecode` is **REJECTED**.
- **Correction 1 (Phase B):** `LiveDataSession.diagnosticSessionId` is `NOT NULL` (FK to `DiagnosticSession`). `LiveDataSnapshot.diagnosticSessionId` is also `NOT NULL` (FK to `DiagnosticSession`). Live data is anchored to the Diagnostic Session, not the Vehicle.
- **Correction 2 (Phase B):** No `LiveDataReading` / `LiveDataSnapshotValue` table. Snapshot values are stored as a single JSONB `values` column on `LiveDataSnapshot`. Any task that would create a per-PID rows table for snapshot values is **REJECTED**.
- **Correction 4 (Phase B):** Reconnect within 30 s = resume same `liveDataSessionId`; reconnect after 30 s = mark previous `STALE` and create a new session. The 30-s window is the same as the stale-timeout window.
- **Correction 5 (Phase B):** The PID formula engine is restricted to the grammar in [pid-definition-contract.md](contracts/pid-definition-contract.md). Any task that would call `eval`, `new Function`, or otherwise expand the grammar is **REJECTED**.

---

## Out of Scope (Reaffirmed)

The following items are **not** part of Feature 006 and must not be added by any task:

- AI Analysis (Feature 007)
- PDF / digital reports (Feature 008)
- PrioraFlow integration (Feature 009)
- **ECU Topology & Control Unit Scan (backlog only — Correction 7):** the future feature with `ControlUnitScan`, `ControlUnit`, and `ControlUnitFault` is documented in `plan.md` § "Future Enhancements (Backlog)". **No implementation tasks; no schema changes; no contract changes in Feature 006.** Tracked as a future feature only.
- Freeze frame data
- Graphing of live or historical sensor streams
- Trend analysis across multiple snapshots
- Actuation tests, bidirectional controls, service functions, adaptations
- Coding, programming, flashing of ECUs
- OEM-specific repair procedures beyond the GM Mode 22 PIDs already in `model-pids.sqlite`
- Continuous recording of sensor streams; the feature is point-in-time snapshots only
- WebSockets or SSE in the MVP (REST polling only; transport is upgradeable in a future feature)
- A separate `LiveDataReading` historical table — Correction 2 (the MVP stores the JSONB `values` map on the snapshot only)
- A generic scripting engine for PID formulas — Correction 5 (restricted grammar only; no `eval`, no `Function`, no user-defined formulas)
- Per-user cadence settings (cadence is a per-session setting)
