# Implementation Plan: OBD Foundation

**Branch**: `004-obd-foundation` | **Date**: 2026-06-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-obd-foundation/spec.md`

---

## Summary

Build the first end-to-end automated OBD-II diagnostic workflow for PrioraScan. A technician launches a Python Desktop Agent, pairs it with the web application via a short-lived token, connects an ELM327 adapter (USB or Bluetooth), and initiates a scan from the Next.js web app. The backend orchestrates the scan: reads VIN, resolves or creates the vehicle, creates a Diagnostic Session, reads active/pending/permanent DTCs, imports them into the session, and produces an immutable audit trail. All data is strictly tenant-scoped and all actions are authenticated.

---

## Technical Context

**Backend Language/Version**: TypeScript / Node.js 20+ / NestJS 10+
**Frontend Language/Version**: TypeScript / Next.js 14+ (App Router)
**Desktop Agent Language/Version**: Python 3.11+
**Primary Backend Dependencies**: NestJS, Prisma, PostgreSQL, class-validator, passport-jwt
**Primary Frontend Dependencies**: Next.js, React, TanStack Query, React Hook Form, Zod, Axios, TailwindCSS, shadcn/ui
**Desktop Agent Dependencies**: pyserial (USB), bleak (Bluetooth), requests/httpx, python-dotenv
**Storage**: PostgreSQL 15+
**Testing**: Jest (backend unit/integration), Playwright (frontend E2E), pytest (agent)
**Target Platform**: Web SaaS + Windows/macOS/Linux Desktop Agent
**Project Type**: Web application + desktop connector
**Performance Goals**: Scan initiation < 2 seconds, VIN read < 30 seconds, fault code import < 10 seconds after scan completion
**Constraints**: Agent heartbeat timeout 60 seconds; adapter command timeout 10 seconds; file size < 300 lines; function size < 30 lines
**Scale/Scope**: multi-tenant MVP phase; architecture must support 10k concurrent agents in future releases

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Justification |
|---|---|---|
| Feature does not contradict PRD/SAD/Frontend Architecture | ✅ Pass | OBD Foundation extends existing Vehicle Management and Diagnostic Sessions per SAD domain model and PRD scope. |
| Multi-tenant boundaries defined for all new entities | ✅ Pass | All new entities carry `organizationId` and every query is tenant-scoped. |
| API contracts specified before backend implementation | ✅ Pass | Contracts defined in Section 9 and `contracts/` folder. |
| AI features include explainability / human confirmation | N/A | No AI features in OBD Foundation. |
| No PrioraFlow dependency introduced for core workflows | ✅ Pass | Scan workflow is standalone. PrioraFlow integration is explicitly out of scope. |
| Error handling and audit logging included in design | ✅ Pass | Defined in Sections 17, 21. Audit records for every scan state transition. |

**Constitution Principles Satisfied**:
- **III. Layered Architecture**: Controller → Service → Repository → DTO boundaries enforced for all new modules.
- **VI. Multi-Tenant First**: Every new model includes `organizationId`; repository queries enforce `where: { organizationId }`.
- **VII. API First**: All OBD capabilities exposed through REST APIs consumed by frontend and Desktop Agent.
- **VIII. Scan Source Agnostic**: ScanJob results map into DiagnosticSession and SessionFaultCode, same model as manual entry.
- **XI. Auditability**: Immutable audit records for scan lifecycle and fault code import.
- **XIII. Progressive Hardware Integration**: USB and Bluetooth adapters supported; graceful degradation to manual entry when no adapter present.
- **XVI. Backend-Centric Business Logic**: Desktop Agent contains zero business logic; all orchestration in NestJS services.

---

## Project Structure

### Documentation (this feature)

```text
specs/004-obd-foundation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── agent-api-contract.md
│   └── scan-workflow-contract.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── obd/
│   │   ├── obd.module.ts
│   │   ├── controllers/
│   │   │   ├── obd-scan.controller.ts
│   │   │   └── agent-pairing.controller.ts
│   │   ├── services/
│   │   │   ├── obd-scan.service.ts
│   │   │   ├── agent-pairing.service.ts
│   │   │   ├── agent-heartbeat.service.ts
│   │   │   └── vin-resolution.service.ts
│   │   ├── repositories/
│   │   │   ├── scan-job.repository.ts
│   │   │   ├── desktop-agent.repository.ts
│   │   │   ├── adapter-connection.repository.ts
│   │   │   └── session-fault-code.repository.ts
│   │   ├── dtos/
│   │   │   ├── create-scan-job.dto.ts
│   │   │   ├── scan-job-response.dto.ts
│   │   │   ├── pairing-token-request.dto.ts
│   │   │   ├── pairing-token-response.dto.ts
│   │   │   ├── agent-heartbeat.dto.ts
│   │   │   └── fault-code-import.dto.ts
│   │   └── types/
│   │       ├── scan-job-status.enum.ts
│   │       ├── adapter-protocol.enum.ts
│   │       └── fault-code-status.enum.ts
│   └── ... (existing modules)

frontend/
├── src/
│   ├── app/
│   │   ├── obd/
│   │   │   ├── page.tsx
│   │   │   └── layout.tsx
│   │   └── ...
│   ├── components/
│   │   └── obd/
│   │       ├── AgentStatusCard.tsx
│   │       ├── ScanControlPanel.tsx
│   │       ├── ScanProgressTimeline.tsx
│   │       └── FaultCodeList.tsx
│   └── hooks/
│       └── useObdScan.ts

desktop-agent/
├── src/
│   ├── __init__.py
│   ├── main.py
│   ├── config.py
│   ├── api_client.py
│   ├── pairing.py
│   ├── heartbeat.py
│   ├── obd/
│   │   ├── __init__.py
│   │   ├── adapter.py
│   │   ├── elm327.py
│   │   ├── connection/
│   │   │   ├── __init__.py
│   │   │   ├── usb.py
│   │   │   └── bluetooth.py
│   │   └── commands/
│   │       ├── __init__.py
│   │       ├── vin.py
│   │       └── dtc.py
│   └── models/
│       ├── __init__.py
│       ├── scan_job.py
│       └── fault_code.py
└── tests/
    ├── test_adapter.py
    └── test_commands.py
