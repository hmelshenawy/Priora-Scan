# Feature Specification: Live Data & Sensor Monitoring

**Feature Branch**: `006-live-data-and-sensor-monitoring`
**Created**: 2026-06-11
**Status**: Draft
**Input**: User description: "Feature 006 — Live Data & Sensor Monitoring. Add real-time vehicle telemetry and VIN intelligence. Read live ECU sensor values, decode raw PID responses, display live data in dashboard, auto-identify vehicle from VIN."

## Context

PrioraScan is an Intelligent Diagnostic Scanner. Features 001–005 are complete: Vehicle Management, Authentication, Diagnostic Sessions, OBD Foundation (Desktop Agent, VIN read, fault code import), and Fault Code Intelligence (enriched fault code knowledge). The user can complete a full OBD scan and view enriched fault codes, but cannot yet see what the vehicle's sensors are reporting in real time, and the technician must still hand-key vehicle Make/Model/Year even after a successful VIN read.

Feature 006 introduces two new capabilities on top of the OBD Foundation:

1. **Vehicle Intelligence** — automatic VIN decoding using the local VPIC asset, so a freshly-read VIN pre-fills the vehicle form for technician confirmation.
2. **Live Data & Sensor Monitoring** — real-time ECU sensor telemetry, decoded against a local PID knowledge base, displayed in a workshop-friendly dashboard, and storable as a point-in-time snapshot linked to a Diagnostic Session.

This is PrioraScan's first true diagnostic telemetry feature. It builds directly on the Desktop Agent infrastructure, the `ScanJob` lifecycle, and the multi-tenant `DiagnosticSession` model from Feature 004.

### Asset Inventory and Known Constraints

The two local data assets named in the user description are present at:

- `backend/data/model-pids.sqlite` — 127 rows, single table `vehicle_pids` with columns `(model, pid, equation, unit, description)`. **All rows are for the `GME` (GM Extended) family using Mode 22 PIDs (PID hex format `22xxxx`).** The asset does **not** contain the standard OBD-II Mode 01 PIDs (`0C`, `0D`, `05`, `10`, `11`, `0B`, `2F`, etc.) listed as the requested MVP set.
- `backend/data/vpic.sqlite.xz` — ~67 MB compressed, ~100 tables; the canonical VIN-decoding table is `DecodingOutput` (rows keyed by VIN).

**Implication for the spec**: Because the `model-pids` asset does not cover the standard Mode 01 PIDs, the standard OBD-II PIDs in the MVP set will be served from a small built-in formula table derived from SAE J1979 (the publicly specified, well-known formulas for those PIDs), not from the SQLite asset. The SQLite asset remains a future-facing extension for GM vehicles; importing it into the application database is a planned but deferred enrichment.

The spec reflects this in the functional requirements (FR-006, FR-007, FR-008) and the assumptions, and the remaining design questions — GM-asset import, polling cadence defaults, snapshot retention, and VPIC storage location — are explicitly raised for user confirmation.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — View Live Sensor Telemetry During a Session (Priority: P1)

A technician opens a Diagnostic Session for a vehicle with a paired, online Desktop Agent and a connected ELM327 adapter. They navigate to the new Live Data page, see the adapter status, pick the standard MVP PID set (RPM, Coolant Temperature, Vehicle Speed, Battery Voltage, Throttle Position, Calculated Engine Load, Short Fuel Trim, Long Fuel Trim, MAF Air Flow, Intake Air Temperature, O2 Sensor Bank 1 Sensor 1 Voltage), and start polling. The dashboard refreshes values every second. The technician can stop polling at any time. The dashboard never shows stale or crashed states if the adapter is disconnected.

**Why this priority**: This is the core user-facing capability of the feature. Without a working live-data dashboard, no other Live Data story has visible value.

**Independent Test**: With a paired online agent and adapter, open the Live Data page for a Diagnostic Session, start polling, verify each row updates with a numeric value, a unit, and a timestamp every ≤ 2 seconds for at least 30 seconds. Disconnect the adapter and verify the dashboard transitions to a safe "Adapter offline" state without crashing.

