# Implementation Plan: Diagnostic Sessions

**Branch**: `003-diagnostic-sessions` | **Date**: 2026-06-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-diagnostic-sessions/spec.md`

**Note**: This plan defines the implementation architecture and design decisions for Diagnostic Sessions before task generation.

## Summary

Implement Diagnostic Sessions as a tenant-scoped workflow entity linked to an existing vehicle. The feature defines a strict session lifecycle (`OPEN` → `IN_PROGRESS` → `CLOSED`), enforces that only one active session may exist per vehicle at a time, and records audit entries for session creation and status changes in the same transaction as the mutation.

The backend will expose versioned REST APIs for session creation, listing, retrieval, and update. The frontend will support vehicle-level session views and lifecycle controls while preserving isolation and RBAC.

## Technical Context

**Language/Version**: Node.js 20+, TypeScript 5.x

**Primary Dependencies**:
- Backend: NestJS, Prisma, PostgreSQL, `class-validator`, `class-transformer`
- Frontend: Next.js, React, TanStack Query, Axios

**Storage**: PostgreSQL via Prisma ORM

**Testing**:
- Backend: Jest, Supertest, Prisma transaction test helpers
- Frontend: Jest, React Testing Library, Playwright (end-to-end)

**Target Platform**: Web application (backend + frontend monorepo)

**Project Type**: Web service with supporting browser UI

**Performance Goals**:
- Session list responses < 500ms for organizations with up to 10,000 sessions
- Lifecycle updates reflected within 1 second for 95% of requests

**Constraints**:
- No fault code entry, attachment uploads, AI analysis, or reporting in this feature
- Session lifecycle must remain linear and enforced server-side
- Closed sessions are immutable for core metadata

**Scale/Scope**:
- Tenant-scoped workshop organizations
- Vehicle-linked diagnostic sessions across potentially large fleets

## Constitution Check

### Pre-Design Gate

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Documentation First | ✅ | Feature spec exists and is referenced in plan header |
| II. Design Before Implementation | ✅ | This plan captures architecture details before task generation |
| IV. Modular Development | ✅ | Diagnostic Sessions are isolated as a feature module with clear dependencies on Vehicle Management only |
| VI. Multi-Tenant First | ✅ | Every session and audit record includes `organizationId`; all read/write paths enforce tenant boundaries |
| VII. API First | ✅ | REST APIs are defined for all capabilities before implementation |
| XI. Auditability | ✅ | Audit logging design is integrated with session mutations and transaction boundaries |
| XII. Security By Default | ✅ | RBAC, tenant isolation, and immutable closed sessions are enforced in backend design |
| XIV. Git & Change Safety | ✅ | Feature branch is identified; no unrelated modules are introduced |
| XV. Simplicity Over Complexity | ✅ | Design avoids future scope items such as reports, file uploads, and AI analysis |

### Post-Design Gate

| Check | Status | Justification |
|-------|--------|---------------|
| Session lifecycle and invalid transitions defined | ✅ | Lifecycle model and transition rules described in design sections |
| Tenant isolation described for all backend operations | ✅ | Tenant boundary strategy is explicit in repository, service, and API design |
| Audit logging strategy scoped to transactional session operations | ✅ | Audit record writes occur in the same transaction as session creation or update |
| RBAC mappings included for create/read/update flows | ✅ | Permission mapping is defined in RBAC section |
| Vehicle relationship is explicit and enforced | ✅ | DiagnosticSession is designed as a child of Vehicle with a foreign key and scoped queries |

**Gate Result**: ✅ PASSED

## Project Structure

### Documentation (this feature)

```text
specs/003-diagnostic-sessions/
├── DIAGNOSTIC_SESSIONS_PLAN.md   # This file
├── plan.md                       # Copy of DIAGNOSTIC_SESSIONS_PLAN.md for speckit tooling
├── spec.md                       # Feature specification
├── checklists/                   # Quality checklist created earlier
└── tasks.md                      # Phase 2 output (NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── diagnostic-sessions/
│   │   ├── controllers/
│   │   │   └── diagnostic-sessions.controller.ts
│   │   ├── dtos/
│   │   │   ├── create-diagnostic-session.dto.ts
│   │   │   ├── update-diagnostic-session.dto.ts
│   │   │   └── diagnostic-session-response.dto.ts
│   │   ├── repositories/
│   │   │   ├── diagnostic-session.repository.ts
│   │   │   └── diagnostic-session-audit.repository.ts
│   │   ├── services/
│   │   │   └── diagnostic-sessions.service.ts
│   │   └── diagnostic-sessions.module.ts
│   ├── auth/                      # existing auth integration
│   ├── guards/                    # existing TenantGuard, RBAC guard
│   └── prisma/                    # existing Prisma service and schema
frontend/
├── src/
│   ├── app/
│   │   ├── vehicles/
│   │   │   ├── [vehicleId]/
│   │   │   │   └── sessions/
│   │   │   │       ├── page.tsx
│   │   │   │       └── components/
│   │   └── diagnostic-sessions/
│   │       └── [sessionId]/
│   ├── components/
│   │   └── diagnostic-sessions/
│   ├── hooks/
│   │   └── use-diagnostic-sessions.ts
│   └── lib/
│       └── api-client.ts
```

**Structure Decision**: Use the existing backend/frontend monorepo layout. Add a dedicated `diagnostic-sessions` backend module with controllers, service, and repository layers, and add vehicle-scoped frontend session views under the existing vehicle route hierarchy.

## Complexity Tracking

No constitutional violations or extra complexity gates were required. The design remains aligned with established backend layering and frontend architecture.

## 1. Technical Overview

Diagnostic Sessions are a new child entity of Vehicle. The backend provides session lifecycle control and audit logging, while the frontend presents vehicle session lists, detail views, and status transitions.

Key architectural decisions:
- Vehicle has many Diagnostic Sessions
- Only one `OPEN` or `IN_PROGRESS` session may exist per vehicle at a time
- Session lifecycle is linear: `OPEN` → `IN_PROGRESS` → `CLOSED`
- Invalid transitions are rejected at the service layer
- Closed sessions are immutable for core metadata and status updates
- DiagnosticSession is designed as the parent entity for future Fault Codes, AI Analysis, and Reports
- Audit records are created in the same transaction as session mutations
- All operations enforce tenant isolation and RBAC

## 2. Prisma Data Model Design

### DiagnosticSession model

- `id: String @id @default(uuid())`
- `organizationId: String`
- `vehicleId: String`
- `number: String` (human-readable session number)
- `status: DiagnosticSessionStatus` enum
- `title: String?`
- `description: String?`
- `createdBy: String`
- `createdAt: DateTime @default(now())`
- `updatedAt: DateTime @updatedAt`

### DiagnosticSessionAuditRecord model

- `id: String @id @default(uuid())`
- `organizationId: String`
- `userId: String`
- `sessionId: String`
- `action: String`
- `status: DiagnosticSessionStatus?`
- `metadata: Json?`
- `createdAt: DateTime @default(now())`

### Enums

- `enum DiagnosticSessionStatus { OPEN IN_PROGRESS CLOSED }`

### Constraints

- Session belongs to one Vehicle via `vehicleId`
- Every session has an `organizationId` for tenant isolation
- `DiagnosticSessionAuditRecord` stores immutable audit history

## 3. Entity Relationships

- `Vehicle` 1 → * `DiagnosticSession`
- `DiagnosticSession` 1 → * `DiagnosticSessionAuditRecord`
- `Organization` 1 → * `DiagnosticSession`
- `Organization` 1 → * `DiagnosticSessionAuditRecord`

The `Vehicle` entity is external to this feature and is referenced through a foreign key. DiagnosticSession is the parent for future child entities such as Fault Codes and AI Analysis artifacts.

## 4. Database Migration Strategy

1. Add `DiagnosticSessionStatus` enum to Prisma schema.
2. Add `DiagnosticSession` and `DiagnosticSessionAuditRecord` models.
3. Add a unique or partial index ensuring one active session per vehicle:
   - PostgreSQL: partial unique index on `(vehicleId)` where `status IN ('OPEN','IN_PROGRESS')`
4. Add foreign key constraints for `vehicleId` and `organizationId`.
5. Add indexes for queries by `organizationId`, `vehicleId`, and `status`.

If Prisma cannot express the partial unique index directly, the migration should include raw SQL in the migration file to create it.

## 5. API Design

### Endpoints

- `POST /api/v1/vehicles/:vehicleId/diagnostic-sessions`
  - Creates a new session for the vehicle
  - Request body: `title?`, `description?`
  - Response: created session payload

- `GET /api/v1/vehicles/:vehicleId/diagnostic-sessions`
  - Lists sessions for the vehicle
  - Query parameters: `page`, `pageSize`, `status?`, `search?`
  - Response: paginated session list

- `GET /api/v1/diagnostic-sessions/:sessionId`
  - Retrieves a single session record
  - Response: session details with lifecycle state and vehicle reference

- `PATCH /api/v1/diagnostic-sessions/:sessionId`
  - Updates session metadata or status for sessions not `CLOSED`
  - Request body: `status?`, `title?`, `description?`
  - Response: updated session

### Response shape

Include:
- `id`
- `number`
- `vehicleId`
- `status`
- `title`
- `description`
- `createdBy`
- `createdAt`
- `updatedAt`

### Error contracts

- `400 BAD REQUEST` for validation failures
- `403 FORBIDDEN` for RBAC or tenant violations
- `404 NOT FOUND` for missing vehicle or session
- `409 CONFLICT` for invalid lifecycle transitions or existing active session
- `500 INTERNAL SERVER ERROR` for unhandled backend failures

## 6. DTO Design

### CreateDiagnosticSessionDto

- `title?: string`
- `description?: string`

Validation:
- `title` max 250 characters
- `description` optional with reasonable length guard if needed

### UpdateDiagnosticSessionDto

- `status?: DiagnosticSessionStatus`
- `title?: string`
- `description?: string`
