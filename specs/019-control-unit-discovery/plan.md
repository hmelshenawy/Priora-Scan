# Implementation Plan: Control Unit Discovery Foundation

**Branch**: `019-control-unit-discovery` | **Date**: 2026-06-15 | **Spec**: [spec.md](./spec.md)

## Summary

Add a read-only Control Unit Discovery feature to PrioraScan that discovers which diagnostic CAN request IDs have responding ECUs using a two-step functional→physical strategy with the `22F190` probe. Results are stored under `DiagnosticSession.vehicleDataJson.controlUnitDiscovery` as a structured JSON with probe history, deduplicated responders, discovery source tracking (`discoveredBy`), confidence levels (`LOW`/`HIGH`), and scan mode metadata (`scanMode`). Each probe execution is isolated — a single probe failure never aborts the entire discovery scan; failures become `ProbeResult` records with `status: "ERROR"` and an `errorCode` field. The desktop agent implements a `DiscoveryStrategy` pattern with `GenericObdCanDiscoveryStrategy` for v1. UDS response parsing logic is extracted into a reusable `uds_response_parser` module for future features (020, 021, 022) to consume. The frontend displays responders by default with an optional probe details view. No new database tables, no new API endpoints, no modifications to prior feature modules.

## Technical Context

**Language/Version**: Python 3.11+ (agent), TypeScript 5+ (backend & frontend)

**Primary Dependencies**: NestJS 10, Prisma 5, Next.js 14, React 18, TanStack Query, shadcn/ui, pytest (agent)

**Storage**: PostgreSQL via Prisma — `DiagnosticSession.vehicleDataJson` JSONB column (no schema migration)

**Testing**: pytest (agent), Jest (backend & frontend)

**Target Platform**: Desktop agent (Python/ELM327), Backend (Node.js server), Frontend (Next.js browser app)

**Project Type**: Web application with desktop agent component

**Performance Goals**: Discovery scan completes in ≤ 30 seconds for 9 probes on a real vehicle; UI renders discovery results in ≤ 500ms

**Constraints**: No new infrastructure, no Redis changes, no database migrations, no new API endpoints, no modifications to existing vehicle health/DTC/freeze-frame/readiness/extended-PID modules

**Scale/Scope**: Single diagnostic session per scan, ≤ 9 probes per session, ≤ 8 unique responders typical

### Architecture Note: Command Queue Reuse

Feature 019 introduces `DISCOVER_CONTROL_UNITS` inside the existing `LiveDataCommandType` enum. Although "live data" and "discovery" are conceptually different operations, the existing command queue infrastructure is reused because it is the established agent command mechanism. **No new queue, scheduler, dispatcher, or command transport layer is introduced.** The `LiveDataCommandType` name is a legacy artifact; the command queue is the sole transport for all agent commands regardless of whether they relate to live data. Future features should also reuse this mechanism rather than creating parallel queue systems.

## Constitution Check

*GATE: Must pass before implementation proceeds.*

- [x] **I. Documentation First**: Spec, data model, and contracts are complete and reference PRD/SAD entities (DiagnosticSession, vehicleDataJson). No undocumented entities introduced.
- [x] **II. Design Before Implementation**: Plan, data model, contracts, and quickstart are written before any code.
- [x] **III. Layered Architecture**: Controller routes event → Service processes business logic → Repository persists. Agent module handles vehicle communication only. No cross-layer leakage.
- [x] **IV. Modular Development**: Feature 019 is self-contained: agent discovery module, backend service extension, frontend component. No cross-module changes except adding event type routing.
- [x] **V. Code Quality**: All new files will follow single-responsibility principle. Discovery module < 300 lines. Strategy pattern keeps concerns separated. UDS response parser is a separate reusable module.
- [x] **VI. Multi-Tenant First**: Discovery data is scoped to `DiagnosticSession` which is tenant-scoped. No cross-tenant access.
- [x] **VII. API First**: No new endpoints. Data is exposed through existing `GET /vehicle-data` endpoint. Agent command uses existing `LiveDataCommand` table.
- [x] **VIII. Scan Source Agnostic**: Discovery uses the same agent→backend event pipeline as other vehicle data features. No ELM327-specific assumptions in the backend.
- [x] **IX. AI Assists, Never Decides**: No AI features in Feature 019. Not applicable.
- [x] **X. Standalone First**: No PrioraFlow dependency. Discovery works independently.
- [x] **XI. Auditability**: Discovery results are stored in `vehicleDataJson` which is part of the audited diagnostic session.
- [x] **XII. Security By Default**: Discovery is triggered via authenticated agent commands. Event processing uses existing auth middleware.
- [x] **XIII. Progressive Hardware Integration**: Discovery extends the existing ELM327 adapter capability. Follows the established pattern.
- [x] **XIV. Git & Change Safety**: Feature branch `019-control-unit-discovery`. No breaking changes to existing APIs or data shapes.
- [x] **XV. Simplicity Over Complexity**: No new DB tables, no new endpoints, no new infrastructure. JSONB extension only.
- [x] **XVI. Backend-Centric Business Logic**: Discovery result processing (classification, deduplication, confidence) happens in the agent. Backend persists and retrieves. Frontend displays only.

