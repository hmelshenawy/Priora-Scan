# Implementation Plan: Vehicle Management

**Branch**: `001-vehicle-management` | **Date**: 2026-06-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-vehicle-management/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Implement a standalone Vehicle Management feature that allows technicians, service advisors, and workshop managers to create, view, search, and edit vehicle records within their organization. The feature exposes a versioned REST API consumed by a Next.js frontend. All vehicle mutations generate tenant-scoped audit records. No dependencies on Diagnostic Sessions, Fault Codes, AI Analysis, Reports, or PrioraFlow. Vehicle deletion is explicitly excluded from MVP.

## Technical Context

**Language/Version**: Node.js 20+ with TypeScript 5.3+. Backend framework: NestJS 10+.

**Primary Dependencies**: Backend: NestJS, Prisma, @nestjs/jwt, @nestjs/passport, class-validator, class-transformer. Frontend: Next.js 14+, TypeScript, TailwindCSS, shadcn/ui, TanStack Query, React Hook Form, Zod, Axios.

**Storage**: PostgreSQL 15+.

**Testing**: Backend: Jest + Supertest. Frontend: Jest + React Testing Library + Playwright.

**Target Platform**: Linux server (backend) + Modern web browsers (frontend)

**Project Type**: Web application (frontend + backend)

**Performance Goals**: Vehicle list <500ms for 10,000 records per organization. Vehicle creation <30 seconds end-to-end. Audit record generation <100ms synchronous.

**Constraints**: Multi-tenant isolation mandatory at all layers. RBAC enforced on every endpoint. No more than six visible fields on vehicle creation form. PATCH for partial updates only. All state-changing API requests MUST include valid CSRF protection.

**Scale/Scope**: SaaS platform supporting multiple workshops. Vehicle Management is the foundational feature for all downstream diagnostic workflows.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Documentation First**: Plan references PRD, SAD, Frontend Architecture, and the refined Vehicle Management spec. No contradictions identified.
- [x] **II. Design Before Implementation**: This plan is the design artifact. Implementation code will not be written until the plan is accepted.
- [x] **III. Layered Architecture**: Plan specifies Controller/Service/Repository/DTO layers for all backend work.
- [x] **IV. Modular Development**: Scope is strictly Vehicle Management. Explicit exclusions prevent cross-module contamination.
- [x] **VI. Multi-Tenant First**: Every entity includes `organizationId`. Every query is scoped by organization.
- [x] **VII. API First**: All capabilities exposed via `/api/v1/vehicles/*`. Frontend consumes APIs.
- [x] **XI. Auditability**: Audit records (`VehicleAuditRecord`) specified for create and update actions.
- [x] **XII. Security By Default**: AuthGuard, RbacGuard, TenantGuard, CsrfGuard defined. RBAC permissions mapped per role. JWT in `HttpOnly; Secure; SameSite=Strict` cookies. CSRF double-submit cookie protection on all mutating requests. CORS restricted to known origins with `Access-Control-Allow-Credentials`. Security headers (HSTS, X-Content-Type-Options) enforced.
- [x] **XV. Simplicity Over Complexity**: Scope limited to vehicle CRU (no Delete). No DMS/ERP features.

**Re-evaluation after Phase 1 (2026-06-08)**:

- [x] **I. Documentation First**: All design artifacts (data-model.md, contracts, quickstart.md) reference and align with PRD, SAD, Frontend Architecture, and spec.md.
- [x] **II. Design Before Implementation**: Phase 0 and Phase 1 complete. No implementation code generated.
- [x] **III. Layered Architecture**: Source code tree defines Controller, Service, Repository, DTO, and Prisma layers with single responsibilities.
- [x] **IV. Modular Development**: Scope confirmed as Vehicle Management only. No cross-module dependencies introduced.
- [x] **VI. Multi-Tenant First**: `organizationId` present on all models. Repository queries scoped. JWT carries org context.
- [x] **VII. API First**: OpenAPI contracts define `/api/v1/vehicles/*`. Frontend consumes APIs via Axios/TanStack Query.
- [x] **XI. Auditability**: `VehicleAuditRecord` model defined with immutable fields. BR-AUDIT-003 enforces synchronous transactional audit writes.
- [x] **XII. Security By Default**: AuthGuard, RbacGuard, TenantGuard, CsrfGuard defined. RBAC permissions mapped per role. JWT in `HttpOnly; Secure; SameSite=Strict` cookies. CSRF double-submit cookie protection on all mutating requests. CORS restricted to known origins with `Access-Control-Allow-Credentials`. Security headers (HSTS, X-Content-Type-Options) enforced.
- [x] **XV. Simplicity Over Complexity**: Scope = CRU only. ≤6 visible fields. No DMS/ERP features. History is a placeholder.

