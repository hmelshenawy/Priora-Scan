# Research: Vehicle Management

**Feature**: Vehicle Management
**Date**: 2026-06-08
**Branch**: 001-vehicle-management

---

## Unknown 1: Backend Language/Framework

**Question**: What backend language and framework should be used for the PrioraScan API?

**Context**: Frontend Architecture specifies Next.js (TypeScript). No backend technology is defined in PRD or SAD. The Constitution requires layered architecture (Controller/Service/Repository/DTO).

**Research**:

| Option | Pros | Cons |
|--------|------|------|
| **Node.js + NestJS** | Same language as frontend (TypeScript); excellent DI and layered architecture support; built-in DTO validation with class-validator; large ecosystem; easy hiring | Heavier than Express; learning curve for decorators |
| **Node.js + Express + custom structure** | Lightweight; familiar to most JS devs; full control over architecture | Manual DI; no built-in DTO/validation; more boilerplate |
| **Python + FastAPI** | Excellent automatic OpenAPI generation; type hints; async native; great for ML/AI future | Different language from frontend; smaller TS ecosystem |
| **Python + Django** | Batteries included; admin UI; mature ORM | Monolithic; less aligned with layered architecture mandate |

**Decision**: **Node.js + NestJS**

**Rationale**:
1. **TypeScript across the stack**: Shared types, language consistency, and easier context switching between frontend and backend teams.
2. **Layered Architecture alignment**: NestJS modules naturally map to Controller/Service/Repository layers. Decorators enforce DTO validation at the boundary.
3. **Future AI integration**: While Vehicle Management doesn't use AI, the broader PrioraScan platform will. Node.js can still integrate with Python ML services via API calls when needed.
4. **Community and hiring**: NestJS is the dominant TypeScript enterprise framework. Finding developers and resources is easier.
5. **Testing**: Built-in testing utilities (Jest integration) align with the project's quality goals.

**Alternatives considered**: FastAPI was a strong contender due to automatic OpenAPI docs, but the language split and Constitution's layered architecture push toward NestJS.

---

## Unknown 2: Database

**Question**: What database should store Vehicle and VehicleAuditRecord data?

**Context**: Multi-tenant SaaS. Vehicle entity has standard fields. VehicleAuditRecord needs to be immutable and tenant-scoped. SAD doesn't specify a database.

**Research**:

| Option | Pros | Cons |
|--------|------|------|
| **PostgreSQL** | ACID compliance; JSONB for audit metadata; row-level security for multi-tenancy; excellent Prisma support with type-safe queries; proven at scale | Slightly more complex setup than MySQL |
| **MySQL** | Familiar to many devs; good ORM support | Less robust JSON support; weaker row-level security |
| **MongoDB** | Flexible schema; easy JSON storage | No ACID transactions across collections; weaker relational integrity |

**Decision**: **PostgreSQL**

**Rationale**:
1. **Relational integrity**: Vehicle data is highly structured (Make, Model, Year, VIN, Plate). Relational databases excel here.
2. **JSONB for audit metadata**: VehicleAuditRecord may store optional before/after snapshots. PostgreSQL's JSONB is perfect for this.
3. **Row-level security**: Can enforce tenant isolation at the database level as an additional defense layer.
4. **Prisma compatibility**: Prisma works excellently with PostgreSQL and NestJS, providing type-safe queries and an excellent migration system.

**Alternatives considered**: MongoDB for schema flexibility, but audit immutability and relational constraints favor PostgreSQL.

---

## Unknown 3: Testing Framework

**Question**: What testing frameworks should be used for backend and frontend?

**Context**: Constitution requires testable code and small, testable units. NestJS and Next.js have their own testing ecosystems.

**Decision**:
- **Backend**: Jest (NestJS default) + Supertest for HTTP contract tests
- **Frontend**: Jest + React Testing Library for unit tests; Playwright for E2E

**Rationale**: Jest is the standard across both NestJS and Next.js. React Testing Library is the recommended approach for React components. Playwright provides reliable E2E testing for the critical vehicle creation flow.

---

## Unknown 4: Authentication Mechanism

**Question**: How should users authenticate with the API?

**Context**: SAD mentions authenticated users but doesn't specify the mechanism. RBAC is required.

**Decision**: **JWT (JSON Web Tokens) with HTTP-only cookies**

