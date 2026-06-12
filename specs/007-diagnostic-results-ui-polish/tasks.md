# Tasks: Diagnostic Results UI Polish + Control Unit Overview

**Input**: Design documents from `/specs/007-diagnostic-results-ui-polish/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Included — the spec explicitly requires frontend unit tests for grouping logic, summary calculations, and component rendering.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Frontend**: `frontend/src/` (components, lib, hooks, app)
- **Frontend Tests**: `frontend/tests/unit/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the foundational types, constants, and data-shaping helper that all user stories depend on.

- [x] T001 [P] Create control unit types and constants in `frontend/src/lib/control-units.ts` — Define `ControlUnitStatus`, `ControlUnitModule`, `ControlUnitResult`, `ControlUnitSummary` types; define `CONTROL_UNIT_MODULES` constant array with 8 known modules (ECM, TCM, ABS, SRS, BCM, ESP, IC, HVAC) including `group` field (`OBD_II` or `OEM_DIAGNOSTICS`); define `OBD_II_ECU_CODES` set defaulting to `['ECM', 'TCM']`
- [x] T002 Create `buildControlUnitOverview()` function in `frontend/src/lib/control-units.ts` — Pure function that takes `FaultCode[]` and optional `Set<string>` of scanned ECU codes; groups fault codes by `ecu` field (case-insensitive); creates known module cards with proper status logic (OBD_II modules: FAULTS_FOUND/NO_FAULTS/NOT_SCANNED; OEM_DIAGNOSTICS modules: FAULTS_FOUND/OEM_DIAGNOSTICS_REQUIRED); creates dynamic cards for unmatched ECU codes; returns `ControlUnitResult[]`
- [x] T003 Create `computeControlUnitSummary()` function in `frontend/src/lib/control-units.ts` — Pure function that takes `ControlUnitResult[]` and returns `ControlUnitSummary` with `modulesWithFaults`, `totalFaultCodes`, `genericObdModulesChecked`, `oemDiagnosticsRequired`
- [x] T004 [P] Create status label and badge helpers in `frontend/src/lib/control-units.ts` — `getControlUnitStatusLabel(status)` returning display text; `getControlUnitStatusBadgeClass(status)` returning Tailwind CSS classes; `getControlUnitName(ecuCode)` returning full module name or "Unknown / Unmapped Control Unit"
- [x] T005 Write unit tests for control unit grouping logic in `frontend/tests/unit/control-units.test.ts` — Test: groups ECM faults correctly; groups TCM faults correctly; renders ECM/TCM as NO_FAULTS when no faults exist; renders ABS/SRS/BCM/ESP/IC/HVAC as OEM_DIAGNOSTICS_REQUIRED; creates dynamic card for unknown ECU like RADAR; groups missing/null ECU into UNKNOWN; calculates summary counts correctly; handles empty fault list (returns 8 modules all with appropriate default statuses)

