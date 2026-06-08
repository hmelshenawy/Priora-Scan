# Research: Authentication v1

**Feature**: Authentication v1
**Date**: 2026-06-08
**Branch**: 002-authentication-v1

---

## Unknown 1: Rate Limiting for Login

**Question**: What rate limiting strategy should protect the login endpoint from brute-force attacks?

**Context**: The Constitution (XII) requires secure by default. The spec requires rate limiting on failed login attempts (API-007).

**Research**:

| Option | Pros | Cons |
|--------|------|------|
| **NestJS Throttler (`@nestjs/throttler`)** | Integrates with NestJS guard system; configurable per endpoint; supports Redis/memory stores; easy to apply to specific routes | Requires additional module configuration |
| **Express `express-rate-limit`** | Mature; flexible; widely used | Less idiomatic in NestJS; manual integration needed |
| **Custom in-memory counter** | No dependency; simple | Not distributed; resets on restart; harder to maintain |

**Decision**: **NestJS Throttler**

**Rationale**:
1. **NestJS-native**: `@nestjs/throttler` plugs into the existing guard pipeline and supports per-route decorators (`@Throttle()`).
2. **Configurable**: Limits can differ by endpoint (strict for login, relaxed for `/me`).
3. **Future-proof**: Can swap to Redis store when scaling horizontally without code changes.
4. **Spec alignment**: Meets API-007 requirement with minimal custom code.

**Configuration**:
- Global default: 10 requests per 60 seconds per IP
- Login endpoint override: 5 requests per 60 seconds per IP

---

## Unknown 2: Token Refresh Strategy

**Question**: How should the frontend silently refresh an expired access token?

**Context**: The spec requires automatic silent refresh (FR-009). The frontend uses Axios with `withCredentials`.

**Research**:

| Option | Pros | Cons |
|--------|------|------|
| **Axios response interceptor + `POST /auth/refresh`** | Transparent to UI code; retries original request after refresh; standard pattern | Risk of multiple parallel refresh requests if many 401s fire simultaneously |

**Decision**: **Axios response interceptor with refresh queue**

**Rationale**:
1. **Transparency**: UI components never see 401s caused by expired access tokens. The interceptor handles refresh and retries silently.
2. **Queue deduplication**: If multiple requests fail with 401 simultaneously, only one refresh call is made; others wait and retry with the new token.
3. **Backend contract**: `POST /api/v1/auth/refresh` reads `refresh_token` cookie, validates it, issues new `access_token` + `csrf_token` cookies, and returns 200.
4. **Fallback**: If refresh token is also expired, the interceptor rejects all queued requests and redirects to `/login`.

---

## Unknown 3: Next.js Protected Routes

**Question**: How should the frontend enforce protected routes and redirect unauthenticated users?

**Context**: The spec requires redirecting unauthenticated users away from protected pages (FR-012).

**Research**:

| Option | Pros | Cons |
|--------|------|------|
| **Next.js Middleware (`middleware.ts`)** | Runs before page render; can check cookies server-side; redirects at edge | Limited cookie access in middleware on some deployments |
| **Client-side auth check in layout/page** | Full cookie access; can call `/me` to verify | Flash of unprotected content before redirect |
| **Higher-order component (HOC) / auth wrapper** | Reusable across pages; can show loading state | Still client-side; not as early as middleware |

**Decision**: **Next.js Middleware for initial redirect + client-side auth context for session awareness**

**Rationale**:
1. **Middleware blocks at the edge**: Unauthenticated requests to `/vehicles`, `/sessions`, etc. are redirected to `/login` before any page code runs.
2. **Client-side auth context**: A lightweight `useAuth` hook calls `GET /api/v1/auth/me` on mount to confirm session validity and expose `user`, `isAuthenticated`, and `isLoading`.
3. **Combined defense**: Middleware catches direct URL entry; client-side context catches in-app navigation and session expiry mid-session.

---

## Unknown 4: Mock vs. Real User Store in v1

**Question**: Should Authentication v1 include a real `User` database table, or remain mocked?

**Context**: User administration, registration, and invitation are explicitly excluded. The spec says "In MVP, user records may be mocked or minimally stored."

**Research**:

| Option | Pros | Cons |
|--------|------|------|
| **Keep mocked (current approach)** | Zero database work; zero migration; fast delivery; matches spec | No real password verification; no multi-user support; must be replaced in v2 |
| **Add minimal `User` table now** | Realistic credential verification; enables future user admin without migration | Requires schema change, migration, seeding; slightly more scope than spec requires |

**Decision**: **Keep mocked in v1; document hardcoded user profiles**

**Rationale**:
1. **Spec compliance**: Explicit exclusions list "User Administration" and "Registration." Adding a User table now bleeds into those excluded areas.
2. **MVP speed**: The goal is to deliver login/logout/session/protected-routes quickly.
3. **Documented bridge**: Hardcode 2–3 representative user profiles (Technician, Service Advisor, Workshop Manager) with realistic permissions so the system behaves correctly for RBAC testing.
4. **Clear future path**: When the Administration module is specified, the mock will be replaced with a real `User` table + bcrypt password hashing.

**Mocked users**:

| Email | Role | Permissions | Organization |
|-------|------|-------------|--------------|
| `tech@workshop.com` | Technician | `read:vehicle`, `create:vehicle` | `org-001` |
| `advisor@workshop.com` | Service Advisor | `read:vehicle` | `org-001` |
| `manager@workshop.com` | Workshop Manager | `read:vehicle`, `create:vehicle`, `update:vehicle` | `org-001` |

---

## Research Summary

| Unknown | Decision | Key Rationale |
|---------|----------|---------------|
| Rate limiting | NestJS Throttler | Native integration, per-endpoint config, future Redis swap |
| Token refresh | Axios interceptor + refresh queue | Transparent to UI, deduplicated parallel requests |
| Protected routes | Next.js Middleware + client auth context | Edge-level blocking + client session awareness |
| User store | Mocked in v1 | Matches explicit exclusions, fast delivery, clear v2 path |

**All NEEDS CLARIFICATION resolved.** Ready for Phase 1 design.