**Gate Result**: ✅ PASS

## Project Structure

### Documentation (this feature)

```text
specs/019-control-unit-discovery/
├── spec.md                              # Feature specification (APPROVED)
├── plan.md                              # This file
├── research.md                          # Phase 0 research output
├── data-model.md                        # Phase 1 data model
├── quickstart.md                        # Phase 1 quickstart guide
├── contracts/
│   └── vehicle-data-api-contract.md     # Phase 1 API contract
└── checklists/
    └── requirements.md                  # Spec quality checklist
```

### Source Code (repository root)

```text
desktop-agent/src/
├── obd/
│   ├── commands/
│   │   ├── control_unit_discovery.py    # 019 NEW — Discovery engine, strategy, builder (consumes uds_response_parser)
│   │   ├── uds_response_parser.py       # 019 NEW — Reusable UDS response parser (classify_response, parse_raw_header_payload, NEGATIVE_RESPONSE_CODES, extract_negative_response)
│   │   ├── vehicle_health.py            # EXISTING — No changes
│   │   ├── extended_pids.py             # EXISTING — No changes (018)
│   │   └── ...
│   └── mock_profiles/
│       ├── control_unit_discovery_profile.py  # 019 NEW — Mock profile for discovery
│       └── profile_registry.py                  # 019 MODIFY — Register new profile
├── agent/
│   ├── scan_executor.py                 # 019 MODIFY — Add execute_control_unit_discovery()
│   └── event_publisher.py               # EXISTING — No changes needed (uses existing emit_session_event)
├── live_data/
│   └── queue.py                         # 019 MODIFY — Add DISCOVER_CONTROL_UNITS dispatch
└── obd/
    └── types.py                          # EXISTING — ScanEventType enum (if needed)

desktop-agent/tests/
├── test_control_unit_discovery.py        # 019 NEW — Unit tests for discovery module
└── test_uds_response_parser.py           # 019 NEW — Unit tests for reusable UDS parser

backend/src/
├── obd/
│   ├── controllers/
│   │   └── agent-webhook.controller.ts   # 019 MODIFY — Route CONTROL_UNIT_DISCOVERY_READ
│   └── types/
│       └── scan-event-type.enum.ts       # 019 MODIFY — Add CONTROL_UNIT_DISCOVERY_READ
├── live-data/
│   └── types/
│       └── live-data-command-type.enum.ts # 019 MODIFY — Add DISCOVER_CONTROL_UNITS
├── vehicle-data/
│   ├── services/
│   │   └── vehicle-data.service.ts       # 019 MODIFY — Add processControlUnitDiscovery()
│   ├── dtos/
│   │   └── vehicle-data-response.dto.ts  # 019 MODIFY — Add ControlUnitDiscovery interfaces (with scanMode), extend validator
│   ├── controllers/
│   │   └── vehicle-data.controller.ts    # EXISTING — No changes
│   └── repositories/
│       └── vehicle-data.repository.ts    # EXISTING — No changes
└── ...

backend/tests/
├── unit/vehicle-data/
│   ├── vehicle-data.service.unit.test.ts        # 019 MODIFY — Add discovery processing tests
│   └── vehicle-data-response.dto.unit.test.ts   # 019 MODIFY — Add discovery validation tests
└── unit/obd/
    └── agent-webhook.controller.unit.test.ts    # 019 MODIFY — Add new event type routing test

frontend/src/
├── components/vehicle-data/
│   ├── ControlUnitsPanel.tsx                     # 019 NEW — Responder table + probe details + scanMode display
│   ├── VehicleHealthPanel.tsx                   # 019 MODIFY — Integrate ControlUnitsPanel
│   └── __tests__/
│       ├── ControlUnitsPanel.test.tsx            # 019 NEW — Component tests
│       └── VehicleHealthPanel.test.tsx           # 019 MODIFY — Add discovery rendering tests
├── services/
│   └── vehicle-data-api.ts                      # 019 MODIFY — Extend VehicleDataJson type with controlUnitDiscovery (including scanMode)
└── ...
```

