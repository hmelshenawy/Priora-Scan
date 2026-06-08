# Tasks: Diagnostic Sessions

**Input**: Design documents from `/specs/003-diagnostic-sessions/`

**Prerequisites**: `plan.md` (required), `spec.md` (required for user stories)

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish backend module structure, database schema, and frontend route scaffolding.

- [x] T001 [P] Create backend module shell `backend/src/diagnostic-sessions/diagnostic-sessions.module.ts`
- [x] T002 [P] Create backend controller file `backend/src/diagnostic-sessions/controllers/diagnostic-sessions.controller.ts`
- [x] T003 [P] Create backend service file `backend/src/diagnostic-sessions/services/diagnostic-sessions.service.ts`
- [x] T004 [P] Create backend repository files `backend/src/diagnostic-sessions/repositories/diagnostic-session.repository.ts` and `backend/src/diagnostic-sessions/repositories/diagnostic-session-audit.repository.ts`
- [x] T005 [P] Create backend DTO files in `backend/src/diagnostic-sessions/dtos/` for create, update, and response payloads
- [x] T006 [P] Add `DiagnosticSession` and `DiagnosticSessionAuditRecord` models plus `DiagnosticSessionStatus` enum to `backend/prisma/schema.prisma`
- [x] T007 [P] Create frontend vehicle session list page shell at `frontend/src/app/vehicles/[vehicleId]/sessions/page.tsx`
- [x] T008 [P] Create frontend diagnostic session detail page shell at `frontend/src/app/diagnostic-sessions/[sessionId]/page.tsx`
- [x] T009 [P] Create frontend hook file `frontend/src/hooks/use-diagnostic-sessions.ts`
- [x] T010 [P] Update backend `backend/src/app.module.ts` to import `DiagnosticSessionsModule`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement core backend and frontend foundation required by all user stories.

- [x] T011 [P] Implement scoped Prisma queries for diagnostic sessions in `backend/src/diagnostic-sessions/repositories/diagnostic-session.repository.ts`
- [x] T012 [P] Implement audit persistence helpers in `backend/src/diagnostic-sessions/repositories/diagnostic-session-audit.repository.ts`
- [x] T013 [P] Implement request/response DTO validation in `backend/src/diagnostic-sessions/dtos/create-diagnostic-session.dto.ts`
- [x] T014 [P] Implement request/response DTO validation in `backend/src/diagnostic-sessions/dtos/update-diagnostic-session.dto.ts`
- [x] T015 [P] Implement response shaping in `backend/src/diagnostic-sessions/dtos/diagnostic-session-response.dto.ts`
- [x] T016 Implement `DiagnosticSessionsService` skeleton and tenant-scoped constructor in `backend/src/diagnostic-sessions/services/diagnostic-sessions.service.ts`
- [x] T017 Implement controller routing and base endpoint wiring in `backend/src/diagnostic-sessions/controllers/diagnostic-sessions.controller.ts`
- [x] T018 Add diagnostic session API client methods to `frontend/src/lib/api-client.ts`
- [x] T019 Add session query and mutation hooks to `frontend/src/hooks/use-diagnostic-sessions.ts`
- [x] T020 Add frontend route layout and placeholder UI for session pages under `frontend/src/app/vehicles/[vehicleId]/sessions/` and `frontend/src/app/diagnostic-sessions/[sessionId]/`

---

## Phase 3: User Story 1 - Create a Diagnostic Session (Priority: P1) 🎯 MVP

**Goal**: Allow authorized users to create a diagnostic session for a vehicle and store it in the tenant-scoped backend.

**Independent Test**: A user with `create:diagnostic-session` permission can create a session for a vehicle and receive the new session record.

### Implementation for User Story 1

- [x] T021 [US1] Implement session creation logic in `backend/src/diagnostic-sessions/services/diagnostic-sessions.service.ts`
- [x] T022 [US1] Implement `POST /api/v1/vehicles/:vehicleId/diagnostic-sessions` endpoint in `backend/src/diagnostic-sessions/controllers/diagnostic-sessions.controller.ts`
- [x] T023 [US1] Add `create:diagnostic-session` RBAC enforcement in `backend/src/diagnostic-sessions/controllers/diagnostic-sessions.controller.ts`
- [x] T024 [US1] Validate `vehicleId` and create DTO payload in `backend/src/diagnostic-sessions/dtos/create-diagnostic-session.dto.ts`
- [x] T025 [US1] Add frontend create session form and submit flow in `frontend/src/app/vehicles/[vehicleId]/sessions/page.tsx`
- [x] T026 [US1] Add session number generation and initial status assignment (`OPEN`) in `backend/src/diagnostic-sessions/services/diagnostic-sessions.service.ts`
- [x] T027 [US1] Add frontend create-success feedback and navigation in `frontend/src/app/vehicles/[vehicleId]/sessions/page.tsx`

---

## Phase 4: User Story 2 - View Diagnostic Sessions for a Vehicle (Priority: P1)

**Goal**: Allow authorized users to list and view sessions linked to a vehicle within their organization.

**Independent Test**: A user with `read:diagnostic-session` permission can view a vehicle’s session list and navigate to a session detail page.

### Implementation for User Story 2