**Acceptance Scenarios**:
1. **Given** a Diagnostic Session belonging to a vehicle, a paired online Desktop Agent, and a connected adapter, **When** the technician opens the Live Data page and presses Start, **Then** the dashboard begins displaying current values for the standard MVP PID set, each row showing a sensor name, current value, unit, and the timestamp of the most recent reading.
2. **Given** polling is active, **When** 1 second elapses, **Then** the dashboard refreshes and shows updated values for every PID that returned a value; PIDs whose ECU did not respond are shown as "No data" rather than zeroed or cleared.
3. **Given** polling is active, **When** the technician presses Stop, **Then** polling stops within one polling interval, no further updates appear, and the most recent values remain visible (read-only).
4. **Given** polling is active, **When** the adapter is physically disconnected or the agent stops responding, **Then** the dashboard transitions to an "Adapter offline" state with a clear message and a Retry action, no further values are shown as current, and no unhandled error appears in the UI.
5. **Given** a Diagnostic Session is closed, **When** the technician opens the Live Data page, **Then** polling is not available and the page displays a "Session closed — live data unavailable" message.

---

### User Story 2 — Decode VIN and Auto-fill Vehicle Form (Priority: P1)

After a successful VIN read during a scan, the Vehicle Confirm modal pre-fills Make, Model, Year, Engine, and Body Style derived from the local VPIC asset. The technician reviews the pre-filled values, edits any incorrect field, and confirms to continue. Manual entry of Make/Model/Year remains available for VINs the asset does not recognize.

**Why this priority**: This is the second core user-facing capability. Without auto-fill, the technician still has to look up VINs externally, which is the exact pain point the user description calls out.

**Independent Test**: With a known VIN that exists in the local VPIC asset, trigger a scan or open the New Vehicle page, paste the VIN, and verify the form pre-fills the corresponding Make/Model/Year/Engine/Body. Edit one field and confirm — the resulting Vehicle record persists the edited value, not the pre-filled value.

**Acceptance Scenarios**:
1. **Given** a VIN the local VPIC asset can decode, **When** the technician enters the VIN in the New Vehicle form (or in the post-scan Vehicle Confirm modal), **Then** the Make, Model, Year, Engine, and Body Style fields are pre-filled from the VPIC decode result.
2. **Given** a pre-filled form, **When** the technician edits any field and confirms, **Then** the edited values are persisted on the Vehicle record (the VPIC-decode result is a starting point, not an immutable overlay).
3. **Given** a VIN the local VPIC asset cannot decode, **When** the technician enters it, **Then** the form is left blank (or the technician may manually enter Make/Model/Year), and confirmation succeeds with the manually-entered values.
4. **Given** a previously decoded VIN, **When** the technician re-enters the same VIN in a new form, **Then** the pre-fill is served from the same source (the cache, if a cache exists, or a fresh asset lookup) and returns the same values as the first decode.

---

### User Story 3 — Capture a Live Data Snapshot into a Diagnostic Session (Priority: P1)

While polling is active, the technician presses "Save Snapshot" on the Live Data page. A point-in-time copy of the current PID values is saved to the database and linked to the open Diagnostic Session. The snapshot is visible later from the session detail page.

**Why this priority**: This is what makes live data part of the permanent diagnostic record. Without persistence, live data is a transient view and cannot inform reports, AI analysis, or PrioraFlow integration in later features.

**Independent Test**: Start polling, wait until at least three PIDs have non-zero values, press Save Snapshot, open the same Diagnostic Session detail page, and verify the snapshot appears in a "Live Data Snapshots" section with the captured values, units, and the capture timestamp.

**Acceptance Scenarios**:
1. **Given** polling is active and at least one PID has reported a value, **When** the technician presses Save Snapshot, **Then** a `LiveDataSnapshot` is created, linked to the current Diagnostic Session, and contains one `LiveDataReading` per PID that returned a value at the time of capture.
2. **Given** a snapshot was saved during a session, **When** the technician opens the session detail page after polling has stopped, **Then** the snapshot is listed in a "Live Data Snapshots" section, with the capture timestamp and the captured values, units, and raw hex payload for each PID.
3. **Given** multiple snapshots were saved during one session, **When** the technician opens the session detail page, **Then** all snapshots are listed, ordered by capture time (newest first or oldest first, consistent within the page).
4. **Given** polling has not started or no PID has returned a value, **When** the technician presses Save Snapshot, **Then** the action is disabled (or returns a clear "no data to capture" message) — an empty snapshot is not created.

---

### User Story 4 — PID Discovery on First Connection (Priority: P2)