```

**Structure Decision**: The backend follows the existing modular NestJS pattern. A new `obd` module is added alongside `vehicles` and `diagnostic-sessions`. The frontend adds an `obd` route with sub-components for agent status, scan control, and fault code display. The Desktop Agent is a separate Python project at `desktop-agent/` with its own virtual environment, config, and tests.

---

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| N/A | No constitutional violations. All design decisions align with existing architecture and principles. | — |

---

## 1. Technical Overview

OBD Foundation introduces a hardware-connected diagnostic pathway to PrioraScan. Prior phases supported manual fault code entry and scan report uploads. This phase adds a live OBD-II data source through an ELM327 adapter connected via a lightweight Python Desktop Agent.

The Desktop Agent is **not** a full application. It is a small local connector that:
- Discovers and opens serial/Bluetooth connections to ELM327 adapters
- Sends AT and OBD-II commands
- Receives responses and forwards them to the NestJS backend
- Sends periodic heartbeats to report liveness

The backend owns all business logic:
- Scan orchestration and state machine
- VIN resolution and vehicle creation
- Diagnostic session creation
- Fault code import and storage
- Audit logging
- Tenant isolation

The Next.js frontend:
- Displays agent and adapter status
- Allows scan initiation
- Shows scan progress
- Displays fault codes after import

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Next.js Web App                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │ Agent Status │  │ Scan Control │  │  Scan Prog.  │  │  Fault Codes│ │
│  │    Card      │  │    Panel     │  │   Timeline   │  │    List     │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘ │
│         └──────────────────┴──────────────────┴──────────────────┘         │
│                           Axios / REST API                               │
└────────────────────────────────────────┬─────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           NestJS Backend                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐│
│  │   Auth/      │  │    OBD       │  │   Vehicle    │  │ Diagnostic  ││
│  │   RBAC       │  │   Module     │  │   Module     │  │   Sessions  ││
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘│
│         └──────────────────┴──────────────────┴──────────────────┘        │
│                              Prisma Client                               │
└────────────────────────────────────────┬─────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          PostgreSQL Database                             │
│    Vehicle │ DiagnosticSession │ ScanJob │ DesktopAgent │ SessionFault │
└─────────────────────────────────────────────────────────────────────────┘
                                         ▲
                                         │ REST API (Agent Token Auth)
┌─────────────────────────────────────────────────────────────────────────┐
│                        Python Desktop Agent                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │
│  │   Heartbeat  │  │  API Client  │  │    Pairing   │                 │
│  │   Loop       │  │  (httpx)     │  │    Module    │                 │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                 │
│         └──────────────────┴──────────────────┘                          │
│                              OBD Adapter Layer                           │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐       │
│  │   USB (pyserial) │  │ Bluetooth (bleak)│  │   ELM327 Parser  │       │
│  │   Connection     │  │   Connection     │  │   & Commands     │       │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
                                         │
                                         ▼
                               ┌─────────────────┐
                               │  ELM327 Adapter │
                               │   (USB / BT)    │
                               └────────┬────────┘
                                        │
                                        ▼
                               ┌─────────────────┐
                               │   Vehicle ECU   │
                               └─────────────────┘
```

---

## 3. Desktop Agent Architecture

### Responsibilities

The Desktop Agent is a **local connector only**. It must **never** contain business logic, authentication decisions, or database access.

Allowed responsibilities:
1. **Adapter Discovery & Connection**: Enumerate available serial ports and Bluetooth devices; filter for ELM327-compatible adapters; open connections.
2. **Command Execution**: Send AT commands and OBD-II service requests; parse raw ECU responses.
3. **API Communication**: Receive scan commands from backend; send scan results and heartbeats to backend.
4. **Pairing**: Accept a one-time pairing token from the user and exchange it for an agent access token.

Prohibited responsibilities:
- Business logic (vehicle matching, session creation, fault code interpretation)
- Database writes
- Direct browser communication
- AI analysis
- Report generation

### Agent Lifecycle

```
┌─────────┐   Pairing Token    ┌──────────┐   Heartbeat    ┌─────────┐
│  IDLE   │ ─────────────────► │ PAIRED   │ ─────────────► │ ONLINE  │
│         │                    │          │   success      │         │
└─────────┘                    └──────────┘                └─────────┘
     │                              │                          │
     │                              │                          │
     ▼                              ▼                          ▼
┌─────────┐                   ┌──────────┐                ┌─────────┐
│  EXIT   │                   │  EXPIRED │                │ OFFLINE │
│         │                   │ (timeout)│                │ (missed │
│         │                   │          │                │  heart- │
│         │                   │          │                │  beats) │
└─────────┘                   └──────────┘                └─────────┘
```

### Agent Modules

| Module | File | Purpose |
|---|---|---|
| `main.py` | Entry point | Event loop, command dispatch, graceful shutdown |
| `config.py` | Configuration | Environment variables, defaults, validation |
| `api_client.py` | HTTP client | Authenticated requests to NestJS backend |
| `pairing.py` | Pairing flow | Token exchange, agent registration, token refresh |
| `heartbeat.py` | Liveness | Periodic heartbeat with version and status |
| `obd/adapter.py` | Adapter abstraction | Base class for OBD adapters |
| `obd/elm327.py` | ELM327 protocol | AT command set, initialization, error handling |
| `obd/connection/usb.py` | USB transport | pyserial-based serial port I/O |
| `obd/connection/bluetooth.py` | Bluetooth transport | bleak-based BLE/Bluetooth Classic discovery and I/O |
| `obd/commands/vin.py` | VIN command | Mode 09 PID 02 request/response parsing |
| `obd/commands/dtc.py` | DTC commands | Mode 03 (current), 07 (pending), 0A (permanent) parsing |

---

## 4. Backend Architecture

### New Module: `obd`

The `obd` module is a first-class NestJS module alongside `vehicles` and `diagnostic-sessions`.

#### Controllers

| Controller | Base Path | Responsibility |
|---|---|---|
| `AgentPairingController` | `POST /obd/agents/pair` | Issue and validate pairing tokens |
| `ObdScanController` | `POST /obd/scans` | Initiate scan from web app |
| `ObdScanController` | `GET /obd/scans/:id` | Get scan job status |
| `ObdScanController` | `GET /obd/scans/:id/results` | Get scan results (fault codes) |
| `ObdScanController` | `POST /obd/scans/:id/cancel` | Cancel running scan |
| `AgentWebhookController` | `POST /obd/agents/:id/heartbeat` | Receive agent heartbeat |
| `AgentWebhookController` | `POST /obd/agents/:id/scan-events` | Receive scan progress and results from agent |

#### Services

