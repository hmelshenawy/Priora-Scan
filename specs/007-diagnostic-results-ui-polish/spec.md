# Feature Specification: Diagnostic Results UI Polish + Control Unit Scan Presentation

**Feature Branch**: `008-diagnostic-results-ui-polish`

**Created**: 2026-06-11

**Status**: Implemented

**Input**: User description: "Implement Diagnostic Results UI Polish + Control Unit Scan Presentation. PrioraScan currently displays fault codes as a flat list. This feels too basic and not like a professional workshop scanner. Improve the diagnostic results frontend so scan results are presented as a full vehicle control unit scan. This phase is mostly frontend and presentation logic. Do NOT implement real manufacturer-specific ECU scanning yet."

## Context

PrioraScan Features 004 (OBD Foundation) and 005 (Fault Code Intelligence) are complete. The user can now complete an OBD scan and view fault codes enriched with titles, descriptions, severity, and system badges. However, the current presentation is a flat list of fault codes — either a plain list on the Diagnostic Session detail page or a simple ECU-grouped list on the OBD dashboard. This does not match the professional workshop scanner experience, where results are organized by vehicle control unit (ECM, TCM, ABS, SRS, etc.) with clear scan statuses per module.

Feature 007 transforms the flat fault-code display into a structured **All Systems Scan** layout that groups codes by control unit, shows modules with no faults as healthy, marks unscanned modules as not-scanned-in-MVP, and provides summary statistics at the top. This is a **presentation-layer-only** feature: no new database tables, no real ECU topology scanning, no manufacturer-specific diagnostics.

The feature introduces a frontend helper that converts a flat list of `FaultCode` objects into grouped `ControlUnitResult` objects, a reusable `ControlUnitScan` component, and updates to both the OBD scan-results page and the Diagnostic Session fault-results area.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — View All Systems Scan Layout (Priority: P1)

A technician completes an OBD scan that returns three fault codes (P0301 ACTIVE ECM, P0171 PENDING ECM, U0100 ACTIVE TCM). Instead of seeing a flat list, the technician sees a structured "All Systems Scan" view with 8 control unit cards: ECM shows "2 faults found" with both codes listed, TCM shows "1 fault found" with its code listed, and ABS, SRS, BCM, ESP, IC, and HVAC each show "Not scanned in MVP" in a muted style.

**Why this priority**: This is the core value of the feature. The flat list → control unit scan transformation is the entire point. Without it, the feature has no user-facing impact.

**Independent Test**: Create a diagnostic session with fault codes P0301 (ACTIVE, ECM), P0171 (PENDING, ECM), and U0100 (ACTIVE, TCM). Open the session detail page. Verify that the page shows 8 control unit cards, that ECM and TCM show fault counts and fault details, and that all other modules show "Not scanned in MVP."

**Acceptance Scenarios**:

1. **Given** a diagnostic session containing fault codes P0301 (ACTIVE, ECM), P0171 (PENDING, ECM), and U0100 (ACTIVE, TCM), **When** the technician opens the session detail page, **Then** the page displays 8 control unit cards grouped into: ECM (FAULTS_FOUND, 2 faults), TCM (FAULTS_FOUND, 1 fault), and 6 other modules (NOT_SCANNED, 0 faults).
2. **Given** the same session, **When** the technician expands the ECM card, **Then** P0301 and P0171 are listed with their code, title, status, system, and severity.
3. **Given** the same session, **When** the technician views the ABS card, **Then** it displays "Not scanned in MVP" in a muted/disabled visual style, with no fault codes listed.

---

### User Story 2 — View Scan Summary Statistics (Priority: P1)

At the top of the All Systems Scan view, the technician sees four summary cards: Total Modules Scanned (number of modules that have been scanned or have faults), Modules with Faults (count), Total Fault Codes (count), and Critical/Active Faults (count of ACTIVE status codes).

