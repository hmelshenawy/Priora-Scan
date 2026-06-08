# Feature Specification: Authentication v1

**Feature Branch**: `002-authentication-v1`

**Created**: 2026-06-08

**Status**: Draft

**Input**: User description: "Authentication v1 scope: Login, Logout, Current User endpoint (/me), CSRF endpoint, JWT cookie issuance, Protected route support, Role and permission resolution, Tenant resolution, Frontend login page, Session persistence. Explicitly exclude: Registration, Forgot password, Password reset, SSO, MFA, User administration, Invitation workflows."

**Constitutional Alignment**: This specification complies with PrioraScan Constitution principles I (Documentation First), II (Design Before Implementation), IV (Modular Development), VI (Multi-Tenant First), VII (API First), XII (Security By Default), XIV (Git & Change Safety), and XV (Simplicity Over Complexity).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Login and Session Establishment (Priority: P1)

A technician, service advisor, or workshop manager needs to authenticate into the PrioraScan system so they can access protected vehicle and diagnostic features.

**Why this priority**: Without authentication, no user can access any protected resource. Login is the absolute prerequisite for every downstream workflow.

**Independent Test**: A user can open the login page, enter valid credentials, submit, and receive HTTP-only cookies that grant access to protected pages.

**Acceptance Scenarios**:

1. **Given** the user is on the login page, **When** they submit a valid email and password, **Then** the system issues `access_token`, `refresh_token`, and `csrf_token` cookies and redirects them to the application dashboard.
2. **Given** the user submits incorrect credentials, **When** the login request completes, **Then** the system returns a clear error message without revealing whether the email exists.
3. **Given** the user is authenticated, **When** they access the `/api/v1/auth/me` endpoint, **Then** the system returns their user profile including role, permissions, and assigned organization.

---

### User Story 2 - Logout and Session Termination (Priority: P1)

An authenticated user needs to end their session securely so that their credentials are no longer active on the device.

**Why this priority**: Session termination is a fundamental security control. Users must be able to log out confidently, especially on shared workshop devices.

**Independent Test**: An authenticated user can click logout, and all authentication cookies are cleared. Subsequent requests to protected endpoints are rejected.

**Acceptance Scenarios**:

1. **Given** the user is authenticated, **When** they invoke logout, **Then** all authentication cookies (`access_token`, `refresh_token`, `csrf_token`) are removed and the user is redirected to the login page.
2. **Given** the user has logged out, **When** they attempt to access a protected endpoint, **Then** the system responds with `401 UNAUTHORIZED`.

---

### User Story 3 - Protected Route Enforcement (Priority: P1)

The system must ensure that every protected API endpoint and frontend page is inaccessible to unauthenticated users.

**Why this priority**: This is the security foundation. Without protected route enforcement, the authentication system provides no value.

**Independent Test**: An unauthenticated user attempting to access any protected page or API receives an access-denied response and is redirected or informed appropriately.

**Acceptance Scenarios**:

1. **Given** an unauthenticated user, **When** they request `GET /api/v1/vehicles`, **Then** the system returns `401 UNAUTHORIZED`.
2. **Given** an unauthenticated user, **When** they navigate to `/vehicles` in the browser, **Then** the frontend redirects them to the login page.
3. **Given** an authenticated user without `create:vehicle` permission, **When** they attempt to POST to `/api/v1/vehicles`, **Then** the system returns `403 FORBIDDEN`.

---

### User Story 4 - CSRF Token Distribution (Priority: P2)

The system must provide a valid CSRF token to authenticated clients so that state-changing requests can pass CSRF validation.

**Why this priority**: CSRF protection is required for all mutating API requests. The token must be obtainable without requiring a full page reload on SPA navigation.

**Independent Test**: An authenticated client can retrieve a fresh CSRF token via a dedicated endpoint and use it successfully in subsequent POST/PATCH requests.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** they request the CSRF endpoint, **Then** the system returns a fresh CSRF token and sets it as a non-HttpOnly cookie.
2. **Given** an unauthenticated user, **When** they request the CSRF endpoint, **Then** the system returns `401 UNAUTHORIZED`.

---

### User Story 5 - Role and Permission Resolution (Priority: P2)

The system must resolve a user's roles and permissions at authentication time and embed them into the session so that RBAC guards can enforce authorization without external lookups on every request.

**Why this priority**: Workshop users have different responsibilities (technician vs. manager). Permission-based access control must be fast and reliable.

**Independent Test**: A user with the "Workshop Manager" role receives a JWT containing `read:vehicle`, `create:vehicle`, and `update:vehicle` permissions. A user with the "Technician" role receives only `read:vehicle` and `create:vehicle`.

**Acceptance Scenarios**:

1. **Given** a Workshop Manager authenticates, **When** the login completes, **Then** the JWT payload includes permissions for vehicle read, create, and update.
2. **Given** a Service Advisor authenticates, **When** the login completes, **Then** the JWT payload includes vehicle read and create permissions but not update.
3. **Given** a user with no vehicle permissions, **When** they attempt any vehicle endpoint, **Then** the system returns `403 FORBIDDEN`.

---

### User Story 6 - Tenant Resolution (Priority: P2)

The system must determine and embed the user's organization identifier into their session so that all downstream data access is automatically scoped to their workshop.

**Why this priority**: Multi-tenancy is a constitutional requirement. Every authenticated request must carry the organization context without requiring the user to select or supply it.

**Independent Test**: A user from Organization A logs in and all subsequent API requests are implicitly scoped to Organization A. They cannot access Organization B's data.

**Acceptance Scenarios**:

1. **Given** a user assigned to Organization A, **When** they authenticate, **Then** the JWT payload includes `organizationId` for Organization A.
2. **Given** an authenticated user from Organization A, **When** they query vehicle data, **Then** the system returns only vehicles belonging to Organization A.
3. **Given** an authenticated user, **When** they attempt to access a resource from another organization, **Then** the system returns `403 TENANT_MISMATCH`.

---

### User Story 7 - Frontend Login Page (Priority: P2)

The system must provide a dedicated login page where users can enter credentials and be redirected into the application upon success.

**Why this priority**: The login page is the user's first interaction with the system. It must be functional, accessible, and secure.

**Independent Test**: A user can navigate to `/login`, enter credentials, submit, and upon success be redirected to `/vehicles` with cookies set.

**Acceptance Scenarios**:

1. **Given** an unauthenticated user navigates to `/login`, **When** the page loads, **Then** a login form with email and password fields is displayed.
2. **Given** the user submits valid credentials, **When** the login succeeds, **Then** they are redirected to the default landing page (`/vehicles`).
3. **Given** the user submits invalid credentials, **When** the login fails, **Then** the form displays an error message and the password field is cleared.
4. **Given** an already-authenticated user navigates to `/login`, **When** the page loads, **Then** they are redirected away to the default landing page.

---

### User Story 8 - Session Persistence (Priority: P2)

The system must allow a user's session to persist across browser refreshes and short idle periods using a refresh token, so users are not forced to re-authenticate frequently during a work shift.

**Why this priority**: Workshop users need uninterrupted access during long diagnostic sessions. Forcing re-login every 15 minutes would disrupt workflow.

**Independent Test**: A user logs in, waits for the access token to expire, and the system silently refreshes their session using the refresh token without requiring credential re-entry.

**Acceptance Scenarios**:

1. **Given** an authenticated user with a valid refresh token, **When** their access token expires, **Then** the system silently issues a new access token upon the next API request.
2. **Given** a user whose refresh token has expired, **When** they make an API request, **Then** the system returns `401 TOKEN_EXPIRED` and the frontend redirects to login.
3. **Given** an authenticated user, **When** they refresh the browser page, **Then** their session remains active and they are not redirected to login.

---

## Edge Cases

- What happens when a user submits an empty email or password?
- How does the system handle a CSRF token that has been tampered with?
- What happens if a user's role/permissions change mid-session (e.g., promoted to manager)?
- How does the system behave when the refresh token is revoked server-side?
- What happens when an authenticated user attempts to access a non-existent endpoint?
- How does the frontend behave when the backend is unreachable during login?
- What happens if a user has multiple active sessions on different devices?
- How does the system handle a request with a valid JWT but missing organization claim?

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow users to authenticate with email and password via a `POST /api/v1/auth/login` endpoint.
- **FR-002**: The system MUST issue three cookies on successful login: `access_token` (HttpOnly, 15-minute expiry), `refresh_token` (HttpOnly, 7-day expiry), and `csrf_token` (non-HttpOnly, session-scoped).
- **FR-003**: The system MUST provide a `POST /api/v1/auth/logout` endpoint that clears all authentication cookies.
- **FR-004**: The system MUST provide a `GET /api/v1/auth/me` endpoint that returns the current user's profile including `id`, `email`, `organizationId`, `roles`, and `permissions`.
- **FR-005**: The system MUST provide a `GET /api/v1/auth/csrf` endpoint that returns a fresh CSRF token and sets the `csrf_token` cookie.
- **FR-006**: The system MUST reject requests to protected endpoints when the `access_token` cookie is missing, invalid, or expired, returning `401 UNAUTHORIZED`.
- **FR-007**: The system MUST embed `userId`, `organizationId`, and `permissions` into the JWT payload at login time.
- **FR-008**: The system MUST resolve tenant context from the JWT on every request and reject cross-tenant access with `403 TENANT_MISMATCH`.
- **FR-009**: The system MUST support automatic silent refresh of the access token using the refresh token before the access token expires.
- **FR-010**: The system MUST provide a frontend login page at `/login` with email and password fields, error display, and redirect on success.
- **FR-011**: The system MUST redirect authenticated users away from the login page to the default landing page.
- **FR-012**: The system MUST redirect unauthenticated users away from protected frontend routes to the login page.

