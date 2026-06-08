# Feature Specification: Vehicle Management

**Feature Branch**: `001-vehicle-management`

**Created**: 2026-06-08

**Status**: Draft

**Input**: User description: "Create a feature specification for Vehicle Management. Scope: Create Vehicle, Edit Vehicle, View Vehicle, Search Vehicles. Actors: Technician, Service Advisor, Workshop Manager. Vehicle belongs to an Organization. VIN optional in MVP. Plate Number optional. Make, Model, Year supported. Vehicle history displays related diagnostic sessions. Multi-tenant isolation required. Full CRUD operations. API-first design. RBAC compliant."

**Constitutional Alignment**: This specification complies with PrioraScan Constitution principles I (Documentation First), II (Design Before Implementation), IV (Modular Development), VI (Multi-Tenant First), VII (API First), XI (Auditability), XII (Security By Default), XIV (Git & Change Safety), and XV (Simplicity Over Complexity).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a Vehicle Record (Priority: P1)

A technician or service advisor needs to register a new vehicle into the workshop's system so that it can be tracked and linked to future diagnostic sessions.

**Why this priority**: Vehicle creation is the prerequisite for every downstream diagnostic workflow. Without a vehicle record, no scan session or history can exist.

**Independent Test**: A user with vehicle creation permissions can open the vehicle creation form, fill in vehicle details, submit, and see the vehicle appear in the vehicle list.

**Acceptance Scenarios**:

1. **Given** the user is authenticated and has the "create:vehicle" permission, **When** they submit a vehicle creation form with Make, Model, and Year, **Then** the vehicle is saved and assigned to their organization.
2. **Given** the user is authenticated, **When** they submit a vehicle with an optional VIN and Plate Number, **Then** the vehicle is saved with those fields populated.
3. **Given** the user attempts to create a vehicle without Make, Model, or Year, **When** they submit the form, **Then** the system rejects the request with a clear validation message.
4. **Given** a user without the "create:vehicle" permission, **When** they attempt to access the creation form or submit data, **Then** the system denies access.
5. **Given** a vehicle is created successfully, **When** the request completes, **Then** an audit record is generated capturing userId, organizationId, action ("vehicle:created"), timestamp, and entityId.

---

### User Story 2 - View and Search Vehicles (Priority: P1)

A technician, service advisor, or workshop manager needs to find and view existing vehicle records so that they can reference vehicle details before or during a diagnostic session.

**Why this priority**: Searching and viewing vehicles is a daily activity for all primary and secondary users. It must work reliably and quickly.

**Independent Test**: A user with view permissions can open the vehicle list, apply search or filter criteria, and see only vehicles belonging to their organization.

**Acceptance Scenarios**:

1. **Given** the user is authenticated and has the "read:vehicle" permission, **When** they open the vehicle list, **Then** they see only vehicles scoped to their organization.
2. **Given** the user is on the vehicle list page, **When** they enter a search term matching a vehicle's Make, Model, VIN, or Plate Number, **Then** the list filters to matching results.
3. **Given** the user applies filters by Make, Model, or Year, **When** the filters are applied, **Then** the list reflects only vehicles matching the selected criteria.
4. **Given** the user clicks a vehicle in the list, **When** the vehicle detail page loads, **Then** all stored vehicle fields are displayed accurately.

---

### User Story 3 - Edit a Vehicle Record (Priority: P2)

A technician or workshop manager discovers that a vehicle's details were entered incorrectly or have changed, and needs to update the record so that future diagnostic references remain accurate.

**Why this priority**: Data accuracy is important, but corrections are less frequent than creation and viewing. Independent vehicle edit supports data quality without blocking core workflows.

**Independent Test**: A user with edit permissions can open an existing vehicle record, modify its details, save, and see the changes reflected immediately.

**Acceptance Scenarios**:

1. **Given** the user has the "update:vehicle" permission, **When** they modify a vehicle's Make, Model, Year, VIN, or Plate Number and submit, **Then** the changes are persisted.
2. **Given** the user modifies a vehicle to duplicate a VIN or Plate Number already used by another vehicle in the same organization, **When** they submit, **Then** the system warns or rejects based on configured uniqueness policy.
3. **Given** the user does not have the "update:vehicle" permission, **When** they attempt to access the edit form or submit changes, **Then** the system denies access.
4. **Given** a vehicle is updated successfully, **When** the request completes, **Then** an audit record is generated capturing userId, organizationId, action ("vehicle:updated"), timestamp, and entityId.