| Service | Responsibility |
|---|---|
| `AgentPairingService` | Generate, validate, and expire pairing tokens; bind agent to user/tenant |
| `AgentHeartbeatService` | Process heartbeats; update agent status; detect offline agents |
| `ObdScanService` | Orchestrate scan lifecycle; state machine transitions; transaction boundaries |
| `VinResolutionService` | Lookup vehicle by VIN within tenant; trigger vehicle creation if absent |
| `FaultCodeImportService` | Import raw fault codes into DiagnosticSession; create `SessionFaultCode` records |
| `ObdAuditService` | Write immutable audit records for scan events |

#### Repositories

| Repository | Responsibility |
|---|---|
| `DesktopAgentRepository` | CRUD for `DesktopAgent` entity; status queries |
| `ScanJobRepository` | CRUD for `ScanJob`; status transitions; tenant-scoped listing |
| `AdapterConnectionRepository` | CRUD for `AdapterConnection`; connection history |
| `SessionFaultCodeRepository` | CRUD for `SessionFaultCode`; bulk insert; listing by session |

---

## 5. Frontend Architecture

### New Route: `/obd`

The `/obd` page is the technician's control center for adapter and scan management.

#### Components

| Component | Responsibility |
|---|---|
| `AgentStatusCard` | Displays Desktop Agent online/offline status, version, last seen. Shows "Pair Agent" button when no agent is paired. |
| `ScanControlPanel` | "Start Scan" button (enabled only when agent is online and adapter connected). Shows adapter connection status and protocol. |
| `ScanProgressTimeline` | Visual timeline of scan stages: Connect Adapter → Read VIN → Resolve Vehicle → Create Session → Read DTCs → Import. Highlights current stage. |
| `FaultCodeList` | Displays imported fault codes from a completed Diagnostic Session. Grouped by ECU. |
| `VehicleConfirmModal` | Modal triggered when VIN does not match existing vehicle. Pre-filled with VIN-derived data. User confirms or edits before scan continues. |

#### Hooks

| Hook | Responsibility |
|---|---|
| `useObdScan` | TanStack Query hook for scan CRUD, status polling, and fault code retrieval. |
| `useAgentStatus` | TanStack Query hook for agent status, heartbeat polling (every 5 seconds). |
| `useAdapterStatus` | TanStack Query hook for adapter connection state. |

#### State Flow

1. Page loads → `useAgentStatus` polls agent status.
2. If no agent paired → show "Pair Agent" flow (generate token, user enters in agent).
3. Agent online + adapter connected → "Start Scan" enabled.
4. User clicks "Start Scan" → mutation `POST /obd/scans` → returns `scanJobId`.
5. Frontend polls `GET /obd/scans/:id` every 2 seconds.
6. If scan reaches `NEEDS_VEHICLE_CONFIRMATION` → open `VehicleConfirmModal`.
7. User confirms vehicle → mutation to resume scan.
8. Scan reaches `COMPLETED` → redirect to Diagnostic Session detail page showing fault codes.

---

## 6. Prisma Data Model Design

### New Models

#### `DesktopAgent`

Represents an installed and paired Desktop Agent instance.

```prisma
model DesktopAgent {
  id             String        @id @default(uuid()) @db.Uuid
  organizationId String        @db.Uuid
  userId         String        @db.Uuid
  name           String?       @db.VarChar(100)
  version        String        @db.VarChar(20)
  status         AgentStatus   @default(OFFLINE)
  pairedAt       DateTime      @default(now()) @db.Timestamptz(6)
  lastSeenAt     DateTime?     @db.Timestamptz(6)
  createdAt      DateTime      @default(now()) @db.Timestamptz(6)
  updatedAt      DateTime      @updatedAt @db.Timestamptz(6)

  scanJobs       ScanJob[]

  @@index([organizationId])
  @@index([organizationId, status])
  @@index([organizationId, userId])
}
```

#### `ScanJob`

Represents a single OBD scan operation initiated by a user.

```prisma
model ScanJob {
  id              String         @id @default(uuid()) @db.Uuid
  organizationId  String         @db.Uuid
  userId          String         @db.Uuid
  agentId         String         @db.Uuid
  vehicleId       String?        @db.Uuid
  diagnosticSessionId String?    @db.Uuid
  status          ScanJobStatus  @default(PENDING)
  adapterType     String?        @db.VarChar(50)
  adapterProtocol String?        @db.VarChar(20)
  vin             String?        @db.VarChar(25)
  errorMessage    String?        @db.VarChar(500)
  startedAt       DateTime?      @db.Timestamptz(6)
  completedAt     DateTime?      @db.Timestamptz(6)
  createdAt       DateTime       @default(now()) @db.Timestamptz(6)
  updatedAt       DateTime       @updatedAt @db.Timestamptz(6)

  agent           DesktopAgent   @relation(fields: [agentId], references: [id])
  vehicle         Vehicle?       @relation(fields: [vehicleId], references: [id])
  diagnosticSession DiagnosticSession? @relation(fields: [diagnosticSessionId], references: [id])
  faultCodes      SessionFaultCode[]

  @@index([organizationId])
  @@index([organizationId, status])
  @@index([organizationId, userId])
  @@index([diagnosticSessionId])
}
```

#### `AdapterConnection`

Represents a connection session between a Desktop Agent and a physical adapter.

```prisma
model AdapterConnection {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @db.Uuid
  agentId        String   @db.Uuid
  adapterType    String   @db.VarChar(50)
  connectionType String   @db.VarChar(20) // USB | BLUETOOTH
  protocol       String?  @db.VarChar(20)  // CAN | ISO | KWP | J1850
  status         String   @db.VarChar(20) // CONNECTED | DISCONNECTED | ERROR
  startedAt      DateTime @default(now()) @db.Timestamptz(6)
  endedAt        DateTime? @db.Timestamptz(6)
  errorMessage   String?  @db.VarChar(500)

  @@index([organizationId])
  @@index([agentId])
  @@index([organizationId, startedAt(sort: Desc)])
}
```

#### `SessionFaultCode`

Represents a fault code imported into a Diagnostic Session from a scan.

