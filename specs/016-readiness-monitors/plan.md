# Implementation Plan: Readiness Monitors

**Branch**: `016-readiness-monitors` | **Date**: 2026-06-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-readiness-monitors/spec.md`

## Summary

Refactor and strengthen the existing `read_readiness_monitors()` function in the desktop agent to fully decode OBD-II Mode 01 PID 01 readiness monitor responses. The current implementation decodes monitor availability/completion but does NOT extract MIL status or DTC count. This feature adds MIL/DTC count extraction, improves the result shape to match the `ReadinessResult` entity, extracts a shared `parse_readiness_monitors()` parser, removes the unused `READINESS_MONITORS` attribute from mock profiles, and ensures mock/real parser consistency. A real Toyota vehicle probe for PID 0101 is required during Phase 0.

## Technical Context

**Language/Version**: Python 3.11+ (desktop-agent)

**Primary Dependencies**: pyserial (USB ELM327), socket (WiFi ELM327), pytest (testing)

**Storage**: N/A — no persistence required (FR-009)

**Testing**: pytest with mock adapter profiles

**Target Platform**: Desktop agent (Windows/macOS/Linux) communicating with ELM327 OBD-II adapters

**Project Type**: Desktop agent service (Python package within monorepo)

**Performance Goals**: PID 0101 response decode under 1ms (pure computation, no I/O)

**Constraints**: No Redis, no caching, no external persistence. Single read per request.

**Scale/Scope**: 6 mock profiles, 1 shared parser, 11 standard SAE J1979 monitors

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] The feature does not contradict `docs/PRD.md`, `docs/SAD.md`, or `docs/FRONTEND_ARCHITECTURE.md` — Readiness monitors are a core diagnostic capability within the OBD-II scan workflow.
- [x] Multi-tenant boundaries are defined for all new entities — This is a desktop-agent feature with no multi-tenant concerns. The `ReadinessResult` is per-vehicle per-read, not persisted.
- [x] API contracts are specified before backend implementation — The `ReadinessResult` shape is defined in the spec (FR-005). No backend API changes are required in this feature (optional additive work).
- [x] AI features include explainability and human-confirmation requirements — N/A, no AI features in this scope.
- [x] No PrioraFlow dependency is introduced for core workflows — Readiness is a live ECU read with no external dependencies.
- [x] Error handling and audit logging are included in the design — Edge cases for NO DATA, empty response, invalid length, and adapter disconnection are specified (FR-006).

## Project Structure

### Documentation (this feature)

```text
specs/016-readiness-monitors/
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
│   │   │   ├── vehicle_data.py     # REFACTOR: read_readiness_monitors(), ADD: parse_readiness_monitors()
│   │   │   └── elm_parser.py        # EXISTING: shared parser utilities (no changes needed)
│   │   ├── mock_profiles/
│   │   │   ├── default.py           # REMOVE: READINESS_MONITORS attribute
│   │   │   ├── no_faults.py         # REMOVE: READINESS_MONITORS attribute
│   │   │   ├── with_faults.py       # REMOVE: READINESS_MONITORS attribute
│   │   │   ├── unsupported_vin.py   # REMOVE: READINESS_MONITORS attribute
│   │   │   ├── toyota_real_sample.py # REMOVE: READINESS_MONITORS attribute, ADD: 0101 PID data
│   │   │   ├── toyota_real_faults.py # REMOVE: READINESS_MONITORS attribute, ADD: 0101 PID data
│   │   │   └── profile_registry.py  # EXISTING: no changes needed
│   │   ├── mock_adapter.py          # EXISTING: no changes needed
│   │   └── ...
│   ├── main.py                      # EXISTING: readinessMonitors in event payload (may need shape update)
│   └── ...
├── tests/
│   ├── test_readiness_monitors.py   # ADD: new test file for readiness parser and edge cases
│   ├── test_mock_profiles.py        # UPDATE: add readiness monitor tests
│   ├── test_toyota_regression.py    # UPDATE: add PID 0101 regression
│   └── test_vehicle_health_integration.py  # UPDATE: verify readinessMonitors shape
└── ...
```

**Structure Decision**: Existing desktop-agent monorepo structure. Changes are confined to `vehicle_data.py`, mock profile modules, and new test files. No new packages or modules required.

## Complexity Tracking

> No constitution violations to justify. All checks pass.