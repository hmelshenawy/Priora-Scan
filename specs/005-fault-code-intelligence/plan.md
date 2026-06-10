# Implementation Plan: Fault Code Intelligence

**Branch**: `005-fault-code-intelligence` | **Date**: 2026-06-10 | **Status**: Draft | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-fault-code-intelligence/spec.md`

---

## Summary

Feature 005 (Fault Code Intelligence) transforms the raw fault codes that PrioraScan imports during an OBD scan into useful diagnostic knowledge. A new global reference table `MasterFaultCode` is seeded once from the existing local asset `backend/data/code-descriptions.sqlite` (~4,655 generic OBD-II codes). At read time, every `SessionFaultCode` row is enriched by a new NestJS service that derives the system/category from the code prefix (`P`/`B`/`C`/`U` → `POWERTRAIN`/`BODY`/`CHASSIS`/`NETWORK`) and supplies an `UNKNOWN` severity, empty causes/checks, and a clear "No description available" indicator when the code is not in the knowledge base. A new read-only API endpoint `GET /fault-codes/{code}` exposes the enriched payload for internal consumers; the existing Diagnostic Session detail and OBD scan-results pages are updated to display the enriched fields without breaking the Feature 004 scan flow.

The seed populates only the fields imported directly from the SQLite asset (`code`, `title`, `description`, `isGeneric`, `source`); severity, system, commonCauses, and recommendedChecks are deliberately NOT computed at seed time and are owned by the enrichment service. The schema includes forward-looking `manufacturer` and `isGeneric` columns to enable future OEM-specific code imports without a migration.

---

## Technical Context

**Backend Language/Version**: TypeScript / Node.js 20+ / NestJS 10+
**Frontend Language/Version**: TypeScript / Next.js 14+ (App Router)
**Primary Backend Dependencies**: NestJS, Prisma, PostgreSQL, class-validator, better-sqlite3 (seed only)
**Primary Frontend Dependencies**: Next.js, React, TanStack Query, Axios, TailwindCSS, shadcn/ui
**Storage**: PostgreSQL 15+ (runtime); SQLite (one-shot seed source, read-only)
**Testing**: Jest (backend unit/integration), Playwright (frontend E2E)
**Target Platform**: Web SaaS
**Project Type**: Web application (backend + frontend)
**Performance Goals**: `GET /fault-codes/{code}` p95 < 200 ms; scan-result page render unchanged from Feature 004; enrichment does not add measurable latency to existing session/scan pages
**Constraints**: Existing 300-line file size and 30-line function size limits apply; tenant isolation on session/scan data is unchanged
**Scale/Scope**: ~4,655 `MasterFaultCode` rows globally; one new read-heavy table; one new endpoint; two existing endpoints extended

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Justification |
|---|---|---|
| Feature does not contradict PRD/SAD/Frontend Architecture | ✅ Pass | Fault Code Intelligence extends existing Diagnostic Session flow per SAD and PRD addendum. |
| Multi-tenant boundaries defined for all new entities | ✅ Pass | `MasterFaultCode` is global reference data (no `organizationId`); `SessionFaultCode` and parents remain tenant-scoped. |
| API contracts specified before backend implementation | ✅ Pass | Defined in `contracts/fault-code-api-contract.md`. |
| AI features include explainability / human confirmation | N/A | No AI features in Feature 005 (out of scope per spec). |
| No PrioraFlow dependency introduced for core workflows | ✅ Pass | Feature is standalone; PrioraFlow integration is explicitly out of scope. |
| Error handling and audit logging included in design | ✅ Pass | Unknown-code fallback is explicit; seed failure is transactional; no new audit records introduced (read-only enrichment). |
| `MasterFaultCode` design separates imported vs derived data | ✅ Pass | Seed only writes imported fields; enrichment service owns derived fields. |
| Out-of-scope list is explicit and enforced | ✅ Pass | FR-017 and the spec's "Out of Scope" section list 11+ excluded items. |

**Constitution Principles Satisfied**:
- **II. Analysis First**: Spec verified against PRD addendum, SAD, and Frontend Architecture before plan generation.
- **III. Layered Architecture**: Controller → Service → Repository → DTO boundaries preserved; new `MasterFaultCodeRepository` and `FaultCodeEnrichmentService` follow existing patterns.
- **V. Module Scope Control**: Only `MasterFaultCode` table and `FaultCodeEnrichment` module are added; no opportunistic refactoring of Feature 004.
- **VI. Multi-Tenant First**: Enrichment is global; tenant isolation is unchanged on `SessionFaultCode`, `DiagnosticSession`, and `ScanJob`.
- **VII. API First**: New `GET /fault-codes/{code}` endpoint plus extended existing endpoints; frontend consumes only the API.
- **X. Change Safety**: No existing public contracts are renamed or have signatures changed; new fields are additive on existing responses.
- **XVI. Backend-Centric Business Logic**: All enrichment rules live in NestJS services; the Desktop Agent is not involved in this feature.

---

## Project Structure

### Documentation (this feature)

```text
specs/005-fault-code-intelligence/
├── plan.md                 # This file
├── spec.md                 # Feature specification
├── data-model.md           # Prisma schema additions
├── contracts/              # API contracts
│   └── fault-code-api-contract.md
├── checklists/
│   └── requirements.md     # Spec quality checklist
└── tasks.md                # Implementation tasks (Phase 2)
```

### Source Code (repository root)

```text
backend/
├── prisma/
│   ├── schema.prisma                       # + MasterFaultCode, + FaultSeverity, + FaultCodeSystem
│   └── seed/
│       └── seed-master-fault-codes.ts      # NEW: idempotent import from code-descriptions.sqlite
├── src/
│   ├── fault-codes/                        # NEW module
│   │   ├── fault-codes.module.ts
│   │   ├── controllers/
│   │   │   └── fault-codes.controller.ts
│   │   ├── services/
│   │   │   └── fault-code-enrichment.service.ts
│   │   ├── repositories/
│   │   │   └── master-fault-code.repository.ts
│   │   ├── rules/
│   │   │   └── system-prefix.rules.ts      # P/B/C/U → system mapping (pure, easy to test)
│   │   └── dtos/
│   │       └── enriched-fault-code.dto.ts
│   └── ... (existing modules)
└── tests/
    └── fault-codes/
        ├── unit/
        │   ├── system-prefix.rules.spec.ts
        │   ├── fault-code-enrichment.service.spec.ts
        │   └── master-fault-code.repository.spec.ts
        ├── integration/
        │   ├── fault-codes.controller.spec.ts
        │   └── seed-master-fault-codes.spec.ts
        └── security/
            └── fault-codes.tenant-isolation.security.test.ts