**Structure Decision**: Feature 019 follows the same three-layer pattern established by Features 009, 016, 017, and 018. The desktop agent adds a new command module (`control_unit_discovery.py`) that follows the pattern of `vehicle_health.py`, plus a new reusable module (`uds_response_parser.py`) extracted for future features. The backend extends the existing `VehicleDataJson` type and adds a service method for processing discovery events. The frontend adds a new component (`ControlUnitsPanel`) that integrates into the existing session detail page. No new modules, no new infrastructure.

## Phase 0: Research ✅

Research is complete. See [research.md](./research.md) for all resolved unknowns.

Key decisions:
- **R1**: Agent→backend data flow follows existing `LiveDataCommand` → `scan_executor` → `emit_session_event` → `AgentWebhookController` pipeline. The `LiveDataCommandType` is reused as the established agent command mechanism — no new queue or transport layer.
- **R4**: Strategy pattern implemented as Python ABC `DiscoveryStrategy` with `GenericObdCanDiscoveryStrategy`
- **R7**: Confidence computed post-discovery by `build_responders()` function grouping probes by `responseId`
- **R9**: `VehicleDataJson` DTO extended with optional `controlUnitDiscovery` field, backward compatible
- **R10**: New command type `DISCOVER_CONTROL_UNITS` and event type `CONTROL_UNIT_DISCOVERY_READ`

## Phase 1: Design & Contracts ✅

Design artifacts are complete:

- [data-model.md](./data-model.md) — Interface definitions, response classification model, confidence rules, deduplication strategy, scan mode metadata
- [contracts/vehicle-data-api-contract.md](./contracts/vehicle-data-api-contract.md) — Response shape extension, contract rules, agent event contract
- [quickstart.md](./quickstart.md) — Agent usage examples, backend processing, frontend rendering, test commands

## Phase 2: Desktop Agent Discovery Engine

**Scope**: New `control_unit_discovery.py` module (consumes reusable parser), new `uds_response_parser.py` module, strategy pattern, mock profile, command dispatch integration.

### Files

| File | Action | Description |
|------|--------|-------------|
| `desktop-agent/src/obd/commands/uds_response_parser.py` | NEW | Reusable UDS response parser: `NEGATIVE_RESPONSE_CODES` mapping, `classify_response()`, `parse_raw_header_payload()`, `extract_negative_response()`. Shared by Feature 019 and future features (020, 021, 022). |
| `desktop-agent/src/obd/commands/control_unit_discovery.py` | NEW | Discovery engine: strategy ABC, `GenericObdCanDiscoveryStrategy`, `build_responders()`, `read_control_units()`. Consumes `uds_response_parser` — does NOT own UDS parsing logic. |
| `desktop-agent/src/obd/mock_profiles/control_unit_discovery_profile.py` | NEW | Mock profile with functional/physical responses |
| `desktop-agent/src/obd/mock_profiles/profile_registry.py` | MODIFY | Register new discovery profile |
| `desktop-agent/src/agent/scan_executor.py` | MODIFY | Add `execute_control_unit_discovery()` handler |
| `desktop-agent/src/live_data/queue.py` | MODIFY | Add `DISCOVER_CONTROL_UNITS` dispatch |

### Steps

1. Create `uds_response_parser.py` with:
   - `NEGATIVE_RESPONSE_CODES` dictionary (7 standard codes + fallback to `UNKNOWN_NEGATIVE_RESPONSE`)
   - `parse_raw_header_payload(raw_response: str) -> tuple[str | None, str | None]` — extracts CAN response header and payload bytes from a raw response string; returns `(None, None)` for `NO DATA` or malformed responses
   - `classify_response(raw_response: str, request_id: str) -> ProbeResult` — pure function that classifies raw ELM327 responses into `POSITIVE`, `NEGATIVE`, `NO_RESPONSE`, or `MALFORMED` categories; populates `rawHeader`, `rawPayload`, `rawResponse`, `responseId`, `negativeResponseCode`, `negativeResponseMeaning`
   - `extract_negative_response(raw_response: str) -> tuple[str | None, str | None]` — extracts NRC service byte and NRC code from a negative response; returns `(None, None)` if not a negative response
   - This module is **shared infrastructure** — Feature 020 (ECU Inventory), Feature 021 (ECU-Specific DTC), and Feature 022 (UDS Explorer) will import from it