```prisma
model SessionFaultCode {
  id                  String   @id @default(uuid()) @db.Uuid
  organizationId      String   @db.Uuid
  diagnosticSessionId String   @db.Uuid
  scanJobId           String   @db.Uuid
  code                String   @db.VarChar(10)
  status              FaultCodeStatus
  ecu                 String?  @db.VarChar(100)
  source              String   @db.VarChar(20) @default("OBD_SCAN")
  importedAt          DateTime @default(now()) @db.Timestamptz(6)
  createdAt           DateTime @default(now()) @db.Timestamptz(6)

  diagnosticSession   DiagnosticSession @relation(fields: [diagnosticSessionId], references: [id])
  scanJob             ScanJob           @relation(fields: [scanJobId], references: [id])

  @@index([organizationId])
  @@index([diagnosticSessionId])
  @@index([organizationId, code])
  @@unique([diagnosticSessionId, scanJobId, code, status, ecu])
}
```

#### `ScanJobAuditRecord`

Immutable audit trail for scan lifecycle events.

```prisma
model ScanJobAuditRecord {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @db.Uuid
  userId         String   @db.Uuid
  scanJobId      String   @db.Uuid
  action         String   @db.VarChar(50)
  status         ScanJobStatus?
  metadata       Json?
  createdAt      DateTime @default(now()) @db.Timestamptz(6)

  @@index([organizationId])
  @@index([scanJobId])
  @@index([organizationId, createdAt(sort: Desc)])
}
```

#### `PairingToken`

Short-lived token for agent pairing.

```prisma
model PairingToken {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @db.Uuid
  userId         String   @db.Uuid
  tokenHash      String   @db.VarChar(255)
  expiresAt      DateTime @db.Timestamptz(6)
  consumedAt     DateTime? @db.Timestamptz(6)
  createdAt      DateTime @default(now()) @db.Timestamptz(6)

  @@index([tokenHash])
  @@index([organizationId, userId])
  @@index([expiresAt])
}
```

### Updated Models

#### `DiagnosticSession` (add relation)

```prisma
model DiagnosticSession {
  // ... existing fields ...
  scanJobs       ScanJob[]
  faultCodes     SessionFaultCode[]
}
```

#### `Vehicle` (add relation)

```prisma
model Vehicle {
  // ... existing fields ...
  scanJobs       ScanJob[]
}
```

### New Enums

```prisma
enum AgentStatus {
  ONLINE
  OFFLINE
  BUSY
}

enum ScanJobStatus {
  PENDING
  RUNNING
  NEEDS_VEHICLE_CONFIRMATION
  COMPLETED
  FAILED
  CANCELLED
}

enum FaultCodeStatus {
  ACTIVE
  PENDING
  PERMANENT
}
```

---

## 7. Entity Relationships

```
Organization
  ├── 1 → Many DesktopAgent
  ├── 1 → Many ScanJob
  ├── 1 → Many AdapterConnection
  ├── 1 → Many SessionFaultCode
  ├── 1 → Many ScanJobAuditRecord
  ├── 1 → Many PairingToken
  ├── 1 → Many Vehicle
  └── 1 → Many DiagnosticSession

DesktopAgent
  └── 1 → Many ScanJob

Vehicle
  └── 1 → Many ScanJob

DiagnosticSession
  ├── 1 → Many ScanJob
  └── 1 → Many SessionFaultCode

ScanJob
  ├── 1 → Many SessionFaultCode
  └── Many → 1 DiagnosticSession
  └── Many → 1 Vehicle
  └── Many → 1 DesktopAgent
```

---

## 8. Database Migration Strategy

### Migration Name

`20260609_add_obd_foundation`

### Migration Order

1. **Create enums**: `AgentStatus`, `ScanJobStatus`, `FaultCodeStatus`
2. **Create `DesktopAgent` table**
3. **Create `PairingToken` table**
4. **Create `ScanJob` table** (with nullable foreign keys to `Vehicle` and `DiagnosticSession`)
5. **Create `AdapterConnection` table**
6. **Create `SessionFaultCode` table**
7. **Create `ScanJobAuditRecord` table**
8. **Add relations** to `DiagnosticSession` and `Vehicle` for `scanJobs` and `faultCodes`
9. **Add indexes** for tenant-scoped queries

### Backward Compatibility

- All new tables are additive. Existing `Vehicle`, `DiagnosticSession`, and audit tables remain unchanged except for optional relation additions.
- Existing API contracts for vehicles and diagnostic sessions are not modified.
- The `vin` field on `Vehicle` already exists as nullable; no schema change required.

### Rollback Plan

- Migration is reversible via Prisma Migrate down command.
- All new tables dropped in reverse order.
- No data loss to existing tables.

---

## 9. API Design

### Web Application APIs (JWT Auth + Tenant Guard + RBAC)

#### Pairing

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/obd/agents/pair` | Technician | Generate a short-lived pairing token for the Desktop Agent |
| `DELETE` | `/obd/agents/:id/unpair` | Technician | Unpair and invalidate an agent |

#### Agent Status

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/obd/agents` | Technician | List paired agents for the tenant |
| `GET` | `/obd/agents/:id/status` | Technician | Get agent online/offline status and adapter state |

#### Scan Management

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/obd/scans` | Technician | Initiate a new scan. Requires online agent with connected adapter. |
| `GET` | `/obd/scans` | Technician | List scan jobs for the tenant (paginated) |
| `GET` | `/obd/scans/:id` | Technician | Get scan job details and current status |
| `GET` | `/obd/scans/:id/results` | Technician | Get fault codes imported by this scan |
| `POST` | `/obd/scans/:id/cancel` | Technician | Cancel a running scan |
| `POST` | `/obd/scans/:id/confirm-vehicle` | Technician | Confirm or create vehicle when VIN is unknown (resumes scan) |

### Desktop Agent APIs (Agent Token Auth)

Agent APIs use a dedicated `X-Agent-Token` header for authentication. The token is obtained during pairing exchange.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/obd/agents/:id/heartbeat` | Agent Token | Report agent liveness |
| `POST` | `/obd/agents/register` | Pairing Token | Exchange pairing token for agent access token |
| `GET` | `/obd/agents/:id/scan-queue` | Agent Token | Poll for pending scan commands |
| `POST` | `/obd/agents/:id/scan-events` | Agent Token | Push scan progress and results |
| `POST` | `/obd/agents/:id/adapter-status` | Agent Token | Report adapter connection/disconnection events |

### DTO Summary

#### Request DTOs

