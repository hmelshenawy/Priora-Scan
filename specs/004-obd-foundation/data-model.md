# Data Model: OBD Foundation

**Feature**: OBD Foundation (Phase 004)
**Date**: 2026-06-09
**Spec**: [spec.md](spec.md)
**Plan**: [plan.md](plan.md)

---

## Overview

This document describes the Prisma schema additions and modifications required for the OBD Foundation feature. All new models respect multi-tenant isolation via `organizationId`. All audit records are immutable.

---

## New Models

### DesktopAgent

Represents an installed and paired Desktop Agent instance.

| Field | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK, auto-generated | Unique agent identifier |
| `organizationId` | UUID | Indexed, NOT NULL | Tenant scope |
| `userId` | UUID | Indexed, NOT NULL | User who paired this agent |
| `name` | String(100) | Nullable | Human-readable agent name |
| `version` | String(20) | NOT NULL | Agent software version |
| `status` | AgentStatus enum | Default: OFFLINE | ONLINE, OFFLINE, BUSY |
| `pairedAt` | Timestamp | Default: now | When agent was paired |
| `lastSeenAt` | Timestamp | Nullable | Last heartbeat timestamp |
| `createdAt` | Timestamp | Default: now | Record creation |
| `updatedAt` | Timestamp | Auto-update | Record modification |

**Indexes**:
- `organizationId`
- `organizationId, status`
- `organizationId, userId`

**Relations**:
- `1 → Many ScanJob`

---

### ScanJob

Represents a single OBD scan operation initiated by a user.

| Field | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK, auto-generated | Unique scan identifier |
| `organizationId` | UUID | Indexed, NOT NULL | Tenant scope |
| `userId` | UUID | Indexed, NOT NULL | User who initiated the scan |
| `agentId` | UUID | FK → DesktopAgent, NOT NULL | Agent executing the scan |
| `vehicleId` | UUID | FK → Vehicle, Nullable | Resolved vehicle |
| `diagnosticSessionId` | UUID | FK → DiagnosticSession, Nullable | Created session |
| `status` | ScanJobStatus enum | Default: PENDING | Lifecycle state |
| `adapterType` | String(50) | Nullable | e.g., "ELM327" |
| `adapterProtocol` | String(20) | Nullable | e.g., "CAN", "ISO" |
| `vin` | String(25) | Nullable | VIN read from vehicle |
| `errorMessage` | String(500) | Nullable | Failure reason if FAILED |
| `startedAt` | Timestamp | Nullable | When scan began |
| `completedAt` | Timestamp | Nullable | When scan ended |
| `createdAt` | Timestamp | Default: now | Record creation |
| `updatedAt` | Timestamp | Auto-update | Record modification |

**Indexes**:
- `organizationId`
- `organizationId, status`
- `organizationId, userId`
- `diagnosticSessionId`

**Relations**:
- `Many → 1 DesktopAgent`
- `Many → 1 Vehicle` (optional)
- `Many → 1 DiagnosticSession` (optional)
- `1 → Many SessionFaultCode`

---

### AdapterConnection

Represents a connection session between a Desktop Agent and a physical adapter.

| Field | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK, auto-generated | Unique connection identifier |
| `organizationId` | UUID | Indexed, NOT NULL | Tenant scope |
| `agentId` | UUID | Indexed, NOT NULL | Parent agent |
| `adapterType` | String(50) | NOT NULL | Adapter model/type |
| `connectionType` | String(20) | NOT NULL | USB or BLUETOOTH |
| `protocol` | String(20) | Nullable | OBD protocol used |
| `status` | String(20) | NOT NULL | CONNECTED, DISCONNECTED, ERROR |
| `startedAt` | Timestamp | Default: now | Connection start |
| `endedAt` | Timestamp | Nullable | Connection end |
| `errorMessage` | String(500) | Nullable | Error details |

**Indexes**:
- `organizationId`
- `agentId`
- `organizationId, startedAt(sort: Desc)`

---

### SessionFaultCode

Represents a fault code imported into a Diagnostic Session from a scan.

| Field | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK, auto-generated | Unique record identifier |
| `organizationId` | UUID | Indexed, NOT NULL | Tenant scope |
| `diagnosticSessionId` | UUID | FK → DiagnosticSession, NOT NULL | Parent session |
| `scanJobId` | UUID | FK → ScanJob, NOT NULL | Source scan |
| `code` | String(10) | NOT NULL | DTC code, e.g., P0301 |
| `status` | FaultCodeStatus enum | NOT NULL | ACTIVE, PENDING, PERMANENT |
| `ecu` | String(100) | Nullable | Originating ECU/system |
| `source` | String(20) | Default: OBD_SCAN | Origin of the code |
| `importedAt` | Timestamp | Default: now | Import timestamp |
| `createdAt` | Timestamp | Default: now | Record creation |

**Indexes**:
- `organizationId`
- `diagnosticSessionId`
- `organizationId, code`

**Unique Constraint**:
- `[diagnosticSessionId, scanJobId, code, status, ecu]`

**Relations**:
- `Many → 1 DiagnosticSession`
- `Many → 1 ScanJob`

---

### ScanJobAuditRecord

Immutable audit trail for scan lifecycle events.

| Field | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK, auto-generated | Unique record identifier |
| `organizationId` | UUID | Indexed, NOT NULL | Tenant scope |
| `userId` | UUID | NOT NULL | Actor |
| `scanJobId` | UUID | Indexed, NOT NULL | Target scan |
| `action` | String(50) | NOT NULL | Event type |
| `status` | ScanJobStatus enum | Nullable | Snapshot at event time |
| `metadata` | JSON | Nullable | Contextual data |
| `createdAt` | Timestamp | Default: now | Event timestamp |

