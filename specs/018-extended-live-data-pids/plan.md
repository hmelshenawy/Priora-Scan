# Implementation Plan: Extended Live Data PIDs — Full Pipeline

**Branch**: `018-extended-live-data-pids` | **Date**: 2026-06-15 | **Spec**: [spec-018b.md](./spec-018b.md)

## Summary

Promote the 7 extended PIDs validated in Feature 018A into the production vehicle health pipeline. The desktop agent's `vehicle_health.py` orchestrator will be extended to query extended PIDs alongside existing health PIDs, with a discovery-failure guard that prevents blind querying. Discovery state lives inside each PID result's `reason` field — no top-level metadata fields. Backend DTOs and frontend types will be extended with optional PID fields only. A new "Fuel & Air Data" section will be added to the VehicleHealthPanel with lightweight fuel trim hints. No new database tables, no new API endpoints, no changes to `vehicle_data.py` re-exports, no modifications to 018A validation modules.

## Technical Context

**Language/Version**: Python 3.11+ (desktop-agent), TypeScript (frontend), NestJS/Prisma (backend)

**Primary Dependencies**: Existing `src.obd.commands` modules, `@tanstack/react-query`, `shadcn/ui`

**Storage**: Existing `DiagnosticSession.vehicleDataJson` JSONB column — no schema changes

**Testing**: pytest (agent), Jest (backend/frontend)

**Target Platform**: Desktop (Windows/macOS/Linux) + Web browser (Next.js)

**Project Type**: Full-stack feature — desktop agent module + backend DTO extension + frontend UI component

**Constraints**:
- No modifications to `extended_pids.py`, `pid_validation.py`, `extended_pid_validation_profile.py`, or `toyota_real_sample.py` (018A modules)
- No `vehicle_data.py` re-export changes required
- No new database tables or schema migrations
- No new API endpoints
- No changes to `/obd/scans/:id/results`
- Integration point is `vehicle_health.py` only

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Documentation First**: Spec references PRD health data requirements and SAD vehicle health workflow. No new entities introduced — extended PIDs are added to existing structures.
- [x] **Design Before Implementation**: This plan is the design document. Implementation proceeds after plan approval.
- [x] **Layered Architecture**: Agent reads data → backend persists in JSONB → API exposes via DTO → frontend renders. No business logic in frontend beyond display rules (fuel trim hints).
- [x] **Modular Development**: Feature touches one agent module (`vehicle_health.py`), backend DTOs, frontend component. Cross-module changes are explicitly documented.
- [x] **Code Quality**: Each file modification is small and focused. Fuel trim hint logic is a pure function.
- [x] **Multi-Tenant First**: N/A — vehicle data is scoped to diagnostic sessions which are already tenant-scoped.
- [x] **API First**: No new endpoints. Existing `GET /api/v1/diagnostic-sessions/:sessionId/vehicle-data` is extended with new fields.
- [x] **Scan Source Agnostic**: Extended PID data is part of the standard vehicle health read. Works with any adapter via `BaseAdapter`.
- [x] **AI Assists, Never Decides**: Fuel trim hints are deterministic rules, not AI. No diagnosis, no repair recommendations.
- [x] **Standalone First**: N/A — no PrioraFlow dependency.
- [x] **Auditability**: Vehicle data is persisted in DiagnosticSession with audit records.
- [x] **Security By Default**: Existing auth/tenant guards apply to the existing endpoint. No new endpoints.
- [x] **Progressive Hardware Integration**: Extended PIDs work with any OBD adapter (USB, WiFi, mock).
- [x] **Git & Change Safety**: Feature branch `018-extended-live-data-pids`.
- [x] **Simplicity Over Complexity**: Feature adds 7 data points to an existing pipeline. No new infrastructure.
- [x] **Backend-Centric Business Logic**: Fuel trim hint rules are display-level (frontend). Data flow and persistence are backend-driven.

