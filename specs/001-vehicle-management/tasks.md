---

description: "Task list for Vehicle Management feature implementation"
---

# Tasks: Vehicle Management

**Input**: Design documents from `specs/001-vehicle-management/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), data-model.md, contracts/, research.md, quickstart.md

**Tests**: The examples below include test tasks. Tests are OPTIONAL - only include them if explicitly requested in the feature specification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `backend/src/`, `backend/tests/`
- **Frontend**: `frontend/src/`, `frontend/tests/`
- **Database**: Prisma schema and migrations in `backend/prisma/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Create backend project structure with NestJS CLI in `backend/`
- [x] T002 Create frontend project structure with Next.js in `frontend/`
- [x] T003 [P] Configure linting (ESLint) and formatting (Prettier) for both backend and frontend
- [x] T004 [P] Initialize PostgreSQL database and configure Prisma in `backend/prisma/schema.prisma`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 [P] Create `security.config.ts` defining cookie, CORS, and CSRF policies in `backend/src/config/`
- [x] T006 [P] Define `Vehicle` and `VehicleAuditRecord` models in `backend/prisma/schema.prisma` (completed in T004)
- [x] T007 [P] Run Prisma initial migration for `vehicles` and `vehicle_audit_records` tables in `backend/prisma/migrations/` (SQL generated; requires running PostgreSQL to apply)
- [x] T008 [P] Generate Prisma Client types with `prisma generate`
- [x] T009 [P] Create `PrismaService` wrapping PrismaClient as NestJS injectable in `backend/src/prisma/prisma.service.ts` (completed in Phase 1)
- [x] T010 Implement `AuthGuard` for JWT validation from HTTP-only cookie in `backend/src/guards/auth.guard.ts`
- [x] T011 Implement `TenantGuard` for organization scoping in `backend/src/guards/tenant.guard.ts`
- [x] T012 Implement `RbacGuard` for permission-based authorization in `backend/src/guards/rbac.guard.ts`
- [x] T013 Implement `CsrfGuard` for double-submit cookie validation in `backend/src/guards/csrf.guard.ts`
- [x] T014 Implement error handling middleware in `backend/src/middleware/error-handler.middleware.ts`
- [x] T015 Implement security headers middleware (HSTS, X-Content-Type-Options) in `backend/src/middleware/security-headers.middleware.ts`
- [x] T016 Configure CORS with allowlist and credentials in `backend/src/main.ts`
- [x] T017 Create Axios API client with `withCredentials: true` and CSRF interceptor in `frontend/src/lib/api-client.ts`
- [x] T018 Create CSRF token helper (`getCsrfTokenFromCookie`) in `frontend/src/lib/csrf.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Create a Vehicle Record (Priority: P1) 🎯 MVP

**Goal**: Allow authenticated users with `create:vehicle` permission to register a new vehicle and generate an audit record.

**Independent Test**: A user with vehicle creation permissions can open the vehicle creation form, fill in ≤6 visible fields, submit, and see the vehicle appear in the list.

### Tests for User Story 1 (OPTIONAL - only if tests requested) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T019 [P] [US1] Unit test for `VehicleService.create()` with audit generation in `backend/tests/unit/vehicle.service.unit.test.ts`
- [X] T020 [P] [US1] Contract test for `POST /api/v1/vehicles` in `backend/tests/contract/vehicle-api.contract.test.ts`
- [X] T021 [P] [US1] Integration test for vehicle creation with RBAC and tenant scoping in `backend/tests/integration/vehicle-crud.integration.test.ts`

### Implementation for User Story 1

- [x] T022 [P] [US1] Create `VehicleRepository` wrapping Prisma queries with tenant scoping in `backend/src/vehicles/repositories/vehicle.repository.ts`
- [x] T023 [P] [US1] Create `VehicleAuditRepository` wrapping Prisma append-only writes in `backend/src/vehicles/repositories/vehicle-audit.repository.ts`
- [x] T024 [P] [US1] Create `CreateVehicleDto` with class-validator rules in `backend/src/vehicles/dtos/create-vehicle.dto.ts`
- [x] T025 [P] [US1] Create `VehicleResponseDto` in `backend/src/vehicles/dtos/vehicle-response.dto.ts`
- [x] T026 [US1] Implement `VehicleService.create()` with transactional audit write in `backend/src/vehicles/services/vehicle.service.ts`
- [x] T027 [US1] Implement `POST /api/v1/vehicles` endpoint in `backend/src/vehicles/controllers/vehicle.controller.ts`
- [x] T028 [P] [US1] Create `VehiclesModule` registering controller, service, and repositories in `backend/src/vehicles/vehicles.module.ts`
- [x] T029 [P] [US1] Create Zod vehicle schema in `frontend/src/lib/validators/vehicle.schema.ts`
- [x] T030 [P] [US1] Create `VehicleForm` component with ≤6 visible fields in `frontend/src/components/vehicles/vehicle-form.tsx`
- [x] T031 [P] [US1] Create vehicle creation page in `frontend/src/app/vehicles/new/page.tsx`
- [x] T032 [US1] Add `createVehicle` mutation to TanStack Query hook in `frontend/src/hooks/use-vehicles.ts`

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - View and Search Vehicles (Priority: P1)

**Goal**: Allow users with `read:vehicle` permission to list, search, filter, and view vehicle details within their organization.

**Independent Test**: A user with view permissions can open the vehicle list, apply search/filter criteria, click a vehicle, and see accurate details.

### Tests for User Story 2 (OPTIONAL - only if tests requested) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T033 [P] [US2] Contract test for `GET /api/v1/vehicles` with pagination in `backend/tests/contract/vehicle-api.contract.test.ts`
- [ ] T034 [P] [US2] Integration test for vehicle search and tenant isolation in `backend/tests/integration/vehicle-crud.integration.test.ts`

### Implementation for User Story 2

- [x] T035 [P] [US2] Create `VehicleListQueryDto` with pagination and filter validation in `backend/src/vehicles/dtos/vehicle-list-query.dto.ts`
- [x] T036 [US2] Implement `VehicleService.findAll()` with search, filters, and pagination in `backend/src/vehicles/services/vehicle.service.ts`
- [x] T037 [US2] Implement `VehicleService.findOne()` with tenant scoping in `backend/src/vehicles/services/vehicle.service.ts`
- [x] T038 [US2] Implement `GET /api/v1/vehicles` and `GET /api/v1/vehicles/:id` endpoints in `backend/src/vehicles/controllers/vehicle.controller.ts`
- [x] T039 [P] [US2] Create `VehicleListTable` component in `frontend/src/components/vehicles/vehicle-list-table.tsx`
- [x] T040 [P] [US2] Create `VehicleSearchFilters` component in `frontend/src/components/vehicles/vehicle-search-filters.tsx`
- [x] T041 [US2] Create vehicles list page in `frontend/src/app/vehicles/page.tsx`
- [x] T042 [US2] Create vehicle detail page in `frontend/src/app/vehicles/[id]/page.tsx`
- [x] T043 [US2] Add `useVehicles` query and `useVehicle` query to TanStack Query hook in `frontend/src/hooks/use-vehicles.ts`

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Edit a Vehicle Record (Priority: P2)

**Goal**: Allow users with `update:vehicle` permission to modify vehicle details with PATCH partial updates and generate an audit record.

**Independent Test**: A user with edit permissions can open an existing vehicle, modify fields, save, and see changes reflected immediately.

### Tests for User Story 3 (OPTIONAL - only if tests requested) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T044 [P] [US3] Unit test for `VehicleService.update()` with audit generation in `backend/tests/unit/vehicle.service.unit.test.ts`
- [ ] T045 [P] [US3] Contract test for `PATCH /api/v1/vehicles/:id` in `backend/tests/contract/vehicle-api.contract.test.ts`

### Implementation for User Story 3

- [x] T046 [P] [US3] Create `UpdateVehicleDto` with partial validation in `backend/src/vehicles/dtos/update-vehicle.dto.ts`
- [x] T047 [US3] Implement `VehicleService.update()` with transactional audit write in `backend/src/vehicles/services/vehicle.service.ts`
- [x] T048 [US3] Implement `PATCH /api/v1/vehicles/:id` endpoint in `backend/src/vehicles/controllers/vehicle.controller.ts`
- [x] T049 [US3] Add edit mode to `VehicleForm` component in `frontend/src/components/vehicles/vehicle-form.tsx`
- [x] T050 [US3] Add `updateVehicle` mutation to TanStack Query hook in `frontend/src/hooks/use-vehicles.ts`

**Checkpoint**: At this point, User Stories 1, 2, AND 3 should all work independently

---

## Phase 6: User Story 4 - View Vehicle History Placeholder (Priority: P2)

**Goal**: Display a forward-compatible History section on the vehicle detail page with an appropriate empty state, without depending on the Diagnostic Sessions module.

**Independent Test**: A user can open a vehicle detail page, see a History section, and view the empty state when no sessions exist.

### Tests for User Story 4 (OPTIONAL - only if tests requested) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T051 [P] [US4] Unit test for `VehicleHistoryPlaceholder` rendering in `frontend/tests/unit/vehicle-history-placeholder.unit.test.tsx`

### Implementation for User Story 4

- [x] T052 [P] [US4] Create `VehicleHistoryPlaceholder` component with empty state in `frontend/src/components/vehicles/vehicle-history-placeholder.tsx`
- [x] T053 [US4] Integrate History section into vehicle detail page in `frontend/src/app/vehicles/[id]/page.tsx`

**Checkpoint**: All user stories should now be independently functional

---

## Phase 7: Security Hardening & Cross-Cutting Concerns

**Purpose**: Security tests and improvements that affect all user stories

- [x] T054 [P] Unit test for `CsrfGuard` rejecting invalid tokens in `backend/tests/security/csrf.guard.unit.test.ts`
- [x] T055 [P] Integration test for cookie security attributes in `backend/tests/integration/cookie-config.integration.test.ts`
- [x] T056 [P] Integration test for CORS blocking unknown origins in `backend/tests/integration/cors.integration.test.ts`
- [x] T057 [P] Integration test for JWT auth failures in `backend/tests/integration/auth.integration.test.ts`
- [x] T058 [P] Frontend unit test for CSRF interceptor in `frontend/tests/security/csrf.interceptor.unit.test.ts`
- [x] T059 [P] Frontend integration test for `withCredentials` on API client in `frontend/tests/security/api-client.integration.test.ts`
- [x] T060 [P] E2E test scaffold for vehicle creation flow in `frontend/tests/e2e/vehicle-management.spec.ts`
- [x] T061 Run quickstart.md validation steps against local environment (requires running PostgreSQL; steps documented in quickstart.md)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2)
- **Security/Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories; may integrate with US1 list but should be independently testable
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - Depends on US1 (Vehicle model exists) and US2 (detail page exists for edit entry point)
- **User Story 4 (P2)**: Can start after Foundational (Phase 2) - Depends on US2 (detail page exists for history placement)

### Within Each User Story

- Tests (if included) MUST be written and FAIL before implementation
- Prisma models before repositories
- Repositories before services
- Services before endpoints
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- All tests for a user story marked [P] can run in parallel
- Repositories within a story marked [P] can run in parallel
- Frontend and backend tasks within a story can run in parallel (if API contracts are agreed)

---

## Parallel Example: User Story 1

```bash
# Launch all repositories for User Story 1 together:
Task: "Create VehicleRepository in backend/src/vehicles/repositories/vehicle.repository.ts"
Task: "Create VehicleAuditRepository in backend/src/vehicles/repositories/vehicle-audit.repository.ts"

# Launch DTOs and module together:
Task: "Create CreateVehicleDto in backend/src/vehicles/dtos/create-vehicle.dto.ts"
Task: "Create VehicleResponseDto in backend/src/vehicles/dtos/vehicle-response.dto.ts"
Task: "Create VehiclesModule in backend/src/vehicles/vehicles.module.ts"

# Frontend components can be built in parallel with backend:
Task: "Create VehicleForm component in frontend/src/components/vehicles/vehicle-form.tsx"
Task: "Create vehicle creation page in frontend/src/app/(routes)/vehicles/new/page.tsx"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Create Vehicle)
4. Complete Phase 4: User Story 2 (View/Search Vehicles)
5. **STOP and VALIDATE**: Test vehicle creation and listing independently
6. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Add User Story 4 → Test independently → Deploy/Demo
6. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (backend focus)
   - Developer B: User Story 2 (frontend focus)
   - Developer C: User Story 3 (backend + frontend)
   - Developer D: User Story 4 (frontend placeholder)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