---

### User Story 4 - View Vehicle History Placeholder (Priority: P2)

A service advisor or workshop manager needs a dedicated section on the vehicle detail page where diagnostic history will eventually be displayed, so that the page structure supports future session linking without creating dependencies on the Diagnostic Sessions module.

**Why this priority**: The vehicle detail page must accommodate future diagnostic session history without requiring the Diagnostic Sessions feature to be implemented first. This preserves a clean UI and forward-compatible layout.

**Independent Test**: A user with view permissions can open a vehicle detail page, see a History section, and understand where past diagnostic activity will appear once the Diagnostic Sessions feature is implemented.

**Acceptance Scenarios**:

1. **Given** the user has the "read:vehicle" permission, **When** they view a vehicle's detail page, **Then** a History section is visible as a dedicated area or tab.
2. **Given** the Diagnostic Sessions module is not yet implemented or no sessions exist for the vehicle, **When** the user views the History section, **Then** the system displays an appropriate empty state (e.g., "No diagnostic sessions yet" or "Diagnostic history will appear here").
3. **Given** the user is viewing the History section, **When** they interact with it, **Then** the section does not attempt to query or display diagnostic session data that does not exist.

---

## Edge Cases

- What happens when two users in the same organization create vehicles with the same Plate Number?
- How does the system handle a VIN longer or shorter than the standard 17 characters?
- How does search behave when the user enters special characters or SQL-like patterns?
- What happens if a vehicle has a very long Make or Model name (e.g., special edition descriptors)?
- How does the system behave when a user without any vehicle permissions attempts to access any vehicle endpoint?
- What happens if a user attempts to update a vehicle that does not exist or belongs to another organization?
- What happens if a PATCH request contains no valid fields to update?

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow authenticated users with the "create:vehicle" permission to create a new vehicle record.
- **FR-002**: Each vehicle MUST be associated with exactly one organization (tenant).
- **FR-003**: A vehicle MUST have Make, Model, and Year. VIN and Plate Number are optional in the MVP.
- **FR-004**: The system MUST enforce multi-tenant isolation: users can only view or edit vehicles within their own organization.
- **FR-005**: The system MUST provide a paginated, searchable list of vehicles scoped to the requesting user's organization.
- **FR-006**: Search MUST support filtering by Make, Model, Year, VIN, and Plate Number.
- **FR-007**: The system MUST allow users with the "update:vehicle" permission to modify vehicle details.
- **FR-008**: The vehicle detail view MUST include a History placeholder section that supports future display of linked diagnostic sessions without depending on the Diagnostic Sessions module.
- **FR-009**: The system MUST enforce RBAC: each vehicle action (create, read, update) requires a specific permission.
- **FR-010**: All vehicle endpoints MUST be exposed via a versioned REST API.
- **FR-011**: The system MUST generate an audit record on every vehicle creation, capturing userId, organizationId, action ("vehicle:created"), timestamp, and entityId.
- **FR-012**: The system MUST generate an audit record on every vehicle update, capturing userId, organizationId, action ("vehicle:updated"), timestamp, and entityId.
- **FR-013**: Audit records MUST be stored in a tenant-scoped manner and MUST be immutable.

### Non-Functional Requirements

- **NFR-001**: Vehicle list queries MUST return results in under 500ms for organizations with up to 10,000 vehicles.
- **NFR-002**: Search and filter operations MUST be case-insensitive.
- **NFR-003**: The system MUST support pagination with a default page size of 25 and a maximum page size of 100.
- **NFR-004**: All vehicle data at rest MUST be isolated by organization identifier.
- **NFR-005**: API responses MUST not leak vehicle data across tenant boundaries under any error condition.

### API Requirements

