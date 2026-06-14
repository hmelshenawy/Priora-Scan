# Implementation Plan: VIN Unsupported Handler Fix

**Branch**: `012-vin-unsupported-handler` | **Date**: 2026-06-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-vin-unsupported-handler/spec.md`

## Summary

Convert `read_vin()` from a string-or-throw pattern to a typed `VinResult` return that classifies VIN reads as SUPPORTED or UNSUPPORTED. Unsupported VIN responses (all-FF, NO DATA, malformed, empty) return `VinResult.unsupported(reason)` instead of raising `RuntimeError`. Only genuine transport/adapter failures still raise exceptions. Vehicle health workflows (`execute_scan`, `execute_vehicle_data_read`) consume `VinResult` and continue when VIN is unsupported. All existing tests are updated to assert on the new return type.

## Technical Context

**Language/Version**: Python 3.11

**Primary Dependencies**: pytest (existing — no new dependencies)

**Storage**: N/A (in-memory only, no persistence)

**Testing**: pytest (existing test framework)

**Target Platform**: Desktop Agent (Python process on Windows/macOS/Linux)

**Project Type**: Desktop agent (sub-component of PrioraScan)

**Performance Goals**: N/A (function return, no I/O performance implications)

**Constraints**: Must not break existing `VinResult.vin` access for callers; must not change backend API contracts beyond adding optional fields; must not require frontend modifications

**Scale/Scope**: 1 dataclass, 2 function signatures, 2 callers updated, ~15 test assertions updated

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| Does not contradict PRD, SAD, or Frontend Architecture | ✅ PASS | VIN handling is a Desktop Agent internal concern. The backend `vin` event payload gains optional `vinStatus`/`reason` fields — additive, non-breaking. |
| Multi-tenant boundaries defined for new entities | ✅ N/A | VinResult is a runtime value object, not a persisted entity. No multi-tenant implications. |
| API contracts specified before backend implementation | ✅ PASS | The VIN_READ and VEHICLE_DATA_READ event payload contracts are specified in [contracts/vin-result-contract.md](./contracts/vin-result-contract.md). Changes are additive (optional fields). |
| AI features include explainability and human-confirmation | ✅ N/A | No AI features in this scope. |
| No PrioraFlow dependency for core workflows | ✅ PASS | VIN reading is standalone, no external dependency. |
| Error handling and audit logging included | ✅ PASS | Every unsupported VIN case produces a structured result with a reason code. Genuine adapter failures still raise exceptions. The `reason` field provides diagnostic information for logging. |

All gates pass. Proceeding to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/012-vin-unsupported-handler/
├── plan.md                          # This file
├── research.md                      # Phase 0 output
├── data-model.md                    # Phase 1 output
├── quickstart.md                    # Phase 1 output
├── contracts/
│   └── vin-result-contract.md       # Phase 1 output
├── checklists/
│   └── requirements.md              # Spec quality checklist
└── tasks.md                         # Phase 2 output (NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
desktop-agent/
├── src/
│   ├── obd/
│   │   ├── commands/
│   │   │   ├── vin.py               # MODIFIED — add VinResult dataclass, change read_vin/_read_vin_mock
│   │   │   ├── vehicle_data.py      # UNCHANGED
│   │   │   ├── dtc.py               # UNCHANGED
│   │   │   └── clear_dtc.py         # UNCHANGED
│   │   ├── mock_adapter.py          # UNCHANGED
│   │   ├── mock_profiles/            # UNCHANGED
│   │   ├── elm327.py                # UNCHANGED
│   │   └── connection/              # UNCHANGED
│   └── main.py                      # MODIFIED — update execute_scan and execute_vehicle_data_read
├── tests/
│   ├── test_commands.py             # MODIFIED — update VinParser test assertions
│   ├── test_vin_real.py             # MODIFIED — update real adapter VIN test assertions
│   ├── test_mock_profiles.py        # MODIFIED — update VinAllFFHandling test assertions
│   ├── test_mock_obd_adapter.py     # MODIFIED — update read_vin assertion
│   ├── test_scan_events.py          # MODIFIED — update read_vin mock return values
│   └── ...                          # UNCHANGED
└── .env                             # UNCHANGED
```

**Structure Decision**: Single project (Desktop Agent). No backend or frontend changes.

## Complexity Tracking

> No constitution violations. Table not required.