- `CreateScanJobDto`: `{ vehicleId?: string }` — if provided, skip VIN-based resolution
- `ConfirmVehicleDto`: `{ make: string; model: string; year: number; vin: string; plateNumber?: string }` — for manual vehicle creation during scan
- `PairingTokenRequestDto`: `{ agentName?: string }`
- `AgentHeartbeatDto`: `{ version: string; adapterConnected: boolean; adapterType?: string; protocol?: string }`
- `ScanEventDto`: `{ event: 'VIN_READ' | 'DTC_READ' | 'ERROR'; payload: unknown }`
- `FaultCodeImportDto`: `{ code: string; status: 'ACTIVE' | 'PENDING' | 'PERMANENT'; ecu?: string }[]`

#### Response DTOs

- `ScanJobResponseDto`: `{ id; status; vehicleId?; diagnosticSessionId?; vin?; adapterType?; protocol?; startedAt?; completedAt?; errorMessage?; createdAt }`
- `PairingTokenResponseDto`: `{ token: string; expiresAt: Date }`
- `AgentStatusResponseDto`: `{ id; name; version; status; lastSeenAt?; adapterConnected: boolean }`
- `FaultCodeListResponseDto`: `{ data: { code; status; ecu?; source; importedAt }[] }`

---

## 10. Agent Communication Design

### Protocol: HTTPS REST Polling (MVP)

The Desktop Agent communicates with the backend over HTTPS REST. For the MVP, the agent uses **short polling** for scan commands and **immediate POST** for results.

#### Command Polling

- Agent polls `GET /obd/agents/:id/scan-queue` every 2 seconds when idle.
- Backend returns the next pending `ScanJob` for this agent, or `204 No Content` if empty.
- Agent transitions to `BUSY` status while executing a scan.

#### Event Pushing

- Agent POSTs scan events to `/obd/agents/:id/scan-events` as they occur.
- Events are idempotent by `scanJobId` + `eventType` + `sequenceNumber`.
- Backend updates `ScanJob` status and writes audit records.

#### Heartbeat

- Agent POSTs heartbeat to `/obd/agents/:id/heartbeat` every 30 seconds.
- Backend updates `lastSeenAt` and `status`.
- If heartbeat is missed for > 60 seconds, backend marks agent as `OFFLINE`.

### Future: WebSocket / SSE

The polling architecture is intentionally simple for MVP. A future enhancement may introduce WebSocket or Server-Sent Events for lower-latency scan progress updates. The event schema is designed to be transport-agnostic.

---

## 11. Pairing & Authentication Design

### Pairing Flow

```
┌─────────────┐          ┌──────────────┐          ┌─────────────┐
│   Web App   │          │   Backend    │          │Desktop Agent│
└──────┬──────┘          └──────┬───────┘          └──────┬──────┘
       │                        │                         │
       │ 1. POST /obd/agents/pair                        │
       │──────────────────────►│                         │
       │                        │                         │
       │ 2. PairingTokenResponse                        │
       │◄──────────────────────│                         │
       │                        │                         │
       │ 3. User copies token   │                         │
       │   (e.g., ABC-123-DEF)  │                         │
       │─────────────────────────┐                         │
       │                         │                         │
       │                         ▼                         │
       │                        ┌─────────────────────────┐│
       │                        │  User pastes token into ││
       │                        │  Desktop Agent UI       ││
       │                        └─────────────────────────┘│
       │                        │                         │
       │                        │ 4. POST /obd/agents/register
       │                        │────────────────────────►│
       │                        │   { pairingToken }      │
       │                        │                         │
       │                        │ 5. AgentAccessToken     │
       │                        │◄────────────────────────│
       │                        │                         │
       │                        │ 6. Agent stores token   │
       │                        │    and begins heartbeat │
       │                        │◄────────────────────────│
       │                        │                         │
```

### Token Security

- **Pairing Token**: 12-character alphanumeric, case-insensitive. Valid for 5 minutes. Single-use. Hashed with SHA-256 before storage.
- **Agent Access Token**: 256-bit cryptographically random string. Stored as bcrypt hash on backend. Passed in `X-Agent-Token` header. Rotatable via re-pairing.
- **Token Binding**: Pairing token is bound to `(organizationId, userId)`. Agent registration creates a `DesktopAgent` record with the same `organizationId` and `userId`.

### Expiration & Cleanup

- Pairing tokens auto-expire after 5 minutes.
- Consumed tokens are marked `consumedAt` and cannot be reused.
- Agent access tokens are valid until explicit unpairing, user logout (backend-side token revocation), or 30 days of inactivity.
- A background job (or Prisma cron) cleans expired pairing tokens nightly.

---

## 12. DTO Design

### Validation Rules

All DTOs use `class-validator` decorators.

#### `CreateScanJobDto`

```typescript
export class CreateScanJobDto {
  @IsOptional()
  @IsUUID()
  vehicleId?: string;
}
```

- If `vehicleId` is provided, the scan skips VIN reading and uses the specified vehicle.
- If `vehicleId` is absent, the scan proceeds with automatic VIN-based resolution.

#### `ConfirmVehicleDto`

```typescript
export class ConfirmVehicleDto {
  @IsString()
  @Length(1, 100)
  make: string;

  @IsString()
  @Length(1, 100)
  model: string;

  @IsInt()
  @Min(1900)
  @Max(2100)
  year: number;

  @IsString()
  @Length(17, 17)
  vin: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  plateNumber?: string;
}
```

- All fields required except `plateNumber`.
- `vin` must be exactly 17 characters (ISO 3779).

#### `AgentHeartbeatDto`

```typescript
export class AgentHeartbeatDto {
  @IsString()
  @Length(1, 20)
  version: string;

  @IsBoolean()
  adapterConnected: boolean;

  @IsOptional()
  @IsString()
  adapterType?: string;

  @IsOptional()
  @IsString()
  protocol?: string;
}
```

#### `ScanEventDto`

```typescript
export class ScanEventDto {
  @IsEnum(['VIN_READ', 'DTC_READ', 'ERROR', 'ADAPTER_CONNECTED', 'ADAPTER_DISCONNECTED'])
  event: ScanEventType;

  @IsObject()
  payload: Record<string, unknown>;

  @IsInt()
  @Min(0)
  sequenceNumber: number;
}
```

#### `FaultCodeImportDto`

```typescript
export class FaultCodeImportDto {
  @IsString()
  @Length(5, 10)
  code: string;

  @IsEnum(FaultCodeStatus)
  status: FaultCodeStatus;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  ecu?: string;
}
```

---

## 13. Validation Rules

### Input Validation

