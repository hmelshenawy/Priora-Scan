# PrioraScan Frontend Improvement Plan

## Phase 1 — Navigation & Workflow Fixes

### Goal

Make the app feel like one connected workshop tool instead of disconnected pages.

### User Problem Solved

Technicians currently lose context when moving between vehicles, scans, sessions, and live data. They need persistent navigation, clear back paths, and context-aware actions.

### Exact Files Likely Affected

- `frontend/src/app/layout.tsx`
- `frontend/src/app/page.tsx`
- `frontend/src/app/vehicles/page.tsx`
- `frontend/src/app/vehicles/[id]/page.tsx`
- `frontend/src/app/vehicles/[id]/sessions/page.tsx`
- `frontend/src/app/diagnostic-sessions/page.tsx`
- `frontend/src/app/diagnostic-sessions/[sessionId]/page.tsx`
- `frontend/src/app/obd/page.tsx`
- `frontend/src/components/auth/auth-provider.tsx`
- `frontend/src/hooks/use-auth.ts`
- New likely files:
  - `frontend/src/components/layout/AppShell.tsx`
  - `frontend/src/components/layout/Sidebar.tsx`
  - `frontend/src/components/layout/Topbar.tsx`
  - `frontend/src/components/layout/PageHeader.tsx`
  - `frontend/src/components/layout/Breadcrumbs.tsx`
  - `frontend/src/components/diagnostic-session/DiagnosticSessionsList.tsx`

### Proposed UI Changes

- Add a shared authenticated app shell with sidebar navigation.
- Add primary nav items: Vehicles and Diagnostics.
- Under Diagnostics, add OBD Dashboard and Diagnostic Sessions.
- Add a global Diagnostic Sessions list page so users can find sessions without first opening a vehicle.
- Add secondary/context slots for current vehicle/session later, without requiring backend changes.
- Add active route highlighting.
- Add logout/user menu using existing auth hooks.
- Convert full reload navigation to Next.js `Link` or router navigation.
- Replace missing `/obd/live-data` links with session-aware navigation to the diagnostic session live-data section.
- Remove or defer `?rescan=` links unless the dashboard handles them.
- Standardize page headers with title, subtitle, breadcrumbs, and action area.
- Use session list columns: Session #, Vehicle, Status, Fault Count, Created, Actions.

### Acceptance Criteria

- Authenticated pages render inside a consistent app shell.
- User can navigate to Vehicles and OBD Dashboard from every authenticated page.
- User can navigate to Diagnostic Sessions from the sidebar.
- Diagnostic Sessions page lists sessions in a scannable table with Session #, Vehicle, Status, Fault Count, Created, and Actions.
- Active route is visually clear.
- Existing auth protection still works.
- Back links and breadcrumbs use specific context where available.
- No route links point to pages that do not exist.
- No scan, backend, or schema behavior changes are introduced.

### Risks / Things Not To Change

- Do not change authentication API behavior.
- Do not remove the current home, OBD, vehicle, or session routes.
- Do not introduce new backend endpoints.
- If no global session-list endpoint exists, keep this frontend-only by using existing accessible data or leave the page wired as a planned UI shell; do not add backend work in Phase 1.
- Keep the shell lightweight; avoid a large redesign before workflows are clarified.

## Phase 2 — Diagnostic Session UX

### Goal

Turn diagnostic session detail into the main technician workspace for a job.

### User Problem Solved

The session page currently has the right ingredients but weak hierarchy. Users need to understand the vehicle, session status, fault results, and live data without scanning unrelated cards.

### Exact Files Likely Affected

- `frontend/src/app/diagnostic-sessions/[sessionId]/page.tsx`
- `frontend/src/components/obd/ControlUnitOverview.tsx`
- `frontend/src/components/live-data/LiveDataCard.tsx`
- `frontend/src/hooks/use-diagnostic-sessions.ts`
- `frontend/src/hooks/useObdScan.ts`
- `frontend/src/hooks/use-vehicles.ts`
- New likely files:
  - `frontend/src/components/diagnostic-session/SessionHeader.tsx`
  - `frontend/src/components/diagnostic-session/SessionLifecyclePanel.tsx`
  - `frontend/src/components/diagnostic-session/SessionNotesForm.tsx`
  - `frontend/src/components/ui/StatusBadge.tsx`
  - `frontend/src/components/ui/LoadingState.tsx`
  - `frontend/src/components/ui/ErrorState.tsx`