**Checkpoint**: `control-units.ts` and its tests are complete. All grouping and summary logic is verified. User story implementation can now begin.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create the reusable UI components that all user stories share.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T006 [P] Create `FaultCodeCard` component in `frontend/src/components/obd/FaultCodeCard.tsx` — Props: `{ code: FaultCode }`; renders a single fault code row with code badge (monospace), status badge (ACTIVE=red, PENDING=amber, PERMANENT→STORED=slate), system badge (colored by system), severity badge (colored by severity), title/description (or "No description available" fallback); reuses `readEnrichment()`, `severityBadgeClass()`, `systemBadgeClass()` from `lib/fault-codes.ts`; responsive layout (stacked on mobile, row on desktop)
- [x] T007 [P] Create `ControlUnitCard` component in `frontend/src/components/obd/ControlUnitCard.tsx` — Props: `{ result: ControlUnitResult; defaultExpanded?: boolean }`; renders card with module header (code visually prominent, name, status badge, fault count); expandable/collapsible fault list using `FaultCodeCard` for each fault; status-specific messaging: FAULTS_FOUND=red border, NO_FAULTS="No faults detected" green, OEM_DIAGNOSTICS_REQUIRED="Manufacturer-specific diagnostics required" amber muted, NOT_SCANNED="Not scanned" gray muted; uses Lucide icons (AlertTriangle, CheckCircle, Lock, MinusCircle)
- [x] T008 [P] Create `ControlUnitSummaryCards` component in `frontend/src/components/obd/ControlUnitSummaryCards.tsx` — Props: `{ summary: ControlUnitSummary }`; renders 4 cards in responsive grid (2×2 mobile, 4-across desktop): Modules with Faults, Total Fault Codes, Generic OBD Modules Checked (showing "ECM, TCM"), OEM Diagnostics Required; each card has numeric value and label; uses `rounded-xl border border-slate-200 bg-white p-4 shadow-sm` consistent with existing card styling
- [x] T009 [P] Create `MvpNoticeBanner` component in `frontend/src/components/obd/MvpNoticeBanner.tsx` — Renders a styled info banner: "Generic OBD-II provides emissions and powertrain diagnostics only. ABS, SRS, BCM, ESP, HVAC and other body/chassis modules require manufacturer-specific diagnostics."; uses neutral/blue background with info icon; responsive text sizing

**Checkpoint**: All foundational components are ready. User story implementation can now begin in parallel.

---

## Phase 3: User Story 1 — View Control Unit Overview Layout (Priority: P1) 🎯 MVP

**Goal**: Replace the flat fault code list with a structured Control Unit Overview showing 8 control unit cards, with faults grouped by module and honest status labels (FAULTS_FOUND, NO_FAULTS, OEM_DIAGNOSTICS_REQUIRED).

**Independent Test**: Create a session with P0301 (ACTIVE, ECM), P0171 (PENDING, ECM), U0100 (ACTIVE, TCM). Open the session detail page. Verify 8 control unit cards render, ECM shows 2 faults, TCM shows 1 fault, and the other 6 modules show OEM_DIAGNOSTICS_REQUIRED.

### Implementation for User Story 1

- [x] T010 [US1] Create `ControlUnitOverview` component in `frontend/src/components/obd/ControlUnitOverview.tsx` — Top-level component; props: `{ faultCodes: FaultCode[]; scannedEcuCodes?: Set<string>; sessionId?: string; scanJobId?: string; vehicleId?: string; showNavigation?: boolean; title?: string }`; internally calls `buildControlUnitOverview()` and `computeControlUnitSummary()`; renders: `<ControlUnitSummaryCards>`, `<MvpNoticeBanner>`, section title "Control Unit Overview", grid of `<ControlUnitCard>` components (responsive 1-col mobile, 2-col desktop); FAULTS_FOUND cards are expanded by default, others collapsed
- [x] T011 [US1] Integrate `ControlUnitOverview` into Diagnostic Session detail page in `frontend/src/app/diagnostic-sessions/[sessionId]/page.tsx` — Replace the existing flat `<ul className="mt-4 divide-y divide-slate-100">` section that renders `EnrichedFaultCodeRow` items with `<ControlUnitOverview faultCodes={faultCodes} sessionId={sessionId} showNavigation={true} />`; keep the existing section heading structure but update it to use the new component; remove the conditional rendering that hides the section when fault codes are empty — ControlUnitOverview should always render (shows all 8 modules even with zero faults)
- [x] T012 [US1] Write component test for ControlUnitOverview in `frontend/tests/unit/ControlUnitOverview.test.tsx` — Test: renders 8 control unit cards with sample fault codes; renders all 8 module cards even with empty fault list; passes correct props to ControlUnitSummaryCards; renders MVP notice banner; does not render misleading "All systems scanned" wording

**Checkpoint**: User Story 1 is complete. The Diagnostic Session detail page now shows the Control Unit Overview instead of a flat list.

---

## Phase 4: User Story 2 — View Scan Summary Statistics (Priority: P1)

**Goal**: Display four summary cards at the top of the Control Unit Overview showing modules with faults, total fault codes, generic OBD modules checked, and OEM diagnostics required.