| Entity | Field | Rule |
|---|---|---|
| `Vehicle.vin` | 17 characters | ISO 3779 format; letters and digits only (no I, O, Q) |
| `ScanJob.vin` | 17 characters | Same as Vehicle; nullable for manual override |
| `FaultCode.code` | 5–10 characters | Standard DTC format: P0xxx, B0xxx, C0xxx, U0xxx |
| `FaultCode.ecu` | 1–100 characters | Free text; e.g., "Engine", "ABS", "Airbag" |
| `DesktopAgent.version` | 1–20 characters | Semantic version string |
| `PairingToken.tokenHash` | SHA-256 hash | 64-character hex string |

### Business Rule Validation

- A scan cannot be started if the agent is `OFFLINE`.
- A scan cannot be started if no adapter is connected.
- A scan cannot be cancelled if already `COMPLETED` or `FAILED`.
- Vehicle VIN must be unique within a tenant. Cross-tenant duplicates are allowed.
- Fault codes are unique within a `(diagnosticSessionId, scanJobId, code, status, ecu)` tuple.

---

## 14. Scan Workflow Design

### State Machine

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

### Detailed Workflow

| Step | Actor | Action | Backend State | Frontend State |
|---|---|---|---|---|
| 1 | Technician | Clicks "Start Scan" | `PENDING` → `RUNNING` | "Connecting adapter..." |
| 2 | Desktop Agent | Connects adapter; sends `ADAPTER_CONNECTED` | — | "Adapter connected" |
| 3 | Desktop Agent | Reads VIN (Mode 09 PID 02); sends `VIN_READ` | Stores `vin` on `ScanJob` | "Reading VIN..." |
| 4 | Backend | `VinResolutionService.lookup(vin, tenantId)` | — | "Resolving vehicle..." |
| 4a | Backend | VIN matches existing vehicle | Links `vehicleId` | — |
| 4b | Backend | VIN does not match | → `NEEDS_VEHICLE_CONFIRMATION` | Opens `VehicleConfirmModal` |
| 5 | Technician | Confirms/creates vehicle (if 4b) | `NEEDS_VEHICLE_CONFIRMATION` → `RUNNING` | Modal closes |
| 6 | Backend | Creates `DiagnosticSession` | Links `diagnosticSessionId` | "Creating session..." |
| 7 | Desktop Agent | Reads DTCs (Mode 03, 07, 0A); sends `DTC_READ` | — | "Reading fault codes..." |
| 8 | Backend | `FaultCodeImportService.import()` | Creates `SessionFaultCode` records | "Importing results..." |
| 9 | Backend | Marks scan complete | `RUNNING` → `COMPLETED` | Redirects to session |
| 10 | Backend | Writes audit record | `scan_completed` | — |

### Failure Paths

| Failure Point | Result | State Transition |
|---|---|---|
| Agent offline at start | Scan blocked | `PENDING` (never starts) |
| Adapter not found | Scan fails | `PENDING` → `FAILED` |
| VIN read fails | Scan fails OR manual fallback | `RUNNING` → `FAILED` |
| Adapter disconnects mid-scan | Scan fails | `RUNNING` → `FAILED` |
| User cancels | Scan cancelled | `RUNNING` → `CANCELLED` |
| Agent disconnects mid-scan | Scan fails after timeout | `RUNNING` → `FAILED` |

---

## 15. Session Creation Strategy

### Automatic Session Creation

When a scan reaches the session creation step:

1. Backend generates a session number using the existing `buildSessionNumber()` pattern (`DS-{timestamp}-{random}`).
2. Backend creates a `DiagnosticSession` with:
   - `organizationId`: from scan
   - `vehicleId`: resolved vehicle
   - `status`: `OPEN` (default)
   - `title`: Auto-generated, e.g., "OBD Scan — {vehicle.make} {vehicle.model}"
   - `description`: null
   - `createdBy`: scan `userId`
3. Backend links the `ScanJob.diagnosticSessionId` to the new session.
4. Backend writes a `DiagnosticSessionAuditRecord` with action `SESSION_CREATED`.

### Transaction Boundary

Session creation occurs inside the same Prisma transaction as:
- Scan status update
- Fault code import
- Audit record creation

This ensures atomicity: if any step fails, no partial session or orphaned fault codes remain.

---

## 16. Fault Code Storage Strategy

### `SessionFaultCode` — The Foundation Model

For OBD Foundation, fault codes are stored as `SessionFaultCode` records directly linked to `DiagnosticSession`. This is intentionally simple and does **not** yet reference a `MasterFaultCode` or `FaultCode` entity.

**Rationale**: The Fault Code Library feature (Phase 3 on the roadmap) will introduce `MasterFaultCode` intelligence. Decoupling now avoids premature abstraction and migration complexity later.

### Storage Fields

| Field | Purpose |
|---|---|
| `code` | Raw DTC string, e.g., `P0301` |
| `status` | `ACTIVE`, `PENDING`, `PERMANENT` |
| `ecu` | Human-readable ECU/system name, e.g., "Engine", "Transmission" |
| `source` | Always `OBD_SCAN` for this phase |
| `importedAt` | Timestamp of import |
| `scanJobId` | Reference back to the scan that produced this code |

### Bulk Insert

When importing fault codes:
1. Backend receives array of `FaultCodeImportDto` from agent.
2. Backend validates each DTO.
3. Backend performs a Prisma `createMany` (or transactional `create` loop) within the scan completion transaction.
4. Backend writes a single `ScanJobAuditRecord` with action `FAULT_CODES_IMPORTED` and metadata containing the count.

### Uniqueness

The composite unique key `[diagnosticSessionId, scanJobId, code, status, ecu]` prevents exact duplicates while allowing:
- The same code from different ECUs
- The same code in different statuses
- The same code from different scan jobs on the same session (if re-scanned)

---

## 17. Audit Logging Strategy

### Audit Events

| Event | Action String | When |
|---|---|---|
| Scan Started | `SCAN_STARTED` | `ScanJob` transitions to `RUNNING` |
| Scan Completed | `SCAN_COMPLETED` | `ScanJob` transitions to `COMPLETED` |
| Scan Failed | `SCAN_FAILED` | `ScanJob` transitions to `FAILED` |
| Scan Cancelled | `SCAN_CANCELLED` | `ScanJob` transitions to `CANCELLED` |
| Fault Codes Imported | `FAULT_CODES_IMPORTED` | After `SessionFaultCode` records created |
| Manual VIN Entry | `MANUAL_VIN_ENTRY` | When user provides VIN instead of OBD read |

### Audit Record Schema