- **API-001**: Vehicle creation endpoint: `POST /api/v1/vehicles` — accepts vehicle payload, returns created vehicle with ID.
- **API-002**: Vehicle list endpoint: `GET /api/v1/vehicles` — supports query parameters for search, filters, pagination.
- **API-003**: Vehicle detail endpoint: `GET /api/v1/vehicles/:id` — returns full vehicle record including a History placeholder compatible with future diagnostic session linking.
- **API-004**: Vehicle update endpoint: `PATCH /api/v1/vehicles/:id` — accepts partial update payload; only provided fields are modified.
- **API-005**: All endpoints MUST return consistent error shapes with HTTP status codes, error codes, and human-readable messages.
- **API-006**: All endpoints MUST require a valid authentication token.
- **API-007**: All endpoints MUST enforce organization scoping and RBAC permissions.
- **API-008**: Audit records MUST be generated synchronously with the vehicle mutation and MUST not fail silently.

### Validation Rules

- **VAL-001**: Make is required and must be a non-empty string with a maximum length of 100 characters.
- **VAL-002**: Model is required and must be a non-empty string with a maximum length of 100 characters.
- **VAL-003**: Year is required and must be an integer between 1900 and the current year + 1.
- **VAL-004**: VIN, if provided, must be alphanumeric and between 3 and 25 characters (relaxed for MVP to support non-standard and partial VINs).
- **VAL-005**: Plate Number, if provided, must be a non-empty string with a maximum length of 20 characters.
- **VAL-006**: Organization ID is derived from the authenticated user's context and must never be supplied or overridden by the client.
- **VAL-007**: Duplicate VIN or Plate Number within the same organization may trigger a warning in the UI but is not a hard blocking constraint in the MVP.
- **VAL-008**: PATCH payloads MUST ignore unknown or read-only fields without raising an error.

### Key Entities

- **Vehicle**: Represents a physical automobile in the workshop system. Key attributes: id, organizationId, make, model, year, vin (optional), plateNumber (optional), createdAt, updatedAt.
- **VehicleAuditRecord**: An immutable record of vehicle mutations. Key attributes: id, organizationId, userId, entityId, action ("vehicle:created" or "vehicle:updated"), timestamp, metadata (optional JSON blob for before/after snapshot in future iterations).
- **Organization** (contextual): The tenant boundary. Every Vehicle and VehicleAuditRecord belongs to exactly one Organization. Users operate within the scope of their assigned Organization.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A technician can create a vehicle record in under 30 seconds.
- **SC-002**: Vehicle search returns filtered results in under 1 second for organizations with up to 10,000 vehicles.
- **SC-003**: 100% of vehicle API endpoints enforce multi-tenant isolation (verified via automated contract tests).
- **SC-004**: Users without the correct RBAC permission receive a clear access-denied response with no data leakage.
- **SC-005**: Vehicle creation requires no more than six visible fields on the initial screen, prioritizing technician speed and minimal data entry.
- **SC-006**: Every vehicle creation and update generates an audit record within 100ms of the mutation completing.
- **SC-007**: The vehicle detail page History section renders correctly and displays an appropriate empty state when no diagnostic sessions are available.

## Explicit Exclusions

The following are explicitly out of scope for the Vehicle Management feature to maintain modular independence and constitutional simplicity:

- **Diagnostic Sessions**: No creation, management, or detailed display of diagnostic sessions. Only a placeholder History section is provided.
- **Fault Code Management**: No fault code entry, storage, or lookup.
- **AI Analysis**: No AI-generated recommendations or explanations.
- **Reports**: No report generation, PDF export, or customer-facing document creation.
- **PrioraFlow Integration**: No synchronization, webhooks, or job card linking to external systems.
- **Vehicle Deletion**: No delete or soft-delete functionality in the MVP. Administrative removal of vehicles will be addressed in a future Administration feature.
- **Administration Features**: No user management, subscription handling, or system-wide settings within this feature.

## Assumptions

- Workshops operate under a single organization context per user login. A user does not switch organizations mid-session.
- Make and Model values are free-text in the MVP. A normalized vehicle database (e.g., standard make/model dropdowns) is a future enhancement.
- Diagnostic sessions are created and managed by a separate feature. This feature only reserves UI space for future session linking.
- Vehicles are primarily workshop assets; customer self-service vehicle management is out of scope.
- The system supports at least one additional vehicle identifier (internal workshop reference number) in a future release, but is not required in the MVP.
- Audit records are written synchronously with the vehicle mutation. Asynchronous or batched audit writing is a future optimization.
