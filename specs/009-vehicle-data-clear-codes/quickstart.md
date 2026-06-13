# Quickstart: Vehicle Health & DTC Clear

**Feature**: 009-vehicle-data-clear-codes
**Date**: 2026-06-13

---

## Overview

Feature 009 adds two capabilities to PrioraScan:

1. **Vehicle Health (Phase A)** — One-shot reads of standard OBD-II vehicle data (battery voltage, VIN, readiness monitors, fuel system status, engine load, fuel level, mileage, supported PID list) displayed in a Vehicle Health panel on the Diagnostic Session detail page.

2. **DTC Clear (Phase B)** — Safe clearing of fault codes via OBD-II Mode 04 with mandatory user confirmation, audit trail, and re-scan workflow.

---

## Prerequisites

- Features 001–007 complete and working
- A connected ELM327-compatible adapter via the Desktop Agent
- An open Diagnostic Session with fault codes (for DTC clear)

---

## Running the Feature

### Phase A — Vehicle Health

1. Navigate to a Diagnostic Session detail page (e.g., `/diagnostic-sessions/:sessionId`)
2. The **Vehicle Health** panel appears on the session page
3. With a connected adapter, press **"Read Vehicle Data"**
4. The system sends a `READ_VEHICLE_DATA` command to the Desktop Agent
5. Within 30 seconds, the Vehicle Health panel populates with:
   - Battery voltage (e.g., "12.4 V")
   - VIN confirmation (e.g., "1HGCM82633A123456")
   - Readiness monitors (e.g., "Misfire: Complete ✓, Components: Incomplete ✗")
   - Fuel system status (e.g., "Closed Loop")
   - Calculated engine load (e.g., "32.5%")
   - Fuel level (e.g., "75%")
   - Mileage (e.g., "Not supported by vehicle / adapter" if unavailable)
   - Supported PIDs list (expandable section)
6. Unsupported data points show "Not supported by vehicle / adapter"
7. Data persists when reopening the session

### Phase B — DTC Clear

1. Navigate to a Diagnostic Session with fault codes
2. In the Control Unit area, press **"Clear Fault Codes"**
3. A confirmation modal appears with the warning: *"Clearing fault codes may erase diagnostic evidence and reset readiness monitors."*
4. Check the acknowledgment checkbox (or type "CLEAR") to enable the Confirm button
5. Press **Confirm**
6. The system sends a `CLEAR_DTC` command to the Desktop Agent
7. Within 60 seconds, the result appears:
   - **Success**: Green banner — "Fault codes cleared successfully." + "Run scan again" action
   - **Failure**: Red banner with failure reason — existing codes remain unchanged
8. On success, press **"Run scan again"** to start a new scan and verify the repair

---

## API Quick Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/diagnostic-sessions/:id/vehicle-data/read` | POST | Queue vehicle data read command |
| `/api/v1/diagnostic-sessions/:id/vehicle-data` | GET | Get last read vehicle data |
| `/api/v1/diagnostic-sessions/:id/fault-codes/clear` | POST | Queue DTC clear command |
| `/api/v1/diagnostic-sessions/:id/fault-codes/clear-status` | GET | Check clear status (optional polling) |

---

## Key Files

### Backend (New)

| File | Purpose |
|---|---|
| `backend/src/vehicle-data/vehicle-data.module.ts` | Vehicle data NestJS module |
| `backend/src/vehicle-data/controllers/vehicle-data.controller.ts` | Vehicle data API endpoints |
| `backend/src/vehicle-data/services/vehicle-data.service.ts` | Vehicle data business logic |
| `backend/src/vehicle-data/dtos/vehicle-data-response.dto.ts` | Response DTO with Zod validation |
| `backend/src/vehicle-data/repositories/vehicle-data.repository.ts` | DiagnosticSession vehicleDataJson read/write |
| `backend/src/dtc-clear/dtc-clear.module.ts` | DTC clear NestJS module |
| `backend/src/dtc-clear/controllers/dtc-clear.controller.ts` | DTC clear API endpoint |
| `backend/src/dtc-clear/services/dtc-clear.service.ts` | DTC clear business logic + concurrent prevention |
| `backend/src/dtc-clear/dtos/dtc-clear-response.dto.ts` | Response DTO with Zod validation |