### Proposed UI Changes

- Add a session header showing session number, status, vehicle context, and primary action.
- Link back to the specific vehicle detail page, not just Vehicles.
- Reorganize page into sections or tabs: Overview, Control Units, Live Data, Notes.
- Move lifecycle actions into the header or a compact side panel.
- Add independent loading/error states for fault-code data.
- Keep `ControlUnitOverview`, but remove duplicated navigation when embedded in session detail.
- Add an anchor target for live data so other links can go to `#live-data`.
- Improve closed session state with read-only visual treatment.

### Acceptance Criteria

- Session detail immediately shows what vehicle and session the technician is working on.
- Fault-code loading does not masquerade as zero faults.
- Control unit results and live data are easy to find.
- Users can return to the related vehicle in one click.
- Session lifecycle behavior remains unchanged.
- Existing live-data start/stop behavior remains unchanged.

### Risks / Things Not To Change

- Do not change diagnostic session status rules.
- Do not change scan/fault-code APIs.
- Do not add reports, AI, graphing, or snapshots.
- Do not remove title/description editing.

## Phase 3 — OBD Dashboard UX

### Goal

Make `/obd` feel like a guided scan command center.

### User Problem Solved

The current dashboard has the pieces needed to start a scan, but it does not clearly guide the user through agent readiness, adapter readiness, scanning, confirmation, and results.

### Exact Files Likely Affected

- `frontend/src/app/obd/page.tsx`
- `frontend/src/components/obd/AgentStatusCard.tsx`
- `frontend/src/components/obd/ScanControlPanel.tsx`
- `frontend/src/components/obd/ScanProgressTimeline.tsx`
- `frontend/src/components/obd/VehicleConfirmModal.tsx`
- `frontend/src/components/obd/PairAgentModal.tsx`
- `frontend/src/components/obd/ControlUnitOverview.tsx`
- `frontend/src/hooks/useObdScan.ts`
- `frontend/src/hooks/useAgentStatus.ts`
- `frontend/src/hooks/useAdapterStatus.ts`
- New likely files:
  - `frontend/src/components/obd/ObdReadinessPanel.tsx`
  - `frontend/src/components/obd/ScanResultActions.tsx`
  - `frontend/src/components/obd/ScanEmptyState.tsx`

### Proposed UI Changes

- Add a readiness checklist: agent paired, agent online, adapter connected.
- Make primary scan action explicit and explain why it is disabled.
- Add meaningful initial empty state before a scan starts.
- Make failed/cancelled scan states action-oriented: Retry, Start New Scan, Check Agent.
- Remove duplicated completed scan action cards.
- Move completed results into a wider results section.
- Make "Open Session" and "Start Live Data" session-aware.
- Do not show "Rescan" unless it actually starts a new scan or is wired to a clear handler.

### Acceptance Criteria

- OBD dashboard shows the next step before, during, and after a scan.
- Disabled scan button always has a visible reason.
- Failed and cancelled scans have recovery actions.
- Completed scans show a clear path to the diagnostic session.
- No missing routes are linked.
- Existing scan start, cancel, confirm vehicle, and results behavior remains unchanged.

### Risks / Things Not To Change

- Do not change scan logic or polling cadence.
- Do not change agent pairing backend behavior.
- Do not implement real ECU discovery.
- Do not persist active scan state unless it can be done using existing frontend route/query state only.

## Phase 4 — Live Data UX

### Goal

Make live data feel like an intentional diagnostic mode, not a small afterthought card.

### User Problem Solved

Users can start live data, but the UI gives limited context about agent choice, status, stale/stopped states, and what the values mean.

### Exact Files Likely Affected

