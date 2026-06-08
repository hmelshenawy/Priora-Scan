# Data Model: Authentication v1

**Feature**: Authentication v1
**Date**: 2026-06-08
**Related**: [spec.md](spec.md), [research.md](research.md)

---

## Entity Overview

Authentication v1 does **not** introduce any new database entities. User records are mocked in memory because registration, user administration, and invitation workflows are explicitly excluded from v1 scope.

The existing `Vehicle` and `VehicleAuditRecord` models from 001-vehicle-management are unchanged. No schema migration is required for this feature.

---

## Session Representation (Non-Persistent)

A session is represented by three cookies issued at login time:

| Cookie | Name | HttpOnly | Secure | SameSite | Max-Age | Purpose |
|--------|------|----------|--------|----------|---------|---------|
| Access Token | `access_token` | Yes | Env-dependent | Strict | 15 min | Short-lived JWT for API access |
| Refresh Token | `refresh_token` | Yes | Env-dependent | Strict | 7 days | Long-lived token for silent refresh |
| CSRF Token | `csrf_token` | No | Env-dependent | Strict | Session | State-change validation token |

---

## JWT Payload Structure

The access token is a JWT containing the following claims:

```json
{
  "sub": "user-uuid",
  "email": "user@workshop.com",
  "organizationId": "org-uuid",
  "roles": ["technician"],
  "permissions": ["read:vehicle", "create:vehicle"],
  "iat": 1717862400,
  "exp": 1717866000
}
```

### Field Definitions

| Claim | Type | Required | Description |
|-------|------|----------|-------------|
| `sub` | string (UUID) | Yes | Unique user identifier |
| `email` | string | Yes | User's email address |
| `organizationId` | string (UUID) | Yes | Tenant boundary for multi-tenancy |
| `roles` | string[] | Yes | User's assigned roles (e.g., `technician`) |
| `permissions` | string[] | Yes | Flattened permission strings for RBAC checks |
| `iat` | number | Yes | Issued-at timestamp (seconds since epoch) |
| `exp` | number | Yes | Expiration timestamp (seconds since epoch) |

---

## Mocked User Profiles (v1 Only)

Authentication v1 uses hardcoded user profiles for demonstration and testing. These are replaced by a real `User` table when the Administration module is implemented.

### Profile Definitions

| Email | Password | Role | Permissions | Organization ID |
|-------|----------|------|-------------|-----------------|
| `tech@workshop.com` | `password123` | `technician` | `read:vehicle`, `create:vehicle` | `00000000-0000-0000-0000-000000000002` |
| `advisor@workshop.com` | `password123` | `service_advisor` | `read:vehicle` | `00000000-0000-0000-0000-000000000002` |
| `manager@workshop.com` | `password123` | `workshop_manager` | `read:vehicle`, `create:vehicle`, `update:vehicle` | `00000000-0000-0000-0000-000000000002` |

### Validation Rules

- Email must match one of the mocked profiles exactly (case-insensitive in production; exact in v1).
- Password must be at least 6 characters (v1 placeholder; production uses bcrypt).
- If email is unrecognized or password is incorrect, return `INVALID_CREDENTIALS` without revealing which field failed.

---

## State Transitions

Authentication has a simple lifecycle:

```
[Unauthenticated] → POST /auth/login → [Authenticated]
[Authenticated]   → POST /auth/logout → [Unauthenticated]
[Authenticated]   → access_token expires → POST /auth/refresh → [Authenticated]
[Authenticated]   → refresh_token expires → [Unauthenticated] → redirect to /login
```

No server-side session state is stored. The system relies entirely on JWT validity and cookie presence.

---

## Multi-Tenancy Enforcement

### JWT-Level

- `organizationId` is embedded in the JWT at login time.
- `TenantGuard` extracts `organizationId` from `req.user` on every protected request.
- Cross-tenant access returns `403 TENANT_MISMATCH`.

### Application-Level

- `AuthGuard` validates JWT signature and expiry before any downstream guard runs.
- `RbacGuard` checks `permissions` array from JWT against `@Permissions()` decorator metadata.
- No database lookup is required per request for authorization; all data is in the JWT.

---

## Migration Notes

### No Migration Required

Authentication v1 makes no schema changes.

### Future Migration (Out of Scope)

When the Administration module is implemented, the following will be added:

- `User` model in Prisma schema with fields: `id`, `email`, `passwordHash`, `organizationId`, `role`, `createdAt`, `updatedAt`
- `Role` and `Permission` models (or enum/table mapping)
- `RefreshToken` table (if server-side revocation is required)
- Password hashing with bcrypt (minimum cost factor 12)
- Registration and invitation workflows