**Why this priority**: Summary cards provide the at-a-glance assessment that professional technicians expect. Without them, the control unit cards lack context.

**Independent Test**: With the same three fault codes as US1, verify the summary cards show: Modules Scanned = 2 (ECM, TCM), Modules with Faults = 2, Total Fault Codes = 3, Critical/Active Faults = 2.

**Acceptance Scenarios**:

1. **Given** a session with P0301 (ACTIVE, ECM), P0171 (PENDING, ECM), U0100 (ACTIVE, TCM), **When** the technician views the All Systems Scan, **Then** the summary cards show: Total Modules Scanned = 2, Modules with Faults = 2, Total Fault Codes = 3, Critical/Active Faults = 2.
2. **Given** a session with zero fault codes, **When** the technician views the All Systems Scan, **Then** the summary cards show: Total Modules Scanned = 0, Modules with Faults = 0, Total Fault Codes = 0, Critical/Active Faults = 0, and all 8 control unit cards show "Not scanned in MVP."

---

### User Story 3 — Navigate from Scan Results (Priority: P2)

On the All Systems Scan view, the technician can navigate to key actions: Back to OBD Dashboard, View Diagnostic Session, Start Live Data (links to live-data feature when available), Rescan, and Export/Report (disabled placeholder if not yet implemented).

**Why this priority**: Navigation is important for workflow continuity but is secondary to the core scan presentation. The feature is still valuable without these links.

**Independent Test**: Open the All Systems Scan view and verify that "Back to OBD Dashboard" and "View Diagnostic Session" links navigate correctly. Verify that "Start Live Data" is visible but links to the live-data feature placeholder. Verify that "Export/Report" is visible and disabled with a tooltip indicating it is not yet available.

**Acceptance Scenarios**:

1. **Given** the All Systems Scan view is displayed, **When** the technician clicks "Back to OBD Dashboard," **Then** the browser navigates to the OBD dashboard page.
2. **Given** the All Systems Scan view is displayed, **When** the technician clicks "View Diagnostic Session," **Then** the browser navigates to the diagnostic session detail page.
3. **Given** the All Systems Scan view is displayed, **When** the technician clicks "Rescan," **Then** a new OBD scan is initiated for the same vehicle/session.
4. **Given** the All Systems Scan view is displayed, **When** the technician sees the "Export/Report" button, **Then** it is visually disabled and shows a tooltip or label indicating it is not yet implemented.

---

### User Story 4 — View Fault Code Details Within a Control Unit Card (Priority: P2)

Within a control unit card that has faults, the technician sees each fault code with its code, title/description (from Fault Code Intelligence), status badge (ACTIVE, PENDING, STORED), system badge, and severity indicator. Unknown codes show "No description available."

**Why this priority**: Fault detail display within cards enhances the professional appearance and ensures the enrichment data from Feature 005 is surfaced in the new layout.

**Independent Test**: Open a session with P0301 (which has enrichment data). Verify the code row shows the title "Cylinder 1 Misfire Detected," an ACTIVE status badge, a POWERTRAIN system badge, and the severity indicator.

**Acceptance Scenarios**:

1. **Given** a session containing P0301 (ACTIVE, ECM) which exists in the fault code knowledge base, **When** the technician expands the ECM control unit card, **Then** P0301 is displayed with its enrichment title, description, ACTIVE status badge, POWERTRAIN system badge, and severity.
2. **Given** a session containing an unknown code X9999 (ACTIVE, ECM), **When** the technician expands the ECM control unit card, **Then** X9999 is displayed with "No description available," ACTIVE status badge, UNKNOWN system badge, and UNKNOWN severity.

---

### User Story 5 — View OBD Scan Results with Control Unit Layout (Priority: P1)

After completing an OBD scan from the OBD Dashboard, the post-scan results page (currently using `FaultCodeList` component) is updated to display the All Systems Scan layout instead of the flat ECU-grouped list.