**Independent Test**: With P0301 (ACTIVE, ECM), P0171 (PENDING, ECM), U0100 (ACTIVE, TCM), verify summary cards show: Modules with Faults=2, Total Fault Codes=3, Generic OBD Modules Checked="ECM, TCM", OEM Diagnostics Required=6.

### Implementation for User Story 2

- [x] T013 [US2] Verify `ControlUnitSummaryCards` renders correct summary values in `frontend/src/components/obd/ControlUnitSummaryCards.tsx` — The component was created in T008. This task verifies it correctly computes and displays: `modulesWithFaults`, `totalFaultCodes`, `genericObdModulesChecked` (as "ECM, TCM" label), `oemDiagnosticsRequired`. Ensure the grid is responsive and cards use consistent styling with the rest of the page.
- [x] T014 [US2] Write test for summary calculation in `frontend/tests/unit/control-units.test.ts` — Add tests to the existing test file: verify `computeControlUnitSummary()` returns correct values for sessions with 3 fault codes across 2 modules; verify it returns all zeros for empty fault list; verify it counts `OEM_DIAGNOSTICS_REQUIRED` modules correctly (should be 6 for the default 8-module catalog)

**Checkpoint**: User Story 2 is complete. Summary cards display correctly at the top of both the session detail and OBD dashboard pages.

---

## Phase 5: User Story 3 — Navigate from Scan Results (Priority: P2)

**Goal**: Add navigation links to the Control Unit Overview: Back to OBD Dashboard, View Diagnostic Session, Start Live Data, Rescan, and Export/Report (disabled placeholder).

**Independent Test**: Open the Control Unit Overview on the OBD dashboard. Click "Back to OBD Dashboard" and verify navigation. Click "View Diagnostic Session" and verify navigation. Verify "Export/Report" is disabled.

### Implementation for User Story 3

- [x] T015 [US3] Add navigation actions section to `ControlUnitOverview` component in `frontend/src/components/obd/ControlUnitOverview.tsx` — Below the control unit cards grid, add a navigation section with: "Back to OBD Dashboard" link (`/obd`), "View Diagnostic Session" link (`/diagnostic-sessions/{sessionId}`), "Start Live Data" link (`/obd/live-data` or placeholder), "Rescan" button (triggers scan re-initiation), "Export/Report" button (disabled, with tooltip "Not yet available"). Use Next.js `Link` component for navigation links. Only render navigation when `showNavigation` prop is true.
- [x] T016 [US3] Write test for navigation rendering in `frontend/tests/unit/ControlUnitOverview.test.tsx` — Add tests to the existing test file: verify "Back to OBD Dashboard" link is present; verify "View Diagnostic Session" link points to correct session URL; verify "Export/Report" button is disabled; verify navigation section is hidden when `showNavigation={false}`

**Checkpoint**: User Story 3 is complete. Navigation links are present and functional.

---

## Phase 6: User Story 4 — View Fault Code Details in Control Unit Cards (Priority: P2)

**Goal**: Ensure each fault code within a control unit card shows code, title/description, status badge, system badge, and severity indicator. Unknown codes show "No description available."

**Independent Test**: Open a session with P0301 (ACTIVE, ECM). Expand the ECM card. Verify the fault row shows the enriched title, ACTIVE status badge, POWERTRAIN system badge, and severity indicator. Add an unknown code and verify "No description available."

### Implementation for User Story 4

- [x] T017 [US4] Verify `FaultCodeCard` renders all fault code fields correctly in `frontend/src/components/obd/FaultCodeCard.tsx` — The component was created in T006. This task verifies: code badge renders in monospace; status badge renders with correct color (ACTIVE=red, PENDING=amber, PERMANENT→"STORED"=slate); system badge renders with correct color; severity badge renders; title renders from enrichment; description renders from enrichment; unknown codes show "No description available." with italic styling
- [x] T018 [US4] Write test for FaultCodeCard in `frontend/tests/unit/FaultCodeCard.test.tsx` — Test: renders enriched fault code with title and description; renders unknown code with "No description available"; renders ACTIVE status badge in red; renders PENDING status badge in amber; renders PERMANENT status badge labeled "STORED" in slate; renders system badge for POWERTRAIN; renders severity badge for UNKNOWN