2. Create `control_unit_discovery.py` with:
   - `DiscoveryStrategy` ABC with `discover(adapter, request_ids, probe_sequence)` method
   - `GenericObdCanDiscoveryStrategy` implementing two-step discovery:
     - Step 1: Functional discovery using `ATSH7DF` + each probe in `probeSequence`
     - Step 2: Physical fallback using `ATSH{requestId}` for `7E0`-`7E7` + each probe
   - Import `classify_response` and `parse_raw_header_payload` from `uds_response_parser` — **do not reimplement UDS parsing in this module**
   - `build_responders(probes)` pure function — groups by `responseId`, computes `discoveredBy`, `confidence`, `capabilities`
   - `read_control_units(adapter, strategy=None)` — orchestrator that runs discovery and returns the full `ControlUnitDiscovery` dict (including `scanMode: "FUNCTIONAL_THEN_PHYSICAL"`)
   - Forbidden service validation: reject any probe starting with `27`, `2E`, `31`, `11`, `14`, `2F`
   - Maximum probe count validation: MAX_DISCOVERY_PROBES = configurable
         If discovery exceeds the configured limit:
         - warn
         - stop scheduling additional probes
         - return partial results
         Never raise an exception.
         
   - **Probe-level isolation**: Each probe execution is wrapped in its own try/except. A single probe failure never aborts the entire discovery scan. Failures are converted into `ProbeResult` records with `status: "ERROR"`, `responseType: "ERROR"`, and an `errorCode` field. Discovery continues with remaining probes. Only unrecoverable startup failures (adapter never connects) prevent discovery execution entirely.
   - `ProbeResult` extends with `errorCode: string | null` — populated only when `status` is `"ERROR"`. Allowed values: `"TIMEOUT"`, `"COMMUNICATION_ERROR"`, `"UNEXPECTED_PAYLOAD"`, `"ADAPTER_DISCONNECT"`. Null for all other statuses.

3. Create mock profile `control_unit_discovery_profile.py` with:
   - Functional response for `7DF` → `7E8` (negative `7F2211`)
   - Physical responses for `7E0` → `7E8` (negative), `7E1`-`7E7` → `NO DATA`
   - At least one positive response scenario for testing

4. Register profile in `profile_registry.py`

5. Add `execute_control_unit_discovery(session_id, adapter)` to `scan_executor.py`:
   - Call `read_control_units(adapter)`
   - Emit `CONTROL_UNIT_DISCOVERY_READ` event via `emit_session_event()`
   - **Probe-level isolation**: The `read_control_units` orchestrator wraps each individual probe in its own try/except. If a single probe throws (timeout, communication error, unexpected payload), it is recorded as a `ProbeResult` with `status: "ERROR"`, `responseType: "ERROR"`, and a descriptive `errorCode`. The scan continues with remaining probes. Only an unrecoverable startup failure (adapter never connects, strategy initialization fails) prevents the entire scan.
   - **Adapter disconnect mid-scan**: If the adapter disconnects during a probe, that probe is recorded with `status: "ERROR"`, `responseType: "ERROR"`, `errorCode: "ADAPTER_DISCONNECT"`. Remaining probes that cannot be sent are also recorded with `errorCode: "ADAPTER_DISCONNECT"`. The partial result is emitted with all probes collected so far and `completedAt` set to the disconnect timestamp.
   - **Per-probe timeout**: Each probe has a configurable timeout (default 2s). If the adapter does not respond within the timeout, the probe is recorded with `status: "ERROR"`, `responseType: "ERROR"`, `errorCode: "TIMEOUT"`. The scan continues.

6. Add `DISCOVER_CONTROL_UNITS` dispatch case in `queue.py`:
   - Map `LiveDataCommandType.DISCOVER_CONTROL_UNITS` → `_control_unit_discovery_handler`
   - Register handler that calls `execute_control_unit_discovery()`
   - **Architecture note**: This reuses the existing `LiveDataCommandType` command queue infrastructure. No new queue, scheduler, dispatcher, or transport layer is introduced.

### Tests

- `test_uds_response_parser.py`: Unit tests for:
  - `parse_raw_header_payload()` — extracts header and payload from valid responses
  - `parse_raw_header_payload()` — returns `(None, None)` for `NO DATA` and malformed responses
  - `classify_response()` — positive, negative, NO_DATA, malformed classification
  - `extract_negative_response()` — NRC extraction and mapping
  - `NEGATIVE_RESPONSE_CODES` — known codes map correctly, unknown codes map to `UNKNOWN_NEGATIVE_RESPONSE`

