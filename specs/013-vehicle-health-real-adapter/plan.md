# Implementation Plan: Vehicle Health Real Adapter Integration

**Branch**: `013-vehicle-health-real-adapter` | **Date**: 2026-06-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-vehicle-health-real-adapter/spec.md`

## Summary

Integrate real WiFi ELM327 adapter probe logic into the production Vehicle Health read flow. The desktop agent must discover supported PIDs from the connected vehicle using Mode 01 bitmap chain-following (0100 → 0120 → 0140, stopping when the chain ends), then read only supported configured health PIDs. Each PID result distinguishes vehicle capability (`supported`) from per-read availability (`available`). Unsupported PIDs and VIN are reported as unsupported rather than failing the read. No Redis, cache, or persistent storage is introduced — discovery is runtime-only. The Toyota mock profile must be fixed to include 0120/0140 bitmap responses that are consistent with its 0100 bitmap declaring bit 32 set.

## Technical Context

**Language/Version**: Python 3.12 (desktop agent), TypeScript 5.x / NestJS (backend), Next.js 14 (frontend)

**Primary Dependencies**: pytest (agent tests), dataclasses (Python), NestJS/Prisma (backend), React/TanStack Query (frontend)

**Storage**: PostgreSQL (existing, not extended in this feature). No new tables. Runtime-only PID discovery.

**Testing**: pytest (desktop-agent unit tests), React Testing Library (frontend — optional)

**Target Platform**: Windows desktop (agent), Node.js server (backend), Browser (frontend)

**Project Type**: Desktop agent + Web application (agent is primary scope; backend/frontend are optional additive work)

**Performance Goals**: PID discovery + health read completes in under 10 seconds for a real vehicle connection

**Constraints**: No Redis, no cache infrastructure, no external capability databases, no persistent VehicleCapabilityProfile table

**Scale/Scope**: Single vehicle per read, 6 configured health PIDs, 3 bitmap discovery commands max

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] The feature does not contradict `docs/PRD.md`, `docs/SAD.md`, or `docs/FRONTEND_ARCHITECTURE.md` — Vehicle Health read is a documented workflow in SAD Feature 009. PID capability discovery is the natural next step for real adapter integration.
- [x] Multi-tenant boundaries are defined for all new entities — PidCapability and HealthPidResult are runtime data within a single diagnostic session, scoped to the agent's vehicle connection. No cross-tenant data.
- [x] API contracts are specified before backend implementation — Backend changes are optional additive work. The agent event payload is documented in contracts/.
- [x] AI features include explainability and human-confirmation requirements — No AI features in this scope.
- [x] No PrioraFlow dependency is introduced for core workflows — Vehicle Health read is fully standalone.
- [x] Error handling and audit logging are included in the design — Unsupported PIDs/VIN are non-blocking results. Transport errors remain exceptions.

## Project Structure

### Documentation (this feature)

```text
specs/013-vehicle-health-real-adapter/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── health-pid-result-contract.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
desktop-agent/
├── src/
│   ├── obd/
│   │   ├── commands/
│   │   │   ├── vehicle_data.py      # PID readers (modify: add RPM/speed/coolant readers, refactor discovery)
│   │   │   ├── elm_parser.py         # Pure-function parser (minor: add bitmap chain-following)
│   │   │   └── vin.py               # VIN reader (no changes)
│   │   ├── mock_profiles/
│   │   │   └── toyota_real_sample.py # Mock profile (modify: add 0120/0140 bitmap responses, remove 0120 from UNSUPPORTED_COMMANDS)
│   │   └── adapter.py               # BaseAdapter interface (no changes)
│   └── main.py                       # Agent entry (modify: rewrite execute_vehicle_data_read)
├── tests/
│   ├── test_commands.py              # Existing tests (extend)
│   ├── test_pid_discovery.py         # NEW: PID capability discovery tests
│   ├── test_vehicle_health_integration.py  # NEW: end-to-end health read tests
│   └── test_toyota_regression.py     # NEW: SC-009 regression test

backend/                               # Optional additive work (may defer)
├── src/vehicle-data/
│   └── dtos/vehicle-data-response.dto.ts  # Extend VehicleDataJson interface

frontend/                              # Optional additive work (may defer)
├── src/components/vehicle-data/
│   └── VehicleHealthPanel.tsx         # Add RPM/speed/coolant rows
```

**Structure Decision**: The primary work is in `desktop-agent/src/obd/commands/` and `desktop-agent/src/main.py`. Backend and frontend changes are additive and may be deferred. No new modules are created — the PID discovery logic extends the existing `vehicle_data.py`, and the health read orchestration stays in `main.py`.

## Complexity Tracking

> No constitution violations to justify. All changes stay within existing module boundaries.

## Post-Phase 1 Constitution Re-Check

- [x] The feature does not contradict `docs/PRD.md`, `docs/SAD.md`, or `docs/FRONTEND_ARCHITECTURE.md` — No new entities or API endpoints introduced. Only runtime data structures within existing agent workflows.
- [x] Multi-tenant boundaries are defined for all new entities — PidCapability and HealthPidResult are per-session runtime data. No persistent storage.
- [x] API contracts are specified before backend implementation — `contracts/health-pid-result-contract.md` defines the HealthPidResult shape and VEHICLE_DATA_READ event payload extension.
- [x] AI features include explainability and human-confirmation requirements — No AI features.
- [x] No PrioraFlow dependency is introduced for core workflows — Vehicle Health read is fully standalone.
- [x] Error handling and audit logging are included in the design — Three-state model (unsupported/unavailable/available) handles all failure modes. Transport errors remain exceptions.

## Notes

**SC-009 Hex Correction Applied**: The original SC-009 listed `0104 → 41045E` but `0x5E` = 94 gives 36.9%, not the expected 46.3%. Corrected to `0104 → 410476` where `0x76` = 118 gives `118 * 100 / 255 = 46.3%`, matching the Toyota mock profile's verified real capture data.

**Bitmap `4100BE1FB813` Verification**: The 0100 bitmap response `BE1FB813` was verified bit-by-bit. Last byte `0x13` = `00010011` has bit 0 (value 1) set, confirming bit 32 of the 32-bit mask is 1. Per SAE J1979, PID 0120 MUST be queried. The Toyota mock profile previously had `0120` in UNSUPPORTED_COMMANDS, which contradicted its own bitmap. This inconsistency is fixed by T001: `0120` is moved to PID_RESPONSES with bitmap `412000000001` (chain continues to 0140), and `0140` is added with bitmap `414040000000` (PID 0x42 supported, chain stops). PID 0x2F (Fuel Level, in 0120 range) and PID 0x42 (Voltage, in 0140 range) both require proper chain-following to be correctly classified.