The first time a vehicle is connected, the system runs a lightweight OBD-II PID discovery (Service 01 PIDs 00/20/40/60/80/A0 to enumerate the 32-bit banks of supported PIDs) and stores the supported PID mask alongside the session. The Live Data page uses this mask to skip PIDs the vehicle does not support and to label them "ECU does not support this PID" rather than showing a stream of "No data" rows.

**Why this priority**: Discovery improves UX, but the Live Data page can still function without it (it just shows "No data" for unsupported PIDs). This is therefore a step beyond the core.

**Independent Test**: Connect to a vehicle, complete discovery once, return to the Live Data page for the same vehicle, verify the page no longer shows "No data" for PIDs the vehicle does not support, and instead labels them with a clear "Not supported" indicator.

**Acceptance Scenarios**:
1. **Given** an online agent and a connected adapter, **When** the technician presses "Discover PIDs" on the Live Data page, **Then** the system sends the standard OBD-II PID-discovery sequence and stores the supported PID mask for the session.
2. **Given** a previously stored supported-PID mask, **When** the technician opens the Live Data page, **Then** the dashboard labels unsupported PIDs as "Not supported" (not "No data") and only polls supported PIDs by default.
3. **Given** the technician wants to poll a PID regardless of the discovery result, **When** they explicitly add it to the watch list, **Then** the system attempts the read and falls back to "No data" / error display if the ECU does not respond.

---

### User Story 5 — Polling Cadence Configuration (Priority: P3)

The technician or workshop manager can configure the polling cadence from a default of 1 second to other supported values (e.g., 500 ms, 2 s, 5 s). The setting is per-user (or per-organization) and persisted between sessions. Polling that exceeds a safe ceiling is automatically capped to protect the adapter and the ECU.

**Why this priority**: This is a quality-of-life enhancement. The default 1-second cadence works for the MVP; configurability is a polish item.

**Independent Test**: Change the polling cadence to 2 seconds, start polling, verify the gap between successive updates is approximately 2 seconds (within ± 20%). Set cadence to 100 ms, verify it is automatically clamped to the minimum supported value (with a clear indicator that the value was clamped).

**Acceptance Scenarios**:
1. **Given** the cadence setting is at the default of 1 second, **When** the technician starts polling, **Then** the dashboard updates at approximately 1-second intervals.
2. **Given** the technician changes the cadence to 2 seconds, **When** polling starts, **Then** updates occur at approximately 2-second intervals.
3. **Given** the technician sets the cadence below the supported minimum, **When** they save the setting, **Then** the setting is clamped to the minimum supported value (e.g., 200 ms) with a visible message, and subsequent polling uses the clamped value.
4. **Given** the technician changes the cadence, **When** they return to the Live Data page in a later session, **Then** the cadence preference is restored.

---

### Edge Cases

- **Adapter offline mid-poll**: Polling stops, dashboard transitions to "Adapter offline" with a Retry action. No stale or zeroed values are presented as current.
- **Agent offline (heartbeat stale)**: Live Data page is not available; the page shows "Agent offline — reconnect your Desktop Agent".
- **Unknown PID (not in the formula table and not in the local asset)**: A row labelled "Unknown PID" is shown with the raw bytes, the unit "—", and no formula is applied. The value is not silently zeroed or guessed.
- **ECU returns an error response (e.g., `7F 01 12` Service Not Supported)**: The dashboard marks the PID with an error indicator and continues polling the remaining PIDs. One bad PID does not break the whole poll cycle.
- **Disconnection / re-connection race**: If the agent is reported offline but the user re-pairs or reconnects within the same session, the dashboard re-enables Start. The first poll cycle after reconnect may legitimately return partial data; the UI must not interpret a partial first cycle as a permanent error.
- **Session is closed while polling**: Polling stops, the page becomes read-only, the existing "Session closed" state appears.
- **VPIC asset missing or corrupt**: The Vehicle form behaves as if the asset is unavailable — the technician may still enter Make/Model/Year manually. A clear message is shown: "Vehicle database unavailable — please enter details manually".
- **Discovery returns an empty / all-zeroes mask**: Treat as "discovery did not complete" — the Live Data page shows all PIDs as "Pending" and offers a "Run discovery" action.
- **Concurrent polling sessions**: If two users in the same tenant (or two browser tabs) start polling for the same agent, the system serves the same adapter concurrently but the dashboard reflects only the local user's view. Per-user state isolation is preserved.
- **Snapshot during unstable connection**: The snapshot persists the values that were successfully read at the instant of capture. A snapshot created during a partial response cycle may have fewer readings than a full poll cycle; this is acceptable and is labelled as such on the snapshot detail view.