- `test_control_unit_discovery.py`: Unit tests for:
  - Functional discovery success
  - Physical discovery success
  - Negative response classification as DISCOVERED
  - `NO DATA` classification as NOT_FOUND
  - Malformed response classification as UNKNOWN/MALFORMED
  - Multiple responders from functional address
  - Confidence assignment (LOW for functional-only, HIGH for physical-confirmed)
  - `discoveredBy` array aggregation
  - `scanMode` field set to `"FUNCTIONAL_THEN_PHYSICAL"`
  - Forbidden service rejection
  - Maximum probe count enforcement
  - Zero responders found (all NO DATA)
  - Discovery module does NOT contain UDS parsing logic (imports from `uds_response_parser`)
  - **Probe-level isolation**: Single probe timeout produces `status: "ERROR"`, `responseType: "ERROR"`, `errorCode: "TIMEOUT"` — scan continues with remaining probes
  - **Probe-level isolation**: Adapter communication error on one probe produces `errorCode: "COMMUNICATION_ERROR"` — scan continues
  - **Probe-level isolation**: Unexpected payload on one probe produces `errorCode: "UNEXPECTED_PAYLOAD"` — scan continues
  - **Probe-level isolation**: Adapter disconnect mid-scan produces `errorCode: "ADAPTER_DISCONNECT"` for the failed probe and remaining probes — partial result is emitted with all collected probes
  - `errorCode` is `null` for all non-ERROR statuses (DISCOVERED, NOT_FOUND, UNKNOWN)

## Phase 3: Backend Persistence & Contracts

**Scope**: Extend `VehicleDataJson` type (with `scanMode`), add `processControlUnitDiscovery()` service method, route new event type, validate discovery data.

### Files

| File | Action | Description |
|------|--------|-------------|
| `backend/src/obd/types/scan-event-type.enum.ts` | MODIFY | Add `CONTROL_UNIT_DISCOVERY_READ` |
| `backend/src/live-data/types/live-data-command-type.enum.ts` | MODIFY | Add `DISCOVER_CONTROL_UNITS` |
| `backend/src/vehicle-data/dtos/vehicle-data-response.dto.ts` | MODIFY | Add `ControlUnitDiscovery` (with `scanMode`), `ProbeResult`, `Responder`, `DiscoverySource`, `DiscoverySummary`, `ResponderCapabilities` interfaces; extend `isValidVehicleDataJson()` |
| `backend/src/vehicle-data/services/vehicle-data.service.ts` | MODIFY | Add `processControlUnitDiscovery()` method |
| `backend/src/obd/controllers/agent-webhook.controller.ts` | MODIFY | Route `CONTROL_UNIT_DISCOVERY_READ` event to `processControlUnitDiscovery()` |

### Steps

1. Add `CONTROL_UNIT_DISCOVERY_READ` to `ScanEventType` enum

2. Add `DISCOVER_CONTROL_UNITS` to `LiveDataCommandType` enum

3. Extend `vehicle-data-response.dto.ts`:
   - Add TypeScript interfaces: `ControlUnitDiscovery` (with `scanMode` field), `DiscoverySummary`, `ProbeResult` (with `errorCode` field), `DiscoverySource`, `Responder`, `ResponderCapabilities`
   - Extend `VehicleDataJson` interface with optional `controlUnitDiscovery?: ControlUnitDiscovery`
   - Update `isValidVehicleDataJson()` to accept sessions without `controlUnitDiscovery` and validate structure when present (including `scanMode` validation)

4. Add `processControlUnitDiscovery(sessionId: string, discovery: ControlUnitDiscovery)` to `VehicleDataService`:
   - Fetch session by ID
   - Merge `controlUnitDiscovery` into existing `vehicleDataJson` (additive only, no overwrite of other keys)
   - **Error isolation**: If discovery data is malformed or processing fails, log the error but do not fail the overall diagnostic session. Return the existing vehicle data unchanged.
   - Validate `errorCode` field in probe results: accept `"TIMEOUT"`, `"COMMUNICATION_ERROR"`, `"UNEXPECTED_PAYLOAD"`, `"ADAPTER_DISCONNECT"` as valid error codes; reject unknown codes but still persist the probe result (unknown codes stored as-is for forward compatibility)
   - Save via repository
   - Return updated vehicle data