frontend/
├── src/
│   ├── app/
│   │   └── diagnostic-sessions/[sessionId]/page.tsx        # UPDATE: render enriched fields
│   ├── components/
│   │   └── obd/
│   │       ├── FaultCodeList.tsx           # UPDATE: accept enriched payload
│   │       └── EnrichedFaultCodeRow.tsx    # NEW: row renderer with severity/system badges
│   ├── hooks/
│   │   └── useEnrichedFaultCodes.ts        # NEW: query enrichment for a session's codes
│   └── lib/
│       └── fault-codes.ts                  # NEW: client helpers (enrichment mapping, hasDescription derivation)
└── tests/
    └── components/
        └── EnrichedFaultCodeRow.spec.tsx
```

**Structure Decision**: A new `backend/src/fault-codes/` NestJS module is added alongside the existing `obd/`, `vehicles/`, and `diagnostic-sessions/` modules. The module owns: the new controller, the new service (enrichment), the new repository (`MasterFaultCode`), the prefix-rule helper, and the seed script. The two existing OBD/Diagnostic-Session endpoints are extended in-place to call the enrichment service, keeping cross-module dependencies explicit. The frontend adds one new component and a hook; the existing session page and OBD scan-results page are updated to render the enriched fields.

---

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| N/A | No constitutional violations. All design decisions align with existing architecture and principles. | — |

---

## 1. Technical Overview

Feature 005 introduces a thin "enrichment" layer between the existing `SessionFaultCode` data and the existing UI surfaces. The layer is read-only, stateless per request, and consumes one new global table.

**Why a service layer, not a database view or join**: A TypeScript service keeps the rules (prefix → system, default severity, fallback behavior) testable in isolation, versionable independently of the schema, and forward-compatible with a future cache. A Prisma `$queryRaw` view would couple the rules to SQL and complicate caching.

**Why derived columns are not stored on the seed row**: The seed remains a single, fast, idempotent copy of the asset. Severity/causes/checks logic will evolve; storing them on the row would mean re-seeding every time a rule changes. Keeping them in the enrichment service lets rule changes ship as code, not as data migrations.

**Why `manufacturer` and `isGeneric` are added now**: They are forward-looking. Adding them to the v1 schema is free; a future migration to add them would touch every insert path. They are nullable / default `true`, so they impose no constraint on the seed.

---

## 2. Component Design

### 2.1 `MasterFaultCodeRepository`

**Responsibility**: Persistence boundary for the `MasterFaultCode` table. Provides:

- `findByCode(code: string): Promise<MasterFaultCode | null>` — case-normalized lookup.
- `upsertMany(rows: MasterFaultCodeSeedRow[]): Promise<UpsertSummary>` — used by the seed.
- `count(): Promise<number>` — used by seed verification and tests.

**Why**: Existing repositories in `obd/repositories/` follow the same shape. Keeping all SQL here keeps the service free of `prisma` calls.

### 2.2 `SystemPrefixRules` (pure module)

**Responsibility**: A pure function `inferSystem(code: string): FaultCodeSystem` that maps the first character of the code to an enum. Returns `UNKNOWN` for any non-`P`/`B`/`C`/`U` prefix or empty input.

**Why a separate module**: The mapping is a one-liner, but it is the most heavily-tested function in this feature (US2 edge cases). Keeping it pure and side-effect-free lets the unit test cover it in one screen of code, and lets future features (e.g., manufacturer-specific system labels) extend it without touching the service.

### 2.3 `FaultCodeEnrichmentService`

**Responsibility**: Given a list of `SessionFaultCode` records (or a single `code` value), return the enriched payload. Owns:

- Code normalization (uppercase).
- Lookup against `MasterFaultCodeRepository`.
- System inference (delegates to `SystemPrefixRules`).
- Default severity (`UNKNOWN` for all codes in v1).
- Default common causes / recommended checks (empty arrays).
- `hasDescription` derivation.
- Provider-injectable service interface (for future caching).

**Why an interface boundary**: The interface `FaultCodeEnrichment` is the seam for FR-020 (cache-friendly design). The implementation `DefaultFaultCodeEnrichmentService` is registered in the module. A future feature can add `CachedFaultCodeEnrichmentService` that delegates to the default and adds an in-memory or Redis cache, registered with the same token.

### 2.4 `FaultCodesController`

**Responsibility**: HTTP boundary. Exposes `GET /fault-codes/{code}` returning the enriched payload from FR-006. Validates the path param and delegates to the service. Returns 200 with the fallback shape for unknown codes (never 404). Returns 401 for unauthenticated requests.

**Why**: Consistent with the existing OBD/Diagnostic-Sessions controller pattern.

### 2.5 `SeedMasterFaultCodes` (CLI script)

**Responsibility**: One-shot, idempotent import of `code-descriptions.sqlite` into `MasterFaultCode`. Reads the SQLite file with `better-sqlite3` (already a transitive dependency in some setups, otherwise added to `devDependencies`), iterates `codes.id` / `codes.desc`, and calls `MasterFaultCodeRepository.upsertMany`. Runs in a single Prisma transaction.

**Failure modes**:
- SQLite file missing → exit code 1 with a clear message.
- `codes` table missing or wrong columns → exit code 1 with a clear message.
- Any row fails → entire transaction rolls back; the table is unchanged.

**Why a CLI, not an API**: The seed is an operational task. It runs in CI/release pipelines, not from the web app or the agent. A CLI script keeps it out of the runtime HTTP path.

### 2.6 Frontend `EnrichedFaultCodeRow` + `useEnrichedFaultCodes`

**Responsibility**:
- `EnrichedFaultCodeRow` renders a single row: raw code, severity badge, system badge, title, description, ECU, status. Falls back to "No description available" when `hasDescription` is false.
- `useEnrichedFaultCodes(codes)` calls the existing session/scan endpoint and assumes the backend has already attached enriched fields; if a future migration is needed and the backend does not attach them, the hook can call `GET /fault-codes/{code}` per code (batched in one call would be a follow-up, not part of v1).

**Why extend the existing session/scan endpoints instead of a per-code client call**: It is one round-trip per page load, not N+1, and it keeps the frontend simple. The backend does the enrichment work in the same service that produces the response.

---

## 3. Updated Response Shapes

The Diagnostic Session endpoint and the OBD scan-result endpoint gain enriched fault-code fields (see `contracts/fault-code-api-contract.md` for the exact JSON). No field on the existing response is renamed or removed; all new fields are additive and nullable/array-defaulted.

---

## 4. Caching Readiness (FR-020)

The enrichment service is registered behind an injection token. A future feature can provide `CachedFaultCodeEnrichmentService` that wraps the default. The controller depends on the token, not the class, so the swap is transparent. Feature 005 does **not** implement caching.

---

## 5. Out of Scope (Re-confirmed)

The spec's "Out of Scope" section is the authoritative list. The plan does not introduce, plan, or stub:

- Live Data, PID polling
- VIN decoding with VPIC
- AI diagnosis
- PDF reports
- PrioraFlow integration
- Freeze frame data
- Graphing
- Programming, Coding, Flashing
- OEM-specific repair procedures
- Search/list endpoint (`GET /fault-codes?query=...`)
- Caching layer (in-memory or Redis)
- Rule-based severity overrides for any specific code family
- Migration of `manufacturer` or `isGeneric` data (they default to `null`/`true`)

---

## 6. Open Implementation Decisions

The following decisions are intentionally deferred to the `tasks.md` / implementation phase:

1. **`title` vs `description` split**: The seed populates both from `codes.desc`. The exact split (e.g., title = first sentence, description = full string) is a task-level choice; both options are spec-compliant.
2. **`system` storage strategy**: Spec allows either storing the derived system in the row on first read OR keeping the enrichment purely read-time. Plan recommends pure read-time derivation (lower coupling, simpler invalidation); the task will confirm.
3. **Where to attach enrichment** in the existing session/scan response — in the service that produces the response, or in the controller via an interceptor. Plan recommends service-level; the task will confirm.

---

## 7. Test Strategy

| Layer | Test type | Coverage target |
|---|---|---|
| `system-prefix.rules` | Unit | All P/B/C/U prefixes, mixed case, empty, non-ASCII, single char, 10-char codes |
| `master-fault-code.repository` | Unit (in-memory Prisma) | upsert idempotency, count, lookup normalization |
| `fault-code-enrichment.service` | Unit | Known code, unknown code, empty KB, all-prefix cases |
| `fault-codes.controller` | Integration (NestJS testing module) | 200 known, 200 unknown, 401 unauth, 400 invalid path |
| Seed script | Integration | First run inserts ~4,655 rows, second run is no-op, missing file exits non-zero |
| Tenant isolation | Security (existing test pattern) | A tenant B user cannot read tenant A's session via the new endpoint; existing `SessionFaultCode` tests still pass |
| Frontend `EnrichedFaultCodeRow` | Component (React Testing Library) | Known code renders all badges; unknown code shows fallback |

---

## 8. Rollout

- Migration is additive; no downtime required.
- Seed runs in CI after migrations; can be re-run any time.
- Backend can be deployed independently; frontend can deploy the new component with no backend change (it will simply render the fallback for all codes until the backend ships). For a clean rollout, deploy backend first, then frontend.
- The `MasterFaultCode` table can be empty for a short period; FR-013 (unknown-code fallback) covers this transition safely.