**All Constitution Check gates passed.**

## Project Structure

### Documentation (this feature)

```text
specs/001-vehicle-management/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── vehicle-api.yaml
│   └── vehicle-api-errors.yaml
└── tasks.md             # Phase 2 output (NOT created by this command)
```

### Source Code (repository root)

```text
# Web application (frontend + backend)
backend/
├── prisma/
│   ├── schema.prisma                     # Prisma schema with Vehicle and VehicleAuditRecord models
│   └── migrations/                       # Prisma migration files
├── src/
│   ├── prisma/
│   │   └── prisma.service.ts             # PrismaClient wrapper as NestJS injectable service
│   ├── vehicles/
│   │   ├── controllers/
│   │   │   └── vehicle.controller.ts     # HTTP only; routes to VehicleService
│   │   ├── services/
│   │   │   └── vehicle.service.ts        # Business logic; tenant scoping, audit orchestration
│   │   ├── repositories/
│   │   │   ├── vehicle.repository.ts     # Prisma database access for Vehicle
│   │   │   └── vehicle-audit.repository.ts # Prisma database access for VehicleAuditRecord
│   │   ├── dtos/
│   │   │   ├── create-vehicle.dto.ts
│   │   │   ├── update-vehicle.dto.ts
│   │   │   ├── vehicle-response.dto.ts
│   │   │   └── vehicle-list-query.dto.ts
│   │   └── vehicles.module.ts            # NestJS feature module
│   ├── guards/
│   │   ├── auth.guard.ts                 # JWT validation from HTTP-only cookie
│   │   ├── rbac.guard.ts                 # Permission-based authorization
│   │   ├── tenant.guard.ts               # Organization scoping
│   │   └── csrf.guard.ts                 # CSRF double-submit cookie validation
│   ├── middleware/
│   │   ├── error-handler.middleware.ts
│   │   └── security-headers.middleware.ts # HSTS, X-Content-Type-Options, etc.
│   └── config/
│       └── security.config.ts            # Cookie, CORS, and CSRF policy definitions
└── tests/
    ├── contract/
    │   └── vehicle-api.contract.test.ts
    ├── integration/
    │   ├── vehicle-crud.integration.test.ts
    │   ├── cookie-config.integration.test.ts
    │   ├── cors.integration.test.ts
    │   └── auth.integration.test.ts
    ├── unit/
    │   ├── vehicle.service.unit.test.ts
    │   └── vehicle.repository.unit.test.ts
    └── security/
        ├── csrf.guard.unit.test.ts
        └── csrf.integration.test.ts

frontend/
├── src/
│   ├── app/
│   │   ├── (routes)/
│   │   │   ├── vehicles/
│   │   │   │   ├── page.tsx            # Vehicle list + search
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx        # Create vehicle (≤6 fields)
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx        # Vehicle detail + history placeholder
│   │   │   └── layout.tsx
│   │   └── api/
│   │       └── vehicles/
│   │           └── route.ts             # API proxy (if full-stack Next.js)
│   ├── components/
│   │   ├── vehicles/
│   │   │   ├── vehicle-form.tsx        # Shared create/edit form (≤6 fields)
│   │   │   ├── vehicle-list-table.tsx
│   │   │   ├── vehicle-search-filters.tsx
│   │   │   └── vehicle-history-placeholder.tsx
│   ├── hooks/
│   │   └── use-vehicles.ts             # TanStack Query hooks
│   ├── lib/
│   │   ├── api-client.ts               # Axios instance with auth + CSRF interceptors
│   │   ├── csrf.ts                     # CSRF token read from cookie + attach to headers
│   │   └── validators/
│   │       └── vehicle.schema.ts       # Zod schemas
│   └── types/
│       └── vehicle.types.ts
└── tests/
    ├── e2e/
    │   └── vehicle-management.spec.ts
    ├── unit/
    │   └── vehicle-form.unit.test.tsx
    └── security/
        ├── csrf.interceptor.unit.test.ts
        └── api-client.integration.test.ts
```

