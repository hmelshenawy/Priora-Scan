# Tasks: Fault Code Intelligence

**Input**: Design documents from `/specs/005-fault-code-intelligence/`
**Branch**: `005-fault-code-intelligence`
**Date**: 2026-06-10
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/

**Tests**: This feature ships with tests; tests for each user story are written and confirmed failing before implementation, per PrioraScan conventions.

**Organization**: Tasks are grouped by user story so each story can be implemented, tested, and delivered independently. The seed (US4) and the schema (Foundational phase) are blockers for the user-facing stories; US5 is lowest priority and can ship after the others.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1 … US5)
- Include exact file paths in descriptions

## Path Conventions

- Backend: `backend/src/`, `backend/prisma/`, `backend/tests/`
- Frontend: `frontend/src/`, `frontend/tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare the new module skeleton and tooling.

- [ ] T001 Create directory `backend/src/fault-codes/` with empty `fault-codes.module.ts`
- [ ] T002 [P] Create `backend/src/fault-codes/dtos/` directory
- [ ] T003 [P] Create `backend/src/fault-codes/repositories/` directory
- [ ] T004 [P] Create `backend/src/fault-codes/services/` directory
- [ ] T005 [P] Create `backend/src/fault-codes/rules/` directory
- [ ] T006 [P] Create `backend/src/fault-codes/controllers/` directory
- [ ] T007 [P] Create `backend/prisma/seed/` directory
- [ ] T008 [P] Add `better-sqlite3` (or equivalent) to `backend/package.json` devDependencies for seed script (FR-002/FR-003/FR-005)

**Checkpoint**: Directory skeleton ready; no code yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, enums, and module wiring that all user stories depend on. **No user story work can begin until this phase is complete.**

- [ ] T009 Add `MasterFaultCode` model to `backend/prisma/schema.prisma` per `data-model.md` (FR-001, FR-002, FR-019)
- [ ] T010 [P] Add `FaultSeverity` enum to `backend/prisma/schema.prisma` (FR-010, FR-018)
- [ ] T011 [P] Add `FaultCodeSystem` enum to `backend/prisma/schema.prisma` (FR-008, FR-010)
- [ ] T012 Generate Prisma migration: `npx prisma migrate dev --name add-master-fault-code`
- [ ] T013 [P] Implement `MasterFaultCodeRepository` skeleton in `backend/src/fault-codes/repositories/master-fault-code.repository.ts` with constructor-injected `PrismaService`, methods: `findByCode`, `upsertMany`, `count` (no business logic yet)
- [ ] T014 [P] Implement `EnrichedFaultCodeDto` in `backend/src/fault-codes/dtos/enriched-fault-code.dto.ts` per `contracts/fault-code-api-contract.md` (FR-006 response shape)
- [ ] T015 [P] Define `FaultCodeEnrichment` injection token + interface in `backend/src/fault-codes/services/fault-code-enrichment.service.ts` (FR-020: cache-friendly interface)
- [ ] T016 Wire `FaultCodesModule` in `backend/src/fault-codes/fault-codes.module.ts`: imports `PrismaModule`, registers controller, service, repository, exports the `FaultCodeEnrichment` token
- [ ] T017 [P] Register `FaultCodesModule` in `backend/src/app.module.ts`
- [ ] T018 [P] Unit-test the Prisma model exists and is queryable: minimal test in `backend/tests/fault-codes/unit/master-fault-code.repository.spec.ts` exercising `count()` returning 0 against a fresh test DB (sanity)

**Checkpoint**: Schema migrated, module wired, interface in place. User-story work can now begin.

---

## Phase 3: User Story 1 — View Enriched Fault Code Description (Priority: P1) 🎯 MVP

**Goal**: Display enriched title, description, severity, and system/category on the Diagnostic Session detail page for known codes.

**Independent Test**: A session containing `P0301` opens to a row showing title "Cylinder 1 Misfire Detected", non-empty description, severity `UNKNOWN`, system `POWERTRAIN`, plus the existing code/status/ECU. (Severity is `UNKNOWN` per FR-018 — Feature 005 does not classify imported codes.)

**Requirement trace**: FR-001, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-015, FR-018, FR-020, SC-001, SC-003, SC-005.

### Tests for User Story 1 (write first, confirm failing)

- [ ] T019 [P] [US1] Unit test `SystemPrefixRules.inferSystem` in `backend/tests/fault-codes/unit/system-prefix.rules.spec.ts` covering P/B/C/U, mixed case, empty string, 10-char code, non-ASCII prefix
- [ ] T020 [P] [US1] Unit test `FaultCodeEnrichmentService` in `backend/tests/fault-codes/unit/fault-code-enrichment.service.spec.ts`: known code returns enriched payload, unknown code returns fallback shape, empty KB returns fallback, code is uppercased before lookup
- [ ] T021 [P] [US1] Integration test for `GET /fault-codes/P0301` in `backend/tests/fault-codes/integration/fault-codes.controller.spec.ts`: 200 with title/description/system/severity for a seeded code
- [ ] T022 [P] [US1] Integration test for `GET /fault-codes/X9999` in same file: 200 with `severity: UNKNOWN`, `system: UNKNOWN`, `hasDescription: false`

### Implementation for User Story 1

- [ ] T023 [P] [US1] Implement `system-prefix.rules.ts` with `inferSystem(code): FaultCodeSystem` (FR-008)
- [ ] T024 [US1] Implement `DefaultFaultCodeEnrichmentService` in `backend/src/fault-codes/services/fault-code-enrichment.service.ts`: implements `FaultCodeEnrichment`; uppercases input, calls repository, applies `inferSystem`, builds `EnrichedFaultCodeDto` with `severity: UNKNOWN` (FR-018), empty `commonCauses`/`recommendedChecks`, `isGeneric: <from row or false for unknown>`, `manufacturer: <from row or null>`, `hasDescription: title != null && title !== ''` (FR-009, FR-010, FR-018, FR-020)
- [ ] T025 [US1] Implement `FaultCodesController` in `backend/src/fault-codes/controllers/fault-codes.controller.ts` exposing `GET /fault-codes/:code`; 200 with enrichment payload, 200 with fallback for unknown, 401 for unauthenticated, 400 for invalid path param (FR-006, FR-016)
- [ ] T026 [P] [US1] Add validation: `code` path param 1–10 chars; reject longer with 400 (defensive — spec says unknown is a normal case, but a 10,000-char input is not)
- [ ] T027 [P] [US1] Update `FaultCodesModule` to register the controller
- [ ] T028 [P] [US1] Add `EnrichedFaultCodeRow.tsx` in `frontend/src/components/obd/EnrichedFaultCodeRow.tsx` — renders raw code, severity badge, system badge, title, description, ECU, status; renders "No description available" indicator when `hasDescription: false` (FR-007, FR-015)
- [ ] T029 [P] [US1] Update `FaultCodeList.tsx` in `frontend/src/components/obd/` to use `EnrichedFaultCodeRow` and accept the enriched payload
- [ ] T030 [US1] Update Diagnostic Session detail page `frontend/src/app/diagnostic-sessions/[sessionId]/page.tsx` to render the enriched fault-code list (FR-007)
- [ ] T031 [P] [US1] Add `lib/fault-codes.ts` in `frontend/src/lib/` with client helpers: type re-exports, badge-color mapping by system/severity
- [ ] T032 [P] [US1] Frontend component test `frontend/tests/components/EnrichedFaultCodeRow.spec.tsx` — known code renders all badges, unknown code shows fallback

**Checkpoint**: A seeded Diagnostic Session shows enriched fields. US1, US2 (graceful fallback), and US3 (enrichment visible on scan results) share a large part of this implementation; the remaining work below is mostly wiring.

---

## Phase 4: User Story 2 — Graceful Fallback for Unknown Codes (Priority: P1)

**Goal**: Pages render successfully with `severity: UNKNOWN` and "No description available" indicator when the code is not in `MasterFaultCode` or the table is empty.

**Independent Test**: Insert a `SessionFaultCode` with value `X9999`, open the session, verify page renders with HTTP 200, no 5xx in logs, code/status/ECU visible, severity `UNKNOWN`, "No description available" indicator shown.

**Requirement trace**: FR-009, FR-011, FR-015, SC-004, SC-007.

> US2 is largely satisfied by US1's `DefaultFaultCodeEnrichmentService` fallback branch. The tasks below cover the explicit acceptance criteria and edge cases the US1 tests don't directly exercise.

### Tests for User Story 2 (write first, confirm failing)

- [ ] T033 [P] [US2] Unit test for `DefaultFaultCodeEnrichmentService` in `backend/tests/fault-codes/unit/fault-code-enrichment.service.spec.ts`: empty KB returns fallback for every code; malformed code (length > 10) handled without throwing
- [ ] T034 [P] [US2] Integration test in `backend/tests/fault-codes/integration/fault-codes.controller.spec.ts`: `GET /fault-codes/` (empty path) returns 400; `GET /fault-codes/X9999` returns 200 with `hasDescription: false`
- [ ] T035 [P] [US2] Security test in `backend/tests/fault-codes/security/fault-codes.tenant-isolation.security.test.ts`: unauthenticated request returns 401; authenticated request from tenant A cannot reach tenant B's session data via the new endpoint (FR-016, SC-008)

### Implementation for User Story 2

- [ ] T036 [US2] Audit `DefaultFaultCodeEnrichmentService` to ensure the "no row" branch never throws; confirm `EnrichedFaultCodeDto` is fully populated with safe defaults (this is the same code as T024; verification step before US2 acceptance)
- [ ] T037 [P] [US2] Update `EnrichedFaultCodeRow.tsx` to render the "No description available" indicator and severity `UNKNOWN` badge when `hasDescription: false`
- [ ] T038 [P] [US2] Add error-boundary / try-catch on the Diagnostic Session page so that an enrichment failure cannot 500 the page (defense-in-depth, complementing the service-level fallback)

**Checkpoint**: Unknown codes never crash the page; severity is always `UNKNOWN`; "No description available" indicator is visible.

---

## Phase 5: User Story 3 — Enrichment Visible on OBD Scan Results (Priority: P1)

**Goal**: The OBD scan-results page (the page shown immediately after a scan finishes) shows the same enriched fault-code information as the Diagnostic Session detail page.

**Independent Test**: Run a scan that returns `P0301`, view the post-scan results page, verify the same fields as the session detail page.

**Requirement trace**: FR-007, SC-003.

### Tests for User Story 3 (write first, confirm failing)

- [ ] T039 [P] [US3] Integration test for the OBD scan-result endpoint in `backend/tests/obd/integration/`: response `faultCodes` array contains enriched fields; unknown code in the response uses fallback

### Implementation for User Story 3

- [ ] T040 [US3] Update `ObdScanService` (or the controller) in `backend/src/obd/` to inject the `FaultCodeEnrichment` token and attach enriched fields to the `SessionFaultCode[]` returned by the scan-result endpoint (FR-007)
- [ ] T041 [P] [US3] Update the OBD scan-results frontend page (under `frontend/src/app/obd/` or wherever Feature 004 placed it) to render the enriched list using the same `EnrichedFaultCodeRow` component
- [ ] T042 [P] [US3] Verify the existing `useObdScan` hook still works with the enriched payload (no breaking change to its return type beyond additive fields)

**Checkpoint**: Scan-results page and session page render identical enriched fields. No regression to Feature 004.

---

## Phase 6: User Story 4 — Seed the Local Knowledge Base (Priority: P2)

**Goal**: The seed script imports `code-descriptions.sqlite` into `MasterFaultCode` idempotently in a single transaction.

**Independent Test**: From an empty `MasterFaultCode` table, run the seed; verify ~4,655 rows and a known sample row (`P0301`) is present with non-empty title/description, `isGeneric: true`, `manufacturer: null`, `severity: UNKNOWN`. Run again; verify no new rows, no duplicates. Remove the file; verify the script exits non-zero with a clear message.

**Requirement trace**: FR-002, FR-003, FR-004, FR-005, FR-014, FR-018, FR-019, SC-001, SC-002, SC-009.

### Tests for User Story 4 (write first, confirm failing)

- [ ] T043 [P] [US4] Integration test in `backend/tests/fault-codes/integration/seed-master-fault-codes.spec.ts`: first run inserts ≥ 4,000 rows; second run inserts 0 new rows; sample row `P0301` has non-empty title and description
- [ ] T044 [P] [US4] Integration test (negative path) in same file: missing `backend/data/code-descriptions.sqlite` exits with non-zero code and a clear message; table is not truncated
- [ ] T045 [P] [US4] Integration test (negative path): `codes` table missing → exits non-zero with clear message
- [ ] T046 [P] [US4] Integration test: after seed, 100% of rows have `severity: UNKNOWN`, `isGeneric: true`, `manufacturer: null` (SC-009, FR-018, FR-019)

### Implementation for User Story 4

- [ ] T047 [US4] Implement `seed-master-fault-codes.ts` in `backend/prisma/seed/`: opens `code-descriptions.sqlite` read-only, validates the `codes` table has `id` and `desc` columns, reads all rows, normalizes to uppercase, calls `MasterFaultCodeRepository.upsertMany` inside a single Prisma transaction, logs a summary (FR-002, FR-003, FR-004, FR-005, FR-014, FR-019)
- [ ] T048 [P] [US4] Implement `MasterFaultCodeRepository.upsertMany` (referenced in T013; flesh out in this task) using Prisma's `createMany` with `skipDuplicates: true` plus a follow-up `update` for changed rows — or, preferred, a single `upsert` in a transaction. Confirm idempotency in tests (FR-002, FR-014, SC-002)
- [ ] T049 [P] [US4] Add an npm script `db:seed:fault-codes` in `backend/package.json` to run the seed via `ts-node` or compiled JS
- [ ] T050 [P] [US4] Document the seed in `backend/prisma/seed/README.md` (or extend the existing README): how to run, what to expect, how to re-run, failure modes
- [ ] T051 [P] [US4] Wire the seed into the existing CI migration job (or document the manual operator step if CI is out of scope for v1)

**Checkpoint**: Seed runs locally and in CI; idempotent; clear error messages on failure; no data is lost on a re-run.

---

## Phase 7: User Story 5 — Look Up a Code by Value (Priority: P3)

**Goal**: Authenticated `GET /fault-codes/{code}` returns the enriched payload for any code (known or unknown), with graceful fallback.

**Independent Test**: `GET /fault-codes/P0301` returns the full payload; `GET /fault-codes/X9999` returns 200 with `severity: UNKNOWN`, `system: UNKNOWN`, `hasDescription: false`; unauthenticated request returns 401.

**Requirement trace**: FR-006, FR-016, SC-005.

> US5 is largely satisfied by US1's controller and service. The tasks below close the loop with the explicit acceptance criteria and forward-compatibility verification.

### Tests for User Story 5 (write first, confirm failing)

- [ ] T052 [P] [US5] Integration test: `GET /fault-codes/P0301` returns all 11 fields in the contract response shape (FR-006)
- [ ] T053 [P] [US5] Integration test: `GET /fault-codes/X9999` returns 200 with the fallback shape; never returns 404 for an unknown code
- [ ] T054 [P] [US5] Integration test: unauthenticated request to the endpoint returns 401 (FR-016)
- [ ] T055 [P] [US5] Performance test: 100 sequential `GET /fault-codes/P0301` calls against a warm DB complete in p95 < 200 ms (SC-005)

### Implementation for User Story 5

- [ ] T056 [US5] Verify the existing `FaultCodesController` and `DefaultFaultCodeEnrichmentService` already meet the FR-006 contract; if any field is missing from the response, add it (audit step; no new code if US1 implementation was complete)
- [ ] T057 [P] [US5] Verify the controller is mounted under a path that does NOT require admin or elevated RBAC; existing authenticated-user guard is sufficient (FR-016)
- [ ] T058 [P] [US5] Verify the response shape contains no volatile fields (timestamps, request IDs) so a future caching layer can key on `(code)` alone (FR-020 forward-compat)

**Checkpoint**: The endpoint exists, matches the contract, and is reachable by any authenticated user.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories.

- [ ] T059 [P] Update `docs/PRD.md` (or `docs/PRD_ADDENDUM_001_OBD_VISION.md`) to reflect that the `MasterFaultCode` table is now global reference data and the OBD Vision addendum is satisfied by Feature 005
- [ ] T060 [P] Update `docs/DATA_assets.md` to mark `code-descriptions.sqlite` as Imported (Feature 005 complete)
- [ ] T061 [P] Update `docs/roadmap.md` to mark Feature 005 Fault Code Intelligence as in-progress / complete
- [ ] T062 [P] Add a brief note to the existing OBD section in `docs/SAD.md` describing the enrichment layer
- [ ] T063 [P] Run `quickstart.md`-style local validation: start backend + frontend, run seed, run a scan, view session, verify enrichment on the page
- [ ] T064 [P] Security sweep: confirm no new endpoint introduces cross-tenant access; rerun existing OBD tenant-isolation tests
- [ ] T065 [P] Code-quality pass: ensure no file exceeds the 300-line limit and no function exceeds 30 lines (existing project constraints)
- [ ] T066 [P] Verify the `MasterFaultCode` table is global: no `organizationId` column, no `where: { organizationId }` in the repository (FR-012)
- [ ] T067 [P] Verify SC-007 (no new external network calls at runtime) by inspecting the service for HTTP clients / external SDKs
- [ ] T068 [P] Verify SC-010 (cache-friendly design) by inspecting the module: the controller depends on the `FaultCodeEnrichment` token, not the concrete class

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion. **BLOCKS** all user stories.
- **User Stories (Phases 3–7)**: All depend on Foundational phase completion.
  - Stories can proceed in parallel (different files).
  - Recommended sequence: US1 → US2 → US3 → US4 → US5 (priority order, with US4 ideally runnable in parallel with US1 because it only touches the seed script and repository).
- **Polish (Phase 8)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **US1 (P1)**: Requires Phase 2 complete. No dependency on other stories. *The MVP slice.*
- **US2 (P1)**: Largely covered by US1's fallback branch; explicit tests + UI guard.
- **US3 (P1)**: Requires US1 service to exist. Touches a different controller (OBD scan-result) and a different page.
- **US4 (P2)**: Requires Phase 2 complete. Independent of US1/US2/US3 — touches only the seed script and repository. *Can run in parallel with US1 if staffed.*
- **US5 (P3)**: Largely the same as US1's controller. Verification only.

### Within Each User Story

- Tests are written first and confirmed to fail before implementation (per project convention).
- Schema migrations before repositories.
- Repositories before services.
- Services before controllers.
- Controller before frontend consumers.
- Story complete before moving to next priority.

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel.
- All Foundational tasks marked [P] can run in parallel (within Phase 2).
- US1, US4 can be worked on in parallel by different developers after Foundational phase completes.
- US2, US3, US5 can begin once US1's service is in place.
- All tests for a user story marked [P] can run in parallel.

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: US1
4. **STOP and VALIDATE**: `GET /fault-codes/P0301` returns enrichment; the Diagnostic Session detail page renders it.
5. Deploy / demo if ready.

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 → Test → Deploy (MVP — even without seed, the API still works against an empty KB via fallback)
3. Add US2 → Test → Deploy
4. Add US3 → Test → Deploy (scan-results page in sync)
5. Add US4 → Test → Deploy (seed populates the KB; ~4,655 codes now enrich)
6. Add US5 → Test → Deploy (endpoint verification)
7. Polish (Phase 8) → Final demo

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together.
2. Once Foundational is done:
   - Developer A: US1 (API + UI)
   - Developer B: US4 (seed script)
   - Developer C: US3 (scan-results page wiring)
3. US2 and US5 are small verification/guard tasks; assign as cleanup.
4. Polish together at the end.

---

## Traceability Matrix

| Requirement | Addressed by |
|---|---|
| FR-001 (MasterFaultCode model) | T009 |
| FR-002 (seed script, idempotent) | T047, T048 |
| FR-003 (SQLite → MasterFaultCode mapping) | T047 |
| FR-004 (single-transaction seed) | T047 |
| FR-005 (seed failure → non-zero) | T044, T045, T047 |
| FR-006 (enriched endpoint) | T025, T056 |
| FR-007 (UI updates) | T030, T041 |
| FR-008 (system prefix mapping) | T023 |
| FR-009 (uppercase + unknown fallback) | T024, T036 |
| FR-010 (severity + system enums) | T010, T011, T024 |
| FR-011 (no external service at runtime) | T067 |
| FR-012 (global ref data, tenant isolation) | T009, T066 |
| FR-013 (Feature 004 unchanged) | T062, T064 |
| FR-014 (idempotent seed) | T048, T043 |
| FR-015 (page renders for any mix) | T028, T037, T038 |
| FR-016 (no new permission) | T025, T057 |
| FR-017 (out-of-scope list) | Plan + spec; no implementation task |
| FR-018 (initial severity = UNKNOWN) | T024, T046 |
| FR-019 (isGeneric=true, manufacturer=null) | T009, T046 |
| FR-020 (cache-friendly interface) | T015, T024, T068 |
| SC-001 (≥4,000 codes after seed) | T043 |
| SC-002 (idempotent seed) | T043, T048 |
| SC-003 (100% of displayed codes have enriched fields) | T021, T030, T041 |
| SC-004 (unknown codes → 200) | T022, T034, T037 |
| SC-005 (enrichment endpoint p95 < 200 ms) | T055 |
| SC-006 (Feature 004 flow unchanged) | T062, T064 |
| SC-007 (no new external network calls) | T067 |
| SC-008 (tenant isolation) | T035, T064 |
| SC-009 (seed: severity UNKNOWN, isGeneric true, manufacturer null) | T046 |
| SC-010 (cache-friendly) | T015, T068 |

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to specific user story for traceability.
- Each user story is independently completable and testable.
- Tests are written first and confirmed failing before implementation (per PrioraScan conventions).
- Commit after each task or logical group.
- Stop at any checkpoint to validate the story independently.
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break independence.
- The seed (US4) and the schema (Foundational) are the two pieces that block the user-facing stories. Everything else is parallelizable.
- No caching, no search endpoint, no rule-based severity — all are explicit future enhancements recorded in the spec.
