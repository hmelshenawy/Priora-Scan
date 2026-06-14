# Implementation Plan: Realistic OBD Mock Profiles

**Branch**: `011-obd-mock-profiles` | **Date**: 2026-06-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-obd-mock-profiles/spec.md`

## Summary

Replace the hardcoded `MockObdAdapter.send()` with a profile-based system where each mock vehicle is a self-contained module file. Developers select a profile via `OBD_MOCK_PROFILE` environment variable. The adapter delegates response generation to the active profile, with a registry that validates and loads profiles at startup. The `default` profile reproduces the current `MockObdAdapter` behavior exactly for backward compatibility. Six profiles ship initially: `default`, `toyota_real_sample`, `no_faults`, `with_faults`, `unsupported_vin`, `toyota_real_faults`. Profiles store raw OBD response bytes (not decoded values) so the same parser code exercises both mock and real vehicle paths. No backend or frontend changes are required.

## Technical Context

**Language/Version**: Python 3.11

**Primary Dependencies**: httpx, pyserial, python-dotenv (existing — no new dependencies)

**Storage**: N/A (in-memory mock data only, no persistence)

**Testing**: pytest (existing test framework)

**Target Platform**: Desktop Agent (Python process on Windows/macOS/Linux)

**Project Type**: Desktop agent (sub-component of a web application)

**Performance Goals**: N/A (mock profiles are in-memory lookups, sub-millisecond response)

**Constraints**: Must not break existing tests; must not change backend API contracts; must not require frontend modifications

**Scale/Scope**: 6 mock profiles, ~6-8 PID responses per profile, 1 registry module, 1 adapter refactor

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| Does not contradict PRD, SAD, or Frontend Architecture | ✅ PASS | Mock profiles are a Desktop Agent internal concern. No PRD/SAD/frontend changes needed. |
| Multi-tenant boundaries defined for new entities | ✅ N/A | Mock profiles have no multi-tenant implications — they are development-only, not user-facing data. |
| API contracts specified before backend implementation | ✅ N/A | No new API endpoints. Existing Desktop Agent → Backend contracts unchanged. |
| AI features include explainability and human-confirmation | ✅ N/A | No AI features in this scope. |
| No PrioraFlow dependency for core workflows | ✅ PASS | Mock profiles are standalone, no external dependency. |
| Error handling and audit logging included | ✅ PASS | Invalid profile falls back to `default` with logged warning. Missing PID returns `b""` (NO DATA equivalent). |

All gates pass. Proceeding to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/011-obd-mock-profiles/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
desktop-agent/
├── src/
│   ├── obd/
│   │   ├── mock_profiles/           # NEW — profile modules
│   │   │   ├── __init__.py          # NEW — exports profile registry
│   │   │   ├── profile_registry.py  # NEW — loads/validates/returns active profile
│   │   │   ├── default.py           # NEW — reproduces current MockObdAdapter behavior
│   │   │   ├── toyota_real_sample.py # NEW — captured Toyota vehicle data (no faults)
│   │   │   ├── toyota_real_faults.py # NEW — captured Toyota data + fault codes
│   │   │   ├── no_faults.py         # NEW — clean vehicle with valid VIN
│   │   │   ├── with_faults.py       # NEW — vehicle with P0301, P0171, U0100
│   │   │   └── unsupported_vin.py   # NEW — vehicle with all-FF VIN payload
│   │   ├── mock_adapter.py          # MODIFIED — delegates to active profile
│   │   ├── adapter.py               # UNCHANGED
│   │   ├── elm327.py                # UNCHANGED
│   │   ├── wifi_elm327.py           # UNCHANGED
│   │   ├── connection/              # UNCHANGED
│   │   └── commands/                # UNCHANGED
│   ├── config.py                    # MODIFIED — add OBD_MOCK_PROFILE config
│   └── main.py                      # UNCHANGED (adapter factory unchanged)
├── tests/
│   ├── test_mock_obd_adapter.py     # MODIFIED — update for profile delegation
│   ├── test_mock_profiles.py        # NEW — profile registry and profile tests
│   ├── test_wifi_connection.py      # UNCHANGED
│   └── ...                          # UNCHANGED
└── .env                             # MODIFIED — add OBD_MOCK_PROFILE entry
```

**Structure Decision**: Single project (Desktop Agent). No backend or frontend changes.

## Complexity Tracking

> No constitution violations. Table not required.