**Why this priority**: The post-scan results page is the first thing a technician sees after running a scan. It must match the professional layout of the session detail page.

**Independent Test**: Initiate an OBD scan from the dashboard, wait for completion, and verify the results are presented in the All Systems Scan layout rather than the flat `FaultCodeList`.

**Acceptance Scenarios**:

1. **Given** a completed scan with fault codes, **When** the technician views the scan results on the OBD dashboard, **Then** the results are displayed in the All Systems Scan layout with control unit cards and summary statistics.
2. **Given** a completed scan with no fault codes, **When** the technician views the scan results, **Then** the All Systems Scan layout is still displayed with all 8 modules showing "Not scanned in MVP" and summary cards showing zero counts.

---

### User Story 6 — Understand MVP Limitations (Priority: P2)

A technician viewing the All Systems Scan sees a clear MVP limitation notice stating: "Some modules may require manufacturer-specific diagnostics and are shown as not scanned in this MVP."

**Why this priority**: Setting user expectations about which modules are actually scanned prevents confusion. This is a UX communication requirement, not core functionality.

**Independent Test**: Open the All Systems Scan view and verify the MVP notice is visible, readable, and clearly positioned near the control unit cards.

**Acceptance Scenarios**:

1. **Given** the All Systems Scan view is displayed, **When** the technician views the page, **Then** a clearly visible notice reads "Some modules may require manufacturer-specific diagnostics and are shown as not scanned in this MVP."
2. **Given** the All Systems Scan view is displayed on a mobile viewport, **When** the technician views the page, **Then** the MVP notice remains visible and legible.

---

### Edge Cases

- **Session with zero fault codes**: All 8 control unit cards show NOT_SCANNED status. Summary cards show all zeros. The page does not look empty or broken.
- **Session with only ECM codes (most common MVP case)**: ECM card shows FAULTS_FOUND with its codes. TCM card shows NOT_SCANNED. All other modules show NOT_SCANNED. The page does not look like only one module was considered.
- **Fault code with unknown ECU module code**: A fault code where the `ecu` field does not match any of the 8 known modules (e.g., ecu="UNKNOWN") is grouped into a generic "Unknown Control Unit" card rather than being lost or causing an error.
- **Empty or missing ecu field on a fault code**: Treated as unknown module and grouped into "Unknown Control Unit."
- **Rapid navigation between scan results and session detail**: Both pages render the All Systems Scan layout without layout shift or flash of flat-list content.
- **Very large number of fault codes (50+) in a single module**: The control unit card for that module remains usable — either collapsed by default or with a scrollable fault list.
- **Concurrent access to session by multiple users in same tenant**: Both users see the same All Systems Scan data; no stale or mismatched grouping.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST display fault codes grouped by vehicle control unit module (ECM, TCM, ABS, SRS, BCM, ESP, IC, HVAC) on both the Diagnostic Session detail page and the OBD scan results page, replacing or enhancing the current flat fault code list.
- **FR-002**: Each control unit card MUST display: module name, module short code, scan status (FAULTS_FOUND, NO_FAULTS, NOT_SCANNED, NOT_SUPPORTED), fault count, and fault codes under that module.
- **FR-003**: Control unit cards with FAULTS_FOUND status MUST be visually highlighted (distinct from healthy and muted cards).
- **FR-004**: Control unit cards with NO_FAULTS status MUST display "No faults detected" with a healthy/positive visual style.
- **FR-005**: Control unit cards with NOT_SCANNED status MUST display "Not scanned in MVP" in a muted/disabled visual style.
- **FR-006**: The All Systems Scan view MUST display four summary cards at the top: Total Modules Scanned, Modules with Faults, Total Fault Codes, and Critical/Active Faults.
- **FR-007**: Each fault code within a control unit card MUST display: code, title/description (from Fault Code Intelligence enrichment), status badge (ACTIVE, PENDING, STORED/PERMANENT), system badge, and severity indicator if available.
- **FR-008**: The system MUST provide a frontend helper function that converts a flat list of FaultCode objects into an array of ControlUnitResult objects, grouping fault codes by their ECU module field.
- **FR-009**: Fault codes whose ECU field does not match any of the 8 known modules MUST be grouped under an "Unknown Control Unit" card rather than being discarded or causing an error.
- **FR-010**: The All Systems Scan view MUST display an MVP limitation notice: "Some modules may require manufacturer-specific diagnostics and are shown as not scanned in this MVP."
- **FR-011**: The All Systems Scan view MUST provide navigation links: Back to OBD Dashboard, View Diagnostic Session, Start Live Data, and Rescan.
- **FR-012**: The "Export/Report" action MUST be displayed as a disabled placeholder button with a tooltip indicating it is not yet implemented.
- **FR-013**: The page MUST NOT look empty when only ECM codes exist. All 8 module cards must render regardless of how many modules have fault codes.
- **FR-014**: The frontend helper MUST treat an empty or missing `ecu` field on a fault code as belonging to the "Unknown Control Unit" group.
- **FR-015**: Modules that have no fault codes in the current data and are not part of the scanned ECU set MUST be shown with NOT_SCANNED status by default in the MVP.
- **FR-016**: The feature MUST NOT introduce any new database tables or modify the existing Prisma schema. A backend response-level derived `controlUnitResults` field is permitted but MUST NOT be a persistent entity.
- **FR-017**: The feature MUST NOT implement real ECU topology scanning, manufacturer-specific diagnostics, ABS/SRS/BCM hardware communication, coding, programming, flashing, service functions, reports, AI analysis, or graphing.
- **FR-018**: The Diagnostic Session detail page and the OBD scan results page MUST render the same All Systems Scan component. The component MUST be reusable across both contexts with different data sources (session fault codes vs. scan results).
- **FR-019**: Fault codes with the STORED status (equivalent to PERMANENT in the backend enum) MUST be displayed with a STORED label in the UI for clarity.
- **FR-020**: The All Systems Scan component MUST be responsive and remain usable on mobile viewports (cards stack vertically, summary cards wrap, MVP notice remains visible).

