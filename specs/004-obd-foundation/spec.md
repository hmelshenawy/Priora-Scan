# Feature Specification: OBD Foundation

**Feature Branch**: `004-obd-foundation`

**Created**: 2026-06-09

**Status**: MVP COMPLETE

**Input**: User description: "OBD Foundation

Create feature specification for Phase 004: OBD Foundation.

Context:

PrioraScan is a web-first Intelligent Diagnostic Scanner.

Current completed features:

001 Vehicle Management
002 Authentication v1
003 Diagnostic Sessions

New architecture decision:

PrioraScan remains a web SaaS product.

Next.js Web App = main product UI
NestJS Backend = source of truth for auth, tenant isolation, sessions, storage, audit, AI, reports
Python Desktop Agent = small local connector only for OBD adapter communication
PostgreSQL = persistent storage

The Desktop Agent is not the full application.
It must only handle local OBD communication and adapter connection.

Architecture flow:

OBD Adapter
→ Python Desktop Agent
→ NestJS API
→ PostgreSQL
→ Next.js Web App

Feature goal:

Build the first end-to-end OBD workflow:

Connect Adapter
→ Read VIN
→ Identify/Create Vehicle
→ Create Diagnostic Session
→ Read Fault Codes
→ Import Fault Codes into Session
→ View Scan Results

MVP adapter scope:

ELM327-compatible adapters only
OBD-II only
Passenger vehicles only

Required User Stories:

US1 Connect Adapter
US2 Disconnect Adapter
US3 Read Vehicle VIN
US4 Start Scan From Web App
US5 Auto-create Diagnostic Session From Scan
US6 Read Fault Codes
US7 Import Fault Codes Into Diagnostic Session
US8 View Scan Results

Important rules:

Browser does not connect directly to the OBD adapter.
Desktop Agent never writes directly to database.
Desktop Agent communicates only with backend APIs.
Backend owns all business logic.
All scan data must be tenant-scoped.
All scan actions require authentication.
Audit records must be created for scan start, scan completion, and fault-code import.
DiagnosticSession remains the parent entity for scan results.
Fault codes are attached to DiagnosticSession.

Out of scope:

Live data
Graphing
Freeze frame
Bi-directional controls
Actuations
Adaptations
Coding
Programming
ECU flashing
AI recommendations
Repair procedures
PDF reports
PrioraFlow integration

Generate specification only.

Do not generate plan.
Do not generate tasks.
Do not generate code."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Connect Adapter (Priority: P1)

A technician launches the Desktop Agent on a local computer, plugs in an ELM327-compatible OBD-II adapter, and establishes a connection so the web application can communicate with the vehicle.

**Why this priority**: Without adapter connectivity, no OBD data can be read. This is the foundational gateway for the entire OBD workflow.

**Independent Test**: A technician can launch the Desktop Agent, connect an adapter, and verify in the web application that the adapter is listed as "Connected" without performing any other actions.

**Acceptance Scenarios**:

1. **Given** the Desktop Agent is running and an ELM327 adapter is available, **When** the technician selects the adapter and initiates connection, **Then** the adapter is connected and the web application displays the connection status within 5 seconds.
2. **Given** no adapter is present or the adapter is incompatible, **When** the technician attempts to connect, **Then** the system displays a clear error message explaining the failure and suggests corrective action.

---

### User Story 2 — Read Vehicle VIN (Priority: P1)

Once the adapter is connected, the technician reads the Vehicle Identification Number (VIN) directly from the vehicle's ECU to identify the vehicle being diagnosed.

**Why this priority**: VIN is the unique key for vehicle identification. It enables automatic vehicle lookup and eliminates manual data entry errors.

**Independent Test**: A technician can connect an adapter and request a VIN read, receiving a valid 17-character VIN within 30 seconds, without needing to start a full scan.

**Acceptance Scenarios**:

1. **Given** a connected adapter and a supported OBD-II vehicle, **When** the technician requests the VIN, **Then** the system returns the correct 17-character VIN.
2. **Given** a connected adapter but the vehicle does not expose VIN via OBD-II, **When** the technician requests the VIN, **Then** the system reports that VIN retrieval is unavailable and allows the technician to enter the VIN manually or continue without it.

---

### User Story 3 — Start Scan From Web App (Priority: P1)

A technician, logged into the PrioraScan web application, initiates an OBD scan that triggers the Desktop Agent to begin communicating with the vehicle.

**Why this priority**: This is the user-facing entry point for the entire automated OBD workflow. It bridges the web UI to the local hardware.

**Independent Test**: A technician can click "Start Scan" in the web application and see the scan transition from "Pending" to "Running" status, even if no adapter is connected (in which case it fails gracefully).

**Acceptance Scenarios**:

1. **Given** an authenticated user with a connected adapter, **When** the user clicks "Start Scan" in the web application, **Then** the backend queues a scan command to the Desktop Agent and the scan status becomes "Running".
2. **Given** an authenticated user with no connected adapter, **When** the user clicks "Start Scan", **Then** the system informs the user that no adapter is connected and prevents the scan from starting.

---

### User Story 4 — Auto-create Diagnostic Session From Scan (Priority: P1)