- [X] T028 [US2] Implement vehicle session list query with pagination in `backend/src/diagnostic-sessions/services/diagnostic-sessions.service.ts`
- [X] T029 [US2] Implement `GET /api/v1/vehicles/:vehicleId/diagnostic-sessions` in `backend/src/diagnostic-sessions/controllers/diagnostic-sessions.controller.ts`
- [X] T030 [US2] Implement `GET /api/v1/diagnostic-sessions/:sessionId` in `backend/src/diagnostic-sessions/controllers/diagnostic-sessions.controller.ts`
- [X] T031 [US2] Implement session detail retrieval in `backend/src/diagnostic-sessions/services/diagnostic-sessions.service.ts`
- [X] T032 [US2] Render session list UI in `frontend/src/app/vehicles/[vehicleId]/sessions/page.tsx`
- [X] T033 [US2] Render session detail UI in `frontend/src/app/diagnostic-sessions/[sessionId]/page.tsx`
- [X] T034 [US2] Add empty state handling for vehicles with no sessions in `frontend/src/app/vehicles/[vehicleId]/sessions/page.tsx`
- [X] T035 [US2] Add tenant-scoped session filtering in `backend/src/diagnostic-sessions/repositories/diagnostic-session.repository.ts`

---

## Phase 5: User Story 3 - Update Diagnostic Session Status (Priority: P2)

**Goal**: Allow authorized users to progress and close diagnostic sessions through the defined lifecycle.

**Independent Test**: A user with `update:diagnostic-session` permission can update a session status through valid lifecycle transitions and see the updated state.

### Implementation for User Story 3

- [X] T036 [US3] Implement lifecycle transition rules in `backend/src/diagnostic-sessions/services/diagnostic-sessions.service.ts`
- [X] T037 [US3] Implement `PATCH /api/v1/diagnostic-sessions/:sessionId` in `backend/src/diagnostic-sessions/controllers/diagnostic-sessions.controller.ts`
- [X] T038 [US3] Enforce invalid status transition rejection in `backend/src/diagnostic-sessions/services/diagnostic-sessions.service.ts`
- [X] T039 [US3] Enforce closed-session immutability in `backend/src/diagnostic-sessions/services/diagnostic-sessions.service.ts`
- [X] T040 [US3] Add session lifecycle controls to `frontend/src/app/diagnostic-sessions/[sessionId]/page.tsx`
- [X] T041 [US3] Add user-facing error handling for invalid transition attempts in `frontend/src/app/diagnostic-sessions/[sessionId]/page.tsx`

---

## Phase 6: User Story 4 - Audit Diagnostic Session Actions (Priority: P2)

**Goal**: Ensure every session creation and status change writes an immutable, tenant-scoped audit record.

**Independent Test**: A successful session creation or status update results in an audit record containing userId, organizationId, sessionId, action, status, and timestamp.

### Implementation for User Story 4

- [X] T042 [US4] Write audit record on session creation in `backend/src/diagnostic-sessions/services/diagnostic-sessions.service.ts`
- [X] T043 [US4] Write audit record on session status change in `backend/src/diagnostic-sessions/services/diagnostic-sessions.service.ts`
- [X] T044 [US4] Ensure audit persistence is included in the same transaction as session mutations in `backend/src/diagnostic-sessions/services/diagnostic-sessions.service.ts`
- [X] T045 [US4] Create immutable audit persistence logic in `backend/src/diagnostic-sessions/repositories/diagnostic-session-audit.repository.ts`
- [X] T046 [US4] Prevent unauthorized audit record creation via public APIs in `backend/src/diagnostic-sessions/controllers/diagnostic-sessions.controller.ts`

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Complete cross-cutting enforcement, consistency, and cleanup for the feature.

- [ ] T047 [P] Add RBAC guard usage to all diagnostic session controller routes in `backend/src/diagnostic-sessions/controllers/diagnostic-sessions.controller.ts`
- [ ] T048 [P] Add tenant isolation enforcement to all diagnostic session repository methods in `backend/src/diagnostic-sessions/repositories/diagnostic-session.repository.ts`
- [ ] T049 [P] Add consistent error handling for diagnostic session endpoints in `backend/src/diagnostic-sessions/controllers/diagnostic-sessions.controller.ts`
- [ ] T050 [P] Update `frontend/src/lib/api-client.ts` error mapping for diagnostic session operations
- [ ] T051 [P] Review and update `specs/003-diagnostic-sessions/DIAGNOSTIC_SESSIONS_PLAN.md` if implementation details change
- [ ] T052 [P] Review `specs/003-diagnostic-sessions/spec.md` and `tasks.md` for scope alignment before `/speckit-plan` completion

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1: Setup** must complete first.
- **Phase 2: Foundational** depends on Phase 1 and blocks all user stories.
- **Phase 3+ User Stories** depend on Phase 2 completion.
- **Phase 7: Polish & Cross-Cutting Concerns** depends on user story completion.

### User Story Dependencies

- **User Story 1 (P1)**: Create Diagnostic Session — depends on foundational backend service, repository, DTO, and route setup.
- **User Story 2 (P1)**: View Diagnostic Sessions — depends on session read APIs and frontend page scaffolding.
- **User Story 3 (P2)**: Update Diagnostic Session Status — depends on session persistence and lifecycle foundation.
- **User Story 4 (P2)**: Audit Diagnostic Session Actions — depends on session mutation flows and transactional persistence.

### Parallel Opportunities

- Phase 1 setup tasks marked `[P]` can run in parallel where they do not depend on each other.
- Phase 2 foundational repository and DTO implementation tasks marked `[P]` can run in parallel.
- User stories 1 and 2 can proceed in parallel after foundational completion because they are separate read/write flows.
- User stories 3 and 4 can also proceed in parallel once session persistence is available.
- Cross-cutting polish tasks marked `[P]` can run in parallel across backend and frontend updates.

## Implementation Strategy

### MVP First

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. Validate session creation independently before executing User Story 2 or later stories

### Incremental Delivery

- Deliver session creation first as the core workflow.
- Add viewing and detail pages next to make sessions discoverable.
- Add lifecycle transitions after the session entity is stable.
- Add audit logging last to preserve traceability and ensure it does not block core functionality.