5. Update `AgentWebhookController.scanEvents()`:
   - Add `CONTROL_UNIT_DISCOVERY_READ` case to event routing
   - Delegate to `vehicleDataService.processControlUnitDiscovery()`
   - **Error isolation**: Catch and log errors from discovery processing; do not propagate to crash the webhook handler. Return success response regardless of discovery processing outcome.

### Tests

- `vehicle-data-response.dto.unit.test.ts`: Validate `ControlUnitDiscovery` shape (valid, missing, malformed, backward compatible, scanMode), validate `errorCode` field accepts known error codes (`TIMEOUT`, `COMMUNICATION_ERROR`, `UNEXPECTED_PAYLOAD`, `ADAPTER_DISCONNECT`) and is `null` for non-ERROR statuses
- `vehicle-data.service.unit.test.ts`: Test `processControlUnitDiscovery()` persistence, merge behavior, backward compatibility, error isolation (malformed discovery data does not crash session)
- `agent-webhook.controller.unit.test.ts`: Test event routing for `CONTROL_UNIT_DISCOVERY_READ`, error isolation (processing errors do not crash webhook handler)

## Phase 4: Frontend Control Units UI

**Scope**: New `ControlUnitsPanel` component (with `scanMode` display), integration with `VehicleHealthPanel`, type extensions.

### Files

| File | Action | Description |
|------|--------|-------------|
| `frontend/src/components/vehicle-data/ControlUnitsPanel.tsx` | NEW | Responder table + collapsible probe details + scan mode display |
| `frontend/src/components/vehicle-data/VehicleHealthPanel.tsx` | MODIFY | Integrate ControlUnitsPanel |
| `frontend/src/services/vehicle-data-api.ts` | MODIFY | Extend VehicleDataJson type with controlUnitDiscovery (including scanMode) |

### Steps

1. Extend `VehicleDataJson` type in `vehicle-data-api.ts`:
   - Add `ControlUnitDiscovery`, `DiscoverySummary`, `ProbeResult`, `DiscoverySource`, `Responder`, `ResponderCapabilities` interfaces (all including `scanMode` on `ControlUnitDiscovery`)
   - Add optional `controlUnitDiscovery?: ControlUnitDiscovery` to `VehicleDataJson`

2. Create `ControlUnitsPanel.tsx`:
   - **Default view**: Render `responders` array as a table with columns: Response ID, Confidence, Status, Protocol
   - **No ECU names**: All name fields are displayed as "—" or similar placeholder (never inferred)
   - **Empty state**: Show "No control units discovered" when `responders` is empty or `controlUnitDiscovery` is missing
   - **Confidence badges**: LOW → yellow/amber badge, HIGH → green badge
   - **Scan mode display**: Show `scanMode` in the discovery metadata section (e.g., "Scan Mode: FUNCTIONAL_THEN_PHYSICAL")
   - **Optional details**: Collapsible `<details>` section showing `probes` array with columns: Method, Request ID, Probe, Response ID, Status, Response Type, Error Code, Raw Response
   - **Error probes**: Probes with `status: "ERROR"` display the `errorCode` (e.g., TIMEOUT, COMMUNICATION_ERROR) in the Status column with an error indicator style
   - **Negative response details**: Tooltip or expandable row showing `negativeResponseCode` and `negativeResponseMeaning`
   - **Discovery metadata**: Show `strategy`, `scanMode`, `probeSequence`, `startedAt`, `completedAt`, and summary stats above the table

3. Integrate into `VehicleHealthPanel.tsx`:
   - Add `ControlUnitsPanel` section after the vehicle health data section
   - Conditionally render: only show if `vehicleData.controlUnitDiscovery` exists
   - Pass `controlUnitDiscovery` data as prop

### Tests

- `ControlUnitsPanel.test.tsx`:
  - Renders responders from mock discovery data
  - Shows empty state when no discovery data
  - Shows empty state when zero responders found
  - Displays confidence badges (LOW/HIGH)
  - Does not display ECU names
  - Displays `scanMode` in discovery metadata
  - Probe details section is collapsible and not shown by default
  - Expanding probe details shows all probes
  - Negative response codes visible in tooltip/detail
  - Error probes display `errorCode` (e.g., TIMEOUT, ADAPTER_DISCONNECT) with error indicator style

## Phase 5: Automated Tests

**Scope**: Comprehensive test coverage across all three codebases.

### Test Matrix

