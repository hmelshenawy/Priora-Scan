# Feature Specification: Diagnostic Sessions

**Feature Branch**: `003-diagnostic-sessions`

**Created**: 2026-06-08

**Status**: Draft

**Input**: User description: "Diagnostic Sessions Vehicle → Diagnostic Session relationship Session lifecycle Session statuses Permissions Audit requirements"

**Constitutional Alignment**: This specification complies with PrioraScan Constitution principles I (Documentation First), II (Design Before Implementation), IV (Modular Development), VI (Multi-Tenant First), VII (API First), XI (Auditability), XII (Security By Default), XIV (Git & Change Safety), and XV (Simplicity Over Complexity).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a Diagnostic Session (Priority: P1)

A technician or service advisor needs to create a diagnostic session for a vehicle so that the workshop can capture the scan event and begin the session lifecycle.

**Why this priority**: Diagnostic sessions are the core unit of traceability and must be linked to a vehicle from the moment they are created.

**Independent Test**: A user with create permission can create a session for a vehicle and the session appears in the vehicle's session list.

**Acceptance Scenarios**:

1. **Given** the user is authenticated and has the `create:diagnostic-session` permission, **When** they submit a new session request for an existing vehicle, **Then** the session is created with status `OPEN` and associated with that vehicle.
2. **Given** the user submits a session request without a valid vehicle ID, **When** the request is processed, **Then** the system rejects it with a clear validation error.
3. **Given** the user is assigned to Organization A, **When** they create a session, **Then** the session is stored under Organization A and is not visible to users from other organizations.
4. **Given** a session is created successfully, **When** the request completes, **Then** an audit record is generated capturing userId, organizationId, action (`diagnostic_session:created`), sessionId, status, and timestamp.

---

### User Story 2 - View Diagnostic Sessions for a Vehicle (Priority: P1)

A technician or manager needs to view diagnostic sessions linked to a vehicle so that they can inspect the session lifecycle and current status.

**Why this priority**: Vehicle-to-session visibility is essential to connect a vehicle record with its diagnostic history.

**Independent Test**: A user with read permission can request sessions for a vehicle and only receives sessions belonging to their organization.

**Acceptance Scenarios**:

1. **Given** the user has the `read:diagnostic-session` permission, **When** they request sessions for a vehicle, **Then** the system returns only sessions for that vehicle within the user's organization.
2. **Given** the vehicle has multiple sessions, **When** the user views the list, **Then** each session displays its status, creation date, and a short description.
3. **Given** the user attempts to view a session from another organization, **When** the request is made, **Then** the system returns `403 FORBIDDEN`.
4. **Given** a vehicle has no sessions, **When** the user views the session list, **Then** the system returns an empty list with a descriptive empty state.

---

### User Story 3 - Update Diagnostic Session Status (Priority: P2)

A technician needs to progress a diagnostic session through its lifecycle so that the workshop can reflect current work state and closure.

**Why this priority**: Status updates reflect actual workflow progress and support downstream reporting and handoff.

**Independent Test**: A user with update permission can change a session's status through allowed lifecycle transitions and see the new status reflected.

**Acceptance Scenarios**:

1. **Given** the user has the `update:diagnostic-session` permission, **When** they change a session from `OPEN` to `IN_PROGRESS`, **Then** the session status is updated and an audit record is created.
2. **Given** the user changes a session from `IN_PROGRESS` to `CLOSED`, **When** the request is processed, **Then** the status update is applied and the session becomes read-only for write operations.
3. **Given** a session is already `CLOSED`, **When** a user attempts to modify its core metadata, **Then** the system rejects the request with a clear message that closed sessions are immutable.
4. **Given** a user without `update:diagnostic-session` permission attempts a status change, **When** they submit the request, **Then** the system returns `403 FORBIDDEN`.

---

### User Story 4 - Audit Diagnostic Session Actions (Priority: P2)

A workshop manager needs a reliable audit trail for diagnostic session creation and status changes so that operations can be reviewed and verified.

**Why this priority**: Auditability is required for accountability, troubleshooting, and compliance in workshop operations.

**Independent Test**: Every session mutation generates an audit record containing the user, organization, session action, and timestamp.

**Acceptance Scenarios**:

1. **Given** a diagnostic session is created, **When** the creation completes, **Then** an audit record is generated with `diagnostic_session:created`.
2. **Given** a session status changes, **When** the update completes, **Then** an audit record is generated with `diagnostic_session:status_updated` and the new status.
3. **Given** a user attempts an unauthorized session action, **When** the request is rejected, **Then** no audit record is written for that failed attempt.
4. **Given** audit records are queried, **When** the requester is authorized, **Then** the records include organizationId and cannot be accessed across tenant boundaries.

---

## Edge Cases

