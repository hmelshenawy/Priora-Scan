# Implementation Plan: Freeze Frame Data

**Branch**: `017-freeze-frame-data` | **Date**: 2026-06-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-freeze-frame-data/spec.md`

## Summary

Implement OBD-II Mode 02 PID 01 Freeze Frame Data retrieval in the desktop agent, following the existing PrioraScan pattern (read function → parse function → structured result → VEHICLE_DATA_READ payload). The feature adds `parse_freeze_frame()` as a pure hex parser and `read_freeze_frame()` as the I/O layer, decoding DTC code plus four MVP PIDs (RPM, speed, engine load, coolant temperature) from freeze frame responses. Implementation proceeds using SAE J1979 examples, mock profiles, and standard OBD-II Mode 02 responses. Real Toyota 0201 validation is a required research and regression activity before feature closure, but it is not a prerequisite for implementation.

## Technical Context

**Language/Version**: Python 3.11+ (desktop-agent)

**Primary Dependencies**: pyserial (USB ELM327), socket (WiFi ELM327), pytest (testing)

**Storage**: N/A — no persistence required (FR-009)

**Testing**: pytest with mock adapter profiles

**Target Platform**: Desktop agent (Windows/macOS/Linux) communicating with ELM327 OBD-II adapters

**Project Type**: Desktop agent service (Python package within monorepo)

**Performance Goals**: Freeze frame response decode under 1ms (pure computation, no I/O)

**Constraints**: No Redis, no caching, no external persistence. Single read per request. No ECU Discovery dependency. No UDS dependency.

**Scale/Scope**: 6 mock profiles, 1 shared parser, 5 decoded fields (DTC + 4 PIDs), 3 result states

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] The feature does not contradict `docs/PRD.md`, `docs/SAD.md`, or `docs/FRONTEND_ARCHITECTURE.md` — Freeze frame is a core diagnostic capability within the OBD-II scan workflow.
- [x] Multi-tenant boundaries are defined for all new entities — This is a desktop-agent feature with no multi-tenant concerns. The `FreezeFrameResult` is per-vehicle per-read, not persisted.
- [x] API contracts are specified before backend implementation — The `FreezeFrameResult` shape is defined in the spec (FR-008). No backend API changes are required in this feature (optional additive work).
- [x] AI features include explainability and human-confirmation requirements — N/A, no AI features in this scope.
- [x] No PrioraFlow dependency is introduced for core workflows — Freeze frame is a live ECU read with no external dependencies.
- [x] Error handling and audit logging are included in the design — Edge cases for NO DATA, empty response, invalid hex, partial PIDs, and adapter disconnection are specified (FR-003, FR-006, FR-013).

## Project Structure

### Documentation (this feature)

```text
specs/017-freeze-frame-data/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
desktop-agent/
├── src/
│   ├── obd/
│   │   ├── commands/
│   │   │   ├── vehicle_data.py     # ADD: read_freeze_frame(), parse_freeze_frame()
│   │   │   └── elm_parser.py       # EXISTING: no changes needed (compact_raw_response, is_adapter_error_response)
│   │   ├── mock_profiles/
│   │   │   ├── default.py          # UPDATE: add PID_RESPONSES["0201"] or UNSUPPORTED_COMMANDS.add("0201")
│   │   │   ├── no_faults.py        # UPDATE: add PID_RESPONSES["0201"] or UNSUPPORTED_COMMANDS.add("0201")
│   │   │   ├── with_faults.py      # UPDATE: add PID_RESPONSES["0201"] (with DTC data)
│   │   │   ├── unsupported_vin.py  # UPDATE: add UNSUPPORTED_COMMANDS.add("0201") (unsupported)
│   │   │   ├── toyota_real_sample.py # UPDATE: add PID_RESPONSES["0201"] or UNSUPPORTED_COMMANDS based on probe
│   │   │   ├── toyota_real_faults.py # UPDATE: add PID_RESPONSES["0201"] (with real DTC data)
│   │   │   └── profile_registry.py  # EXISTING: no changes needed
│   │   ├── mock_adapter.py          # EXISTING: no changes needed (PID_RESPONSES lookup handles 0201 automatically)
│   │   └── ...
│   ├── main.py                      # UPDATE: add vehicle_health["freezeFrame"] = read_freeze_frame(adapter)
│   └── ...
├── tests/
│   ├── test_freeze_frame.py         # ADD: new test file for freeze frame parser and edge cases
│   ├── test_mock_profiles.py         # UPDATE: add freeze frame profile tests
│   ├── test_toyota_regression.py     # UPDATE: add PID 0201 regression
│   └── test_vehicle_health_integration.py  # UPDATE: verify freezeFrame shape
└── ...
```

**Structure Decision**: Existing desktop-agent monorepo structure. Changes are confined to `vehicle_data.py` (add read/parse functions), mock profile modules (add `0201` responses), `main.py` (add to event payload), and new test files. No new packages or modules required. Parser and reader are both in `vehicle_data.py`, matching the readiness monitors pattern.

## Design Decisions

1. **Parser-first implementation order**: Known OBD-II examples → Parser tests → Parser implementation → Mock profile updates → Workflow integration. Mock profiles are NOT updated until parser tests pass.

2. **Three-state result model** (per spec corrections):
   - `supported: true, available: true` — freeze frame data exists
   - `supported: true, available: false` — desired state for "no snapshot" (actual ECU behavior TBD)
   - `supported: false, available: false` — Mode 02 unsupported or NO DATA

3. **MVP PID scope limited to 4 PIDs**: DTC + RPM (0C) + Speed (0D) + Engine Load (04) + Coolant Temp (05). Additional PIDs preserved as raw hex, no mandatory decoding.

4. **Shared DTC decoding**: Extract `_decode_dtc_byte_pair()` helper from `parse_dtcs()` to reuse in `parse_freeze_frame()`.

5. **`_send_pid()` reuse**: `read_freeze_frame()` calls `_send_pid(adapter, "02", "01")` following the existing pattern.

6. **Implementation proceeds without Toyota vehicle**: Implementation may proceed using SAE J1979 examples, mock profiles, and standard OBD-II Mode 02 responses. Real Toyota 0201 validation remains a required research and regression activity before feature closure, but it is not a prerequisite for implementation.

## Complexity Tracking

> No constitution violations to justify. All checks pass.