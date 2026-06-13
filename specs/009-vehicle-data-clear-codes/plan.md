# Implementation Plan: Vehicle Health & DTC Clear

**Branch**: `009-vehicle-data-clear-codes` | **Date**: 2026-06-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/009-vehicle-data-clear-codes/spec.md`

## Summary

Feature 009 adds two diagnostic capabilities: (1) one-shot vehicle health data reads (battery voltage, VIN confirmation, readiness monitors, fuel system status, calculated engine load, fuel level, mileage, supported PID list) stored as a JSONB snapshot on the Diagnostic Session, and (2) safe clearing of fault codes via OBD-II Mode 04 with mandatory user confirmation, audit trail, and re-scan workflow. Both capabilities extend the existing Desktop Agent command queue and event-push pattern. The feature avoids two dedicated tables (VehicleData, DtcClearRequest) by using JSONB on DiagnosticSession and existing audit records, reducing schema and service-layer overhead.

## Technical Context

**Language/Version**: TypeScript 5.x (backend: NestJS, frontend: Next.js)

**Primary Dependencies**: NestJS, Prisma ORM, Next.js, TanStack Query, shadcn/ui, Zod

**Storage**: PostgreSQL (Prisma ORM), JSONB columns for vehicle data snapshot

**Testing**: Jest (unit), integration tests via supertest, React Testing Library (frontend)

**Target Platform**: Web application (Next.js SSR/CSR + NestJS API)

**Project Type**: Web application (monorepo with backend/ and frontend/)

**Performance Goals**: Vehicle data read completes within 30 seconds; DTC clear result within 60 seconds

**Constraints**: Multi-tenant isolation on all new data; no direct browser-to-adapter communication; agent command queue reuse

**Scale/Scope**: Single workshop with ~5 concurrent sessions (MVP)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Evidence |
|---|---|---|
| Does not contradict PRD/SAD/FRONTEND_ARCHITECTURE | ✅ PASS | Vehicle health and DTC clear are diagnostic workflow extensions within the OBD session context. SAD defines Diagnostic Session and fault code entities. |
| Multi-tenant boundaries defined for all new entities | ✅ PASS | `vehicleDataJson` on `DiagnosticSession` inherits tenant scope via `organizationId`. DTC clear audit records use existing `DiagnosticSessionAuditRecord` with `organizationId`. |
| API contracts specified before backend implementation | ✅ PASS | Vehicle data API contract and DTC clear API contract defined in `contracts/`. Both specify endpoints, request/response shapes, error codes, and agent event types. |
| AI features include explainability and human-confirmation | ⬜ N/A | No AI features in this spec. |
| No PrioraFlow dependency for core workflows | ✅ PASS | All functionality is standalone. No PrioraFlow integration. |
| Error handling and audit logging included | ✅ PASS | VEHICLE_DATA_READ_REQUESTED/COMPLETED and DTC_CLEAR_REQUESTED/COMPLETED/FAILED audit events. Confirmation modal for DTC clear. Failure banners for both features. |

## Project Structure

### Documentation (this feature)

```text
specs/009-vehicle-data-clear-codes/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── vehicle-data-api-contract.md
│   └── dtc-clear-api-contract.md
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── obd/                          # Existing — extended
│   │   ├── types/
│   │   │   ├── scan-event-type.enum.ts      # Add VEHICLE_DATA_READ, DTC_CLEARED, DTC_CLEAR_FAILED
│   │   │   └── scan-command-type.enum.ts    # NEW: READ_VEHICLE_DATA, CLEAR_DTC
│   │   ├── services/
│   │   │   └── obd-scan.service.ts          # Existing — extended for vehicle data & clear commands
│   │   ├── controllers/
│   │   │   └── agent-webhook.controller.ts  # Existing — handle new event types
│   │   └── obd.module.ts                    # Existing — register new providers
│   ├── vehicle-data/                 # NEW module
│   │   ├── vehicle-data.module.ts
│   │   ├── controllers/
│   │   │   └── vehicle-data.controller.ts  # POST .../vehicle-data/read, GET .../vehicle-data
│   │   ├── services/
│   │   │   └── vehicle-data.service.ts      # Queue read, process results, build JSONB
│   │   ├── dtos/
│   │   │   ├── vehicle-data-response.dto.ts
│   │   │   └── vehicle-data-point.dto.ts
│   │   └── repositories/
│   │       └── vehicle-data.repository.ts   # Read/write vehicleDataJson on DiagnosticSession
│   ├── dtc-clear/                    # NEW module
│   │   ├── dtc-clear.module.ts
│   │   ├── controllers/
│   │   │   └── dtc-clear.controller.ts      # POST .../fault-codes/clear
│   │   ├── services/
│   │   │   └── dtc-clear.service.ts         # Queue clear, prevent concurrent, process result
│   │   └── dtos/
│   │       └── dtc-clear-response.dto.ts
│   └── live-data/                    # Existing — pid-decoder reused for one-shot reads
│       └── services/
│           └── pid-decoder.service.ts
├── tests/
│   ├── unit/
│   │   ├── vehicle-data/
│   │   │   └── vehicle-data.service.unit.test.ts
│   │   └── dtc-clear/
│   │       └── dtc-clear.service.unit.test.ts
│   ├── integration/
│   │   ├── vehicle-data/
│   │   │   └── vehicle-data.controller.integration.test.ts
│   │   └── dtc-clear/
│   │       └── dtc-clear.controller.integration.test.ts
│   └── security/
│       └── vehicle-data-dtc-clear.tenant-isolation.test.ts
└── prisma/
    └── migrations/
        └── 20260613_add_vehicle_data_json/   # New migration