```
ScanJobAuditRecord
  id             UUID
  organizationId UUID (tenant scope)
  userId         UUID (who initiated)
  scanJobId      UUID
  action         String (50)
  status         ScanJobStatus (optional, snapshot at time of event)
  metadata       JSON (contextual data)
  createdAt      Timestamp
```

### Transaction Atomicity

Every audit record is written in the **same Prisma transaction** as the business mutation it describes. This guarantees:
- No mutation without audit.
- No audit without mutation.
- Rollback of both if either fails.

### Immutable Guarantee

- Audit records have no `updatedAt` field.
- No API endpoint exposes update or delete for audit records.
- Soft delete (if ever needed) is handled by an `archivedAt` field on the parent entity, never by modifying audit records.

---

## 18. Transaction Boundaries

### Transaction 1: Scan Initiation

```typescript
prisma.$transaction(async (tx) => {
  // 1. Create ScanJob (PENDING)
  // 2. Write SCAN_STARTED audit
});
```

### Transaction 2: Scan Completion (Success)

```typescript
prisma.$transaction(async (tx) => {
  // 1. Update ScanJob status → COMPLETED
  // 2. Create DiagnosticSession (if not exists)
  // 3. Link ScanJob.diagnosticSessionId
  // 4. Bulk insert SessionFaultCode records
  // 5. Write SCAN_COMPLETED audit
  // 6. Write FAULT_CODES_IMPORTED audit
});
```

### Transaction 3: Vehicle Confirmation During Scan

```typescript
prisma.$transaction(async (tx) => {
  // 1. Create Vehicle (if new)
  // 2. Write vehicle audit record
  // 3. Update ScanJob.vehicleId
  // 4. Update ScanJob.status → RUNNING (resume)
});
```

### Transaction Isolation Level

Prisma defaults to `Serializable` for PostgreSQL. This is acceptable for MVP volume. If contention arises on `ScanJob` status updates, the service layer uses optimistic locking (retry on `P2034` transaction conflict).

---

## 19. Tenant Isolation Strategy

### Enforcement Layers

| Layer | Mechanism |
|---|---|
| **Controller** | `@TenantGuard` extracts `organizationId` from JWT and injects into request context. |
| **Service** | Every service method receives `organizationId` as first parameter and passes it to repositories. |
| **Repository** | Every Prisma query includes `where: { organizationId }`. No repository query omits this filter. |
| **DTO** | No DTO carries `organizationId`; it is injected by the guard from the authenticated token. |
| **Database** | Every new table has `organizationId` indexed. Composite indexes always lead with `organizationId`. |

### Cross-Tenant Vehicle Match Prevention

When resolving VIN:
```typescript
const vehicle = await tx.vehicle.findFirst({
  where: {
    vin: vinFromObd,
    organizationId: scanOrganizationId, // ← strict tenant filter
  },
});
```

If a VIN exists in another tenant, the query returns `null` and the scan proceeds to `NEEDS_VEHICLE_CONFIRMATION`. The user in the current tenant never learns the VIN exists elsewhere.

---

## 20. RBAC Permission Mapping

### New Permissions

| Permission | Resource | Action | Roles |
|---|---|---|---|
| `obd:scan:create` | ScanJob | Create / Start | Technician, Workshop Manager |
| `obd:scan:read` | ScanJob | View / List | Technician, Service Advisor, Workshop Manager |
| `obd:scan:cancel` | ScanJob | Cancel | Technician, Workshop Manager |
| `obd:agent:pair` | DesktopAgent | Pair / Unpair | Technician, Workshop Manager |
| `obd:agent:read` | DesktopAgent | View status | Technician, Service Advisor, Workshop Manager |
| `obd:fault-code:read` | SessionFaultCode | View | Technician, Service Advisor, Workshop Manager |

### Permission Enforcement

- Controller methods use `@RequirePermission('obd:scan:create')` decorator.
- `RBACGuard` checks the user's role against the permission matrix in `role-permissions.ts`.
- The `TenantGuard` runs before `RBACGuard` to ensure the user belongs to the requested tenant.

---

## 21. Error Handling Strategy

### Error Categories

| Category | Source | HTTP Status | Response Shape |
|---|---|---|---|
| Validation | class-validator | `400 Bad Request` | `{ code: 'VALIDATION_ERROR', message, details: fieldErrors }` |
| Auth / RBAC | Guards | `401 Unauthorized` / `403 Forbidden` | `{ code: 'UNAUTHORIZED' / 'FORBIDDEN', message }` |
| Tenant Isolation | Guards / Service | `403 Forbidden` | `{ code: 'TENANT_ACCESS_DENIED', message }` |
| Resource Not Found | Repository / Service | `404 Not Found` | `{ code: 'SCAN_JOB_NOT_FOUND' / 'AGENT_NOT_FOUND', message }` |
| Business Conflict | Service | `409 Conflict` | `{ code: 'AGENT_OFFLINE' / 'SCAN_ALREADY_COMPLETED', message }` |
| Adapter / Agent Error | Agent event | `422 Unprocessable` | `{ code: 'ADAPTER_DISCONNECTED' / 'VIN_READ_FAILED', message }` |
| Internal Error | Unexpected | `500 Internal Server Error` | `{ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' }` |

### Error Codes

New error codes for OBD module:
- `AGENT_NOT_FOUND`
- `AGENT_OFFLINE`
- `AGENT_NOT_PAIRED`
- `ADAPTER_NOT_CONNECTED`
- `SCAN_JOB_NOT_FOUND`
- `SCAN_JOB_INVALID_STATE`
- `VIN_READ_FAILED`
- `VEHICLE_CONFIRMATION_REQUIRED`
- `PAIRING_TOKEN_EXPIRED`
- `PAIRING_TOKEN_INVALID`

### Frontend Error Handling

- API errors are caught by Axios interceptors and passed to a global error boundary.
- Business errors (e.g., `AGENT_OFFLINE`) display a toast notification with a specific action button (e.g., "Check Agent Status").
- Scan failures show a persistent error state in the `ScanProgressTimeline` with a "Retry" option.

---

## 22. State Management Strategy

### Backend State

#### ScanJob Status Machine

- `PENDING`: Created, awaiting agent to start.
- `RUNNING`: Agent is executing scan commands.
- `NEEDS_VEHICLE_CONFIRMATION`: VIN does not match; awaiting user input.
- `COMPLETED`: All steps succeeded; fault codes imported.
- `FAILED`: An unrecoverable error occurred.
- `CANCELLED`: User explicitly cancelled.