- `frontend/src/components/live-data/LiveDataCard.tsx`
- `frontend/src/hooks/useLiveData.ts`
- `frontend/src/app/diagnostic-sessions/[sessionId]/page.tsx`
- `frontend/src/components/obd/ControlUnitOverview.tsx`
- New likely files:
  - `frontend/src/components/live-data/LiveDataControls.tsx`
  - `frontend/src/components/live-data/LiveDataRow.tsx`
  - `frontend/src/components/live-data/LiveDataStatusBanner.tsx`
  - `frontend/src/components/live-data/LiveDataEmptyState.tsx`

### Proposed UI Changes

- Split `LiveDataCard` into controls, rows, and state banners.
- Show selected/running agent in active state.
- Add clearer offline/no-agent/offline-agent states.
- Add a cadence selector using the existing `cadenceMs` hook support, clamped by existing backend behavior.
- Improve stopped/stale states with Restart action.
- Add last-updated freshness warning when values are old.
- Keep values as simple numeric tiles; do not add graphing.
- Update all live-data links to point to the session live-data section.

### Acceptance Criteria

- Live data has clear Not Started, Starting, Active, Stopped, Stale/Error states.
- Users can understand why live data cannot start.
- Users can restart after stopped/stale states.
- Cadence can be selected without backend changes beyond existing endpoint support.
- No graphing, reports, AI, snapshots, or real ECU discovery is added.

### Risks / Things Not To Change

- Do not change live-data backend logic.
- Do not add new PID discovery.
- Do not add charting.
- Do not imply unsupported PIDs are actually discovered.

## Phase 5 — Vehicle UX

### Goal

Make the vehicle record the natural starting point for workshop work.

### User Problem Solved

Vehicle pages currently show basic stored data but do not guide users into sessions, scans, or diagnostic history.

### Exact Files Likely Affected

- `frontend/src/app/vehicles/page.tsx`
- `frontend/src/app/vehicles/new/page.tsx`
- `frontend/src/app/vehicles/[id]/page.tsx`
- `frontend/src/app/vehicles/[id]/edit/page.tsx`
- `frontend/src/app/vehicles/[id]/sessions/page.tsx`
- `frontend/src/components/vehicles/vehicle-list-table.tsx`
- `frontend/src/components/vehicles/vehicle-search-filters.tsx`
- `frontend/src/components/vehicles/vehicle-form.tsx`
- `frontend/src/components/vehicles/vehicle-history-placeholder.tsx`
- `frontend/src/components/vehicles/vin-decode-button.tsx`
- `frontend/src/hooks/use-vehicles.ts`
- `frontend/src/hooks/use-diagnostic-sessions.ts`
- New likely files:
  - `frontend/src/components/vehicles/VehicleDetailHeader.tsx`
  - `frontend/src/components/vehicles/VehicleSessionList.tsx`
  - `frontend/src/components/vehicles/VehicleMobileCardList.tsx`
  - `frontend/src/components/vehicles/VehicleActions.tsx`

### Proposed UI Changes

- Add action buttons on vehicle detail: Create Session, View Sessions, Start OBD Scan, Edit.
- Replace placeholder history with recent sessions using existing session hook where practical.
- Add "Create Vehicle" action to empty list state.
- Make vehicle list mobile-friendly with card rows on small screens.
- Replace `window.location.href` row navigation.
- Make vehicle detail emphasize make/model/year/VIN/plate before raw ID.
- Add cancel/back actions to create/edit forms.
- Fix VIN decode UI so it either is explicit or clearly auto-lookup, but not both.

### Acceptance Criteria

- Vehicle detail offers clear next actions.
- Vehicle sessions are discoverable from vehicle detail.
- Empty vehicle list includes a create action.
- Vehicle list remains usable on mobile.
- Create/edit forms keep current validation and backend behavior.
- No backend schema or vehicle API changes are required.

### Risks / Things Not To Change

- Do not change vehicle validation rules unless only improving frontend labels/help text.
- Do not remove VIN decode.
- Do not add backend-derived vehicle history if existing hooks are enough.
- Do not start scans with hidden vehicle assumptions unless existing scan API supports it.

## Phase 6 — Visual Polish & Consistency

### Goal