### Key Entities *(include if feature involves data)*

- **ControlUnitResult** (frontend-only data shape, not a stored entity): Represents a single control unit in the scan results. Attributes: `code` (short code, e.g., "ECM"), `name` (full name, e.g., "Engine Control Module"), `status` (FAULTS_FOUND | NO_FAULTS | NOT_SCANNED | NOT_SUPPORTED), `faults` (array of FaultCode objects belonging to this module).
- **ControlUnitModule** (frontend-only constant): Defines the 8 known control unit modules and their short codes and full names. ECM — Engine Control Module, TCM — Transmission Control Module, ABS — Anti-lock Brake System, SRS — Airbag / Supplemental Restraint System, BCM — Body Control Module, ESP — Electronic Stability Program, IC — Instrument Cluster, HVAC — Climate Control.
- **ScanSummary** (frontend-only derived shape): Summary statistics for the All Systems Scan view. Attributes: `totalModulesScanned`, `modulesWithFaults`, `totalFaultCodes`, `criticalActiveFaults`.
- **FaultCode** (existing frontend type, unchanged): The enriched fault code type from Feature 005 with code, status, ecu, title, description, system, severity fields.
- **FaultCodeCard** (UI component): A reusable component for rendering a single fault code with its code, title, status badge, system badge, and severity indicator. Used within each ControlUnitResult card.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A technician can open a diagnostic session with 3 fault codes (P0301 ACTIVE ECM, P0171 PENDING ECM, U0100 ACTIVE TCM) and see 8 control unit cards, with ECM showing 2 faults, TCM showing 1 fault, and the remaining 6 modules showing "Not scanned in MVP."
- **SC-002**: The summary cards at the top of the All Systems Scan view correctly display: Total Modules Scanned = 2, Modules with Faults = 2, Total Fault Codes = 3, Critical/Active Faults = 2 for the same session.
- **SC-003**: A diagnostic session with zero fault codes renders the All Systems Scan layout without appearing broken or empty, showing all 8 modules as "Not scanned in MVP" and all summary counts as zero.
- **SC-004**: A fault code with an unrecognized or missing ECU field is grouped under an "Unknown Control Unit" card and does not cause a rendering error.
- **SC-005**: The All Systems Scan component renders correctly on both the Diagnostic Session detail page and the OBD scan results page with the same visual layout.
- **SC-006**: The MVP limitation notice is visible and legible on both desktop and mobile viewports.
- **SC-007**: Navigation links (Back to OBD Dashboard, View Diagnostic Session, Start Live Data, Rescan) function correctly and route to the expected pages.
- **SC-008**: The existing Feature 004 and Feature 005 scan and enrichment flows continue to work unchanged after this feature ships. Existing tests for fault code enrichment, scan results, and session fault codes continue to pass.