**Structure Decision**: Option 2 (Web application with separate backend and frontend). This aligns with the Constitution's API First principle (VII), allowing the backend to serve multiple consumers (web frontend, future mobile app, third-party integrations). The layered backend structure follows Constitution III (Layered Architecture) with strict Controller/Service/Repository/DTO boundaries. Prisma is used as the ORM with a custom Repository layer wrapping Prisma queries to maintain separation of concerns and enable testability.

## Complexity Tracking

> No Constitution Check violations identified. All design decisions are justified by constitutional principles.

| Design Decision | Justification | Constitutional Basis |
|-----------------|---------------|----------------------|
| Separate backend/frontend | API-first SaaS; enables future headless consumers | VII. API First |
| VehicleAuditRecord model | Immutable audit trail for every mutation | XI. Auditability |
| PATCH for updates | Partial update support; reduces client payload complexity | XV. Simplicity |
| History placeholder UI | Forward-compatible without Diagnostic Sessions dependency | IV. Modular Development |
| CSRF double-submit cookie | SPA-compatible CSRF defense without server-side state | XII. Security By Default |
| Secure cookie attributes | HttpOnly + Secure + SameSite=Strict on all auth cookies | XII. Security By Default |
| CORS allowlist | No wildcard origins; credentials enabled for cookie transport | XII. Security By Default |
| Prisma ORM | Type-safe queries; excellent migration system; clean repository wrapper pattern | III. Layered Architecture |
| ≤6 visible fields on creation | Technician speed; minimal data entry friction | XV. Simplicity |

---

## Security Architecture

Because authentication uses JWT in HTTP-only cookies, CSRF protection is mandatory for all state-changing requests. This section defines the security model for Vehicle Management.

### 1. CSRF Protection: Double-Submit Cookie Pattern

**Strategy**: The backend issues a non-HttpOnly `csrf_token` cookie on authentication. The frontend reads this cookie and sends its value in the `X-CSRF-Token` request header. The backend validates that the header value matches the cookie value for every mutating request (POST, PATCH, PUT, DELETE).

**Why double-submit cookie**: It does not require server-side session state, works naturally with JWT cookie authentication, and is the industry-standard defense for SPA architectures.

**Implementation**:

- **Backend (NestJS)**:
  - `CsrfGuard` reads `csrf_token` from cookies and `X-CSRF-Token` from headers.
  - Guard compares the two values using a constant-time comparison to prevent timing attacks.
  - Guard is applied globally to all POST, PATCH, PUT, DELETE routes via `APP_GUARD` or controller decorators.
  - GET, HEAD, OPTIONS requests are exempt (read-only, no side effects).

- **Frontend (Next.js)**:
  - `lib/csrf.ts` reads `document.cookie` for `csrf_token`.
  - Axios request interceptor automatically attaches `X-CSRF-Token` header to all mutating requests.
  - On 403 `CSRF_INVALID`, the frontend refreshes the page to obtain a fresh token from the backend.

### 2. Secure Cookie Configuration

All cookies set by the backend MUST use the following attributes:

| Cookie | HttpOnly | Secure | SameSite | Path | Max-Age |
|--------|----------|--------|----------|------|---------|
| `access_token` (JWT) | Yes | Yes (production) | Strict | / | 15 minutes |
| `refresh_token` (JWT) | Yes | Yes (production) | Strict | / | 7 days |
| `csrf_token` | No | Yes (production) | Strict | / | Session |

**Rules**:
- `Secure` is conditional: enabled in production, relaxed to `false` only in local development over HTTP.
- `SameSite=Strict` prevents cross-origin cookie transmission in all browsing contexts.
- `csrf_token` is intentionally **not** HttpOnly so that JavaScript can read it for the double-submit pattern.

### 3. CORS Restrictions

CORS is configured explicitly. No wildcard origins.

**Allowed Origins**:
- Production: exact frontend domain (e.g., `https://app.priorascan.com`)
- Staging: exact staging domain
- Development: `http://localhost:3000`

**CORS Policy**:
- `Access-Control-Allow-Credentials: true` — required for cookie transmission
- `Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, X-CSRF-Token, Authorization`
- Preflight (`OPTIONS`) responses cached for 24 hours
- No origin reflection. Unknown origins receive a CORS error.

