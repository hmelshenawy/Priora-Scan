# Tasks: OBD Foundation

**Input**: Design documents from `/specs/004-obd-foundation/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [data-model.md](data-model.md), [contracts/agent-api-contract.md](contracts/agent-api-contract.md), [contracts/scan-workflow-contract.md](contracts/scan-workflow-contract.md), [research.md](research.md), [quickstart.md](quickstart.md)

**Organization**: Tasks are grouped by phase, aligned with user stories and the approved plan, to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, workspace creation, and tool configuration

- [x] T001 [P] Create `desktop-agent/` directory structure per plan.md (`desktop-agent/src/obd/`, `desktop-agent/src/models/`, `desktop-agent/tests/`, `desktop-agent/requirements.txt`)
- [x] T002 [P] Create `backend/src/obd/` module directory structure (`controllers/`, `services/`, `repositories/`, `dtos/`, `types/`)
- [x] T003 [P] Create `frontend/src/components/obd/` and `frontend/src/hooks/` directories for OBD UI components
- [x] T004 [P] Add `obd` module import and registration in `backend/src/app.module.ts`
- [x] T005 [P] Add new OBD permissions to `backend/src/auth/constants/role-permissions.ts` (`obd:scan:create`, `obd:scan:read`, `obd:scan:cancel`, `obd:agent:pair`, `obd:agent:read`, `obd:fault-code:read`)

---

## Phase 2: Foundation (Blocking Prerequisites)

**Purpose**: Prisma schema migration, enums, base repositories, and shared types that ALL downstream phases depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Prisma Schema

- [x] T006 [P] Add `AgentStatus` enum to `backend/prisma/schema.prisma` (`ONLINE`, `OFFLINE`, `BUSY`)
- [x] T007 [P] Add `ScanJobStatus` enum to `backend/prisma/schema.prisma` (`PENDING`, `RUNNING`, `NEEDS_VEHICLE_CONFIRMATION`, `COMPLETED`, `FAILED`, `CANCELLED`)
- [x] T008 [P] Add `FaultCodeStatus` enum to `backend/prisma/schema.prisma` (`ACTIVE`, `PENDING`, `PERMANENT`)
- [x] T009 [P] Add `DesktopAgent` model to `backend/prisma/schema.prisma` with all fields, indexes, and `1 → Many ScanJob` relation
- [x] T010 [P] Add `PairingToken` model to `backend/prisma/schema.prisma` with all fields, indexes, and `tokenHash` index
- [x] T011 [P] Add `ScanJob` model to `backend/prisma/schema.prisma` with all fields, indexes, and relations to `DesktopAgent`, `Vehicle`, `DiagnosticSession`
- [x] T012 [P] Add `AdapterConnection` model to `backend/prisma/schema.prisma` with all fields and indexes
- [x] T013 [P] Add `SessionFaultCode` model to `backend/prisma/schema.prisma` with all fields, indexes, unique constraint `[diagnosticSessionId, scanJobId, code, status, ecu]`, and relations to `DiagnosticSession` and `ScanJob`
- [x] T014 [P] Add `ScanJobAuditRecord` model to `backend/prisma/schema.prisma` with all fields, indexes, and NO `updatedAt` field
- [x] T015 Add relations `scanJobs` and `faultCodes` to existing `DiagnosticSession` model in `backend/prisma/schema.prisma`
- [x] T016 Add relation `scanJobs` to existing `Vehicle` model in `backend/prisma/schema.prisma`
- [x] T017 Generate and run Prisma migration `npx prisma migrate dev --name add_obd_foundation`
- [x] T018 Regenerate Prisma Client with `npx prisma generate`

### Shared Types & Contracts

- [x] T019 [P] Create `backend/src/obd/types/scan-job-status.enum.ts` exporting `ScanJobStatus` enum mapping Prisma values
- [x] T020 [P] Create `backend/src/obd/types/agent-status.enum.ts` exporting `AgentStatus` enum mapping Prisma values
- [x] T021 [P] Create `backend/src/obd/types/fault-code-status.enum.ts` exporting `FaultCodeStatus` enum mapping Prisma values
- [x] T022 [P] Create `backend/src/obd/types/adapter-protocol.enum.ts` with supported protocol strings (`CAN`, `ISO`, `KWP`, `J1850`)
- [x] T023 [P] Create `backend/src/obd/types/scan-event-type.enum.ts` with agent event types (`ADAPTER_CONNECTED`, `ADAPTER_DISCONNECTED`, `VIN_READ`, `VIN_READ_FAILED`, `DTC_READ`, `DTC_READ_FAILED`, `ERROR`)

**Checkpoint**: Prisma schema migrated, client generated, all OBD types defined. Foundation ready.

---

## Phase 3: Desktop Agent Pairing (US1 — Connect Adapter, US2 — Disconnect Adapter)

**Goal**: Technicians can pair a Desktop Agent with their tenant via a short-lived token, and disconnect/unpair when finished.

**Independent Test**: A technician can click "Pair Agent" in the web app, receive a token, enter it into the agent, and see the agent status change to "Online". The technician can also unpair the agent.

### Tests for Phase 3

- [ ] T024 [P] [US1] Write integration test for pairing token generation in `backend/tests/integration/obd/pairing-token.integration.test.ts`
- [ ] T025 [P] [US1] Write integration test for agent registration (token exchange) in `backend/tests/integration/obd/agent-registration.integration.test.ts`
- [ ] T026 [P] [US1] Write integration test for agent unpair in `backend/tests/integration/obd/agent-unpair.integration.test.ts`

### Backend — Pairing

- [x] T027 [P] [US1] Create `PairingTokenRequestDto` in `backend/src/obd/dtos/pairing-token-request.dto.ts` with optional `agentName` field and class-validator decorators
- [x] T028 [P] [US1] Create `PairingTokenResponseDto` in `backend/src/obd/dtos/pairing-token-response.dto.ts` with `token` and `expiresAt` fields
- [x] T029 [P] [US1] Create `DesktopAgentRepository` in `backend/src/obd/repositories/desktop-agent.repository.ts` with `create`, `findById`, `findByOrganization`, `updateStatus`, `delete` methods (all tenant-scoped)
- [x] T030 [P] [US1] Create `AgentPairingService` in `backend/src/obd/services/agent-pairing.service.ts` with `generatePairingToken`, `exchangePairingToken`, `unpairAgent` methods
- [x] T031 [US1] Implement `generatePairingToken` in `AgentPairingService`: create 12-char alphanumeric token, hash with SHA-256, store in `PairingToken` with 5-minute expiry, bind to `(organizationId, userId)`
- [x] T032 [US1] Implement `exchangePairingToken` in `AgentPairingService`: validate hash, mark consumed, create `DesktopAgent` record, return agent access token (256-bit random)
- [x] T033 [US1] Implement `unpairAgent` in `AgentPairingService`: delete `DesktopAgent`, invalidate access token, write audit-like cleanup (optional log)
- [x] T034 [US1] Create `AgentPairingController` in `backend/src/obd/controllers/agent-pairing.controller.ts` with `POST /obd/agents/pair` (JWT + RBAC `obd:agent:pair`) and `DELETE /obd/agents/:id/unpair` endpoints
- [x] T035 [US1] Create `AgentWebhookController` in `backend/src/obd/controllers/agent-webhook.controller.ts` with `POST /obd/agents/register` (pairing token exchange, no JWT)

### Backend — Agent Status Queries

- [x] T036 [P] [US1] Create `AgentStatusResponseDto` in `backend/src/obd/dtos/agent-status-response.dto.ts`
- [x] T037 [US1] Add `GET /obd/agents` to `AgentPairingController` (list paired agents for tenant, JWT + RBAC)
- [x] T038 [US1] Add `GET /obd/agents/:id/status` to `AgentPairingController` (return agent status and adapter connection state)

### Desktop Agent — Pairing

- [x] T039 [P] [US1] Create `desktop-agent/src/config.py` with `PRIORASCAN_API_URL` env loading and validation
- [x] T040 [P] [US1] Create `desktop-agent/src/api_client.py` with base HTTP client (httpx), retry logic for 500/429, and `X-Agent-Token` header injection
- [x] T041 [US1] Create `desktop-agent/src/pairing.py` with `exchange_pairing_token(pairing_token, agent_name, version)` function that calls `POST /obd/agents/register` and stores returned `accessToken` and `agentId`
- [x] T042 [US1] Create `desktop-agent/src/main.py` CLI entry point with `pair` subcommand that prompts for token and calls pairing flow

**Checkpoint**: Phase 3 complete. Pairing/unpairing works end-to-end.

---

## Phase 4: Agent Heartbeat (FR-018, FR-019)

**Goal**: Backend tracks agent liveness, version, and online status via periodic heartbeats.

**Independent Test**: A paired agent sends heartbeats every 30 seconds; the web app shows "Online" status. After 60 seconds of silence, status changes to "Offline".

### Tests for Phase 4

- [ ] T043 [P] Write integration test for heartbeat updates in `backend/tests/integration/obd/agent-heartbeat.integration.test.ts`
- [ ] T044 [P] Write integration test for offline detection after missed heartbeats in `backend/tests/integration/obd/agent-offline.integration.test.ts`

### Backend — Heartbeat

- [x] T045 [P] Create `AgentHeartbeatDto` in `backend/src/obd/dtos/agent-heartbeat.dto.ts` with `version`, `adapterConnected`, `adapterType`, `protocol` fields and class-validator decorators
- [x] T046 Create `AgentHeartbeatService` in `backend/src/obd/services/agent-heartbeat.service.ts` with `processHeartbeat(agentId, dto)` and `markOfflineAgents()` methods
- [x] T047 Implement `processHeartbeat` in `AgentHeartbeatService`: update `DesktopAgent.lastSeenAt`, `status`, `version`, and adapter state in same transaction
- [x] T048 Implement `markOfflineAgents` in `AgentHeartbeatService`: query agents with `lastSeenAt < now - 60 seconds` and set `status = OFFLINE`
- [x] T049 Add `POST /obd/agents/:id/heartbeat` to `AgentWebhookController` (agent token auth, no JWT)
- [x] T050 Add a NestJS scheduled task (e.g., `@Interval(30000)` or cron) that calls `markOfflineAgents` every 30 seconds in `backend/src/obd/services/agent-heartbeat.service.ts`

### Desktop Agent — Heartbeat

- [x] T051 Create `desktop-agent/src/heartbeat.py` with `send_heartbeat(api_client, agent_id, version, adapter_state)` function
- [x] T052 Integrate heartbeat loop into `desktop-agent/src/main.py`: send heartbeat every 30 seconds while running

**Checkpoint**: Phase 4 complete. Heartbeat and offline detection functional.

---

## Phase 5: Scan Workflow (US4 — Start Scan From Web App)

**Goal**: A technician can initiate an OBD scan from the web app, and the backend orchestrates the scan lifecycle with proper state transitions.

**Independent Test**: An authenticated user clicks "Start Scan" with an online agent and connected adapter. A `ScanJob` is created with status `PENDING`, transitions to `RUNNING`, and can be cancelled.

### Tests for Phase 5

- [ ] T053 [P] [US4] Write integration test for scan initiation in `backend/tests/integration/obd/scan-initiate.integration.test.ts`
- [ ] T054 [P] [US4] Write integration test for scan cancellation in `backend/tests/integration/obd/scan-cancel.integration.test.ts`
- [ ] T055 [P] [US4] Write integration test for invalid state transitions in `backend/tests/integration/obd/scan-state.integration.test.ts`

### Backend — Scan Job Lifecycle

- [x] T056 [P] [US4] Create `CreateScanJobDto` in `backend/src/obd/dtos/create-scan-job.dto.ts` with optional `vehicleId` field
- [x] T057 [P] [US4] Create `ScanJobResponseDto` in `backend/src/obd/dtos/scan-job-response.dto.ts` with all fields from plan.md
- [x] T058 [P] [US4] Create `ScanJobRepository` in `backend/src/obd/repositories/scan-job.repository.ts` with `create`, `findById`, `findByOrganization`, `updateStatus`, `listForAgent` methods (all tenant-scoped)
- [x] T059 [US4] Create `ObdScanService` in `backend/src/obd/services/obd-scan.service.ts` with scan state machine
- [x] T060 [US4] Implement `ObdScanService.createScan` in `backend/src/obd/services/obd-scan.service.ts`: validate agent is `ONLINE` and adapter connected, create `ScanJob` (`PENDING`), write `SCAN_STARTED` audit in transaction
- [x] T061 [US4] Implement `ObdScanService.cancelScan` in `backend/src/obd/services/obd-scan.service.ts`: validate scan is `PENDING` or `RUNNING`, transition to `CANCELLED`, write `SCAN_CANCELLED` audit in transaction
- [x] T062 [US4] Implement scan state transition validation in `ObdScanService`: reject invalid transitions (e.g., `COMPLETED` → any) with `SCAN_JOB_INVALID_STATE` error
- [x] T063 [US4] Add `POST /obd/scans` to `ObdScanController` in `backend/src/obd/controllers/obd-scan.controller.ts` (JWT + RBAC `obd:scan:create` + TenantGuard)
- [x] T064 [US4] Add `GET /obd/scans` to `ObdScanController` (JWT + RBAC `obd:scan:read` + TenantGuard, paginated)
- [x] T065 [US4] Add `GET /obd/scans/:id` to `ObdScanController` (JWT + RBAC `obd:scan:read` + TenantGuard)
- [x] T066 [US4] Add `POST /obd/scans/:id/cancel` to `ObdScanController` (JWT + RBAC `obd:scan:cancel` + TenantGuard)

### Backend — Agent Command Queue

- [x] T067 [US4] Add `GET /obd/agents/:id/scan-queue` to `AgentWebhookController` (agent token auth): return next `PENDING` scan job for this agent, or `204 No Content`
- [x] T068 [US4] Implement queue logic: when agent polls, find oldest `PENDING` `ScanJob` for that `agentId`, transition to `RUNNING`, write `SCAN_STARTED` audit, return job with command list

### Desktop Agent — Command Execution

- [x] T069 [US4] Create `desktop-agent/src/models/scan_job.py` with `ScanJob` dataclass
- [x] T070 [US4] Add scan queue polling loop to `desktop-agent/src/main.py`: poll `GET /obd/agents/:id/scan-queue` every 2 seconds when idle, execute returned commands

**Checkpoint**: Phase 5 complete. Scan initiation, cancellation, and agent command queue work.

---

## Phase 6: VIN Resolution (US3 — Read Vehicle VIN)

**Goal**: The Desktop Agent reads VIN from the vehicle, and the backend resolves it to an existing vehicle or pauses for user confirmation.

**Independent Test**: Agent connects adapter and reads a valid 17-char VIN. Backend matches it to a tenant vehicle or transitions scan to `NEEDS_VEHICLE_CONFIRMATION`.

### Tests for Phase 6

- [ ] T071 [P] [US3] Write integration test for VIN-based vehicle resolution in `backend/tests/integration/obd/vin-resolution.integration.test.ts`
- [ ] T072 [P] [US3] Write integration test for cross-tenant VIN isolation in `backend/tests/integration/obd/vin-tenant-isolation.integration.test.ts`

### Backend — VIN Resolution

- [x] T073 [P] [US3] Create `VinResolutionService` in `backend/src/obd/services/vin-resolution.service.ts`
- [x] T074 [US3] Implement `VinResolutionService.resolve(vin, organizationId)` in `backend/src/obd/services/vin-resolution.service.ts`: query `Vehicle` by `vin + organizationId`, return vehicle or `null` (cross-tenant matches treated as `null`)
- [x] T075 [US3] Implement `VinResolutionService.validateVin(vin)` in `backend/src/obd/services/vin-resolution.service.ts`: 17 chars, alphanumeric, no I/O/Q
- [x] T076 [US3] Add VIN handling to `ObdScanService`: on `VIN_READ` event from agent, call `VinResolutionService.resolve`, update `ScanJob.vin`, if match found set `vehicleId` and continue; if no match transition to `NEEDS_VEHICLE_CONFIRMATION`

### Backend — Vehicle Confirmation

- [x] T077 [P] [US3] Create `ConfirmVehicleDto` in `backend/src/obd/dtos/confirm-vehicle.dto.ts` with `make`, `model`, `year`, `vin`, `plateNumber` fields and class-validator decorators (vin must be exactly 17 chars)
- [x] T078 [US3] Add `POST /obd/scans/:id/confirm-vehicle` to `ObdScanController` (JWT + RBAC `obd:scan:create` + TenantGuard)
- [x] T079 [US3] Implement `ObdScanService.confirmVehicle(scanJobId, dto, organizationId, userId)`: create `Vehicle` via existing `VehicleService` or `VehicleRepository`, link to `ScanJob`, transition scan to `RUNNING`, write audit in transaction

### Desktop Agent — VIN Command

- [x] T080 [P] [US3] Create `desktop-agent/src/obd/commands/vin.py` with `read_vin(adapter)` function that sends Mode 09 PID 02 and parses 17-char VIN response
- [x] T081 [US3] Integrate VIN read into agent scan execution flow: after `ADAPTER_CONNECTED`, send `VIN_READ` event with parsed VIN to backend

**Checkpoint**: Phase 6 complete. VIN reading and resolution work end-to-end.

---

## Phase 7: Diagnostic Session Creation (US5 — Auto-create Diagnostic Session From Scan)

**Goal**: When a scan resolves a vehicle, the backend automatically creates a `DiagnosticSession` and links it to the `ScanJob`.

**Independent Test**: After VIN resolution, a `DiagnosticSession` is created with auto-generated title and linked to the vehicle. The scan status transitions to `RUNNING` and continues to DTC reading.

### Tests for Phase 7

- [ ] T082 [P] [US5] Write integration test for automatic session creation during scan in `backend/tests/integration/obd/session-auto-create.integration.test.ts`

### Backend — Session Creation

- [x] T083 [P] [US5] Create `ObdScanService.createSessionFromScan(scanJob, tx)` in `backend/src/obd/services/obd-scan.service.ts`: generate session number, create `DiagnosticSession` with `organizationId`, `vehicleId`, `createdBy`, `title`, `status: OPEN`, link `ScanJob.diagnosticSessionId`
- [x] T084 [US5] Ensure session creation happens inside the same Prisma transaction as scan status update and fault code import (defined in Phase 8 transaction boundary)
- [x] T085 [US5] Write `DiagnosticSessionAuditRecord` for `SESSION_CREATED` action when session is created from scan

### Desktop Agent — Continue After Session Created

- [x] T086 [US5] No agent changes needed — agent continues polling for next command (DTC read)

**Checkpoint**: Phase 7 complete. Automatic diagnostic session creation works.

---

## Phase 8: Fault Code Import (US6 — Read Fault Codes, US7 — Import Fault Codes Into Diagnostic Session)

**Goal**: The Desktop Agent reads active, pending, and permanent DTCs from the vehicle. The backend imports them into the `DiagnosticSession` as `SessionFaultCode` records.

**Independent Test**: A completed scan produces `SessionFaultCode` records with correct `code`, `status`, `ecu`, and `scanJobId`. Duplicate codes across ECUs are preserved. Viewing the session shows all imported codes.

### Tests for Phase 8

- [ ] T087 [P] [US6] Write integration test for fault code import in `backend/tests/integration/obd/fault-code-import.integration.test.ts`
- [ ] T088 [P] [US6] Write integration test for duplicate fault codes across ECUs in `backend/tests/integration/obd/fault-code-duplicates.integration.test.ts`
- [ ] T089 [P] [US6] Write integration test for scan completion audit in `backend/tests/integration/obd/scan-completion-audit.integration.test.ts`

### Backend — Fault Code Import

- [x] T090 [P] [US6] Create `FaultCodeImportDto` in `backend/src/obd/dtos/fault-code-import.dto.ts` with `code` (5–10 chars), `status` (FaultCodeStatus), `ecu` (optional, 1–100 chars)
- [ ] T091 [P] [US6] Create `SessionFaultCodeRepository` in `backend/src/obd/repositories/session-fault-code.repository.ts` with `bulkCreate`, `findBySession`, `findByScanJob` methods (all tenant-scoped)
- [ ] T092 [US6] Create `FaultCodeImportService` in `backend/src/obd/services/fault-code-import.service.ts` with `importFaultCodes(scanJobId, codes, tx)` method
- [ ] T093 [US6] Implement `FaultCodeImportService.importFaultCodes`: validate all DTOs, perform Prisma `createMany` (or transactional create loop) within transaction, write `FAULT_CODES_IMPORTED` audit with count in metadata
- [ ] T094 [US6] Handle duplicate codes across ECUs: the composite unique key `[diagnosticSessionId, scanJobId, code, status, ecu]` preserves distinct ECU sources
- [ ] T095 [US6] Implement `ObdScanService.completeScan(scanJobId, faultCodes)` in `backend/src/obd/services/obd-scan.service.ts`: validate scan is `RUNNING`, call `FaultCodeImportService.importFaultCodes`, transition to `COMPLETED`, set `completedAt`, write `SCAN_COMPLETED` audit in same transaction
- [ ] T096 [US6] Add `GET /obd/scans/:id/results` to `ObdScanController` (JWT + RBAC `obd:fault-code:read` + TenantGuard): return `SessionFaultCode` list for the scan job

### Desktop Agent — DTC Commands

- [ ] T097 [P] [US6] Create `desktop-agent/src/obd/commands/dtc.py` with three functions: `read_current_dtcs(adapter)`, `read_pending_dtcs(adapter)`, `read_permanent_dtcs(adapter)`
- [ ] T098 [US6] Implement DTC parsing in `desktop-agent/src/obd/commands/dtc.py`: parse Mode 03 (current), Mode 07 (pending), Mode 0A (permanent) responses into `{ code, status, ecu }` objects
- [ ] T099 [US6] Integrate DTC read into agent scan execution flow: after session creation, read all three DTC types, aggregate, and send `DTC_READ` event to backend

### Desktop Agent — Error Handling

- [ ] T100 [US6] Add error event handling to agent scan flow: if any command fails, send `ERROR` event with message and abort scan gracefully

**Checkpoint**: Phase 8 complete. Fault code reading, import, and viewing work end-to-end.

---

## Phase 9: Frontend OBD Dashboard (US8 — View Scan Results, US1–US7 UI)

**Goal**: The Next.js web app provides a complete OBD control center: agent status, scan control, progress tracking, and fault code viewing.

**Independent Test**: A technician can view agent status, start a scan, watch progress, confirm a new vehicle, and view imported fault codes in the Diagnostic Session detail page.

### Tests for Phase 9

- [ ] T101 [P] [US8] Write frontend unit test for `AgentStatusCard` in `frontend/src/components/obd/__tests__/AgentStatusCard.test.tsx`
- [ ] T102 [P] [US8] Write frontend unit test for `ScanProgressTimeline` in `frontend/src/components/obd/__tests__/ScanProgressTimeline.test.tsx`
- [ ] T103 [P] [US8] Write frontend integration test (Playwright) for full scan flow in `frontend/tests/e2e/obd-scan-flow.spec.ts`

### Frontend — Hooks

- [ ] T104 [P] [US8] Create `frontend/src/hooks/useAgentStatus.ts` with TanStack Query: poll `GET /obd/agents` every 5 seconds
- [ ] T105 [P] [US8] Create `frontend/src/hooks/useObdScan.ts` with TanStack Query: `startScan` mutation, `getScanJob` query with 2-second polling when active, `cancelScan` mutation
- [ ] T106 [P] [US8] Create `frontend/src/hooks/useAdapterStatus.ts` with TanStack Query: poll agent adapter state

### Frontend — Components

- [ ] T107 [P] [US8] Create `frontend/src/components/obd/AgentStatusCard.tsx`: show agent online/offline/busy status, version, last seen, "Pair Agent" button when no agents
- [ ] T108 [P] [US8] Create `frontend/src/components/obd/ScanControlPanel.tsx`: "Start Scan" button (disabled when agent offline or no adapter), adapter type/protocol display
- [ ] T109 [P] [US8] Create `frontend/src/components/obd/ScanProgressTimeline.tsx`: visual timeline of scan stages, highlight current stage, show completed/failed states
- [ ] T110 [P] [US8] Create `frontend/src/components/obd/FaultCodeList.tsx`: display imported fault codes grouped by ECU, with code, status badge, source
- [ ] T111 [P] [US8] Create `frontend/src/components/obd/VehicleConfirmModal.tsx`: modal with pre-filled VIN-derived data (make/model/year from VIN decode if available), editable fields, confirm button resumes scan
- [ ] T112 [P] [US8] Create `frontend/src/components/obd/PairAgentModal.tsx`: modal showing pairing token with copy button, instructions, expiry countdown

### Frontend — Page

- [ ] T113 [US8] Create `frontend/src/app/obd/page.tsx`: OBD dashboard page composing AgentStatusCard, ScanControlPanel, ScanProgressTimeline, and conditional FaultCodeList
- [ ] T114 [US8] Add navigation link to `/obd` in the main application layout/menu
- [ ] T115 [US8] Update `frontend/src/app/diagnostic-sessions/[id]/page.tsx` (or detail component) to display `SessionFaultCode` list when fault codes exist

**Checkpoint**: Phase 9 complete. Full OBD UI functional.

---

## Phase 10: Security & Tenant Isolation

**Goal**: All OBD endpoints enforce authentication, authorization, tenant isolation, and audit logging.

**Independent Test**: A user from tenant A cannot see agent status, scan jobs, or fault codes from tenant B. RBAC prevents unauthorized actions. All scan lifecycle events have immutable audit records.

### Tests for Phase 10

- [ ] T116 [P] Write security test for cross-tenant scan access in `backend/tests/security/obd-tenant-isolation.security.test.ts`
- [ ] T117 [P] Write security test for unauthorized scan cancellation in `backend/tests/security/obd-rbac.security.test.ts`
- [ ] T118 [P] Write security test for agent token validation in `backend/tests/security/obd-agent-auth.security.test.ts`

### RBAC & Guards

- [ ] T119 Add `@RequirePermission('obd:scan:create')` to `POST /obd/scans` in `ObdScanController`
- [ ] T120 Add `@RequirePermission('obd:scan:read')` to `GET /obd/scans` and `GET /obd/scans/:id` in `ObdScanController`
- [ ] T121 Add `@RequirePermission('obd:scan:cancel')` to `POST /obd/scans/:id/cancel` in `ObdScanController`
- [ ] T122 Add `@RequirePermission('obd:agent:pair')` to `POST /obd/agents/pair` and `DELETE /obd/agents/:id/unpair` in `AgentPairingController`
- [ ] T123 Add `@RequirePermission('obd:agent:read')` to `GET /obd/agents` and `GET /obd/agents/:id/status` in `AgentPairingController`
- [ ] T124 Add `@RequirePermission('obd:fault-code:read')` to `GET /obd/scans/:id/results` in `ObdScanController`
- [ ] T125 Ensure `TenantGuard` runs on ALL OBD controller methods (already implied by existing auth setup, verify for new controllers)

### Agent Token Authentication

- [ ] T126 Create `AgentAuthGuard` in `backend/src/guards/agent-auth.guard.ts`: validate `X-Agent-Token` header against `DesktopAgent` access token hash, reject with 401 if invalid
- [ ] T127 Apply `AgentAuthGuard` to all `AgentWebhookController` endpoints (`/obd/agents/:id/heartbeat`, `/obd/agents/:id/scan-queue`, `/obd/agents/:id/scan-events`, `/obd/agents/:id/adapter-status`, `/obd/agents/register` uses pairing token instead)

### Tenant Isolation Verification

- [ ] T128 Verify every repository query in `ScanJobRepository`, `DesktopAgentRepository`, `SessionFaultCodeRepository`, `AdapterConnectionRepository` includes `where: { organizationId }`
- [ ] T129 Verify `VinResolutionService.resolve` strictly filters by `organizationId` (cross-tenant VINs treated as non-matches)
- [ ] T130 Verify `AgentPairingController` list endpoints only return agents where `organizationId` matches the authenticated user's tenant

### Audit Verification

- [ ] T131 Verify `ScanJobAuditRecord` is written in the same Prisma transaction as every `ScanJob` status mutation (`SCAN_STARTED`, `SCAN_COMPLETED`, `SCAN_FAILED`, `SCAN_CANCELLED`, `FAULT_CODES_IMPORTED`)
- [ ] T132 Verify `ScanJobAuditRecord` has no `updatedAt` field and no update/delete endpoints exist

**Checkpoint**: Phase 10 complete. Security and tenant isolation hardened.

---

## Phase 11: Testing & Validation

**Purpose**: Comprehensive testing of the OBD Foundation feature across all layers.

### Backend Unit Tests

- [ ] T133 [P] Write unit test for `AgentPairingService.generatePairingToken` in `backend/tests/unit/obd/agent-pairing.service.unit.test.ts`
- [ ] T134 [P] Write unit test for `AgentPairingService.exchangePairingToken` in `backend/tests/unit/obd/agent-pairing.service.unit.test.ts`
- [ ] T135 [P] Write unit test for `AgentHeartbeatService.processHeartbeat` in `backend/tests/unit/obd/agent-heartbeat.service.unit.test.ts`
- [ ] T136 [P] Write unit test for `AgentHeartbeatService.markOfflineAgents` in `backend/tests/unit/obd/agent-heartbeat.service.unit.test.ts`
- [ ] T137 [P] Write unit test for `ObdScanService.createScan` state validation in `backend/tests/unit/obd/obd-scan.service.unit.test.ts`
- [ ] T138 [P] Write unit test for `ObdScanService.stateTransition` validation in `backend/tests/unit/obd/obd-scan.service.unit.test.ts`
- [ ] T139 [P] Write unit test for `VinResolutionService.resolve` tenant isolation in `backend/tests/unit/obd/vin-resolution.service.unit.test.ts`
- [ ] T140 [P] Write unit test for `VinResolutionService.validateVin` in `backend/tests/unit/obd/vin-resolution.service.unit.test.ts`
- [ ] T141 [P] Write unit test for `FaultCodeImportService.importFaultCodes` in `backend/tests/unit/obd/fault-code-import.service.unit.test.ts`

### Backend Integration Tests

- [ ] T142 [P] Write integration test for full scan workflow (pair → start → vin → session → dtc → import → view) in `backend/tests/integration/obd/full-scan-workflow.integration.test.ts`
- [ ] T143 [P] Write integration test for scan failure path (adapter disconnect mid-scan) in `backend/tests/integration/obd/scan-failure.integration.test.ts`
- [ ] T144 [P] Write integration test for agent offline during scan start in `backend/tests/integration/obd/scan-agent-offline.integration.test.ts`
- [ ] T145 [P] Write integration test for empty DTC list (no fault codes) in `backend/tests/integration/obd/scan-empty-dtc.integration.test.ts`

### Desktop Agent Tests

- [ ] T146 [P] Write unit test for `desktop-agent/src/obd/commands/vin.py` with mock ELM327 response
- [ ] T147 [P] Write unit test for `desktop-agent/src/obd/commands/dtc.py` with mock Mode 03/07/0A responses
- [ ] T148 [P] Write unit test for `desktop-agent/src/pairing.py` token exchange (mock HTTP server)
- [ ] T149 [P] Write unit test for `desktop-agent/src/heartbeat.py` loop timing and payload
- [ ] T150 [P] Write integration test for agent startup, pairing, and heartbeat against local backend

### Frontend Tests

- [ ] T151 [P] Write E2E test for pairing flow in `frontend/tests/e2e/obd-pairing.spec.ts`
- [ ] T152 [P] Write E2E test for scan initiation and progress display in `frontend/tests/e2e/obd-scan-progress.spec.ts`
- [ ] T153 [P] Write E2E test for vehicle confirmation modal in `frontend/tests/e2e/obd-vehicle-confirm.spec.ts`
- [ ] T154 [P] Write E2E test for fault code display in `frontend/tests/e2e/obd-fault-codes.spec.ts`

**Checkpoint**: Phase 11 complete. All tests passing.

---

## Phase 12: Polish

**Purpose**: Documentation, cleanup, performance, and cross-cutting refinements.

- [ ] T155 [P] Add inline JSDoc comments to all new public methods in OBD backend services and repositories
- [ ] T156 [P] Add docstrings to all new Python agent modules
- [ ] T157 Add `backend/src/obd/obd.module.ts` barrel exports if not already present
- [ ] T158 Add `desktop-agent/README.md` with setup, pairing, and troubleshooting instructions
- [ ] T159 Add OBD section to `docs/SAD.md` documenting the agent architecture and scan workflow
- [ ] T160 Review all new files for Constitution compliance: file length ≤ 300 lines, function length ≤ 30 lines, no hardcoded values
- [ ] T161 Verify no business logic exists in any frontend component beyond UI rendering and API calls
- [ ] T162 Verify Desktop Agent contains no business logic (vehicle matching, session creation, fault code interpretation)
- [ ] T163 Run `npm run lint` on backend and frontend; fix all issues
- [ ] T164 Run `python -m flake8 desktop-agent/` and `python -m mypy desktop-agent/`; fix all issues
- [ ] T165 Run `npx prisma validate` to ensure schema is valid
- [ ] T166 Run quickstart.md validation steps: pair agent, connect adapter, start scan, view results
- [ ] T167 Perform manual end-to-end test: USB adapter → read VIN → match vehicle → scan → import → view fault codes
- [ ] T168 Perform manual end-to-end test: Bluetooth adapter → read VIN → new vehicle → confirm → scan → import → view fault codes

**Checkpoint**: Phase 12 complete. Feature ready for review and merge.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — can start immediately.
- **Phase 2 (Foundation)**: Depends on Phase 1 — BLOCKS all later phases. Prisma migration must complete before any repository or service code is written.
- **Phase 3 (Agent Pairing)**: Depends on Phase 2 (needs `DesktopAgent`, `PairingToken` models and `AgentStatus` enum).
- **Phase 4 (Heartbeat)**: Depends on Phase 3 (needs paired agent and `DesktopAgentRepository`).
- **Phase 5 (Scan Workflow)**: Depends on Phase 2 (needs `ScanJob` model) and Phase 4 (needs online agent detection). Can be developed in parallel with Phase 3–4 if stubs are used, but integration requires both.
- **Phase 6 (VIN Resolution)**: Depends on Phase 5 (needs running scan state machine) and existing `Vehicle` model.
- **Phase 7 (Session Creation)**: Depends on Phase 6 (needs resolved vehicle) and existing `DiagnosticSession` model.
- **Phase 8 (Fault Code Import)**: Depends on Phase 7 (needs `DiagnosticSession` created) and Phase 2 (needs `SessionFaultCode` model).
- **Phase 9 (Frontend)**: Depends on Phase 3–8 APIs being available. Can develop UI skeletons in parallel with backend stubs.
- **Phase 10 (Security)**: Depends on all controller endpoints from Phases 3–9 being present.
- **Phase 11 (Testing)**: Depends on all implementation phases.
- **Phase 12 (Polish)**: Depends on all implementation and testing.

### User Story Mapping

| User Story | Primary Phase | Dependencies |
|---|---|---|
| US1 — Connect Adapter | Phase 3 | Phase 2 |
| US2 — Disconnect Adapter | Phase 3 | Phase 3 (US1) |
| US3 — Read Vehicle VIN | Phase 6 | Phase 5 |
| US4 — Start Scan From Web App | Phase 5 | Phase 2, 4 |
| US5 — Auto-create Diagnostic Session From Scan | Phase 7 | Phase 6 |
| US6 — Read Fault Codes | Phase 8 | Phase 7 |
| US7 — Import Fault Codes Into Diagnostic Session | Phase 8 | Phase 7 |
| US8 — View Scan Results | Phase 9 | Phase 8 |

### Parallel Opportunities

- **Within Phase 1**: All setup directory creation tasks (T001–T005) are parallel.
- **Within Phase 2**: All Prisma model additions (T006–T016) and type creation (T019–T023) are parallel. Migration (T017–T018) must run after schema changes.
- **Within Phase 3**: DTOs (T027–T028), repository (T029), and controller (T034–T035) can be drafted in parallel. Service implementation (T030–T033) depends on repository.
- **Within Phase 5**: DTOs (T056–T057), repository (T058), and controller endpoints (T063–T066) can be drafted in parallel. Service (T059–T062) and queue logic (T067–T068) depend on repository.
- **Within Phase 8**: DTO (T090), repository (T091), service (T092–T095), and agent command files (T097–T099) can be developed in parallel.
- **Within Phase 9**: All frontend hooks (T104–T106) and components (T107–T112) can be developed in parallel. Page composition (T113) depends on components.
- **Across phases**: Backend and Desktop Agent development can proceed in parallel once Phase 2 is complete. Frontend development can proceed in parallel with backend once API contracts are stable.

---

## Parallel Example: Phase 5 (Scan Workflow)

```bash
# Launch in parallel:
Task: "Create CreateScanJobDto in backend/src/obd/dtos/create-scan-job.dto.ts"
Task: "Create ScanJobResponseDto in backend/src/obd/dtos/scan-job-response.dto.ts"
Task: "Create ScanJobRepository in backend/src/obd/repositories/scan-job.repository.ts"
Task: "Create ScanJob model dataclass in desktop-agent/src/models/scan_job.py"