| Layer | File | Coverage |
|-------|------|----------|
| Agent | `test_uds_response_parser.py` | `parse_raw_header_payload()`, `classify_response()`, `extract_negative_response()`, `NEGATIVE_RESPONSE_CODES`, NO_DATA handling, malformed handling |
| Agent | `test_control_unit_discovery.py` | Functional discovery, physical discovery, positive/negative/NO_DATA/malformed classification (via parser), **probe-level isolation** (single probe ERROR does not abort scan), **errorCode field** (TIMEOUT, COMMUNICATION_ERROR, UNEXPECTED_PAYLOAD, ADAPTER_DISCONNECT), **adapter disconnect mid-scan** (partial results emitted), confidence assignment, discoveredBy aggregation, scanMode field, forbidden services, max probe count, zero responders, imports from uds_response_parser not reimplementing |
| Agent | `test_scan_events.py` | CONTROL_UNIT_DISCOVERY_READ event emission |
| Backend | `vehicle-data-response.dto.unit.test.ts` | ControlUnitDiscovery validation (valid, missing, malformed, backward compatible, scanMode), **errorCode validation** (known codes accepted, null for non-ERROR statuses) |
| Backend | `vehicle-data.service.unit.test.ts` | processControlUnitDiscovery persistence, merge behavior, backward compatibility, **error isolation** (malformed discovery data does not crash session) |
| Backend | `agent-webhook.controller.unit.test.ts` | CONTROL_UNIT_DISCOVERY_READ event routing |
| Frontend | `ControlUnitsPanel.test.tsx` | Responder rendering, empty state, confidence badges, no ECU names, scanMode display, probe details toggle, **error probes with errorCode display** |
| Frontend | `VehicleHealthPanel.test.tsx` | ControlUnitsPanel integration, conditional rendering |

## Phase 6: Regression & Real Vehicle Validation

**Scope**: Ensure existing features are unaffected and real vehicle testing works.

### Regression Checklist

- [ ] All existing vehicle health PID reads work unchanged (Features 009, 018B)
- [ ] DTC read/clear works unchanged (Features 004, 009B)
- [ ] Readiness monitors work unchanged (Feature 016)
- [ ] Freeze frame data works unchanged (Feature 017)
- [ ] VIN read works unchanged
- [ ] Live data streaming works unchanged (Feature 006)
- [ ] Agent pairing and heartbeat work unchanged
- [ ] Existing `vehicleDataJson` fields are not modified when discovery data is added
- [ ] Sessions without discovery data render correctly in the frontend
- [ ] UDS response parser module is importable and usable independently of discovery module
- [ ] **Single probe failure does not abort the discovery scan** — timeout, communication error, and unexpected payload each produce a probe result with `status: "ERROR"` and appropriate `errorCode`; remaining probes continue
- [ ] **Adapter disconnect mid-scan produces partial results** — failed and remaining probes get `errorCode: "ADAPTER_DISCONNECT"`; all collected probes are persisted; the diagnostic session continues
- [ ] **`errorCode` field is `null` for all non-ERROR probe statuses** (DISCOVERED, NOT_FOUND, UNKNOWN with MALFORMED responseType)
- [ ] **Frontend displays error probes correctly** — probes with `status: "ERROR"` show the `errorCode` in the probe details table

### Toyota Real Vehicle Validation

1. Start PrioraScan backend and frontend
2. Connect desktop agent to ELM327 WiFi on Toyota vehicle
3. Initiate control unit discovery scan
4. Verify functional probe `7DF` → `22F190` returns response
5. Verify physical probes `7E0`-`7E7` → `22F190` return responses or `NO DATA`
6. Verify `7E0` → negative response `7E8037F2211` is classified as DISCOVERED/NEGATIVE with NRC `11`/`SERVICE_NOT_SUPPORTED`
7. Verify `7E1` → `NO DATA` is classified as NOT_FOUND/NO_RESPONSE
8. Verify responder `7E8` has `confidence: HIGH` and `discoveredBy` includes both FUNCTIONAL and PHYSICAL entries
9. Verify `scanMode` is `"FUNCTIONAL_THEN_PHYSICAL"` in the persisted result
10. Verify frontend Control Units panel shows responders (not probes) by default
11. Verify probe details section is accessible and shows all 9 probes
12. Verify no ECU names are inferred (all `ecuName` fields are null)
13. **Verify probe-level isolation** — if a physical probe times out, the remaining probes still execute; the timed-out probe is recorded with `status: "ERROR"`, `responseType: "ERROR"`, `errorCode: "TIMEOUT"`
14. **Verify adapter disconnect mid-scan** — if the adapter disconnects during the scan, partial results are persisted; the failed probe and remaining probes get `errorCode: "ADAPTER_DISCONNECT"`; the session continues

