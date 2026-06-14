# PrioraScan Frontend Review

## Executive Summary

The PrioraScan frontend has useful feature slices, but it still feels basic because the screens behave like isolated CRUD pages instead of one continuous diagnostic workspace. The app has no persistent navigation shell, no sidebar, limited workflow memory, inconsistent page headers/actions, and several routes promise actions that either do not exist yet or lead to weak placeholders.

The strongest frontend work already exists in the OBD and diagnostic scan components: agent status, scan progress, control unit overview, enriched fault cards, and live data. The next improvement should focus on connecting those pieces into guided technician workflows.

## Current Frontend Problems

### Routing And Navigation

- There is no shared app shell in `frontend/src/app/layout.tsx`; every authenticated page stands alone.
- The home page at `frontend/src/app/page.tsx` is only a centered two-link launcher.
- There is no sidebar or primary navigation for Vehicles, OBD Dashboard, Diagnostic Sessions, Live Data, or account/logout.
- There is no global Diagnostic Sessions list page; users must currently find sessions through a vehicle-specific page or a direct session link.
- Back links vary by page and often send users to broad pages rather than the most relevant previous workflow.
- Some navigation uses `next/link`, while other areas use `<a>` or `window.location.href`, causing full page reloads and inconsistent behavior.
- There is no breadcrumb trail for nested workflows such as Vehicles -> Vehicle Detail -> Sessions -> Session Detail.
- `/obd/live-data` is linked from `ControlUnitOverview`, but no matching page exists. Live data currently lives inside diagnostic session detail.
- `href="/obd?rescan={scanJobId}"` exists, but the OBD dashboard does not appear to read the `rescan` query parameter.

### Sidebar/Menu Structure

- No sidebar exists.
- No active route highlighting exists.
- No top-level Diagnostics menu exists with both OBD Dashboard and Diagnostic Sessions.
- No contextual menu exists for a selected vehicle or active diagnostic session.
- No global indicator exists for Desktop Agent status, adapter state, or active scan/live-data activity.
- The user cannot quickly move between "Vehicle", "Sessions", "OBD Scan", and "Live Data" for the same job.

### OBD Dashboard

- The OBD Dashboard has important cards, but it does not feel like a command center.
- The active scan ID is only local component state, so workflow continuity is weak after refresh/navigation.
- The dashboard starts scans without a strong vehicle/session context in the UI.
- Agent, adapter, scan control, progress, and results are visually separate, with no single guided sequence.
- Empty state before any scan is minimal; it does not explain the next best action beyond the button state.
- Failed and cancelled scan states exist but do not present strong recovery actions such as Retry, Start New Scan, or View Vehicle.
- Pairing is hidden behind the agent card only when no agent exists; once an agent exists there is no obvious manage/re-pair action.
- The completed scan state duplicates actions: `ControlUnitOverview` has navigation, then another "Open Session" card appears below.

### OBD Scan Results Page / Results Area

- There is no dedicated scan result route. Results are embedded inside `/obd` after a locally tracked scan completes.
- Results disappear as a coherent page if local dashboard state is lost.
- `ControlUnitOverview` gives a better professional scanner presentation, but it is nested in a two-column dashboard layout instead of receiving full result-page emphasis.
- The "Rescan" action is a link-like placeholder and not wired into the dashboard.
- "Export / Report" is disabled, which is acceptable, but it should be visually quieter and consistently explained.
- "Start Live Data" points to a missing route instead of the active diagnostic session's live-data area.

### Diagnostic Session Detail Page

- The page mixes session metadata editing, lifecycle actions, control unit results, live data, and lifecycle guidance without a clear hierarchy.
- It displays raw `vehicleId` instead of vehicle make/model/year/VIN context or a link to the vehicle.
- The page width is `max-w-4xl`, while the control unit overview grid would benefit from wider space.
- Fault-code loading state is not surfaced independently; the control unit overview may render as no faults while fault codes are still loading.
- Session lifecycle actions are clear but feel admin-like rather than part of a technician workflow.
- There are no tabs or anchors for Overview, Faults, Live Data, and Notes.
- The "Back to vehicles" link skips over the specific vehicle/session context.
- No clear primary action exists after opening a session: start session, scan, review faults, or live data all compete.

### Vehicle Pages And Forms

- Vehicle list is table-only on all screen sizes; mobile usability is likely weak.
- Vehicle rows use `window.location.href`, causing full reloads.
- Empty vehicle state says "No vehicles found" but does not offer "Create Vehicle".
- Vehicle detail shows a basic data card and placeholder history rather than a useful workshop record.
- Vehicle detail does not show recent diagnostic sessions despite a sessions route existing.
- Vehicle detail lacks direct actions: Start OBD Scan, Create Diagnostic Session, View Sessions, Start Live Data from latest session.
- Vehicle pages use raw IDs prominently, which makes the app feel technical rather than technician-oriented.
- Vehicle create/edit pages have no cancel/back action near the form submit area.
- VIN decode behavior is surprising: it triggers automatically when VIN length is 3 to 25 characters, while comments say the user must explicitly press a button. The component is also named `VinDecodeButton` but renders status text only.