### 4. Authenticated API Requests from Frontend

**Axios Configuration** (`frontend/src/lib/api-client.ts`):

```typescript
const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL,
  withCredentials: true, // Send cookies cross-origin
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach CSRF token to mutating requests
apiClient.interceptors.request.use((config) => {
  if (['post', 'patch', 'put', 'delete'].includes(config.method?.toLowerCase() || '')) {
    const csrfToken = getCsrfTokenFromCookie(); // from lib/csrf.ts
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
  }
  return config;
});
```

**Request Flow**:
1. User authenticates → backend sets `access_token`, `refresh_token`, and `csrf_token` cookies.
2. Frontend loads → `api-client.ts` initialized with `withCredentials: true`.
3. User creates a vehicle → Axios POST includes cookies + `X-CSRF-Token` header.
4. Backend validates JWT (AuthGuard) → validates permission (RbacGuard) → validates CSRF (CsrfGuard) → validates tenant (TenantGuard) → processes request.

### 5. Security Tests

Security behavior must be verified by automated tests:

**Backend Tests** (`backend/tests/security/`):

| Test | Description |
|------|-------------|
| `csrf.guard.unit.test.ts` | CsrfGuard rejects mutating requests without matching CSRF token |
| `csrf.guard.unit.test.ts` | CsrfGuard allows GET requests without CSRF token |
| `csrf.guard.unit.test.ts` | CsrfGuard rejects requests with mismatched token (timing-safe) |
| `cookie-config.integration.test.ts` | Cookies are HttpOnly, Secure, SameSite=Strict in production |
| `cors.integration.test.ts` | Requests from unknown origins are blocked |
| `cors.integration.test.ts` | Preflight requests return correct headers for allowed origins |
| `auth.integration.test.ts` | Missing JWT cookie returns 401 |
| `auth.integration.test.ts` | Expired JWT cookie returns 401 with `TOKEN_EXPIRED` |

**Frontend Tests** (`frontend/tests/security/`):

| Test | Description |
|------|-------------|
| `csrf.interceptor.unit.test.ts` | Axios interceptor attaches `X-CSRF-Token` to POST/PATCH |
| `csrf.interceptor.unit.test.ts` | Axios interceptor does not attach header to GET requests |
| `api-client.integration.test.ts` | `withCredentials: true` is set on all requests |

**Contract Tests**:
- All state-changing endpoints return `403 CSRF_INVALID` when CSRF token is missing or incorrect.

---

## Phase 0: Outline & Research

### Unknowns Identified

1. **Backend Language/Framework**: Not specified in PRD, SAD, or Frontend Architecture.
2. **Database**: Not specified in SAD.
3. **Testing Framework**: Depends on backend choice.
4. **Authentication Mechanism**: JWT? Session-based? OAuth2? Not specified.
5. **RBAC Implementation**: Role definitions exist in SAD but authorization mechanism is not detailed.

### Research Tasks

- [x] **Research Backend Stack**: Node.js + NestJS + TypeScript selected for stack alignment and layered architecture support.
- [x] **Research Database Choice**: PostgreSQL selected for ACID compliance, JSONB audit metadata, and row-level security.
- [x] **Research Auth/RBAC Patterns**: JWT in HTTP-only cookies with permission-based RBAC selected.

**Output**: [research.md](research.md) — all NEEDS CLARIFICATION resolved.

---

## Phase 1: Design & Contracts

### Prerequisites

`research.md` complete — all NEEDS CLARIFICATION resolved. ✅

### Outputs

1. [x] **data-model.md**: Prisma schema definitions for Vehicle and VehicleAuditRecord models with indexes, constraints, and business rules.
2. [x] **contracts/vehicle-api.yaml**: OpenAPI contract for `/api/v1/vehicles/*` covering POST, GET, PATCH.
3. [x] **contracts/vehicle-api-errors.yaml**: Standardized error response schema with code catalog.
4. [x] **quickstart.md**: Developer onboarding for local development and testing.

### Agent Context Update

[x] `CLAUDE.md` updated between `<!-- SPECKIT START -->` and `<!-- SPECKIT END -->` markers to reference:

```
specs/001-vehicle-management/plan.md
```

---

## Phase 2: Task Generation

**Not performed by this command.** Run `/speckit-tasks` after this plan is accepted to generate implementation tasks.