## Dependencies

| Dependency | Type | Notes |
|------------|------|-------|
| `desktop-agent/src/obd/adapter.py` | Import reuse | BaseAdapter interface for send/connect |
| `desktop-agent/src/obd/commands/uds_response_parser.py` | NEW (019) | Reusable UDS parser — consumed by discovery module and future features |
| `desktop-agent/src/obd/commands/control_unit_discovery.py` | NEW (019) | Discovery engine — imports from `uds_response_parser`, does NOT own parsing logic |
| `desktop-agent/src/obd/commands/vehicle_health.py` | Import reuse | Pattern reference for read_orchestrate_result |
| `desktop-agent/src/agent/scan_executor.py` | Modify | Add discovery handler |
| `desktop-agent/src/agent/event_publisher.py` | Import reuse | emit_session_event for CONTROL_UNIT_DISCOVERY_READ |
| `desktop-agent/src/live_data/queue.py` | Modify | Add DISCOVER_CONTROL_UNITS dispatch (reuses existing command queue infrastructure) |
| `backend/src/obd/types/scan-event-type.enum.ts` | Modify | Add new event type |
| `backend/src/live-data/types/live-data-command-type.enum.ts` | Modify | Add new command type (reuses existing LiveDataCommandType — not a new queue) |
| `backend/src/vehicle-data/dtos/vehicle-data-response.dto.ts` | Modify | Extend interfaces (add scanMode) and validator |
| `backend/src/vehicle-data/services/vehicle-data.service.ts` | Modify | Add processControlUnitDiscovery |
| `backend/src/obd/controllers/agent-webhook.controller.ts` | Modify | Route new event type |
| `frontend/src/services/vehicle-data-api.ts` | Modify | Extend VehicleDataJson type (add scanMode) |
| `frontend/src/components/vehicle-data/VehicleHealthPanel.tsx` | Modify | Integrate ControlUnitsPanel |
| Features 009, 016, 017, 018 | No changes | Existing vehicle data modules are read-only, not modified |
| Features 020, 021, 022 (future) | Will consume | `uds_response_parser.py` is shared infrastructure for future UDS features |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| ELM327 timeout on slow vehicles during 9-probe scan | Medium | Medium | Set per-probe timeout (2s default); **each probe is isolated in its own try/except** — timeout produces `status: "ERROR"`, `errorCode: "TIMEOUT"` and the scan continues with remaining probes; return partial results |
| Adapter sends unexpected response format | Medium | Low | `classify_response()` in `uds_response_parser.py` handles all four categories including MALFORMED; **unexpected payloads are caught per-probe and recorded with `errorCode: "UNEXPECTED_PAYLOAD"`**; never crashes |
| Multiple ECUs respond to functional `7DF` | Low | Low | All responses captured; each unique `responseId` becomes a separate responder; `discoveredBy` tracks all sources |
| Adapter disconnects mid-scan | Low | Medium | **Probe-level isolation**: failed probe gets `errorCode: "ADAPTER_DISCONNECT"`; remaining probes that cannot be sent also get `errorCode: "ADAPTER_DISCONNECT"`; partial results are persisted with all probes collected so far; `completedAt` set to disconnect time; never crash |
| `vehicleDataJson` grows large with discovery data | Low | Low | Discovery result is bounded (max 9 probes + max 8 responders in v1); JSONB handles this efficiently |
| Frontend renders stale discovery data | Low | Low | Discovery is a one-shot scan (not streaming); data is immutable once persisted; TanStack Query cache invalidation on refetch |
| UDS parser duplication across features | Low (mitigated) | Medium | Extracted `uds_response_parser.py` in Feature 019 prevents duplication; Features 020-022 will import from it |
| Future developers create parallel command queue for discovery | Low (mitigated) | Medium | Architecture note in plan and code comments documents that `LiveDataCommandType` is the sole agent command mechanism |

## Rollout Sequence

1. **Phase 2** — Desktop Agent Discovery Engine (agent can discover ECUs independently; UDS parser is reusable; each probe is isolated so single failures don't abort the scan)
2. **Phase 3** — Backend Persistence & Contracts (backend can receive and store discovery data)
3. **Phase 4** — Frontend Control Units UI (technicians can see discovered ECUs with scan mode)
4. **Phase 5** — Automated Tests (all test suites pass including UDS parser tests)
5. **Phase 6** — Regression & Real Vehicle Validation (end-to-end verification)