**Rationale**:
1. **Stateless API**: JWTs align with the REST API-first design. The frontend (Next.js) can store tokens in HTTP-only cookies for security.
2. **RBAC support**: JWT payload can include user ID, organization ID, and role/permissions, enabling fast authorization checks at the API gateway.
3. **Multi-tenant scoping**: The `organizationId` in the JWT ensures every request is automatically scoped to the user's organization.
4. **Secure**: HTTP-only cookies prevent XSS token theft. Short expiry + refresh token rotation mitigates replay attacks.

**Token structure**:
```json
{
  "sub": "user-uuid",
  "org": "organization-uuid",
  "roles": ["technician"],
  "permissions": ["create:vehicle", "read:vehicle", "update:vehicle"],
  "iat": 1717862400,
  "exp": 1717866000
}
```

---

## Unknown 5: RBAC Implementation

**Question**: How should role-based access control be implemented?

**Context**: SAD defines actors (Technician, Service Advisor, Workshop Manager, System Administrator) but doesn't detail the authorization mechanism.

**Decision**: **Permission-based RBAC with role-to-permission mapping**

**Rationale**:
1. **Granularity**: The Constitution (XII) requires authorization on every action. Permissions (e.g., `create:vehicle`) are more granular than roles.
2. **Flexibility**: Roles group permissions. A Workshop Manager might have all vehicle permissions, while a Service Advisor has only read.
3. **JWT integration**: Permissions are embedded in the JWT, allowing fast middleware checks without database lookups on every request.

**Default role mapping for Vehicle Management**:

| Role | create:vehicle | read:vehicle | update:vehicle |
|------|----------------|--------------|----------------|
| Technician | ✓ | ✓ | ✗ |
| Service Advisor | ✗ | ✓ | ✗ |
| Workshop Manager | ✓ | ✓ | ✓ |
| System Admin | ✓ | ✓ | ✓ |

**Guard implementation**: NestJS `@UseGuards(RbacGuard)` decorator on controller methods, checking JWT permissions against required permissions.

---

## Unknown 6: CSRF Protection

**Question**: How should CSRF protection be implemented given JWT authentication uses HTTP-only cookies?

**Context**: HTTP-only cookies are vulnerable to CSRF if state-changing requests don't require additional validation. The Constitution (XII) requires secure handling by default.

**Research**:

| Option | Pros | Cons |
|--------|------|------|
| **Double-submit cookie** | No server-side state; works naturally with JWT cookies; industry standard for SPAs; simple to implement | Requires a readable cookie (non-HttpOnly csrf_token) |
| **Synchronizer token (session-based)** | Strong security; token not exposed to JS | Requires server-side session state; adds complexity |
| **SameSite=Strict only** | Simple; no extra tokens | Does not protect against all CSRF vectors (e.g., same-site subdomain attacks, XSS via same-origin iframes) |

**Decision**: **Double-submit cookie pattern + SameSite=Strict**

**Rationale**:
1. **No server-side state**: The double-submit cookie pattern stores the CSRF token in a cookie and expects it back in a header. No session database is needed.
2. **Defense in depth**: `SameSite=Strict` blocks cross-site cookie transmission in modern browsers. The double-submit cookie provides an additional layer for same-site attack vectors and legacy browsers.
3. **SPA compatibility**: Next.js can read the non-HttpOnly `csrf_token` cookie and attach it to Axios requests without complex state management.
4. **Constitution XII alignment**: Secure by default requires explicit CSRF protection, not relying solely on browser mechanisms.

**Implementation**:
- Backend sets `csrf_token` cookie (non-HttpOnly, Secure, SameSite=Strict) on login.
- Frontend reads `csrf_token` and sends it in `X-CSRF-Token` header for POST/PATCH/PUT/DELETE.
- Backend `CsrfGuard` validates cookie value matches header value using constant-time comparison.

---

## Research Summary

| Unknown | Decision | Key Rationale |
|---------|----------|---------------|
| Backend stack | Node.js + NestJS + TypeScript | Stack alignment, layered architecture support |
| Database | PostgreSQL | ACID, JSONB, row-level security, multi-tenant |
| Testing | Jest + React Testing Library + Playwright | Ecosystem alignment, standard for chosen stack |
| Authentication | JWT in HTTP-only cookies | Stateless, RBAC-friendly, multi-tenant scoping |
| RBAC | Permission-based with JWT embedding | Granular, fast, flexible role mapping |
| CSRF Protection | Double-submit cookie + SameSite=Strict | No server-side state, defense in depth, SPA compatible |

**All NEEDS CLARIFICATION resolved.** Ready for Phase 1 design.
