---

description: "Task list for Authentication v1 feature implementation"
---

# Tasks: Authentication v1

**Input**: Design documents from `specs/002-authentication-v1/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: The examples below include test tasks. Tests are OPTIONAL - only include them if explicitly requested in the feature specification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `backend/src/`, `backend/tests/`
- **Frontend**: `frontend/src/`, `frontend/tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

**Note**: Most setup was completed in 001-vehicle-management foundational phase.

- [x] T001 Create backend project structure with NestJS CLI in `backend/`
- [x] T002 Create frontend project structure with Next.js in `frontend/`
- [x] T003 [P] Configure linting (ESLint) and formatting (Prettier) for both backend and frontend
- [x] T004 [P] Initialize PostgreSQL database and configure Prisma in `backend/prisma/schema.prisma`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 [P] Create `security.config.ts` defining cookie, CORS, and CSRF policies in `backend/src/config/`
- [x] T006 [P] Create `AuthGuard` for JWT validation from HTTP-only cookie in `backend/src/guards/auth.guard.ts`
- [x] T007 [P] Create `TenantGuard` for organization scoping in `backend/src/guards/tenant.guard.ts`
- [x] T008 [P] Create `RbacGuard` for permission-based authorization in `backend/src/guards/rbac.guard.ts`
- [x] T009 [P] Create `CsrfGuard` for double-submit cookie validation in `backend/src/guards/csrf.guard.ts`
- [x] T010 [P] Implement error handling middleware in `backend/src/middleware/error-handler.middleware.ts`
- [x] T011 [P] Implement security headers middleware in `backend/src/middleware/security-headers.middleware.ts`
- [x] T012 Configure CORS with allowlist and credentials in `backend/src/main.ts`
- [x] T013 Create Axios API client with `withCredentials: true` and CSRF interceptor in `frontend/src/lib/api-client.ts`
- [x] T014 Create CSRF token helper in `frontend/src/lib/csrf.ts`
- [x] T015 [P] Create `LoginDto` with class-validator rules in `backend/src/auth/dtos/login.dto.ts`
- [x] T016 [P] Create `AuthController` with login/logout endpoints in `backend/src/auth/auth.controller.ts`
- [x] T017 [P] Create `AuthService` with mock login and JWT signing in `backend/src/auth/auth.service.ts`
- [x] T018 [P] Create `AuthModule` registering JwtModule in `backend/src/auth/auth.module.ts`
- [x] T019 Install `@nestjs/throttler` and add to `backend/package.json`
- [x] T020 Configure `ThrottlerModule` in `backend/src/app.module.ts`
- [x] T021 [P] Create `UserProfileDto` in `backend/src/auth/dtos/user-profile.dto.ts`
- [x] T022 [P] Create `RefreshTokenDto` in `backend/src/auth/dtos/refresh-token.dto.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Login and Session Establishment (Priority: P1) 🎯 MVP

**Goal**: Allow pre-provisioned users to authenticate with email and password, receive JWT cookies, and access their profile via `/me`.

**Independent Test**: A user opens the login page, submits valid credentials, receives `access_token`, `refresh_token`, and `csrf_token` cookies, and `GET /auth/me` returns their profile with role, permissions, and organization.

### Tests for User Story 1 (OPTIONAL) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T023 [P] [US1] Unit test for `AuthService.login()` with JWT payload shape in `backend/tests/unit/auth.service.unit.test.ts`
- [x] T024 [P] [US1] Contract test for `POST /api/v1/auth/login` in `backend/tests/contract/auth-api.contract.test.ts`
- [x] T025 [P] [US1] Integration test for login cookie issuance in `backend/tests/integration/auth.integration.test.ts`
- [x] T026 [P] [US1] Integration test for `GET /api/v1/auth/me` returning profile in `backend/tests/integration/auth.integration.test.ts`

### Implementation for User Story 1

- [x] T027 [US1] Add `@Throttle()` decorator to login endpoint for rate limiting in `backend/src/auth/auth.controller.ts`
- [x] T028 [P] [US1] Update mock user profiles to include `role` field in `backend/src/auth/auth.service.ts`
- [x] T029 [P] [US1] Add `roles` array to JWT payload in `backend/src/auth/auth.service.ts`
- [x] T030 [US1] Implement `GET /api/v1/auth/me` endpoint in `backend/src/auth/auth.controller.ts`
- [x] T031 [US1] Implement `getCurrentUser()` in `backend/src/auth/auth.service.ts`
- [x] T032 [P] [US1] Add `UserProfileDto` response serialization to `/me` endpoint in `backend/src/auth/auth.controller.ts`

**Checkpoint**: At this point, login and `/me` should be fully functional and testable independently

---

## Phase 4: User Story 2 - Logout and Session Termination (Priority: P1)

**Goal**: Allow authenticated users to securely terminate their session by clearing all authentication cookies.

**Independent Test**: An authenticated user invokes logout; all cookies are removed; subsequent requests to protected endpoints return `401 UNAUTHORIZED`.

### Tests for User Story 2 (OPTIONAL) ⚠️

- [x] T033 [P] [US2] Integration test for logout cookie clearing in `backend/tests/integration/auth.integration.test.ts`

### Implementation for User Story 2

- [x] T034 [US2] Implement `POST /api/v1/auth/logout` endpoint in `backend/src/auth/auth.controller.ts`
- [x] T035 [US2] Implement `logout()` clearing all cookies in `backend/src/auth/auth.service.ts`
- [x] T036 [US2] Verify logout response returns `{ message: "Logged out successfully." }` in `backend/src/auth/auth.controller.ts`

**Checkpoint**: Logout endpoint clears all three cookies and returns confirmation

---

## Phase 5: User Story 3 - Protected Route Enforcement (Priority: P1)

**Goal**: Ensure every protected API endpoint and frontend page rejects unauthenticated users.

**Independent Test**: An unauthenticated user requesting `GET /api/v1/vehicles` receives `401`; navigating to `/vehicles` in the browser redirects to `/login`.

### Tests for User Story 3 (OPTIONAL) ⚠️

- [x] T037 [P] [US3] Integration test for `401` on missing JWT in `backend/tests/integration/auth.integration.test.ts`
- [x] T038 [P] [US3] Unit test for Next.js middleware redirect logic in `frontend/tests/unit/middleware.unit.test.ts`

### Implementation for User Story 3

- [x] T039 [US3] `AuthGuard` validates JWT and rejects missing/invalid tokens in `backend/src/guards/auth.guard.ts`
- [x] T040 [US3] `TenantGuard` enforces `organizationId` presence in `backend/src/guards/tenant.guard.ts`
- [x] T041 [US3] `RbacGuard` enforces `@Permissions()` metadata in `backend/src/guards/rbac.guard.ts`
- [x] T042 [US3] Create Next.js `middleware.ts` for protected route enforcement in `frontend/src/middleware.ts`
- [x] T043 [P] [US3] Create public routes allowlist in `frontend/src/lib/public-routes.ts`
- [x] T044 [US3] Add client-side auth state provider in `frontend/src/components/auth/auth-provider.tsx`

**Checkpoint**: Both backend API and frontend pages enforce authentication

---

## Phase 6: User Story 4 - CSRF Token Distribution (Priority: P2)

**Goal**: Provide a dedicated endpoint for authenticated clients to obtain a fresh CSRF token.

**Independent Test**: An authenticated client requests `GET /auth/csrf` and receives a token with the `csrf_token` cookie updated.

### Tests for User Story 4 (OPTIONAL) ⚠️

- [x] T045 [P] [US4] Contract test for `GET /api/v1/auth/csrf` in `backend/tests/contract/auth-api.contract.test.ts`

### Implementation for User Story 4

- [x] T046 [US4] Implement `GET /api/v1/auth/csrf` endpoint in `backend/src/auth/auth.controller.ts`
- [x] T047 [US4] Add `getCsrfToken()` public method to `AuthService` in `backend/src/auth/auth.service.ts`
- [x] T048 [US4] Ensure CSRF endpoint sets `csrf_token` cookie in response in `backend/src/auth/auth.controller.ts`

**Checkpoint**: Authenticated clients can refresh CSRF tokens on demand

---

## Phase 7: User Story 5 - Role and Permission Resolution (Priority: P2)

**Goal**: Resolve a user's roles and permissions at login time and embed them into the JWT payload.

**Independent Test**: A Workshop Manager login includes `update:vehicle`; a Service Advisor login does not.

### Tests for User Story 5 (OPTIONAL) ⚠️

- [x] T049 [P] [US5] Unit test for role-to-permission mapping in `backend/tests/unit/auth.service.unit.test.ts`
- [x] T050 [P] [US5] Integration test verifying permission differences across roles in `backend/tests/integration/auth.integration.test.ts`

### Implementation for User Story 5

- [x] T051 [US5] Create role-to-permission mapping constants in `backend/src/auth/constants/role-permissions.ts`
- [x] T052 [US5] Update `AuthService.login()` to resolve permissions from role mapping in `backend/src/auth/auth.service.ts`
- [x] T053 [US5] Define 3 mocked user profiles (Technician, Service Advisor, Workshop Manager) in `backend/src/auth/auth.service.ts`
- [x] T054 [P] [US5] Add `permissions` array to JWT payload in `backend/src/auth/auth.service.ts`

**Checkpoint**: JWT payload contains correct `roles` and `permissions` per user profile

---

## Phase 8: User Story 6 - Tenant Resolution (Priority: P2)

**Goal**: Embed the user's `organizationId` into the JWT so all downstream data access is tenant-scoped.

**Independent Test**: A user from Organization A logs in and all subsequent API requests are implicitly scoped to Organization A.

### Tests for User Story 6 (OPTIONAL) ⚠️

- [x] T055 [P] [US6] Integration test for `403 TENANT_MISMATCH` on cross-tenant access in `backend/tests/integration/auth.integration.test.ts`

### Implementation for User Story 6

- [x] T056 [US6] `TenantGuard` extracts `organizationId` from JWT in `backend/src/guards/tenant.guard.ts`
- [x] T057 [US6] `organizationId` is embedded in JWT at login time in `backend/src/auth/auth.service.ts`
- [x] T058 [US6] Cross-tenant requests return `403 TENANT_MISMATCH` in `backend/src/guards/tenant.guard.ts`

**Checkpoint**: Tenant resolution is enforced at the guard level on every protected request

---

## Phase 9: User Story 7 - Frontend Login Page (Priority: P2)

**Goal**: Provide a dedicated `/login` page where users can enter credentials and be redirected into the application.

**Independent Test**: A user navigates to `/login`, enters valid credentials, submits, and is redirected to `/vehicles` with cookies set. Invalid credentials show an error.

### Tests for User Story 7 (OPTIONAL) ⚠️

- [x] T059 [P] [US7] Unit test for `LoginForm` validation in `frontend/tests/unit/login-form.unit.test.tsx`
- [x] T060 [P] [US7] E2E test for login success redirect in `frontend/tests/e2e/auth.spec.ts`
- [x] T061 [P] [US7] E2E test for login error display in `frontend/tests/e2e/auth.spec.ts`

### Implementation for User Story 7

- [x] T062 [P] [US7] Create Zod login schema in `frontend/src/lib/validators/login.schema.ts`
- [x] T063 [P] [US7] Create `LoginForm` component in `frontend/src/components/auth/login-form.tsx`
- [x] T064 [US7] Create `/login` page in `frontend/src/app/login/page.tsx`
- [x] T065 [US7] Create `useAuth` hook with `login`, `logout`, `me` in `frontend/src/hooks/use-auth.ts`
- [x] T066 [US7] Integrate `useAuth` hook with TanStack Query mutations in `frontend/src/hooks/use-auth.ts`
- [x] T067 [US7] Redirect authenticated users away from `/login` in `frontend/src/app/login/page.tsx`

**Checkpoint**: Frontend login page is functional, validates input, and redirects correctly

---

## Phase 10: User Story 8 - Session Persistence (Priority: P2)

**Goal**: Allow sessions to persist across browser refreshes and access token expiry via silent refresh.

**Independent Test**: A user logs in, waits for access token to expire, and the next API request silently refreshes the session without credential re-entry.

### Tests for User Story 8 (OPTIONAL) ⚠️

- [x] T068 [P] [US8] Contract test for `POST /api/v1/auth/refresh` in `backend/tests/contract/auth-api.contract.test.ts`
- [x] T069 [P] [US8] Integration test for silent refresh behavior in `backend/tests/integration/auth.integration.test.ts`
- [x] T070 [P] [US8] E2E test for session persistence across page refresh in `frontend/tests/e2e/auth.spec.ts`

### Implementation for User Story 8

- [x] T071 [US8] Implement `POST /api/v1/auth/refresh` endpoint in `backend/src/auth/auth.controller.ts`
- [x] T072 [US8] Implement `refreshToken()` in `backend/src/auth/auth.service.ts`
- [x] T073 [US8] Add Axios response interceptor for silent refresh in `frontend/src/lib/api-client.ts`
- [x] T074 [P] [US8] Add refresh queue deduplication to prevent parallel refresh calls in `frontend/src/lib/api-client.ts`
- [x] T075 [US8] Redirect to `/login` when refresh token is also expired in `frontend/src/lib/api-client.ts`

**Checkpoint**: Session persists silently for 7 days; expired refresh token forces re-login

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Security hardening, testing coverage, and documentation validation

- [x] T076 [P] Integration test for rate limiting on login (5 req/min) in `backend/tests/integration/auth.integration.test.ts`
- [x] T077 [P] Integration test for CORS blocking unknown origins in `backend/tests/integration/cors.integration.test.ts`
- [x] T078 [P] Security test for cookie attributes (HttpOnly, Secure, SameSite) in `backend/tests/security/cookie-config.unit.test.ts`
- [x] T079 [P] Frontend unit test for CSRF interceptor in `frontend/tests/security/csrf.interceptor.unit.test.ts`
- [x] T080 [P] Frontend integration test for `withCredentials` on API client in `frontend/tests/security/api-client.integration.test.ts`
- [x] T081 [P] E2E test for protected route redirect when logged out in `frontend/tests/e2e/auth.spec.ts`
- [x] T082 [P] E2E test for role-based access denial in `frontend/tests/e2e/auth.spec.ts`
- [x] T083 Run `quickstart.md` validation steps against local environment

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
  - `T019` (Throttler install) must complete before `T020` (Throttler config)
  - `T021` (UserProfileDto) must complete before US1 `/me` implementation
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational - No dependencies; may be tested with US1 login
- **User Story 3 (P1)**: Can start after Foundational - Backend guards already exist; frontend middleware depends on nothing
- **User Story 4 (P2)**: Can start after Foundational and US1 (login provides auth context for testing `/csrf`)
- **User Story 5 (P2)**: Can start after Foundational and US1 (login is where resolution happens)
- **User Story 6 (P2)**: Already complete in Foundational phase
- **User Story 7 (P2)**: Can start after Foundational and US1 (needs login endpoint to exist)
- **User Story 8 (P2)**: Can start after Foundational and US1 (needs login to issue refresh token)

### Within Each User Story

- Tests (if included) MUST be written and FAIL before implementation
- Backend endpoints before frontend integration
- Core implementation before polish
- Story complete before moving to next priority

### Parallel Opportunities

- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- All tests for a user story marked [P] can run in parallel
- Frontend and backend tasks within a story can run in parallel (if API contracts are agreed)
- US4, US5, US7, and US8 can all proceed in parallel once US1 login is functional

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Unit test for AuthService.login() in backend/tests/unit/auth.service.unit.test.ts"
Task: "Contract test for POST /api/v1/auth/login in backend/tests/contract/auth-api.contract.test.ts"
Task: "Integration test for login cookie issuance in backend/tests/integration/auth.integration.test.ts"

# Launch backend endpoint + DTO together:
Task: "Add @Throttle() to login endpoint in backend/src/auth/auth.controller.ts"
Task: "Add UserProfileDto response serialization in backend/src/auth/auth.controller.ts"

# Frontend tasks can start in parallel with backend:
Task: "Create Zod login schema in frontend/src/lib/validators/login.schema.ts"
Task: "Create LoginForm component in frontend/src/components/auth/login-form.tsx"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 + 3 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Login + /me)
4. Complete Phase 4: User Story 2 (Logout)
5. Complete Phase 5: User Story 3 (Protected Routes)
6. **STOP and VALIDATE**: Test login, logout, protected routes independently
7. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Add User Story 4 (CSRF endpoint) → Test independently → Deploy/Demo
6. Add User Story 5 (Role resolution) → Test independently → Deploy/Demo
7. Add User Story 7 (Login page) → Test independently → Deploy/Demo
8. Add User Story 8 (Session persistence) → Test independently → Deploy/Demo

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (backend endpoints)
   - Developer B: User Story 3 (frontend middleware + protected routes)
   - Developer C: User Story 7 (frontend login page + useAuth hook)
   - Developer D: User Story 5 (role/permission resolution)
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
- The mock credential validation in `AuthService` is a temporary bridge. Replace with real `User` table + bcrypt when the Administration module is implemented.