**Gate Result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/018-extended-live-data-pids/
├── spec.md                  # Feature 018A specification (validation-only)
├── spec-018b.md             # Feature 018B specification (full pipeline)
├── plan.md                  # This file (018A + 018B)
├── research.md              # Phase 0 research (018A)
├── quickstart.md            # Quick reference (018A)
├── checklists/
│   ├── requirements.md       # 018A checklist
│   └── requirements-018b.md # 018B checklist
└── tasks.md                 # Tasks (018A, to be updated for 018B)
```

### Source Code (repository root)

```text
desktop-agent/
├── src/obd/commands/
│   ├── vehicle_health.py              # MODIFY — add extended PID integration
│   ├── extended_pids.py               # EXISTING — DO NOT MODIFY (018A)
│   ├── pid_validation.py              # EXISTING — DO NOT MODIFY (018A)
│   ├── health_pids.py                 # EXISTING — DO NOT MODIFY
│   ├── vehicle_data.py                # EXISTING — DO NOT MODIFY
│   └── supported_pids.py             # EXISTING — DO NOT MODIFY
├── src/obd/mock_profiles/
│   ├── extended_pid_validation_profile.py  # EXISTING — DO NOT MODIFY (018A)
│   ├── toyota_real_sample.py              # EXISTING — DO NOT MODIFY
│   └── profile_registry.py               # EXISTING — may need new test profile
└── src/agent/
    └── scan_executor.py              # MODIFY — add extended PID fields to vehicle_data payload

backend/
├── src/vehicle-data/dtos/
│   └── vehicle-data-response.dto.ts  # MODIFY — add extended PID fields to VehicleDataJson
└── src/vehicle-data/services/
    └── vehicle-data.service.ts        # REVIEW — may need isValidVehicleDataJson update

frontend/
├── src/services/
│   └── vehicle-data-api.ts           # MODIFY — add extended PID fields to VehicleDataJson type
└── src/components/vehicle-data/
    └── VehicleHealthPanel.tsx         # MODIFY — add Fuel & Air Data section + fuel trim hints
```

**Structure Decision**: The integration point for extended PIDs in the agent is `vehicle_health.py`, not `vehicle_data.py`. The `scan_executor.py` already calls `read_vehicle_health()` and enriches it — the extended PID fields will be added to the enrichment step. No `vehicle_data.py` re-export changes are required.

## Phase 0: Research

### Research Tasks

| # | Unknown | Resolution |
|---|---------|------------|
| R1 | How does `read_vehicle_health()` handle discovery failure and how should extended PIDs differ? | `read_vehicle_health()` falls back to attempting all `CONFIGURED_HEALTH_PIDS` when discovery fails. For extended PIDs, FR-019 mandates that discovery failure MUST NOT blindly query extended PIDs — instead, each extended PID is represented as unavailable with reason `PID_DISCOVERY_FAILED`. The standard health PIDs keep their existing fallback behavior. |
| R2 | How does `scan_executor.py` wire the data to the backend? | `execute_vehicle_data_read()` calls `read_vehicle_health()` and enriches the result dict with `fuelSystemStatus`, `readinessMonitors`, `freezeFrame`, `supportedPids`, `mileage`, and `vin`. The extended PID fields will be added to this enrichment step by reading from the `vehicle_health` result dict. |
| R3 | What is the current `VehicleDataJson` interface shape and how do new fields get added? | `VehicleDataJson` is a TypeScript interface in both backend (`vehicle-data-response.dto.ts`) and frontend (`vehicle-data-api.ts`). It has required fields (`batteryVoltage`, `vin`, `readinessMonitors`, `fuelSystemStatus`, `calculatedEngineLoad`, `fuelLevel`, `mileage`, `supportedPids`, `freezeFrame`). New extended PID fields will be added as **optional** fields for backward compatibility. |
| R4 | How does the `VehicleHealthPanel` currently render data? | It renders specific fields from `VehicleDataJson`: batteryVoltage, vin, fuelSystemStatus, calculatedEngineLoad, fuelLevel, mileage, readinessMonitors, freezeFrame, supportedPids. A new "Fuel & Air Data" section will be added as a separate card. |
| R5 | Can `vehicle_health.py` be extended without breaking existing tests? | Yes. The function returns a dict. Adding new keys to the dict is backward-compatible. The existing `result_map` maps PIDs to field names. Extended PIDs will need a similar mapping. The function can be extended to also read extended PIDs and add them to the result. |
| R6 | How should discovery failure be handled for extended PIDs specifically? | When `read_supported_pids()` fails or returns empty Mode 01 PIDs, `read_vehicle_health()` currently falls back to all health PIDs. For extended PIDs, the agent will NOT fall back. Instead, all extended PIDs will be marked as `supported: false, available: false` with a `reason: "PID_DISCOVERY_FAILED"` field. Standard health PIDs keep their fallback behavior unchanged. |

### Research Output

See detailed findings in [research.md](./research.md) (018A research covers reader functions, decode formulas, and result models). Additional 018B-specific research is covered in R1–R6 above.

## Phase 1: Design & Contracts

### Data Model

No new database entities. Extended PID data is stored in the existing `DiagnosticSession.vehicleDataJson` JSONB column.

The `VehicleDataJson` interface is extended with **optional** fields:

```typescript
interface VehicleDataJson {
  // ... existing fields (unchanged) ...
  batteryVoltage: VehicleDataPoint;
  vin: VehicleDataPoint;
  readinessMonitors: { supported: boolean; value: Record<string, ReadinessMonitor> };
  fuelSystemStatus: VehicleDataPoint;
  calculatedEngineLoad: VehicleDataPoint;
  fuelLevel: VehicleDataPoint;
  mileage: VehicleDataPoint;
  supportedPids: { '01': string[]; '09': string[] };
  freezeFrame?: { supported: boolean; available: boolean; value?: { ... } };