### Live Data Card / Page

- There is no dedicated live data page despite navigation pointing to one.
- Live data is only a card inside diagnostic session detail.
- The card has useful MVP PID rows but feels static and table-like.
- There is no cadence selector in the UI even though the hook supports `cadenceMs`.
- There is no clear offline state when agents exist but are offline.
- The start flow selects an agent, but the active state does not show which agent is running the session.
- Stopped/stale states need clearer recovery actions and explanations.
- Live data values have no grouping, min/max, status explanation, or "last sample age" warning.
- No snapshot/report/graphing should be added now, but the layout should leave room for future controls without implying unsupported features.

### Control Unit Overview UI

- The control unit presentation is a strong step forward, but it still needs better workflow integration.
- It uses "OEM Diagnostics Required" while the feature spec expected "Not scanned in MVP"; the new wording is more honest, but the product copy should be standardized.
- Summary cards include "Generic OBD Modules Checked" as a comma-separated value, which can become visually awkward and less scanner-like.
- The component always embeds navigation actions; those actions can duplicate page-level actions and sometimes point to missing routes.
- `ControlUnitCard` has a `defaultExpanded` prop, but `ControlUnitOverview` does not expose a way to control expansion policy.
- All module cards render the same grid density; technicians may need faulted modules prioritized more clearly.
- Unknown modules are handled, but the UI does not explain why they are unknown.

### Buttons, Links, Empty States, Loading States, Error States

- Buttons use inconsistent labels and styling across pages: "Create Vehicle", "Save Changes", "Start Scan", "Confirm & Resume", "Open Session".
- Links mix arrows, plain text, bordered buttons, and card links.
- Loading states are mostly text-only; no skeletons or stable page placeholders.
- Error states often explain failure but rarely provide a recovery action.
- Empty states are minimal and do not consistently include the next action.
- Disabled buttons explain the reason in nearby text sometimes, but not consistently.
- There is no shared `Button`, `PageHeader`, `EmptyState`, `ErrorState`, `StatusBadge`, or `SectionCard` component.

### Page Layout Consistency

- Layout widths vary: `max-w-2xl`, `max-w-4xl`, `max-w-5xl`, `max-w-7xl`.
- Page headers are hand-built each time and differ in spacing, typography, and action placement.
- Cards use mixed radius classes (`rounded-lg`, `rounded-xl`) and mixed gray/slate palettes.
- The login page uses indigo focus/button styling while the rest mostly uses blue.
- There is no shared spacing system beyond ad hoc Tailwind classes.
- There are nested cards in a few places, especially around session/detail sections, which makes pages feel boxy.

### Component Reuse

- Good reusable pieces already exist:
  - `ControlUnitOverview`
  - `ControlUnitCard`
  - `ControlUnitSummaryCards`
  - `FaultCodeCard`
  - `AgentStatusCard`
  - `ScanControlPanel`
  - `ScanProgressTimeline`
  - `LiveDataCard`
  - `VehicleForm`
- Missing reusable primitives:
  - App shell with sidebar/topbar
  - Page header with primary/secondary actions
  - Breadcrumbs
  - Button/link variants
  - Empty/error/loading state components
  - Status badge component
  - Detail list/key-value component
  - Action toolbar
  - Mobile list/card alternative for tables
  - Modal wrapper with consistent close/cancel behavior

### Mobile Responsiveness

- Most layouts use responsive grids, but the app has not been shaped as a mobile workflow.
- Vehicle table is not mobile-friendly.
- Control unit summary cards are dense on small screens, especially with text values.
- Diagnostic session detail has multiple full-width cards stacked without sticky navigation or anchors.
- Modal forms may fit but lack focus management and may feel cramped.
- The absence of sidebar/topbar responsive behavior means mobile navigation is still unresolved.

### User Workflow Continuity

- A technician cannot easily answer: "What vehicle am I working on? What session is active? What is the next action?"
- Scan completion does not naturally transition into a persistent result page.
- Vehicle, session, scan, and live data contexts are not carried together visually.
- Refreshing the OBD dashboard risks losing the visible result state.
- Session detail does not make it easy to return to the exact vehicle or sessions list.
- Live data is available only if the user happens to be on session detail; scan result navigation points elsewhere.

## Missing Buttons / Links / Actions

- Global navigation: Vehicles, OBD Dashboard, Diagnostic Sessions, Active Scan, Logout.
- Sidebar Diagnostics group: OBD Dashboard, Diagnostic Sessions.
- Diagnostic Sessions list page with columns: Session #, Vehicle, Status, Fault Count, Created, Actions.
- Vehicle detail: Start OBD Scan, Create Session, View Sessions, Edit Vehicle, Back to Vehicles.
- Vehicle empty state: Create Vehicle.
- Vehicle list row action: View, Sessions, Start Scan.
- Session detail: Back to Vehicle, View Vehicle, Start OBD Scan for this vehicle, jump to Live Data.
- OBD dashboard completed scan: View Session, Start Live Data in Session, Start New Scan.
- Failed scan: Retry Scan, Pair/Check Agent, View Troubleshooting.
- Agent card with existing agent: Manage Pairing / Refresh Status.
- Live data stopped/stale: Restart Live Data.
- Control unit overview: make navigation context-aware and remove missing-route links.