**Checkpoint**: User Story 4 is complete. Fault code details are fully visible within control unit cards.

---

## Phase 7: User Story 5 — OBD Scan Results with Control Unit Layout (Priority: P1)

**Goal**: Replace the `FaultCodeList` component on the OBD dashboard page with the `ControlUnitOverview` component so post-scan results display in the professional layout.

**Independent Test**: Start an OBD scan from the dashboard, wait for completion, verify results are presented in the Control Unit Overview layout instead of the flat FaultCodeList.

### Implementation for User Story 5

- [x] T019 [US5] Integrate `ControlUnitOverview` into OBD dashboard page in `frontend/src/app/obd/page.tsx` — Replace the `<FaultCodeList scanJobId={...} />` component (conditionally rendered when scan is completed) with `<ControlUnitOverview faultCodes={faultCodes} scanJobId={activeScanId} showNavigation={true} />`; extract fault codes from the `useScanResults` hook response; keep the existing conditional rendering based on scan completion status; remove or comment out the `FaultCodeList` import
- [x] T020 [US5] Handle empty scan results in OBD dashboard integration — Ensure that when a scan completes with zero fault codes, the `ControlUnitOverview` still renders with all 8 modules showing appropriate statuses (ECM/TCM as NO_FAULTS, others as OEM_DIAGNOSTICS_REQUIRED); verify the "Open Session" link card still appears when a `diagnosticSessionId` exists

**Checkpoint**: User Story 5 is complete. The OBD dashboard post-scan results now display in the Control Unit Overview layout.

---

## Phase 8: User Story 6 — MVP Limitation Notice (Priority: P2)

**Goal**: Display a clear notice on the Control Unit Overview page explaining that generic OBD-II only provides emissions and powertrain diagnostics.

**Independent Test**: Open the Control Unit Overview on any device. Verify the notice is visible, readable, and correctly states the OBD-II limitation. Verify it remains visible on mobile viewports.

### Implementation for User Story 6

- [x] T021 [US6] Verify `MvpNoticeBanner` renders correct notice text and is responsive — The component was created in T009. This task verifies: notice text reads exactly "Generic OBD-II provides emissions and powertrain diagnostics only. ABS, SRS, BCM, ESP, HVAC and other body/chassis modules require manufacturer-specific diagnostics."; banner uses consistent styling (rounded border, info icon, neutral background); text remains legible on mobile viewports; no misleading text like "All systems scanned" or "No faults" for unscanned modules

**Checkpoint**: User Story 6 is complete. The MVP limitation notice is visible and accurate.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final refinements, responsive testing, and documentation updates.