When a scan starts, the system automatically resolves the vehicle by VIN and creates a Diagnostic Session so that all subsequent results are organized under a single, coherent diagnostic encounter.

**Why this priority**: The Diagnostic Session is the parent entity for all scan results. Creating it automatically ensures data integrity and reduces technician workload.

**Independent Test**: A technician can start a scan for a vehicle whose VIN already exists in the tenant; the system attaches the new Diagnostic Session to that existing vehicle without prompting for manual vehicle selection.

**Acceptance Scenarios**:

1. **Given** a scan is started and the VIN matches an existing vehicle in the user's tenant, **When** the system resolves the vehicle, **Then** a new Diagnostic Session is created and linked to the existing vehicle.
2. **Given** a scan is started and the VIN does not match any vehicle in the tenant, **When** the system attempts to resolve the vehicle, **Then** the system prompts the user to create a new vehicle profile pre-filled with available VIN-derived data.
3. **Given** a scan is started and the VIN matches a vehicle in a different tenant, **When** the system resolves the vehicle, **Then** the system treats it as a non-match and prompts to create a new vehicle within the current tenant.

---

### User Story 5 — Read Fault Codes (Priority: P1)

During an active scan, the Desktop Agent reads current Diagnostic Trouble Codes (DTCs) — active, pending, and permanent — from the vehicle.

**Why this priority**: Reading fault codes is the core value of the OBD workflow. It captures the vehicle's diagnostic state for analysis and reporting.

**Independent Test**: A technician can start a scan on a vehicle with known fault codes; after the scan completes, the exact codes and their statuses are present in the system.

**Acceptance Scenarios**:

1. **Given** an active scan and a vehicle with stored fault codes, **When** the system reads codes, **Then** all active, pending, and permanent codes are collected.
2. **Given** an active scan and a vehicle with no fault codes, **When** the system reads codes, **Then** the scan completes successfully with an empty code list.
3. **Given** an active scan and the adapter is disconnected mid-operation, **When** the read is interrupted, **Then** the scan is marked as failed and the user is notified with the reason.

---

### User Story 6 — Import Fault Codes Into Diagnostic Session (Priority: P1)

After fault codes are read from the vehicle, they are imported into the active Diagnostic Session so they can be viewed, analyzed, and reported alongside technician notes and AI recommendations.

**Why this priority**: Importing transforms raw adapter data into structured, persistent diagnostic knowledge attached to a session.

**Independent Test**: A technician can complete a scan and immediately open the Diagnostic Session to see the imported fault codes with their status and ECU source.

**Acceptance Scenarios**:

1. **Given** a completed scan with fault codes, **When** the system imports the codes, **Then** each code is stored in the Diagnostic Session with its alphanumeric value, status, and originating ECU.
2. **Given** a completed scan with duplicate codes across multiple ECUs, **When** the system imports the codes, **Then** duplicates are preserved with distinct ECU sources so the technician sees the full picture.

---

### User Story 7 — Disconnect Adapter (Priority: P2)

A technician can safely disconnect the adapter after the scan is complete, freeing the hardware and ending the Desktop Agent's communication session.

**Why this priority**: Proper disconnection prevents adapter lock-up, clears the communication channel for other tools, and signals the end of the diagnostic encounter.

**Independent Test**: A technician can click "Disconnect" in the web application (or close the Desktop Agent) and see the adapter status change to "Disconnected".

**Acceptance Scenarios**:

1. **Given** a connected adapter, **When** the technician initiates disconnection, **Then** the adapter is released and the web application reflects the disconnection within 3 seconds.
2. **Given** an adapter that was physically removed without software disconnection, **When** the Desktop Agent detects the loss of communication, **Then** the system updates the status to "Disconnected" and notifies the user.

---

### User Story 8 — View Scan Results (Priority: P2)

A technician or service advisor opens a Diagnostic Session in the web application to view the complete set of imported fault codes, scan metadata, and vehicle details.

**Why this priority**: Viewing results is the culmination of the OBD workflow. It enables decision-making, customer communication, and historical tracking.

**Independent Test**: A user can open a previously completed Diagnostic Session and view all imported fault codes, scan timestamps, and associated vehicle information without needing to re-scan.

**Acceptance Scenarios**:

1. **Given** a Diagnostic Session with imported fault codes, **When** a user opens the session, **Then** all fault codes are displayed with their code, description, status, and ECU source.
2. **Given** a tenant with multiple vehicles and scans, **When** a user views scan results, **Then** the user only sees results belonging to their own tenant.

---

### Edge Cases