### Non-Functional Requirements

- **NFR-001**: Login response time MUST be under 500ms for 95% of requests.
- **NFR-002**: Token refresh MUST complete in under 200ms.
- **NFR-003**: JWT secrets MUST be at least 32 characters and stored securely.
- **NFR-004**: All cookie attributes MUST be configurable per environment (Secure flag enabled in production, relaxed in development).
- **NFR-005**: The system MUST NOT log passwords or JWT secrets in any form.

### API Requirements

- **API-001**: Login endpoint: `POST /api/v1/auth/login` — accepts `{ email, password }`, returns user profile and sets cookies.
- **API-002**: Logout endpoint: `POST /api/v1/auth/logout` — clears all auth cookies, returns confirmation.
- **API-003**: Current user endpoint: `GET /api/v1/auth/me` — returns current user's profile from JWT context.
- **API-004**: CSRF endpoint: `GET /api/v1/auth/csrf` — returns fresh CSRF token, sets `csrf_token` cookie.
- **API-005**: Token refresh endpoint: `POST /api/v1/auth/refresh` — accepts `refresh_token` cookie, issues new `access_token` and `csrf_token` cookies.
- **API-006**: All auth endpoints MUST return consistent error shapes with HTTP status codes, error codes, and human-readable messages.
- **API-007**: The login endpoint MUST rate-limit failed attempts to mitigate brute-force attacks.
- **API-008**: The `/me` and `/csrf` endpoints MUST require a valid `access_token` cookie.

### Validation Rules

- **VAL-001**: Email MUST be a valid email format and non-empty.
- **VAL-002**: Password MUST be non-empty and at least 6 characters (MVP placeholder; production requires hashed verification).
- **VAL-003**: The `access_token` cookie MUST be validated on every protected request; missing or invalid tokens return `401`.
- **VAL-004**: The `csrf_token` cookie and `X-CSRF-Token` header MUST match on all mutating requests.
- **VAL-005**: The `organizationId` claim in the JWT MUST be present and non-empty.
- **VAL-006**: The `permissions` claim in the JWT MUST be an array of strings.

### Key Entities

- **User**: Represents an authenticated person in the workshop system. Key attributes: id, email, organizationId, role, permissions. In MVP, user records may be mocked or minimally stored since registration is excluded.
- **Session**: An active authentication state represented by valid JWT cookies. Bound to a single user and organization. Includes access token (short-lived), refresh token (long-lived), and CSRF token.
- **Organization** (contextual): The tenant boundary. Every session belongs to exactly one Organization. Derived from the user's assigned organization at login time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can complete login in under 30 seconds from landing on the login page to accessing the vehicle list.
- **SC-002**: 100% of protected API endpoints reject unauthenticated requests with `401 UNAUTHORIZED`.
- **SC-003**: 100% of protected API endpoints reject cross-tenant requests with `403 TENANT_MISMATCH`.
- **SC-004**: Session refresh succeeds silently for 99% of requests within the refresh token lifetime.
- **SC-005**: Users are not forced to re-enter credentials for at least 7 days while actively using the application.
- **SC-006**: CSRF tokens are regenerated and distributed within 100ms of request.

## Explicit Exclusions

The following are explicitly out of scope for Authentication v1 to maintain modularity and constitutional simplicity:

- **Registration / Sign-up**: No user self-registration. Users are assumed to be provisioned by an external process or administration module.
- **Forgot Password**: No password recovery flows.
- **Password Reset**: No email-based or token-based password reset.
- **SSO / OAuth2 / SAML**: No third-party identity provider integration.
- **MFA / 2FA**: No multi-factor authentication.
- **User Administration**: No user CRUD, role assignment, or permission management.
- **Invitation Workflows**: No email invitations or invite-link flows.
- **Account Deletion**: No user account deletion or deactivation.

## Assumptions

- Users are pre-provisioned in the system; there is no self-registration in v1.
- Password storage uses secure hashing (e.g., bcrypt) in production; MVP may use placeholder validation.
- A single user belongs to exactly one organization and does not switch organizations mid-session.
- The frontend is a Single Page Application (SPA) that reads the `csrf_token` cookie via JavaScript.
- JWT secrets are configured via environment variables and are at least 32 characters.
- Role-to-permission mappings are hardcoded or minimally configured in v1; dynamic permission management is excluded.
- The refresh token endpoint is stateless (no server-side session store); invalidation is handled by token expiry.