- A diagnostic session is created for a vehicle that is later deleted or archived.
- A user attempts to change a session status from `OPEN` directly to `CLOSED` without passing through `IN_PROGRESS`.
- A session is created with minimal metadata and later updated by another user in the same organization.
- A user with `read:diagnostic-session` permission but without vehicle read permission requests session details.
- A vehicle is deleted in the source system while sessions still exist.
- A user tries to create a session for a vehicle that belongs to another organization.
- A request includes an invalid or missing organization context in the authentication token.
- A closed session is accidentally referenced in an attempted edit request.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A diagnostic session MUST belong to exactly one vehicle.
- **FR-002**: A vehicle CAN have multiple diagnostic sessions.
- **FR-003**: The system MUST support diagnostic session statuses: `OPEN`, `IN_PROGRESS`, and `CLOSED`.
- **FR-004**: The system MUST allow authorized users with `create:diagnostic-session` permission to create new sessions.
- **FR-005**: The system MUST allow authorized users with `read:diagnostic-session` permission to list and retrieve sessions within their organization.
- **FR-006**: The system MUST allow authorized users with `update:diagnostic-session` permission to change session metadata and status through defined lifecycle transitions.
- **FR-007**: Once a session reaches `CLOSED`, it MUST become read-only for core metadata updates.
- **FR-008**: All diagnostic session actions MUST enforce organization scoping so users can only access sessions within their own organization.
- **FR-009**: All session-related API requests MUST require authentication and RBAC enforcement.
- **FR-010**: The system MUST generate an audit record for each session creation and each status change.
- **FR-011**: Audit records MUST include userId, organizationId, sessionId, action, status, and timestamp.
- **FR-012**: Audit records MUST be immutable and tenant-scoped.
- **FR-013**: Session read operations MUST return a clear lifecycle state and vehicle identifier for each session.
-A vehicle may have multiple diagnostic sessions historically,
but only one session may have status OPEN or IN_PROGRESS at any time.
- FR-014:
A vehicle may have multiple diagnostic sessions historically,
but only one session may have status OPEN or IN_PROGRESS at any time.
- FR-015:
The system must generate a human-readable session number.

### Non-Functional Requirements

- **NFR-001**: Session list queries for a vehicle MUST return results in under 500ms for organizations with up to 10,000 sessions.
- **NFR-002**: Status and lifecycle operations MUST be reflected within 1 second of the request completing.
- **NFR-003**: API responses MUST NOT leak session data across tenant boundaries under any error condition.
- **NFR-004**: Read operations MUST support pagination with a default page size of 25 and a maximum of 100.
- **NFR-005**: All status and audit operations MUST preserve the original creation timestamp even when the session is updated.

### API Requirements

- **API-001**: Create session endpoint: `POST /api/v1/vehicles/:vehicleId/diagnostic-sessions` — creates a new session linked to the vehicle.
- **API-002**: List sessions endpoint: `GET /api/v1/vehicles/:vehicleId/diagnostic-sessions` — returns sessions for the specified vehicle with pagination and filtering.
- **API-003**: Session detail endpoint: `GET /api/v1/diagnostic-sessions/:sessionId` — returns a session record with status, vehicle reference, and lifecycle history.
- **API-004**: Update session endpoint: `PATCH /api/v1/diagnostic-sessions/:sessionId` — updates session metadata or status for sessions not in `CLOSED` state.
- **API-005**: All endpoints MUST return consistent error shapes with human-readable messages and well-defined status codes.
- **API-006**: All endpoints MUST reject unauthorized or cross-tenant requests with `403 FORBIDDEN`.
- **API-007**: Session creation and status update endpoints MUST require the acting user's organization context derived from their authentication token.
- **API-008**: Audit generation MUST occur as part of the same request flow and MUST not be silently dropped if audit persistence fails.

### Validation Rules

- **VAL-001**: Vehicle ID MUST be present and valid when creating a session.
- **VAL-002**: Status transitions MUST be valid: `OPEN` → `IN_PROGRESS` → `CLOSED`.
- **VAL-003**: A session cannot be created with status `CLOSED` directly.
- **VAL-004**: Session title or short description, if provided, MUST be a string no longer than 250 characters.
- **VAL-005**: Organization ID MUST be derived from the authenticated user's context; clients MUST NOT be allowed to override it.
- **VAL-006**: Requests to update a closed session MUST be rejected with a clear business rule error.
- **VAL-007**: Audit records MUST not be writable or editable through public APIs.
- **VAL-008**: A vehicle may have multiple diagnostic sessions historically,
but only one session may have status OPEN or IN_PROGRESS at any time.

### Key Entities

- **Diagnostic Session**: A session associated with one vehicle and one organization. Key attributes: id, vehicleId, organizationId, status, createdBy, createdAt, updatedAt, title/description.
- **Diagnostic Session Audit Record**: An immutable log entry for session lifecycle changes. Key attributes: id, organizationId, userId, sessionId, action (`diagnostic_session:created`, `diagnostic_session:status_updated`), status, timestamp, metadata.
- **Vehicle** (contextual): The parent entity for sessions. Every diagnostic session belongs to exactly one vehicle.
- **Organization** (contextual): The tenant boundary. All sessions and audit records belong to one organization.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Authorized users can create a diagnostic session in under 30 seconds from vehicle selection to session creation.
- **SC-002**: Session status changes persist and display correctly in under 1 second for 95% of requests.
- **SC-003**: 100% of diagnostic session reads and writes are scoped to the user's organization.
- **SC-004**: All session creation and status update requests generate an audit record with the required fields.
- **SC-005**: Closed sessions are read-only and cannot be modified by UI or API clients.
- **SC-006**: Session list and detail endpoints return valid lifecycle states and do not include sessions from other organizations.

## Explicit Exclusions

- Fault code entry, management, and lookup are out of scope for this feature.
- Report generation, PDF export, and customer-facing diagnostic summaries are out of scope.
- File uploads, scan report ingestion, and PrioraFlow integration are out of scope.
- Vehicle creation and editing are handled by the Vehicle Management feature and are not part of this feature.
- User administration, role management, and organization provisioning are out of scope.

## Assumptions

- The Vehicle Management feature already exists and provides vehicle records to attach sessions to.
- Diagnostic sessions are primarily metadata and lifecycle state in MVP; rich content such as fault codes, notes, or attachments may be added later.
- The session lifecycle is linear: `OPEN` → `IN_PROGRESS` → `CLOSED`.
- Audit logging is a core requirement and must be written synchronously with session mutations.
- RBAC permissions are managed centrally and mapped to the session actions described in this feature.