## Confusing User Flows

- "Start Live Data" from scan results routes to `/obd/live-data`, but live data is actually inside `/diagnostic-sessions/[sessionId]`.
- "Rescan" creates `/obd?rescan=...`, but the dashboard has no visible handling for that query.
- Vehicle detail suggests history is unavailable, while vehicle sessions are available on a separate route.
- A user can create a diagnostic session from `/vehicles/[id]/sessions`, but vehicle detail does not prominently advertise that route.
- OBD scan flow can create or attach a diagnostic session, but the dashboard does not clearly show the vehicle/session relationship.
- VIN decode appears automatic while the component name/comment suggests an explicit button.

## Pages That Feel Unfinished

- `/`: basic launcher rather than dashboard or authenticated workspace entry.
- `/obd`: functional but not yet a workshop scan command center.
- `/vehicles/[id]`: data card plus placeholder history, no strong workflow actions.
- `/vehicles/[id]/sessions`: useful, but isolated from vehicle detail and not visually connected.
- `/diagnostic-sessions/[sessionId]`: feature-rich but cluttered and lacking clear navigation/hierarchy.
- Missing `/diagnostic-sessions`: users need a session list to find prior work without first locating the vehicle.
- Missing `/obd/live-data`: linked but not implemented.

## UI Inconsistencies

- Blue vs indigo primary color.
- Gray vs slate neutral palettes.
- `rounded-md`, `rounded-lg`, and `rounded-xl` mixed without system.
- Full page reload links in some places, Next links in others.
- Text loading states vs card loading states.
- Error boxes with different colors, radius, and recovery patterns.
- Page headers vary by title size and action location.
- Some pages use IDs as primary context; others use human labels.

## Reusable Component Opportunities

- `AppShell`: sidebar, topbar, user menu, active route state, mobile menu.
- `DiagnosticSessionsList`: reusable list/table for global and vehicle-scoped session discovery.
- `PageHeader`: title, subtitle, breadcrumbs, action slot.
- `ActionBar`: primary and secondary page actions.
- `Button` and `LinkButton`: consistent variants and disabled/loading states.
- `StatusBadge`: shared color semantics for agent, session, scan, fault, live data.
- `EmptyState`: title, body, primary action, secondary action.
- `ErrorState`: message plus retry/back action.
- `LoadingState` / skeletons: stable page loading placeholders.
- `DetailGrid`: consistent vehicle/session metadata display.
- `ResponsiveTable`: desktop table plus mobile card list.
- `DiagnosticWorkspaceHeader`: selected vehicle/session/scan context band.
- `ModalShell`: shared header, close behavior, footer buttons.

## Quick Wins

- Add an authenticated app shell with basic sidebar navigation.
- Add a top-level Diagnostic Sessions list route so sessions can be found without going through a vehicle page.
- Replace `/obd/live-data` links with session-aware anchors or links to `/diagnostic-sessions/{id}#live-data`.
- Remove or wire the `rescan` query link; use a button if no route behavior exists.
- Add "Create Vehicle" to the empty vehicles state.
- Add "View Sessions" and "Create Session" to vehicle detail.
- Replace `window.location.href` row navigation with `next/link` or router navigation.
- Show fault-code loading/error state in diagnostic session detail before rendering zero-result control units.
- Standardize page headers and back links.
- Add recovery actions to failed/cancelled scan states.
- Make Live Data stopped/stale states clearer with "Restart Live Data".
- Normalize primary color and button styles.

## Medium Improvements

- Create a persistent diagnostic workspace pattern across OBD dashboard and session detail.
- Split diagnostic session detail into sections or tabs: Overview, Control Units, Live Data, Notes.
- Turn completed scan results into a durable route or a session-first result page.
- Improve vehicle detail into a real record page with recent sessions and scan actions.
- Add a mobile card layout for vehicle list.
- Add consistent skeleton loaders for vehicle list, OBD dashboard, session detail, and live data.
- Add contextual breadcrumbs across vehicle/session/scan routes.
- Add a global session index with a search/filter-ready layout, even if advanced filters come later.
- Create shared status badge and state components.
- Refactor OBD dashboard into a guided sequence: Agent -> Adapter -> Vehicle -> Scan -> Results.

## Larger UX Refactors

- Build a full app shell with sidebar, responsive mobile drawer, topbar, user/logout, and global agent status.
- Introduce a session-centric diagnostic workspace where vehicle, session, faults, and live data live together.
- Add durable routing for scan result views so completed scans can be revisited and shared internally.
- Unify vehicle and diagnostic session flows so technicians start from a vehicle and naturally move through scan, results, and live data.
- Establish a frontend design system layer with tokens, primitives, page patterns, and state patterns.

## Constraints To Preserve

- Do not change backend logic.
- Do not change database schema.
- Do not change scan logic.
- Do not remove completed features.
- Do not implement real ECU discovery.
- Do not implement reports, AI, or graphing.
- Keep OEM/manufacturer-specific diagnostics as explanatory UI only.