## Assumptions

- The current `FaultCode` type (with `ecu` field from Feature 004) is the source of truth for which module a fault code belongs to. The 8 known module short codes (ECM, TCM, ABS, SRS, BCM, ESP, IC, HVAC) are defined as a frontend constant; they are not sourced from a database table.
- In the MVP, modules without fault codes in the scan data are assumed NOT_SCANNED rather than NO_FAULTS, because the current OBD-II adapter only scans the engine and transmission modules. This assumption may be revisited when manufacturer-specific ECU scanning is added in a future feature.
- The `ecu` field on `SessionFaultCode` stores the module short code (e.g., "ECM", "TCM") as populated by the OBD scan import. The grouping helper matches against this field case-insensitively.
- The PERMANENT fault code status from the backend enum is displayed as "STORED" in the UI for clarity, as professional diagnostic tools use "Stored" rather than "Permanent" for this category.
- The "Start Live Data" link points to the Live Data feature (Feature 006). If that feature is not yet available, the link navigates to the live data page placeholder or shows a coming-soon state.
- The "Export/Report" button is disabled because the Reports feature (Feature 008 in the roadmap) is not yet implemented.
- No backend schema changes are needed. The `controlUnitResults` grouping is computed entirely on the frontend from the existing `FaultCode[]` array. An optional backend derived field may be added during planning/implementation if it simplifies the API response, but it MUST NOT introduce a new database table.
- The All Systems Scan layout replaces the current `FaultCodeList` component on the OBD scan results page and replaces the flat fault code `<ul>` on the Diagnostic Session detail page. The `EnrichedFaultCodeRow` component is reused within the new `FaultCodeCard` component.
- The 8 module definitions (ECM, TCM, ABS, SRS, BCM, ESP, IC, HVAC) are a static, frontend-defined list. They are not dynamically loaded from the backend. This list may be expanded in future features when manufacturer-specific diagnostics are added.

## Out of Scope (Confirmed Exclusions)

Feature 007 explicitly does **NOT** include any of the following; they remain in future roadmap phases:

- **Real ECU topology scan** — dynamically discovering which modules exist in a specific vehicle
- **Manufacturer-specific diagnostics** — Mercedes, BMW, Toyota OEM protocols
- **ABS/SRS/BCM actual hardware communication** — real bi-directional control
- **Coding, programming, or ECU flashing**
- **Service functions** (throttle adaptation, steering angle reset, etc.)
- **Freeze frame data**
- **Reports and PDF export** (Feature 008 — Reports)
- **AI Analysis** (Feature 007 — AI Analysis in the roadmap, separate from this 007 spec number)
- **Graphing** of live or historical sensor data
- **Live data / PID streaming** (Feature 006 — Live Data & Sensor Monitoring)
- **PrioraFlow integration** (Feature 009)