  // NEW — Extended PID fields (optional for backward compatibility)
  stftBank1?: VehicleDataPoint;     // PID 06 - Short Term Fuel Trim Bank 1
  ltftBank1?: VehicleDataPoint;     // PID 07 - Long Term Fuel Trim Bank 1
  stftBank2?: VehicleDataPoint;     // PID 08 - Short Term Fuel Trim Bank 2
  ltftBank2?: VehicleDataPoint;     // PID 09 - Long Term Fuel Trim Bank 2
  map?: VehicleDataPoint;           // PID 0B - Intake Manifold Absolute Pressure
  maf?: VehicleDataPoint;           // PID 10 - Mass Air Flow
  throttlePosition?: VehicleDataPoint; // PID 11 - Throttle Position

  // Discovery state lives inside each PID result's `reason` field.
  // No top-level metadata fields (extendedPidsDiscoveryFailed, supportedExtendedPids, unsupportedExtendedPids).
}
```

### Contracts

**No new API endpoints.** The existing `GET /api/v1/diagnostic-sessions/:sessionId/vehicle-data` endpoint returns the extended `VehicleDataJson` with the new optional fields.

The desktop agent `execute_vehicle_data_read()` function already emits a `VEHICLE_DATA_READ` event with the full vehicle health dict. The extended PID fields will be added to this dict before emission.

### Key Design Decisions

1. **Integration point is `vehicle_health.py`**, not `vehicle_data.py`. The `read_vehicle_health()` function will be extended to also read extended PIDs and add them to its result dict. No `vehicle_data.py` re-export changes are required.

2. **Discovery failure guard for extended PIDs**. When `read_supported_pids()` returns empty Mode 01 PIDs, `read_vehicle_health()` falls back to all health PIDs (existing behavior). Extended PIDs, however, are NOT blindly queried. Instead, each extended PID is returned as `{ pid, supported: false, available: false, value: null, unit: "...", rawResponse: null, reason: "PID_DISCOVERY_FAILED" }`. The health scan completes without crashing. No top-level metadata fields are added — discovery state lives inside each PID result's `reason` field.

3. **No top-level metadata fields**. The design does not include `extendedPidsDiscoveryFailed`, `supportedExtendedPids`, or `unsupportedExtendedPids`. Each PID result already contains `supported`, `available`, and `reason` fields, which is sufficient for the frontend to determine state. Adding separate top-level metadata would duplicate information and increase API complexity.

4. **Extended PID fields in scan_executor.py**. After `read_vehicle_health()` returns, the result dict will contain extended PID entries (e.g., `"stftBank1": {...}, "ltftBank1": {...}, ...`). These are already part of the dict that gets emitted via `emit_session_event()`. No code changes to `scan_executor.py` are expected unless a real issue is discovered.

4. **Optional fields in TypeScript**. The new `VehicleDataJson` fields are optional (`?`) to maintain backward compatibility with pre-018B data. The frontend handles missing fields by showing "Not Supported" state.

5. **Fuel & Air Data as a new section**. A separate card/section inside `VehicleHealthPanel`, not mixed into the existing health data grid. This preserves the existing layout and makes the new data visually distinct. The section renders only when at least one extended PID field exists in `VehicleDataJson`. For pre-018B sessions with no extended PID fields, the section is not rendered at all — do not show "Not Supported" for data that was never collected.

6. **Fuel trim hints are deterministic**. A pure function `getFuelTrimHint(value: number | null): string | null` returns `"Normal"`, `"Lean Tendency"`, `"Rich Tendency"`, or `null`. No AI, no diagnosis, no repair recommendations.

7. **No modifications to 018A modules**. The `extended_pids.py` and `pid_validation.py` modules are imported, not modified. The `CONFIGURED_EXTENDED_PIDS` dict and reader functions are reused as-is.

8. **Discovery failure reason field**. Extended PID results that fail due to discovery failure include a `reason: "PID_DISCOVERY_FAILED"` field. This is consistent with the 018A `reason` field pattern (`"NO_DATA"`, `"PREFIX_MISMATCH"`, `"INVALID_RESPONSE"`).

## Implementation Phases

### Phase 1: Agent Integration — Extended PID Polling

**Files**: `desktop-agent/src/obd/commands/vehicle_health.py` (MODIFY)

Extend `read_vehicle_health()` to also read extended PIDs:

1. Import `CONFIGURED_EXTENDED_PIDS`, `EXTENDED_PID_NAMES`, `EXTENDED_PID_UNITS` from `extended_pids.py`.
2. After reading standard health PIDs, read extended PIDs:
   - If `discovery_ok` (supported_mode01 is non-empty): iterate `CONFIGURED_EXTENDED_PIDS`, read supported PIDs, mark unsupported PIDs. For supported PIDs where the reader returns `supported: False`, add `reason: "NO_DATA"` / `"PREFIX_MISMATCH"` / `"INVALID_RESPONSE"` (reuse `_classify_unavailable_reason` logic from `pid_validation.py` or inline the classification).
   - If `not discovery_ok`: set all extended PIDs to `{ pid, supported: false, available: false, value: null, unit: "...", reason: "PID_DISCOVERY_FAILED" }`.
3. Add an `extendedPidsDiscoveryFailed` boolean to the result dict (true if discovery failed).
4. Map extended PIDs to their field names (`stftBank1`, `ltftBank1`, `stftBank2`, `ltftBank2`, `map`, `maf`, `throttlePosition`) and add to the result dict. No top-level metadata fields (`supportedExtendedPids`, `unsupportedExtendedPids`, `extendedPidsDiscoveryFailed`) — discovery state lives inside each PID result's `reason` field.

**No existing behavior changes.** Standard health PIDs keep their fallback behavior. The extended PID logic is additive.

### Phase 2: Agent — Scan Executor Verification

**Files**: `desktop-agent/src/agent/scan_executor.py` (READ-ONLY, no changes expected)

Verify that `execute_vehicle_data_read()` passes through `read_vehicle_health()` results unchanged. The extended PID fields flow through automatically because they're part of the dict that gets emitted via `emit_session_event()`. No code changes expected. No documentation comments required. Modify only if a real issue is discovered.

### Phase 3: Backend — DTO Extension

**Files**:
- `backend/src/vehicle-data/dtos/vehicle-data-response.dto.ts` (MODIFY)
- `backend/src/vehicle-data/services/vehicle-data.service.ts` (REVIEW)

1. Add optional extended PID fields to the `VehicleDataJson` interface: `stftBank1?`, `ltftBank1?`, `stftBank2?`, `ltftBank2?`, `map?`, `maf?`, `throttlePosition?`. No top-level metadata fields (`extendedPidsDiscoveryFailed`, `supportedExtendedPids`, `unsupportedExtendedPids`).
2. Update `isValidVehicleDataJson()` to accept but not require the new optional fields. Extended PID results may contain an optional `reason` field — this must be accepted.
3. Verify the backend's `processVehicleDataRead()` correctly persists the new fields to `vehicleDataJson` (since it's JSONB, this should work without schema changes).

### Phase 4: Frontend — Type Extension

**Files**: `frontend/src/services/vehicle-data-api.ts` (MODIFY)

1. Add optional extended PID fields to the frontend `VehicleDataJson` interface matching the backend DTOs. No top-level metadata fields.
2. Ensure the `useVehicleData()` hook returns the extended fields as part of the response.

### Phase 5: Frontend — Fuel & Air Data Section

**Files**: `frontend/src/components/vehicle-data/VehicleHealthPanel.tsx` (MODIFY)

1. Add a new `FuelAndAirDataCard` sub-component (can be inline or a separate file).
2. Render STFT Bank 1, LTFT Bank 1, STFT Bank 2, LTFT Bank 2, MAP, MAF, Throttle Position.
3. Handle three states per field: supported+available (show value+unit), supported+unavailable (show "No Data"), unsupported (show "Not Supported").
4. Handle missing fields gracefully (pre-018B data).
5. Add fuel trim hint logic:
   - `getFuelTrimHint(value: number | null): string | null`
   - -10% to +10% → "Normal"
   - Above +10% → "Lean Tendency"
   - Below -10% → "Rich Tendency"
   - null/undefined → no hint
6. Render hints as subtle badges next to fuel trim values. No diagnosis, no AI language, no repair recommendations.
7. Handle discovery failure PIDs: when a PID result has `supported: false, available: false, reason: "PID_DISCOVERY_FAILED"`, show "Not Available".
8. For pre-018B sessions where no extended PID fields exist, do not render the Fuel & Air Data section at all. Do not show "Not Supported" for data that was never collected.

### Phase 6: Tests

**Files**:
- `desktop-agent/tests/test_vehicle_health_integration.py` (MODIFY — add extended PID assertions)
- `desktop-agent/tests/test_extended_pids.py` (EXISTING — 018A tests, must pass unchanged)
- `desktop-agent/tests/test_pid_validation.py` (EXISTING — 018A tests, must pass unchanged)
- `backend/src/vehicle-data/dtos/__tests__/vehicle-data-response.dto.spec.ts` (NEW or MODIFY — test DTO validation)
- `frontend/src/components/vehicle-data/__tests__/VehicleHealthPanel.test.tsx` (NEW or MODIFY — test rendering)
- `frontend/src/services/__tests__/vehicle-data-api.test.ts` (MODIFY — test type handling)

#### Agent Tests

1. **Extended PID polling with all supported PIDs**: Run `read_vehicle_health()` with the `extended_pid_validation` profile. Verify all 7 extended PID fields appear in the result with correct values.
2. **Extended PID polling with partial support**: Run with a profile that only supports some extended PIDs. Verify unsupported PIDs have `supported: false` and no OBD command is sent.
3. **Discovery failure guard**: Run with a mock that returns empty Mode 01 PIDs. Verify standard health PIDs still attempt their fallback. Verify all extended PIDs have `supported: false, available: false, reason: "PID_DISCOVERY_FAILED"`. No top-level metadata fields (`extendedPidsDiscoveryFailed`, `supportedExtendedPids`, `unsupportedExtendedPids`) in the result.
4. **Toyota regression still passes**: Existing `test_vehicle_health_integration.py` and `test_toyota_regression.py` pass unchanged.

#### Backend Tests

1. **VehicleDataJson with extended fields**: Verify `isValidVehicleDataJson()` accepts payloads with extended PID fields. Each field should have the `VehicleDataPoint` shape with `supported`, `available`, and optional `reason`.
2. **VehicleDataJson without extended fields**: Verify `isValidVehicleDataJson()` still accepts payloads without extended PID fields (backward compatibility).
3. **API response includes extended fields**: Verify the vehicle data API returns extended PID fields when present in the JSONB.
4. **Discovery failure in PID results**: Verify `isValidVehicleDataJson()` accepts payloads where extended PID fields have `supported: false, available: false, reason: "PID_DISCOVERY_FAILED"`. No top-level metadata fields are required.

#### Frontend Tests

1. **Fuel & Air Data renders with supported values**: Given all extended PIDs supported and available, the section displays all 7 values with units.
2. **Unsupported PIDs show "Not Supported"**: Given some PIDs unsupported, the section displays "Not Supported" for those PIDs.
3. **Unavailable PIDs show "No Data"**: Given some PIDs supported but unavailable, the section displays "No Data".
4. **Missing fields handled safely**: Given pre-018B data without extended PID fields, the Fuel & Air Data section is not rendered at all (not shown with "Not Supported" for data that was never collected).
5. **Discovery failure shows "Not Available"**: Given extended PID fields with `supported: false, available: false, reason: "PID_DISCOVERY_FAILED"`, the section displays "Not Available" for each discovery-failed PID. No top-level `extendedPidsDiscoveryFailed` flag is used.
6. **Fuel trim hints render correctly**: Given fuel trim values at -15%, 0%, +15%, verify "Rich Tendency", "Normal", "Lean Tendency" badges appear.

### Phase 7: Polish & Regression Verification

**Files**: None (verification only)

1. Run full desktop-agent test suite: `cd desktop-agent && python -m pytest tests/ -v`
2. Run full backend test suite: `cd backend && npm run test`
3. Run full frontend type check: `cd frontend && npm run type-check`
4. Verify no modifications to 018A modules: `extended_pids.py`, `pid_validation.py`, `extended_pid_validation_profile.py`, `toyota_real_sample.py`
5. Verify `read_vehicle_health()` works with `MockObdAdapter(profile_name="extended_pid_validation")` and returns extended PID fields.
6. Verify Toyota regression tests pass unchanged.

## Dependencies

| Dependency | Type | Notes |
|---|---|---|
| `extended_pids.CONFIGURED_EXTENDED_PIDS` | Import reuse | Dict of PID hex codes to reader functions from 018A |
| `extended_pids.EXTENDED_PID_NAMES` | Import reuse | Dict of PID hex codes to display names |
| `extended_pids.EXTENDED_PID_UNITS` | Import reuse | Dict of PID hex codes to units |
| `extended_pids.read_stft_bank1` etc. | Import reuse | 7 reader functions from 018A |
| `health_pids._unsupported_pid_result` | Import reuse | Three-state result factory — unsupported |
| `health_pids._unavailable_pid_result` | Import reuse | Three-state result factory — supported but unavailable |
| `supported_pids.read_supported_pids` | Import reuse | PID bitmap discovery |
| `vehicle_health.read_vehicle_health` | Modify | Extend to include extended PID polling |
| `vehicle_data.py` | No changes | NOT a re-export target for extended PIDs |
| Backend `VehicleDataJson` DTO | Modify | Add optional extended PID fields (7 fields only, no metadata fields) |
| Frontend `vehicle-data-api.ts` | Modify | Add optional extended PID fields (7 fields only, no metadata fields) |
| Frontend `VehicleHealthPanel.tsx` | Modify | Add Fuel & Air Data section |

## Test Strategy

| Test Type | File | Coverage |
|---|---|---|
| Agent — Extended PID polling | `test_vehicle_health_integration.py` (modify) | All 7 PIDs with supported/unsupported/NO DATA scenarios |
| Agent — Discovery failure | `test_vehicle_health_integration.py` (modify) | Extended PIDs marked unavailable with reason when discovery fails |
| Agent — Toyota regression | `test_toyota_regression.py` (existing) | Must pass unchanged |
| Agent — 018A validation | `test_extended_pids.py`, `test_pid_validation.py` (existing) | Must pass unchanged |
| Backend — DTO validation | `vehicle-data-response.dto.spec.ts` (new/modify) | VehicleDataJson with/without extended fields |
| Backend — API response | Integration test | Extended fields present in API response |
| Frontend — Type safety | `vehicle-data-api.test.ts` (modify) | Type handling for optional extended fields |
| Frontend — Rendering | `VehicleHealthPanel.test.tsx` (new/modify) | Fuel & Air Data section, state handling, fuel trim hints |
| Frontend — Backward compat | `VehicleHealthPanel.test.tsx` (new/modify) | Pre-018B data without extended fields |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Extending `read_vehicle_health()` breaks existing health PID behavior | Low | High | Additive-only changes. Standard health PIDs keep their fallback behavior. Extended PIDs have separate logic. Comprehensive regression tests. |
| Discovery failure guard introduces inconsistency | Low | Medium | Standard health PIDs fall back to all configured PIDs. Extended PIDs are NOT blindly queried. Each PID result contains `reason: "PID_DISCOVERY_FAILED"` to document the state. |
| Backend `isValidVehicleDataJson()` rejects new fields | Low | Medium | New fields are optional. Update validation to accept but not require them. Test with and without extended fields. |
| Frontend crashes on pre-018B data | Low | High | All extended PID fields are optional in TypeScript types. Fuel & Air Data section only renders when at least one extended PID field exists. Pre-018B sessions don't show the section at all. |
| Fuel trim hints are interpreted as diagnosis | Medium | Low | Hints are labeled as "Normal" / "Lean Tendency" / "Rich Tendency" — explicitly NOT diagnostic. No repair recommendations. No AI language. |
| 018A modules are accidentally modified | Low | High | `extended_pids.py` and `pid_validation.py` are imported, not modified. Regression tests verify they pass unchanged. |
| Missing metadata fields cause confusion | Low | Low | Discovery state lives inside each PID result's `reason` field. No separate `extendedPidsDiscoveryFailed`, `supportedExtendedPids`, or `unsupportedExtendedPids` fields are needed — each PID result is self-contained. |

## Rollout Sequence

1. **Phase 1** — Agent integration: Extend `vehicle_health.py` to read extended PIDs with discovery failure guard
2. **Phase 2** — Agent verification: Ensure scan_executor passes extended fields through
3. **Phase 3** — Backend DTO: Add optional extended PID fields to VehicleDataJson
4. **Phase 4** — Frontend types: Add optional extended PID fields to vehicle-data-api.ts
5. **Phase 5** — Frontend UI: Add Fuel & Air Data section to VehicleHealthPanel with hints
6. **Phase 6** — Tests: Agent integration tests, backend DTO tests, frontend rendering tests
7. **Phase 7** — Polish: Full regression suite verification

Phases 1–2 are agent-only (no backend/frontend changes). Phases 3–4 are backend/frontend type changes. Phase 5 is UI. Phase 6 is test coverage. Phase 7 is regression verification.

## Toyota Real-Vehicle Validation Procedure

After all tests pass, run the validation on a real vehicle:

1. Connect ELM327 adapter to the vehicle (USB or WiFi)
2. Start the desktop agent and trigger a vehicle health read from the UI
3. Verify the Fuel & Air Data section appears in VehicleHealthPanel
4. Verify each extended PID shows the correct value, "No Data", or "Not Supported"
5. Verify fuel trim hints appear correctly for values outside -10% to +10%
6. Verify the vehicle data API response includes extended PID fields
7. Compare values with a known OBD-II scan tool if available
8. Record the support matrix for Feature 018B planning documentation