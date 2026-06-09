# Scan Workflow Contract

**Feature**: OBD Foundation (Phase 004)
**Date**: 2026-06-09
**Audience**: Frontend developers, backend developers, QA

---

## Overview

This document defines the scan workflow state machine, the interaction contract between the Next.js frontend and the NestJS backend, and the expected UI behavior at each state.

---

## State Machine

```
                    ┌─────────────┐
         ┌─────────►│   PENDING   │◄────────┐
         │          │             │         │
         │          └──────┬──────┘         │
         │                 │ Start Scan      │ Retry
         │                 ▼                 │
         │          ┌─────────────┐          │
         │          │   RUNNING   │          │
         │          │             │          │
         │          └──────┬──────┘          │
         │                 │                 │
         │     ┌───────────┼───────────┐     │
         │     │           │           │     │
         │     ▼           ▼           ▼     │
         │ ┌────────┐ ┌──────────┐ ┌────────┐│
         │ │COMPLETED│ │  FAILED  │ │CANCELLED││
         │ │        │ │          │ │        ││
         │ └───┬────┘ └────┬─────┘ └────┬───┘│
         │     │           │            │     │
         └─────┘           └────────────┘     │
                    ┌──────────────┐
                    │NEEDS_VEHICLE_│
                    │ CONFIRMATION │
                    └──────┬───────┘
                           │ Confirm Vehicle
                           ▼
                    ┌──────────────┐
                    │   RUNNING    │ (resume)
                    └──────────────┘
```

### Valid Transitions

| From | To | Trigger | Actor |
|---|---|---|---|
| `PENDING` | `RUNNING` | Agent begins execution | Desktop Agent |
| `RUNNING` | `NEEDS_VEHICLE_CONFIRMATION` | VIN does not match existing vehicle | Backend |
| `NEEDS_VEHICLE_CONFIRMATION` | `RUNNING` | User confirms or creates vehicle | Technician |
| `RUNNING` | `COMPLETED` | All commands succeeded; fault codes imported | Backend |
| `RUNNING` | `FAILED` | Unrecoverable error or timeout | Backend / Agent |
| `RUNNING` | `CANCELLED` | User clicks Cancel | Technician |
| `PENDING` | `CANCELLED` | User clicks Cancel before agent starts | Technician |

### Invalid Transitions

| From | To | Reason |
|---|---|---|
| `COMPLETED` | Any | Terminal state |
| `FAILED` | Any | Terminal state |
| `CANCELLED` | Any | Terminal state |
| `PENDING` | `COMPLETED` | Cannot complete without running |
| `NEEDS_VEHICLE_CONFIRMATION` | `COMPLETED` | Must resume and finish scan first |

---

## Frontend-Backend Interaction

### Step 1: Initiate Scan

**Frontend Action**: User clicks "Start Scan".

**API Call**:
```
POST /obd/scans
Authorization: Bearer <jwt>
Content-Type: application/json

{ "vehicleId": "uuid" } // optional
```

**Backend Response (201 Created)**:
```json
{
  "id": "scan-job-uuid",
  "status": "PENDING",
  "agentId": "agent-uuid",
  "createdAt": "2026-06-09T10:00:00Z"
}
```

**UI State**:
- "Start Scan" button disabled.
- `ScanProgressTimeline` shows "Pending — awaiting agent".

---

### Step 2: Poll for Status

**Frontend Action**: Begin polling `GET /obd/scans/:id` every 2 seconds.

**API Call**:
```
GET /obd/scans/:id
Authorization: Bearer <jwt>
```

**Backend Response (200 OK)**:
```json
{
  "id": "scan-job-uuid",
  "status": "RUNNING",
  "vin": null,
  "vehicleId": null,
  "diagnosticSessionId": null,
  "adapterType": "ELM327",
  "protocol": "CAN",
  "startedAt": "2026-06-09T10:00:05Z",
  "completedAt": null,
  "errorMessage": null
}
```

**UI States by Status**:

| Status | UI Text | Polling Interval |
|---|---|---|
| `PENDING` | "Agent is preparing to start..." | 2s |
| `RUNNING` | "Scan in progress — {currentStep}" | 2s |
| `NEEDS_VEHICLE_CONFIRMATION` | "New vehicle detected. Please confirm details." | Stop polling; wait for user action |
| `COMPLETED` | "Scan complete. Viewing results..." | Stop polling; redirect |
| `FAILED` | "Scan failed: {errorMessage}" | Stop polling; show retry |
| `CANCELLED` | "Scan cancelled." | Stop polling |

