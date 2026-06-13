# Implementation Plan: ELM327 WiFi Adapter Integration

**Branch**: `010-elm327-wifi-adapter` | **Date**: 2026-06-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/010-elm327-wifi-adapter/spec.md`

## Summary

Feature 010 upgrades the Desktop Agent to connect to a real ELM327 WiFi adapter over TCP, enabling real vehicle data reads (VIN, DTCs, PIDs) through the existing command queue and event-push architecture. The agent already has a USB ELM327 adapter and mock adapter; this adds a third WiFi connection type with its own `WifiConnection` class and `WifiElm327Adapter`. No database schema changes are needed — the `AdapterConnection.connectionType` field is VarChar, so 'WIFI' is stored alongside existing 'USB' and 'MOCK' values. The frontend surfaces `adapterType` and `connectionType` from the existing `AdapterConnection` model via the agent status endpoint. The key milestone: read real RPM or VIN from a real vehicle through WiFi ELM327.

## Technical Context

**Language/Version**: Python 3.11 (Desktop Agent), TypeScript 5.x (Backend + Frontend)

**Primary Dependencies**: Python stdlib `socket` (TCP), `threading` (existing agent loop), NestJS, Prisma ORM, Next.js, TanStack Query

**Storage**: PostgreSQL (existing — no schema changes needed), AdapterConnection.connectionType is VarChar(20) supporting 'WIFI'

**Testing**: pytest (Desktop Agent), Jest (backend), React Testing Library (frontend)

**Target Platform**: Windows/macOS laptop with WiFi connection to ELM327 OBD adapter

**Project Type**: Monorepo web application + Desktop Agent

**Performance Goals**: WiFi connection established within 10 seconds; single PID read within 2 seconds; live data at ≥0.5 Hz

**Constraints**: Must not break any existing mock adapter tests; no database schema changes; backend API contracts unchanged; ELM327 AT command timing per datasheet (100ms minimum inter-command delay)

**Scale/Scope**: Single workshop with 1 ELM327 WiFi adapter at a time

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Evidence |
|---|---|---|
| Does not contradict PRD/SAD/FRONTEND_ARCHITECTURE | ✅ PASS | PRD Addendum 001 elevates OBD to core capability. SAD Addendum 001 defines Desktop Agent architecture with generic "OBD Adapter" abstraction. WiFi is another adapter connection type within the existing OBD framework. |
| Multi-tenant boundaries defined for all new entities | ✅ PASS | No new database entities. AdapterConnection already has organizationId. WiFi adapter state is Desktop Agent local only. |
| API contracts specified before backend implementation | ✅ PASS | No new API endpoints. Existing agent heartbeat and agent status endpoints already carry adapterType/connectionType fields. Only the frontend needs to surface them. |
| AI features include explainability and human-confirmation | ⬜ N/A | No AI features in this spec. |
| No PrioraFlow dependency for core workflows | ✅ PASS | Entirely standalone. No PrioraFlow integration. |
| Error handling and audit logging are included | ✅ PASS | ELM327 error responses (NO DATA, ?, STOPPED, timeout) handled with structured results. TCP disconnection triggers reconnection with backoff. All commands logged for debugging. |

### Principle XIII — Progressive Hardware Integration

Constitution Principle XIII defines the hardware sequence: Manual → Scan upload → **USB OBD** → Bluetooth OBD → OEM. WiFi OBD fits within the USB OBD step — it is another direct OBD-II communication type using the same ELM327 chip, differing only in transport (TCP vs serial). The OBD Foundation (Features 004–009) already implements the "USB OBD" step; this feature extends it with a WiFi transport option. Bluetooth remains out of scope.

## Project Structure

### Documentation (this feature)

```text
specs/010-elm327-wifi-adapter/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (minimal — no new DB entities)
├── quickstart.md        # Phase 1 output (manual smoke test)
├── contracts/           # Phase 1 output (WiFi adapter connection contract)
│   └── wifi-adapter-connection-contract.md
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
desktop-agent/
├── src/
│   ├── config.py                          # MODIFIED — add WiFi env vars
│   ├── main.py                            # MODIFIED — update adapter factory, dynamic heartbeat
│   ├── obd/
│   │   ├── adapter.py                     # MODIFIED — add connect() to BaseAdapter
│   │   ├── elm327.py                      # EXISTING — USB ELM327 (unchanged)
│   │   ├── wifi_elm327.py                 # NEW — WiFi ELM327 adapter
│   │   ├── mock_adapter.py               # EXISTING — unchanged
│   │   ├── connection/
│   │   │   ├── usb.py                     # EXISTING — unchanged
│   │   │   ├── wifi.py                    # NEW — TCP WiFi connection
│   │   │   └── bluetooth.py              # EXISTING — stub, unchanged
│   │   └── commands/
│   │       ├── elm_parser.py              # NEW — ELM327 response parser functions
│   │       ├── vin.py                     # MODIFIED — use elm_parser for real responses
│   │       ├── dtc.py                     # MODIFIED — use elm_parser for real responses
│   │       ├── vehicle_data.py            # MODIFIED — use elm_parser for real responses
│   │       └── clear_dtc.py              # MODIFIED — use elm_parser for real responses
│   ├── live_data/
│   │   ├── poller.py                      # MODIFIED — add real-data poll path
│   │   └── generator.py                  # EXISTING — MockLiveDataGenerator (fallback)
│   └── heartbeat.py                       # MODIFIED — dynamic adapter status
└── tests/
    ├── test_wifi_connection.py            # NEW — WiFi TCP connection tests
    ├── test_wifi_elm327_adapter.py        # NEW — WiFi adapter integration tests
    ├── test_elm_parser.py                 # NEW — ELM327 response parser tests
    └── ... (existing tests unchanged)

backend/
├── src/
│   └── obd/
│       ├── dtos/
│       │   └── agent-status-response.dto.ts  # MODIFIED — add adapterType, connectionType
│       ├── services/
│       │   └── agent-heartbeat.service.ts    # MODIFIED — pass connectionType='WIFI'
│       └── controllers/
│           └── agent-pairing.controller.ts   # MODIFIED — include adapterType in response
└── (no schema changes)

frontend/
├── src/
│   ├── hooks/
│   │   └── useAgentStatus.ts              # MODIFIED — add adapterType, connectionType to interface
│   └── components/
│       └── obd/
│           ├── AgentStatusCard.tsx        # MODIFIED — show adapter type label
│           └── ScanControlPanel.tsx       # MODIFIED — show adapter type in status area
└── (no new components needed — UI enhancement only)
```

**Structure Decision**: No new NestJS modules or frontend component directories. The WiFi adapter is a Desktop Agent feature that plugs into the existing adapter abstraction. Backend changes are limited to surfacing existing `AdapterConnection` fields in the agent status response. Frontend changes are limited to displaying adapter type labels in existing components.

## Complexity Tracking

No constitution violations to justify. All design decisions align with constitutional principles:

- WiFi adapter extends existing `BaseAdapter` interface (Principle III — layered architecture)
- Adapter type exposed via existing API fields, no new endpoints (Principle VII — API first)
- No new database tables (Principle XV — simplicity)
- WiFi is a transport variant of existing OBD integration, not a new integration phase (Principle XIII — progressive hardware)
- Mock adapter remains fully functional (backward compatibility)