- [x] T022 [P] Update spec.md status to reflect implementation complete in `specs/007-diagnostic-results-ui-polish/spec.md` — Change status from "Draft" to "Implemented" or appropriate status
- [x] T023 [P] Verify responsive layout across all new components — Test ControlUnitOverview on mobile (375px), tablet (768px), and desktop (1280px) viewports; verify summary cards wrap correctly; verify control unit cards stack on mobile and grid on desktop; verify fault code cards within control unit cards are readable on mobile; verify MVP notice banner text wraps gracefully
- [x] T024 [P] Verify no misleading wording across the entire UI — Search all new component files for text like "All systems scanned", "No faults" (when referring to unscanned modules), or "Not scanned in MVP"; replace with honest wording per the spec (OEM_DIAGNOSTICS_REQUIRED status, "Manufacturer-specific diagnostics required", "Generic OBD-II provides emissions and powertrain diagnostics only")
- [x] T025 [P] Verify `FaultCodeList` component is retained but unused in `frontend/src/components/obd/FaultCodeList.tsx` — The component remains in the codebase for backward compatibility but is no longer rendered by default; verify no other component imports or renders `FaultCodeList` in the main user flow; verify no console errors from the unused component

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion (needs `ControlUnitResult` type and `buildControlUnitOverview()` function)
- **User Stories (Phases 3-8)**: All depend on Phase 2 completion (need the foundational components)
  - US1 (Phase 3) and US5 (Phase 7) both modify pages — US1 should complete first as it establishes the integration pattern
  - US2 (Phase 4) is already implemented within US1 since `ControlUnitSummaryCards` is part of the `ControlUnitOverview` component
  - US3 (Phase 5) adds navigation to the component created in US1
  - US4 (Phase 6) verifies the `FaultCodeCard` created in Phase 2
  - US6 (Phase 8) verifies the banner created in Phase 2

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2. Core component creation and session page integration.
- **US2 (P1)**: Depends on Phase 2. Summary cards are built into `ControlUnitOverview` — verified as part of US1's component but tested separately.
- **US3 (P2)**: Depends on US1. Navigation actions are added to the `ControlUnitOverview` component created in US1.
- **US4 (P2)**: Depends on Phase 2. Fault code display is verified within the `FaultCodeCard` created in Phase 2.
- **US5 (P1)**: Depends on US1 and US3 for the complete `ControlUnitOverview` component. OBD dashboard integration follows the pattern established in US1.
- **US6 (P2)**: Depends on Phase 2. MVP notice banner is verified as part of the component created in Phase 2.

### Within Each Phase

- Phase 1 tasks T001-T004 can run in parallel (different functions in same file — write them together)
- Phase 1 task T005 (tests) should run after T001-T004
- Phase 2 tasks T006-T009 can run in parallel (different component files)
- Phase 3: T010 first, then T011 (depends on T010), then T012 (depends on T010-T011)
- Phase 5-8 are verification tasks that depend on earlier phases

### Parallel Opportunities

- Phase 1: T001, T002, T003, T004 can be written together (same file)
- Phase 2: T006, T007, T008, T009 can be written in parallel (different files)
- Phase 3-8: Must run sequentially as each builds on the previous

---

## Parallel Example: Phase 2 (Foundational Components)

```text
# All four components are independent files — can be created in parallel:
T006: FaultCodeCard.tsx        (uses FaultCode type + readEnrichment helper)
T007: ControlUnitCard.tsx      (uses ControlUnitResult type + FaultCodeCard)
T008: ControlUnitSummaryCards.tsx (uses ControlUnitSummary type)
T009: MvpNoticeBanner.tsx     (static content, no types)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup → `control-units.ts` with types, constants, helpers, and tests
2. Complete Phase 2: Foundational → All 4 UI components
3. Complete Phase 3: US1 → `ControlUnitOverview` component + session page integration
4. **STOP and VALIDATE**: Open a session with fault codes, verify 8 module cards render
5. The session detail page now shows a professional Control Unit Overview

### Incremental Delivery

1. Phases 1-3 → US1 complete (Control Unit Overview on session detail page)
2. Phase 4 → US2 verified (summary cards display correct counts)
3. Phase 5 → US3 added (navigation links)
4. Phase 6 → US4 verified (fault code details in cards)
5. Phase 7 → US5 complete (OBD dashboard also uses Control Unit Overview)
6. Phase 8 → US6 verified (MVP notice is visible and accurate)
7. Phase 9 → Polish and cross-cutting concerns addressed

### Parallel Team Strategy

With multiple developers:
1. Team completes Phases 1-2 together (foundation)
2. Once foundation is done:
   - Developer A: US1 (ControlUnitOverview + session page integration)
   - Developer B: US4 (FaultCodeCard verification and tests)
3. After US1:
   - Developer A: US3 (navigation actions)
   - Developer B: US5 (OBD dashboard integration)
4. Final: US2 and US6 verification + Polish

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- The `PERMANENT` fault code status is displayed as "STORED" in the UI per the spec
- `FaultCodeList` component is retained but no longer rendered by default
- `EnrichedFaultCodeRow` component is retained and its badge helpers are reused in `FaultCodeCard`
- No backend changes, no new API endpoints, no database migrations
- All new code is in `frontend/src/` only