## Requirements *(mandatory)*

### Functional Requirements

#### Vehicle Intelligence

- **FR-001**: The system MUST provide a backend service that decodes a 17-character VIN against the local VPIC asset and returns a `VehicleDecode` payload containing at minimum `make`, `model`, `year`, `engine`, `bodyStyle`, `manufacturer`, and `decodedAt`.
- **FR-002**: The system MUST expose an authenticated API endpoint `GET /vehicles/decode?vin={vin}` that returns the `VehicleDecode` payload for a valid VIN. The endpoint MUST be reachable by any authenticated user in the tenant; it MUST NOT introduce a new permission.
- **FR-003**: When the local VPIC asset can decode the VIN, the system MUST pre-fill the New Vehicle form and the post-scan Vehicle Confirm modal with the decoded fields, and MUST allow the user to edit any field before confirming. The persisted Vehicle record MUST contain the user-confirmed values, not the auto-filled values.
- **FR-004**: When the local VPIC asset cannot decode the VIN, the form MUST remain blank (or show the technician's manually-entered values) and confirmation MUST succeed with those values. The system MUST NOT block vehicle creation because of a missing decode.
- **FR-005**: The system MUST cache successful VIN decodes so that repeated decodes of the same VIN are served without re-querying the asset. A `VehicleDecode` row is the suggested cache representation (see Key Entities). The cache is global reference data and MUST NOT be tenant-scoped.

#### Live Data — PID Discovery and Read

- **FR-006**: The system MUST support OBD-II PID discovery via Service 01 PIDs 00, 20, 40, 60, 80, A0 (the four 32-bit banks of supported PIDs) over the existing Desktop Agent. The supported-PID mask MUST be stored for the current session.
- **FR-007**: The system MUST support reading the standard OBD-II Mode 01 PIDs in the MVP set: `0C` (Engine RPM), `0D` (Vehicle Speed), `05` (Coolant Temperature), `42` (Control Module Voltage), `11` (Throttle Position), `04` (Calculated Engine Load), `06` (Short Term Fuel Trim Bank 1), `07` (Long Term Fuel Trim Bank 1), `10` (MAF Air Flow), `0F` (Intake Air Temperature), `14` (O2 Sensor Bank 1 Sensor 1 Voltage). The formulas and units for these PIDs MUST be served from a small built-in formula table (well-known SAE J1979 formulas); the local `model-pids.sqlite` asset does not currently contain them and is treated as a future extension (FR-008).
- **FR-008**: The system MUST load the local `backend/data/model-pids.sqlite` asset at startup or first use and expose its PID definitions for PIDs the built-in table does not cover. For the MVP, the asset's GM-Extended Mode 22 PIDs are loaded as an additional PID source but are not exercised in the default dashboard view; the standard Mode 01 PIDs in the MVP set are the user-visible default.
- **FR-009**: The system MUST decode raw PID response bytes using the formula and unit defined in either the built-in table (for the standard Mode 01 PIDs) or the loaded `model-pids` asset (for PIDs it covers). Decoding errors MUST be reported per-PID; one bad PID MUST NOT abort the poll cycle.
- **FR-010**: The system MUST return a `LiveDataReading` payload containing at minimum: `pid`, `name` (human-readable), `value` (decoded numeric or string), `unit`, `rawValue` (the raw hex bytes returned by the ECU), and `capturedAt` (timestamp of the read). PIDs the ECU did not support in a given poll cycle MUST return a "no data" reading rather than a zeroed or guessed value.

#### Live Data — Polling and Dashboard

- **FR-011**: The system MUST support start, stop, and safe re-connect of periodic PID polling through the existing Desktop Agent. Polling cadence MUST default to 1 second; the cadence MUST be configurable within a safe range (e.g., 200 ms to 5 s). Values outside the safe range MUST be clamped with a visible indicator.
- **FR-012**: The Live Data dashboard MUST show, for each PID in the active set, the sensor name, the current decoded value, the unit, and the timestamp of the most recent reading. The dashboard MUST update automatically on each poll cycle and MUST continue showing the most recent values when polling stops.
- **FR-013**: The Live Data dashboard MUST detect adapter disconnection (no response for one poll cycle, repeated N times, or an explicit disconnect event from the agent) and transition to a safe "Adapter offline" state with a clear message and a Retry action. The dashboard MUST NOT show stale values as if they were current.
- **FR-014**: The Live Data dashboard MUST label a PID as "Not supported" if the supported-PID mask from FR-006 indicates the ECU does not advertise that PID, and as "No data" if the ECU simply did not respond during a poll cycle. The two states MUST be visually distinct.

#### Live Data — Session Snapshot

- **FR-015**: The system MUST allow the technician to save a point-in-time `LiveDataSnapshot` linked to the current open Diagnostic Session. Each snapshot MUST contain a `capturedAt` timestamp and one `LiveDataReading` per PID that returned a value at the time of capture. Snapshots MUST NOT contain readings for PIDs that returned no data.
- **FR-016**: The snapshot save action MUST be unavailable (or return a clear "no data to capture" message) when polling has not produced any readings. An empty snapshot MUST NOT be created.
- **FR-017**: Snapshots MUST be visible from the Diagnostic Session detail page in a "Live Data Snapshots" section. The detail view MUST show the capture timestamp and the captured values, units, and raw hex payload for each PID in the snapshot.
- **FR-018**: Snapshots MUST be tenant-scoped through their parent Diagnostic Session. A user in tenant A MUST NOT be able to read snapshots from tenant B, even via a direct API call.

#### Polling Architecture (Transport)

- **FR-019**: Polling for live data MUST be initiated by the Desktop Agent. The backend persists the most recent reading per (session, PID) and exposes them through a polling-safe API endpoint. The architecture MUST be "agent initiated" (i.e., the agent is the source of truth for "live"; the backend records what the agent reports). The backend MUST NOT attempt to open its own connection to the adapter.
- **FR-020**: The agent MUST push each poll-cycle result to the backend via an authenticated agent endpoint. The endpoint MUST be tenant-scoped (the agent's existing organization binding is used) and MUST be reachable only by the agent to which the session is bound.

#### Multi-Tenancy, Permissions, and Audit

- **FR-021**: All new entities (`VehicleDecode`, `LiveDataSnapshot`, `LiveDataReading`) MUST respect organization boundaries. `VehicleDecode` is global reference data and is the only new entity without `organizationId`; it MUST NOT be used as a tenant isolation boundary.
- **FR-022**: The new endpoints introduced in this feature MUST be reachable by the same authenticated users who can view a Diagnostic Session in their tenant — no new permission is required. Service Advisors, Technicians, and Workshop Managers can decode VINs, view live data for open sessions, and view snapshots. Polling and snapshot capture are gated by the existence of an open Diagnostic Session in the tenant.
- **FR-023**: The system MUST write a `DiagnosticSessionAuditRecord` for the actions `LIVE_DATA_POLL_STARTED`, `LIVE_DATA_POLL_STOPPED`, `LIVE_DATA_SNAPSHOT_CAPTURED`, and `VIN_DECODED_FROM_ASSET` (when the VPIC asset successfully decoded a VIN used in vehicle creation or confirmation). All such audit records MUST be tenant-scoped and immutable.

#### Backward Compatibility

- **FR-024**: The existing Feature 004 scan flow and the Feature 005 enrichment flow MUST continue to work unchanged. This feature MUST NOT alter the `ScanJob`, `SessionFaultCode`, `MasterFaultCode`, or fault-code enrichment endpoints. The Desktop Agent's existing command queue MUST be extended, not replaced.

#### Out-of-Scope Constraints (Reaffirmed)

- **FR-025**: This feature MUST NOT include any of the following, which remain in later roadmap phases: AI analysis, PDF/digital reports, freeze-frame data, graphing or trend analysis, actuation tests, bidirectional controls, service functions, adaptations, coding, programming, flashing, OEM-specific diagnostics, PrioraFlow integration.

### Key Entities *(include if feature involves data)*

- **VehicleDecode** (global reference data, NOT tenant-scoped): A cached VPIC decode result. Suggested fields: `id`, `vin` (unique, 17 chars), `make`, `model`, `year`, `engine`, `bodyStyle`, `manufacturer`, `decodedAt`, `source` (asset identifier, e.g., `vpic.sqlite.xz`). Lifecycle: created on first successful decode of a given VIN; reused for subsequent decodes of the same VIN.
- **LiveDataSession** (tenant-scoped, optional): A new logical "live data session" bound to an open `DiagnosticSession` for the duration of polling. May be implicit (status flag on the `DiagnosticSession`) or explicit (own table). Holds the current supported-PID mask and the most recent reading per PID. Decision deferred to planning; this spec leaves both options open.
- **LiveDataSnapshot** (tenant-scoped): A point-in-time capture of the live data values during a session. Suggested fields: `id`, `organizationId`, `diagnosticSessionId`, `capturedAt`, `createdBy`. Has many `LiveDataReading`.
- **LiveDataReading** (tenant-scoped via parent snapshot): A single sensor reading inside a snapshot. Suggested fields: `id`, `snapshotId`, `pid`, `name`, `value` (numeric or string), `unit`, `rawValue` (raw hex bytes), `capturedAt`.
- **MostRecentLiveReading** (read-model, not a stored entity): The latest value per PID for an active live session, served by the API to power the dashboard. May be a Prisma view or a query result; not an independent table in the MVP.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A technician can start polling the standard MVP PID set and see fresh values on the dashboard within 2 seconds of pressing Start.
- **SC-002**: Once polling is active, the dashboard updates at the configured cadence (default 1 second) with a p95 refresh-to-display latency of 1 second or less over a healthy agent connection.
- **SC-003**: When the adapter is physically disconnected during polling, the dashboard transitions to the "Adapter offline" state within 5 seconds, and no stale value is shown as current.
- **SC-004**: A known VIN that exists in the local VPIC asset decodes to the correct Make/Model/Year/Engine/Body in the New Vehicle form on the first attempt with no external network call. Verified by inspecting the network log: zero outbound calls beyond the local backend.
- **SC-005**: A successful VIN decode is reused on subsequent requests for the same VIN: a second call to `GET /vehicles/decode?vin={vin}` for a known VIN returns the same payload in under 100 ms p95 after the first decode.
- **SC-006**: A snapshot saved during an active poll cycle persists and is visible on the Diagnostic Session detail page. The page renders the snapshot with its captured values, units, and timestamp without page errors.
- **SC-007**: Tenant isolation is preserved: a user in tenant A cannot read, modify, or snapshot live data from a Diagnostic Session in tenant B. The existing tenant-isolation tests for Diagnostic Sessions continue to pass.
- **SC-008**: The Feature 004 scan flow (adapter connect → VIN read → fault-code import → view enriched results) and the Feature 005 enrichment flow (MasterFaultCode lookups) continue to work after Feature 006 ships. Existing scan-related tests continue to pass.
- **SC-009**: When a PID is not advertised in the supported-PID mask, the dashboard labels it "Not supported" within 2 poll cycles of the first display. When a PID is advertised but does not respond, the dashboard labels it "No data" within 2 poll cycles.
- **SC-010**: A new Diagnostic Session Audit Record of action `VIN_DECODED_FROM_ASSET` is written on the first successful VPIC-backed decode used for a vehicle creation or confirmation; the audit record is immutable and tenant-scoped.

## Assumptions

- The user is multi-tenant and the existing tenant-isolation model in `DiagnosticSession` / `ScanJob` / `SessionFaultCode` is preserved. `VehicleDecode` is global reference data (not tenant-scoped) because VPIC data is industry-standard and identical across tenants.
- The local `vpic.sqlite.xz` asset is the canonical source of VIN-decoding knowledge for this feature. A SQL lookup into the asset's `DecodingOutput` table (or equivalent canonical table) is sufficient to extract Make/Model/Year/Engine/Body. The exact table/column names are a planning decision. The decision of whether the asset is **imported into PostgreSQL** vs **queried in place** from a per-process SQLite handle is a planning decision driven by size and update frequency (see Open Questions).
- The local `model-pids.sqlite` asset contains 127 rows, all in the GM-Extended Mode 22 family, and does **not** cover the standard OBD-II Mode 01 PIDs the user description requested as the MVP set. The standard PIDs are therefore served from a small built-in SAE J1979 formula table built into the backend; the SQLite asset is loaded as an additional, future-facing PID source. This split keeps the requested MVP working without re-shipping a different asset.
- The Desktop Agent continues to be the bridge: it owns the OBD-II connection, executes PID reads, and pushes results to the backend. The backend orchestrates state and exposes APIs; it does not open its own connection to the adapter.
- Polling is **agent-initiated**: the agent is the source of truth for "live"; the backend records what the agent reports. The MVP keeps the existing REST polling pattern from Feature 004 (no WebSockets, no SSE). The transport is transport-agnostic so a future WebSocket upgrade does not require re-planning the data flow.
- Live data is **read-heavy** and tenant-scoped through the `DiagnosticSession`; the system does not need to scale to thousands of concurrent polling sessions in the MVP. p95 latency targets above are sized for a single workshop with a handful of active sessions.
- Snapshots are **point-in-time captures**, not recordings. They are stored as one row per captured PID; no time-series table is needed in the MVP. A future feature (Freeze Frame / Graphing) may extend the model.
- The new endpoints introduced by this feature do **not** require new permissions beyond the existing read/write access to Diagnostic Sessions in the tenant.
- The new "Live Data" page is a new route under the existing `sessions/[id]` navigation; it is not a separate top-level sidebar entry in the MVP.
- The `Vehicle` model already has nullable `make`, `model`, `year`, and `vin` columns. Auto-fill updates these (and adds `engine`, `bodyStyle` to a new optional metadata field if the schema does not yet support them — see Open Questions).
- The Desktop Agent already supports a generic command queue and result push pattern from Feature 004. The "live data" command and "push live reading" event types are added to the existing queue, not a new transport.

## Out of Scope (Confirmed Exclusions)

Feature 006 explicitly does **NOT** include any of the following; they remain in later roadmap phases:

- **AI Analysis** of live data streams or snapshots (Feature 007)
- **PDF / digital reports** (Feature 008)
- **PrioraFlow integration** (Feature 009)
- **Freeze Frame data**
- **Graphing** of live or historical sensor streams
- **Trend analysis** across multiple snapshots
- **Actuation tests**, **bidirectional controls**, **service functions**, **adaptations**
- **Coding**, **programming**, **flashing** of ECUs
- **OEM-specific repair procedures** or OEM-specific PID libraries beyond the GM Mode 22 PIDs that already ship in the `model-pids` asset
- **Recording** continuous sensor streams; the feature is point-in-time snapshots only

## Open Questions (For `/speckit-clarify` or Planning)

The following decisions are not blocking the spec but should be confirmed before planning:

1. **VPIC asset storage**: Import `vpic.sqlite.xz` into a PostgreSQL table (`vehicle_decode` / `vpic_*`) on first use (or as a one-shot seed) **or** open a per-process read-only SQLite handle to the decompressed file at runtime? The import is more portable and queryable; the in-place query avoids ~70 MB of data duplication and a migration step. *(Recommended: in-place read-only SQLite handle with an in-memory cache for VIN decode results, to avoid the migration overhead and keep the asset as the single source of truth. The `VehicleDecode` cache table stores only successful decode summaries, not the whole VPIC corpus.)*
2. **`model-pids` asset import**: Same trade-off. The asset is only 127 rows, so a PostgreSQL import is essentially free. *(Recommended: import into a `pid_definition` table on first use; standard Mode 01 PIDs live in a small built-in seed the application ships with, separate from the asset.)*
3. **Live data session state**: Should "live data session" be a flag/JSON column on `DiagnosticSession` or a new `LiveDataSession` table? *(Recommended: a small `LiveDataSession` table linked to `DiagnosticSession`, holding supported-PID mask and last-polled-at, so concurrent sessions on different agents do not collide and snapshots are not coupled to the live data lifecycle.)*
4. **Snapshot retention**: Should the MVP impose a cap (e.g., 20 snapshots per session) or allow unbounded snapshots? *(Recommended: cap at 50 snapshots per session for the MVP, with oldest-snapshots-evicted policy; configurable in a future release.)*
5. **`Vehicle` schema for engine/bodyStyle**: The current `Vehicle` model has `make`, `model`, `year`, `vin`, `plateNumber`. To pre-fill engine and body, the schema needs an extension. *(Recommended: add nullable `engine` (VarChar 100) and `bodyStyle` (VarChar 100) columns to `Vehicle` in the Feature 006 migration. Migration is additive.)*