Create a consistent frontend design language that makes the product feel more professional without changing core behavior.

### User Problem Solved

The UI feels basic because each page hand-rolls common patterns: cards, headers, buttons, badges, loading states, and errors.

### Exact Files Likely Affected

- `frontend/src/app/globals.css`
- Most page files under `frontend/src/app`
- Components under:
  - `frontend/src/components/obd`
  - `frontend/src/components/live-data`
  - `frontend/src/components/vehicles`
  - `frontend/src/components/auth`
- New likely files:
  - `frontend/src/components/ui/Button.tsx`
  - `frontend/src/components/ui/LinkButton.tsx`
  - `frontend/src/components/ui/Card.tsx`
  - `frontend/src/components/ui/StatusBadge.tsx`
  - `frontend/src/components/ui/EmptyState.tsx`
  - `frontend/src/components/ui/ErrorState.tsx`
  - `frontend/src/components/ui/LoadingState.tsx`
  - `frontend/src/components/ui/DetailGrid.tsx`

### Proposed UI Changes

- Standardize primary color, neutral palette, radius, spacing, and focus states.
- Create shared button/link variants.
- Create shared status badge variants.
- Create shared empty/error/loading states with optional actions.
- Create a page header component and use it across pages.
- Reduce nested card feel by using page sections and clear bands.
- Tighten typography scale for dashboard cards and dense diagnostic information.
- Add icons from `lucide-react` where they clarify actions and statuses.

### Acceptance Criteria

- Common actions look consistent across pages.
- Loading, empty, and error states have consistent layout and recovery options.
- Page headers use one pattern.
- Login and authenticated pages no longer feel visually unrelated.
- No completed feature is removed.

### Risks / Things Not To Change

- Do not spend this phase on major workflow redesign.
- Do not hide important diagnostic details in the name of polish.
- Keep density appropriate for workshop use; avoid marketing-style hero layouts.

## Phase 7 — Mobile/Responsive Review

### Goal

Make key workflows usable on small screens and tablets.

### User Problem Solved

Technicians may use tablets or narrow screens near a vehicle. The current app is responsive in places, but not reviewed as a complete mobile workflow.

### Exact Files Likely Affected

- `frontend/src/app/layout.tsx`
- `frontend/src/app/vehicles/page.tsx`
- `frontend/src/app/vehicles/[id]/page.tsx`
- `frontend/src/app/diagnostic-sessions/[sessionId]/page.tsx`
- `frontend/src/app/obd/page.tsx`
- `frontend/src/components/layout/*`
- `frontend/src/components/vehicles/vehicle-list-table.tsx`
- `frontend/src/components/obd/ControlUnitOverview.tsx`
- `frontend/src/components/obd/ControlUnitSummaryCards.tsx`
- `frontend/src/components/live-data/LiveDataCard.tsx`

### Proposed UI Changes

- Add mobile app shell behavior: topbar plus drawer navigation.
- Replace vehicle table with mobile cards below a breakpoint.
- Review control unit cards and summary cards for text wrapping and density.
- Make diagnostic session sections easy to jump between on mobile.
- Ensure modal content fits small screens and supports scrolling.
- Ensure action bars wrap cleanly and primary actions stay visible.
- Test key flows at mobile and tablet widths.

### Acceptance Criteria

- Vehicles list, vehicle detail, OBD dashboard, session detail, and live data are usable at common mobile widths.
- No button text overflows.
- No cards become unreadably dense.
- Modals can be completed on mobile.
- Navigation remains accessible without a desktop sidebar.

### Risks / Things Not To Change

- Do not create separate mobile-only feature behavior.
- Do not remove table density on desktop.
- Do not add native-device assumptions.

## Recommended First Phase

Implement Phase 1 first.

Navigation and workflow fixes unlock the rest of the roadmap. Without a shared shell, breadcrumbs, and context-aware links, improvements to diagnostic sessions, OBD, live data, and vehicles will keep feeling like isolated patches. Phase 1 is also relatively low-risk because it can be done frontend-only, preserves existing backend behavior, and immediately removes visible product rough edges such as missing live-data routes and inconsistent page navigation.