- **Adapter connection failure**: The adapter is not found, is already in use by another application, or is incompatible. The system must display a specific, actionable error message.
- **VIN read failure**: The vehicle does not support VIN over OBD-II, returns a blank value, or returns a malformed string. The system must allow the user to proceed manually or abort.
- **Cross-tenant vehicle match**: A VIN exists in another organization. The system must never reveal or link to that vehicle; it must treat it as a non-match.
- **No fault codes present**: The vehicle reports zero DTCs. The system must complete the scan successfully, create an audit record, and show a "No codes found" state.
- **Adapter disconnection during scan**: The adapter is unplugged or loses power mid-scan. The system must mark the scan as failed, retain any partial data, and notify the user.
- **Desktop Agent offline**: The Desktop Agent loses network connectivity during a scan. The system must detect the disconnection, fail the scan gracefully, and allow retry when connectivity returns.
- **Authentication expiry**: The user's session token expires during a scan. The system must complete the in-flight scan if possible, but reject any new commands until re-authentication.
- **Duplicate fault codes**: The same fault code is reported by multiple ECUs. The system must preserve each instance with its ECU source rather than deduplicating.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow an authenticated user to establish a connection between a Desktop Agent instance and an ELM327-compatible OBD-II adapter.
- **FR-002**: The system MUST allow a user to disconnect an active adapter connection safely.
- **FR-003**: The system MUST read the Vehicle Identification Number (VIN) from the connected vehicle through the adapter.
- **FR-004**: The system MUST allow an authenticated user to initiate an OBD scan from the web application.
- **FR-005**: The system MUST match the read VIN to an existing vehicle within the user's tenant. If no match exists, the system MUST allow the user to create a new vehicle profile automatically populated with VIN-derived data.
- **FR-006**: The system MUST create a Diagnostic Session linked to the identified vehicle when a scan is initiated.
- **FR-007**: The system MUST read active, pending, and permanent Diagnostic Trouble Codes (DTCs) from the vehicle via the adapter.
- **FR-008**: The system MUST import all read fault codes into the active Diagnostic Session, preserving code value, status, and ECU source.
- **FR-009**: The system MUST allow users to view scan results, including the full set of imported fault codes, within the web application.
- **FR-010**: The system MUST create an immutable audit record for scan start, scan completion, and fault-code import events.
- **FR-011**: All scan data and resulting diagnostic sessions MUST be strictly scoped to the authenticated user's organization (tenant).
- **FR-012**: The browser MUST NOT connect directly to the OBD adapter under any circumstances.
- **FR-013**: The Desktop Agent MUST communicate exclusively with backend APIs and MUST NOT write directly to the persistent database.
- **FR-014**: The system MUST support passenger vehicles compliant with OBD-II standards only.
- **FR-015**: The system MUST support ELM327-compatible adapters using USB and Bluetooth connections.
- **FR-016**: The Desktop Agent MUST authenticate and pair with the backend using a short-lived pairing token. A user initiates pairing from the web application, receives a one-time code, and enters it into the Desktop Agent. The agent is then bound to that user's session until logout or timeout.
- **FR-017**: The scan workflow MUST proceed automatically through adapter connection, VIN reading, vehicle identification or creation, diagnostic session creation, and fault code reading. When the read VIN does not match an existing vehicle in the tenant, the system MUST pause and prompt the user to confirm or edit the new vehicle profile before continuing.

### Key Entities *(include if feature involves data)*

- **DesktopAgent**: A locally installed connector application that bridges the OBD adapter and the PrioraScan backend. Attributes: unique agent identifier, connection state, linked user/tenant reference.
- **AdapterConnection**: Represents a live or historical connection session between a Desktop Agent and a physical OBD adapter. Attributes: adapter type, connection protocol (e.g., CAN, ISO), status (connected / disconnected / error), start/end timestamps.
- **ScanJob**: Represents a user-initiated OBD scan operation. Attributes: status (pending, running, completed, failed), linked vehicle, linked diagnostic session, initiated by user, start time, end time, error details.
- **FaultCode**: A diagnostic trouble code retrieved from the vehicle. Attributes: alphanumeric code (e.g., P0301), category (powertrain, body, chassis, network), status (active, pending, permanent), associated ECU or system.
- **DiagnosticSession**: The container for a single diagnostic encounter (defined in prior phases). In this feature, it serves as the parent entity for all scan results and imported fault codes.
- **Vehicle**: The vehicle profile (defined in prior phases). Attributes: VIN, make, model, year, tenant.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A technician can connect an adapter and initiate a scan from the web application within 2 minutes of launching the Desktop Agent.
- **SC-002**: VIN reading succeeds and returns a valid VIN for 95% of supported vehicles within 30 seconds.
- **SC-003**: Fault codes are imported into the Diagnostic Session and visible in the web application within 10 seconds of scan completion.
- **SC-004**: 100% of scan start, scan completion, and fault-code import actions generate an immutable audit record.
- **SC-005**: Scan data is never visible to users outside the originating tenant.
- **SC-006**: A technician can view historical scan results for any vehicle in their tenant without re-scanning.

## Assumptions

- The user has installed the Desktop Agent on a computer with physical or wireless access to the OBD adapter.
- The vehicle supports OBD-II and exposes VIN via Mode 09 PID 02.
- The ELM327 adapter responds to standard AT and OBD command sets.
- The Desktop Agent host has active internet connectivity to reach PrioraScan backend APIs.
- Users are authenticated in the web application before initiating scans.
- Only passenger vehicles (Class M1) are targeted; heavy-duty and non-OBD-II vehicles are out of scope.
- Fault codes are read from all available ECUs; the system does not filter or interpret codes during the OBD Foundation phase.