### Backend (Modified)

| File | Change |
|---|---|
| `backend/prisma/schema.prisma` | Add `vehicleDataJson`, `vehicleDataReadAt` to DiagnosticSession |
| `backend/src/obd/types/scan-event-type.enum.ts` | Add `VEHICLE_DATA_READ`, `DTC_CLEARED`, `DTC_CLEAR_FAILED` |
| `backend/src/obd/controllers/agent-webhook.controller.ts` | Handle new event types in switch statement |
| `backend/src/obd/obd.module.ts` | Import VehicleDataModule, DtcClearModule |

### Frontend (New)

| File | Purpose |
|---|---|
| `frontend/src/components/vehicle-data/VehicleHealthPanel.tsx` | Main vehicle health panel |
| `frontend/src/components/vehicle-data/VehicleDataPointRow.tsx` | Single data point row |
| `frontend/src/components/vehicle-data/SupportedPidList.tsx` | Expandable PID list |
| `frontend/src/components/dtc-clear/ClearFaultCodesButton.tsx` | Clear button + state |
| `frontend/src/components/dtc-clear/ClearConfirmationModal.tsx` | Warning + confirmation |
| `frontend/src/components/dtc-clear/ClearResultBanner.tsx` | Success/failure banner |
| `frontend/src/services/vehicle-data-api.ts` | API client for vehicle data |
| `frontend/src/services/dtc-clear-api.ts` | API client for DTC clear |

### Frontend (Modified)

| File | Change |
|---|---|
| `frontend/src/app/diagnostic-sessions/[sessionId]/page.tsx` | Add VehicleHealthPanel to session detail |
| `frontend/src/components/obd/ControlUnitOverview.tsx` | Add ClearFaultCodesButton |

### Desktop Agent (New)

| File | Purpose |
|---|---|
| `desktop-agent/src/obd/commands/vehicle_data.py` | Vehicle data PID readers (PID 42/03/04/2F/01/00/20/31) |
| `desktop-agent/src/obd/commands/clear_dtc.py` | Mode 04 clear DTC command |

### Desktop Agent (Modified)

| File | Change |
|---|---|
| `desktop-agent/src/main.py` | Add READ_VEHICLE_DATA and CLEAR_DTC command dispatch |
| `desktop-agent/src/obd/mock_adapter.py` | Add vehicle health + clear DTC mock responses |
| `desktop-agent/src/live_data/queue.py` | Add READ_VEHICLE_DATA and CLEAR_DTC command type routing |

---

## Testing

### Unit Tests (Backend)

```bash
cd backend
npm run test -- --testPathPattern="vehicle-data"
npm run test -- --testPathPattern="dtc-clear"
```

### Integration Tests (Backend)

```bash
cd backend
npm run test:e2e -- --testPathPattern="vehicle-data"
npm run test:e2e -- --testPathPattern="dtc-clear"
```

### Frontend Tests

```bash
cd frontend
npm run test -- --testPathPattern="VehicleHealthPanel"
npm run test -- --testPathPattern="ClearConfirmationModal"
```

### Tenant Isolation Test

```bash
cd backend
npm run test -- --testPathPattern="tenant-isolation"
```

### Desktop Agent Tests

```bash
cd desktop-agent
pytest tests/test_vehicle_data_commands.py
pytest tests/test_clear_dtc.py
pytest tests/test_vehicle_data_read_flow.py
pytest tests/test_clear_dtc_flow.py
pytest tests/test_mock_vehicle_health.py
pytest tests/test_mock_clear_dtc.py
```