Valid transitions:
- `PENDING` → `RUNNING`
- `RUNNING` → `NEEDS_VEHICLE_CONFIRMATION`
- `NEEDS_VEHICLE_CONFIRMATION` → `RUNNING`
- `RUNNING` → `COMPLETED`
- `RUNNING` → `FAILED`
- `RUNNING` → `CANCELLED`
- `PENDING` → `CANCELLED`

Invalid transitions return `SCAN_JOB_INVALID_STATE`.

#### Agent Status

- `ONLINE`: Heartbeat received within last 60 seconds.
- `OFFLINE`: No heartbeat for > 60 seconds.
- `BUSY`: Agent reported it is executing a scan.

### Frontend State

#### Server State (TanStack Query)

- `agentStatus` query: refetch every 5 seconds.
- `scanJob` query: refetch every 2 seconds when status is `PENDING`, `RUNNING`, or `NEEDS_VEHICLE_CONFIRMATION`.
- `faultCodes` query: refetch on manual invalidation after scan completes.

#### UI State (React State / URL)

- `scanJobId` in URL query param for deep-linking to a scan.
- `isVehicleModalOpen` boolean for the confirmation modal.
- `selectedAdapterId` in agent connection flow (future multi-adapter support).

---

## 23. Testing Strategy

### Backend Tests

| Test Type | Scope | Examples |
|---|---|---|
| **Unit** | Service logic in isolation | `ObdScanService` state transitions; `VinResolutionService` tenant-scoped lookup |
| **Unit** | Repository queries | `ScanJobRepository` status updates; `DesktopAgentRepository` heartbeat processing |
| **Unit** | DTO validation | `ConfirmVehicleDto` rejects invalid VIN lengths |
| **Integration** | Controller + Service + Repository + DB | Full scan workflow from `POST /obd/scans` to `COMPLETED` with seeded agent and adapter |
| **Integration** | Agent API endpoints | Heartbeat updates agent status; pairing token exchange |
| **Security** | RBAC + Tenant Guard | Technician cannot cancel another technician's scan; cross-tenant access blocked |

### Frontend Tests

| Test Type | Scope | Examples |
|---|---|---|
| **Unit** | Component rendering | `AgentStatusCard` shows "Offline" when heartbeat stale |
| **Unit** | Hook logic | `useObdScan` polling stops when scan reaches terminal state |
| **E2E** | Full user flow | Technician pairs agent, connects adapter, starts scan, views fault codes |

### Desktop Agent Tests

| Test Type | Scope | Examples |
|---|---|---|
| **Unit** | Command parsing | `dtc.py` parses Mode 03 response into `P0301` |
| **Unit** | Adapter abstraction | `elm327.py` sends correct ATZ initialization sequence |
| **Integration** | API client | `api_client.py` retries on 500, backs off on 429 |
| **Integration** | Pairing flow | `pairing.py` exchanges token and stores access token |

### Test Data Fixtures

- Mock ELM327 responses for VIN and DTC commands.
- Seeded `Vehicle` with known VIN for positive-match tests.
- Seeded `Vehicle` in a different tenant for cross-tenant isolation tests.

---

## 24. Future Extension Points

The OBD Foundation schema and architecture are designed to support the following future features without schema redesign:

### Live Data (Phase 5+)

- `ScanJob` can be extended with a `mode: 'SCAN' | 'LIVE_DATA'` enum.
- `AdapterConnection` already tracks `protocol`; live data PIDs are protocol-specific.
- Agent polling loop can be repurposed for periodic PID reads.

### Freeze Frame (Phase 5+)

- `ScanJob` metadata JSON can store freeze frame snapshots.
- `SessionFaultCode` metadata JSON can store associated freeze frame data.

### AI Analysis (Phase 4)

- `DiagnosticSession` already exists. AI Analysis attaches to it.
- `SessionFaultCode` provides the raw input for AI recommendation generation.
- No OBD schema changes required.

### Reports (Phase 5+)

- `DiagnosticSession` with `SessionFaultCode` records is the source data for PDF report generation.
- `ScanJob` provides metadata (adapter type, protocol) for report context.

### PrioraFlow Integration (Phase 6)

- `DiagnosticSession` is the integration payload. OBD Foundation does not alter the session model.
- `ScanJob` can include a `prioraFlowJobCardId` foreign key in a future migration.

### Master Fault Code Library (Phase 3)

- `SessionFaultCode` remains the session-specific instance.
- A future `MasterFaultCode` table is introduced with a `code` primary key.
- A non-foreign-key mapping (e.g., `SessionFaultCode.code` → `MasterFaultCode.code` lookup) is used to enrich descriptions without altering `SessionFaultCode`.

### Multi-ECU Deep Scan (Future)

- `SessionFaultCode.ecu` field already supports distinct ECU sources.
- Agent `DTC_READ` event payload can be extended with ECU address without breaking the API contract.

### Additional Adapter Types (Future)

- `AdapterConnection.adapterType` is a free string. New adapter families (e.g., J2534) require no schema change.
- `DesktopAgent` is adapter-agnostic.

---

## Appendix: Research & Decisions

### Phase 0: Resolved Unknowns

| Unknown | Decision | Rationale |
|---|---|---|
| ELM327 connection interfaces | USB + Bluetooth | USB is most reliable for MVP. Bluetooth covers wireless use cases. Wi-Fi adds network complexity and is deferred. |
| Desktop Agent authentication | Short-lived pairing token | Simplest to implement; secure; no long-lived API keys to manage; user explicitly controls pairing. |
| Scan workflow automation | Hybrid (auto + pause for new vehicle) | Speeds common case (known vehicle); prevents accidental vehicle creation from misread VIN; balances UX and data integrity. |
| Agent-to-backend transport | HTTPS REST polling | Simplest cross-platform solution. WebSocket/SSE deferred to future phase for real-time live data. |
| Fault code intelligence model | Deferred to Phase 3 | `SessionFaultCode` is sufficient for scan import. `MasterFaultCode` introduces unnecessary complexity for MVP. |
| Python agent libraries | `pyserial` (USB), `bleak` (Bluetooth) | `pyserial` is mature and cross-platform. `bleak` is the modern asyncio-native BLE library. Both are actively maintained. |
| Heartbeat interval | 30 seconds; offline threshold 60 seconds | Balances liveness detection with network load. 2 missed heartbeats = offline. |
| Pairing token lifetime | 5 minutes | Long enough for user to copy-paste; short enough to limit exposure. |