# Then launch in parallel (after repository is ready):
Task: "Create ObdScanService in backend/src/obd/services/obd-scan.service.ts"
Task: "Add scan-queue endpoint to AgentWebhookController"
Task: "Add scan endpoints to ObdScanController"
```

---

## Implementation Strategy

### MVP First (US1 + US4)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundation (CRITICAL)
3. Complete Phase 3: Agent Pairing (US1)
4. Complete Phase 4: Heartbeat
5. Complete Phase 5: Scan Workflow (US4)
6. **STOP and VALIDATE**: Agent can pair, heartbeat, and receive a scan command
7. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundation → Foundation ready
2. Phase 3–4 (US1–US2) → Agent pairing and status tracking work
3. Phase 5 (US4) → Scan can be started from web app
4. Phase 6 (US3) → VIN reading works
5. Phase 7 (US5) → Session auto-creation works
6. Phase 8 (US6–US7) → Fault code import works
7. Phase 9 (US8) → Full UI experience
8. Phase 10–12 → Harden and polish

### Parallel Team Strategy

With multiple developers:

1. **Dev A** (Backend): Phases 2 → 3 → 4 → 5 → 6 → 7 → 8
2. **Dev B** (Agent): Phases 1 (agent setup) → 3 (pairing) → 4 (heartbeat) → 5 (queue) → 6 (VIN) → 8 (DTC)
3. **Dev C** (Frontend): Phases 1 (frontend setup) → 9 (all UI components and pages)
4. **Dev D** (QA/Security): Phase 10 (security) → Phase 11 (testing)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each phase should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate phase independently
- Avoid: vague tasks, same file conflicts, cross-phase dependencies that break independence
- Total task count: 168 tasks across 12 phases