**Indexes**:
- `organizationId`
- `scanJobId`
- `organizationId, createdAt(sort: Desc)`

**No `updatedAt` field — immutable.**

---

### PairingToken

Short-lived token for agent pairing.

| Field | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK, auto-generated | Unique record identifier |
| `organizationId` | UUID | Indexed, NOT NULL | Tenant scope |
| `userId` | UUID | Indexed, NOT NULL | Token issuer |
| `tokenHash` | String(255) | Indexed, NOT NULL | SHA-256 hash of token |
| `expiresAt` | Timestamp | Indexed, NOT NULL | Expiration time |
| `consumedAt` | Timestamp | Nullable | When token was used |
| `createdAt` | Timestamp | Default: now | Record creation |

**Indexes**:
- `tokenHash`
- `organizationId, userId`
- `expiresAt`

---

## Updated Models

### DiagnosticSession

Add relations to link scan jobs and imported fault codes.

**New fields**:
- `scanJobs` — `1 → Many ScanJob`
- `faultCodes` — `1 → Many SessionFaultCode`

### Vehicle

Add relation to link scan jobs.

**New field**:
- `scanJobs` — `1 → Many ScanJob`

---

## New Enums

### AgentStatus

| Value | Meaning |
|---|---|
| `ONLINE` | Heartbeat received within threshold |
| `OFFLINE` | Heartbeat missed; agent unreachable |
| `BUSY` | Agent is executing a scan |

### ScanJobStatus

| Value | Meaning |
|---|---|
| `PENDING` | Created; awaiting agent execution |
| `RUNNING` | Agent is executing scan commands |
| `NEEDS_VEHICLE_CONFIRMATION` | VIN unknown; awaiting user input |
| `COMPLETED` | Scan succeeded; fault codes imported |
| `FAILED` | Unrecoverable error occurred |
| `CANCELLED` | User explicitly cancelled |

### FaultCodeStatus

| Value | Meaning |
|---|---|
| `ACTIVE` | Currently active DTC (Mode 03) |
| `PENDING` | Pending DTC (Mode 07) |
| `PERMANENT` | Permanent DTC (Mode 0A) |

---

## Entity Relationship Diagram

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Organization  │     │   Organization  │     │   Organization  │
│        │        │     │        │        │     │        │        │
│        ▼        │     │        ▼        │     │        ▼        │
│  ┌───────────┐  │     │  ┌───────────┐  │     │  ┌───────────┐  │
│  │ DesktopAgent│ │     │  │   Vehicle  │ │     │  │DiagnosticSession│
│  │   │       │ │     │  │   │       │ │     │  │   │       │  │
│  │   ▼       │ │     │  │   ▼       │ │     │  │   ▼       │  │
│  │ ScanJob   │◄┼─────┼──┼──►│       │ │     │  │ ScanJob   │◄─┼──┼────┐
│  │   │       │ │     │  │         │ │     │  │   │       │  │    │
│  │   ▼       │ │     │  └───────────┘ │     │  │   ▼       │  │    │
│  │ SessionFaultCode│ │     │  ┌───────────┐  │     │  │ SessionFaultCode│  │    │
│  └───────────┘  │     │  │  AdapterConnection  │     │  └───────────┘  │    │
│                 │     │  └───────────┘  │     │                 │    │
│                 │     │                 │     │                 │    │
│  ┌───────────┐  │     │  ┌───────────┐  │     │  ┌───────────┐  │    │
│  │PairingToken│ │     │  │ScanJobAudit│ │     │  │DiagnosticSessionAudit││    │
│  └───────────┘  │     │  └───────────┘  │     │  └───────────┘  │    │
└─────────────────┘     └─────────────────┘     └─────────────────┘    │
                                                                     │
                                                                     │
                                     ┌───────────────────────────────┘
                                     │
                                     ▼
                              ┌───────────────┐
                              │ SessionFaultCode
                              │  (linked to   │
                              │   DiagnosticSession
                              │   and ScanJob) │
                              └───────────────┘
```

---

## Validation Rules

### Model-Level

| Model | Field | Rule |
|---|---|---|
| `Vehicle` | `vin` | 17 characters; letters and digits only (no I, O, Q) |
| `ScanJob` | `vin` | 17 characters when present; nullable |
| `SessionFaultCode` | `code` | 5–10 characters; standard DTC prefix (P, B, C, U) |
| `SessionFaultCode` | `ecu` | 1–100 characters; free text |
| `DesktopAgent` | `version` | 1–20 characters |
| `PairingToken` | `tokenHash` | 64-character hex (SHA-256) |

### Cross-Model

- `ScanJob.organizationId` must equal `DesktopAgent.organizationId`, `Vehicle.organizationId`, and `DiagnosticSession.organizationId`.
- `SessionFaultCode.organizationId` must equal parent `DiagnosticSession.organizationId` and `ScanJob.organizationId`.
- `AdapterConnection.organizationId` must equal parent `DesktopAgent.organizationId`.

---

## Migration Impact

### Additive Changes

All changes are additive. No existing tables are altered except for adding optional relation fields to `DiagnosticSession` and `Vehicle`.

### New Tables

1. `DesktopAgent`
2. `PairingToken`
3. `ScanJob`
4. `AdapterConnection`
5. `SessionFaultCode`
6. `ScanJobAuditRecord`

### New Enums

1. `AgentStatus`
2. `ScanJobStatus`
3. `FaultCodeStatus`

### Existing Table Modifications

- `DiagnosticSession`: Add relation fields (Prisma-level only; no new columns on table)
- `Vehicle`: Add relation fields (Prisma-level only; no new columns on table)

### Backward Compatibility

- Existing APIs for vehicles and diagnostic sessions are unchanged.
- New APIs are additive under `/obd/*` namespace.
- Existing frontend code is unaffected.