frontend/
├── src/
│   ├── components/
│   │   ├── vehicle-data/             # NEW
│   │   │   ├── VehicleHealthPanel.tsx       # Main panel with data points + Read button
│   │   │   ├── VehicleDataPointRow.tsx      # Single data point row (value or "Not supported")
│   │   │   ├── SupportedPidList.tsx         # Expandable PID list section
│   │   │   └── __tests__/
│   │   │       └── VehicleHealthPanel.test.tsx
│   │   ├── dtc-clear/               # NEW
│   │   │   ├── ClearFaultCodesButton.tsx    # Button + state management
│   │   │   ├── ClearConfirmationModal.tsx   # Warning + checkbox/typing confirm
│   │   │   ├── ClearResultBanner.tsx        # Success/failure banner
│   │   │   └── __tests__/
│   │   │       └── ClearConfirmationModal.test.tsx
│   │   └── obd/                      # Existing — extended
│   │       └── ControlUnitOverview.tsx       # Add Clear button in fault area
│   ├── services/
│   │   ├── vehicle-data-api.ts       # NEW: API client for vehicle data
│   │   └── dtc-clear-api.ts          # NEW: API client for DTC clear
│   └── app/
│       └── diagnostic-sessions/
│           └── [sessionId]/
│               └── page.tsx                 # Existing — add VehicleHealthPanel
└── tests/                                   # (if applicable)

desktop-agent/
├── src/
│   ├── main.py                    # Existing — add READ_VEHICLE_DATA and CLEAR_DTC dispatch
│   ├── obd/
│   │   ├── adapter.py             # Existing — BaseAdapter interface
│   │   ├── elm327.py             # Existing — Elm327Adapter
│   │   ├── mock_adapter.py       # Existing — add vehicle health + clear DTC mock responses
│   │   └── commands/
│   │       ├── vin.py            # Existing — reuse for VIN read in vehicle data flow
│   │       ├── dtc.py            # Existing — Mode 03/07/0A fault code read
│   │       ├── vehicle_data.py   # NEW — PID 42/03/04/2F/01/00/20/31 readers
│   │       └── clear_dtc.py      # NEW — Mode 04 clear DTC command
│   └── live_data/
│       ├── generator.py           # Existing — MockLiveDataGenerator
│       ├── poller.py              # Existing — LiveDataPoller
│       └── queue.py              # Existing — add READ_VEHICLE_DATA and CLEAR_DTC command dispatch
└── tests/
    ├── test_commands.py           # Existing — extend with vehicle data PID tests
    ├── test_vehicle_data_commands.py  # NEW — vehicle data OBD command unit tests
    ├── test_clear_dtc.py         # NEW — clear DTC command unit tests
    ├── test_vehicle_data_read_flow.py # NEW — execute_vehicle_data_read integration
    ├── test_clear_dtc_flow.py    # NEW — execute_clear_dtc integration
    ├── test_mock_vehicle_health.py # NEW — mock adapter vehicle health responses
    └── test_mock_clear_dtc.py   # NEW — mock adapter clear DTC scenarios
```

**Structure Decision**: Two new NestJS modules (`vehicle-data/`, `dtc-clear/`) follow the existing module pattern from `obd/`, `live-data/`, `fault-codes/`. Each module has controller, service, DTOs, and repository layers per Constitution Principle III. New frontend components are grouped by feature (`vehicle-data/`, `dtc-clear/`) matching the existing `obd/`, `live-data/` structure. The existing `ControlUnitOverview` is extended with the clear button rather than replaced. Two new agent command modules (`vehicle_data.py`, `clear_dtc.py`) follow the existing `commands/` pattern from `vin.py` and `dtc.py`. Agent main loop dispatch is extended in `queue.py` alongside the existing `LIVE_DATA_POLL`/`LIVE_DATA_STOP` pattern.

## Complexity Tracking

No constitution violations to justify. All design decisions align with constitutional principles:

- JSONB on DiagnosticSession follows Principle XV (Simplicity Over Complexity)
- Audit records for DTC clear tracking follow Principle XI (Auditability)
- Layered architecture (Controller → Service → Repository) follows Principle III
- Multi-tenant isolation via existing DiagnosticSession.organizationId follows Principle VI