---

### Step 3: Vehicle Confirmation (if needed)

**Frontend Action**: Modal opens with pre-filled vehicle data.

**API Call**:
```
POST /obd/scans/:id/confirm-vehicle
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "make": "Honda",
  "model": "Accord",
  "year": 2023,
  "vin": "1HGCM82633A123456",
  "plateNumber": "ABC-1234"
}
```

**Backend Response (200 OK)**:
```json
{
  "id": "scan-job-uuid",
  "status": "RUNNING",
  "vehicleId": "new-vehicle-uuid",
  "diagnosticSessionId": "new-session-uuid"
}
```

**UI State**:
- Modal closes.
- Polling resumes.
- Timeline shows "Vehicle confirmed — continuing scan..."

---

### Step 4: View Results

**Frontend Action**: On `COMPLETED`, redirect to Diagnostic Session detail.

**API Call**:
```
GET /diagnostic-sessions/:diagnosticSessionId
Authorization: Bearer <jwt>
```

**Then fetch fault codes**:
```
GET /obd/scans/:scanJobId/results
Authorization: Bearer <jwt>
```

**Response (200 OK)**:
```json
{
  "data": [
    {
      "code": "P0301",
      "status": "ACTIVE",
      "ecu": "Engine",
      "source": "OBD_SCAN",
      "importedAt": "2026-06-09T10:05:00Z"
    },
    {
      "code": "P0302",
      "status": "PENDING",
      "ecu": "Engine",
      "source": "OBD_SCAN",
      "importedAt": "2026-06-09T10:05:00Z"
    }
  ]
}
```

**UI State**:
- `FaultCodeList` renders grouped by ECU.
- `ScanProgressTimeline` shows all steps as completed.

---

## Error Handling Contract

### Agent Offline at Start

**Backend Response (409 Conflict)**:
```json
{
  "code": "AGENT_OFFLINE",
  "message": "Your Desktop Agent is offline. Please ensure it is running and paired."
}
```

**UI Action**: Show toast with link to "Agent Status" page.

### Adapter Not Connected

**Backend Response (409 Conflict)**:
```json
{
  "code": "ADAPTER_NOT_CONNECTED",
  "message": "No OBD adapter is connected to your Desktop Agent. Please connect an adapter and try again."
}
```

**UI Action**: Show toast with adapter connection instructions.

### Scan Already in Progress

**Backend Response (409 Conflict)**:
```json
{
  "code": "AGENT_BUSY",
  "message": "Your agent is already running a scan. Please wait for it to complete."
}
```

**UI Action**: Disable "Start Scan"; show active scan progress.

### VIN Read Failed

**Backend Response (422 Unprocessable Entity)**:
```json
{
  "code": "VIN_READ_FAILED",
  "message": "Could not read VIN from the vehicle. You may continue with manual vehicle selection."
}
```

**UI Action**: Open `VehicleConfirmModal` with empty VIN field.

### Scan Cancelled by User

**Frontend Action**: User clicks "Cancel".

**API Call**:
```
POST /obd/scans/:id/cancel
Authorization: Bearer <jwt>
```

**Backend Response (200 OK)**:
```json
{
  "id": "scan-job-uuid",
  "status": "CANCELLED"
}
```

**UI Action**: Stop polling; show "Scan cancelled" state; re-enable "Start Scan".

### Scan Failed Mid-Operation

**Backend pushes event** (via polling update):
```json
{
  "status": "FAILED",
  "errorMessage": "Adapter disconnected during DTC read."
}
```

**UI Action**: Stop polling; show error state with "Retry" button.

---

## Polling Behavior Rules

1. **Start polling** immediately after `POST /obd/scans` returns.
2. **Interval**: 2 seconds.
3. **Stop polling** when status is `COMPLETED`, `FAILED`, or `CANCELLED`.
4. **Pause polling** when status is `NEEDS_VEHICLE_CONFIRMATION`; resume after `POST /obd/scans/:id/confirm-vehicle` returns.
5. **Abort polling** if the user navigates away from the scan page.
6. **Handle 404**: If the scan job is not found (deleted or access revoked), stop polling and show error.
