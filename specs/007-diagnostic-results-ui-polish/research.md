# Research: Diagnostic Results UI Polish + Control Unit Overview

**Feature Branch**: `008-diagnostic-results-ui-polish`
**Date**: 2026-06-11
**Status**: Complete

## R1: Frontend UI Component Strategy

**Decision**: Build reusable components using existing Tailwind CSS + hand-crafted patterns (no shadcn/ui primitives)

**Rationale**: The current codebase uses zero shadcn/ui component files. While `class-variance-authority`, `clsx`, `tailwind-merge`, and `lucide-react` are npm dependencies, the `components/ui/` directory does not exist. All existing UI (session detail page, OBD dashboard, FaultCodeList, EnrichedFaultCodeRow) is built with raw Tailwind CSS classes. Introducing shadcn/ui now would create an inconsistent styling baseline where some components use shadcn/ui primitives and others don't. The new components should match the existing design language.

**Alternatives considered**:
- **shadcn/ui setup + Accordion/Collapsible components**: Would add animation and accessibility benefits but requires generating 5-8 shadcn/ui components first, then refactoring existing pages for consistency. Scope creep beyond this feature.
- **Framer Motion for animations**: Would require a new npm dependency and animation infrastructure. The spec calls for accordion/card layout, not complex animations. CSS transitions are sufficient.

## R2: Control Unit Module Catalog Design

**Decision**: Define the 8 known modules as a static TypeScript constant (`CONTROL_UNIT_MODULES`) in a new `lib/control-units.ts` file. Not sourced from backend API.

**Rationale**: The spec explicitly states "No backend schema changes" and the modules (ECM, TCM, ABS, SRS, BCM, ESP, IC, HVAC) are industry-standard OBD-II module names that don't change between vehicles. A frontend constant is the simplest, most maintainable approach. If manufacturer-specific modules are added in a future feature, the constant can be extended or replaced with an API call at that time.

**Alternatives considered**:
- **Backend endpoint returning module catalog**: Adds API surface for data that is static. Would require a controller, service, DTO, and test — all for a constant array. Overkill for MVP.
- **JSON config file in `/public/`**: Adds file I/O overhead and cache management for data that never changes at runtime.

## R3: Grouping Logic — Frontend Helper Function

**Decision**: Create a pure function `buildControlUnitOverview(faultCodes: FaultCode[]): ControlUnitResult[]` in `lib/control-units.ts`.

**Rationale**: The grouping logic is presentation-only (no backend persistence needed). A pure function is easily testable, has no side effects, and can be used by both the OBD dashboard and the session detail page. The function receives the existing `FaultCode[]` array (already enriched by Feature 005) and produces `ControlUnitResult[]` which is the shape the UI components consume.

**Alternatives considered**:
- **Backend derived field `controlUnitResults`**: The spec mentions this as optional. Rejected because: (a) it would add a controller/service change for pure presentation logic, (b) the grouping is based on static module definitions, not business rules, (c) it violates the constitution's Backend-Centric Business Logic principle only if we claim this is business logic — but it's not, it's presentation logic, so it belongs in the frontend.

## R4: Status Semantics — OEM_DIAGNOSTICS_REQUIRED vs NOT_SCANNED

**Decision**: Use `OEM_DIAGNOSTICS_REQUIRED` for the 6 non-OBD-II modules (ABS, SRS, BCM, ESP, IC, HVAC) instead of `NOT_SCANNED` from the original spec.

**Rationale**: The user's revised input explicitly replaces `NOT_SCANNED` with `OEM_DIAGNOSTICS_REQUIRED` and the label "Manufacturer-specific diagnostics required" instead of "Not scanned in MVP." This is more honest and professional. Generic OBD-II does not scan ABS/SRS/BCM/ESP/HVAC modules; claiming they were "not scanned" implies they could have been, while `OEM_DIAGNOSTICS_REQUIRED` clearly communicates that these modules require specialized equipment beyond standard OBD-II.

**Alternatives considered**:
- **NOT_SCANNED**: The original spec used this. Rejected per user's revised input.
- **NOT_SUPPORTED**: Too absolute — implies the app will never support these modules, which may not be true in future versions.

## R5: Dynamic Unknown ECU Card Handling

**Decision**: When a fault code's `ecu` field does not match any of the 8 known modules, create a dynamic card using the raw `ecu` value as the code, with name "Unknown / Unmapped Control Unit" and status `FAULTS_FOUND` (if faults exist) or `NO_FAULTS` (if somehow grouped with zero faults). Do NOT bucket these under a generic "Others" group.

**Rationale**: The user's revised input explicitly requires this. Each unmapped ECU gets its own card, preserving the original module code (e.g., "RADAR", "SAM-F"). This is more informative than a catch-all "Others" category and matches professional scanner behavior.

**Alternatives considered**:
- **Generic "Others" bucket**: Rejected per user's explicit instruction.
- **Silently drop unknown ECU codes**: Would lose diagnostic data. Unacceptable.

## R6: Existing Component Reuse Strategy

**Decision**: Refactor `EnrichedFaultCodeRow` into `FaultCodeCard` as the primary display component within control unit cards. Keep `EnrichedFaultCodeRow` as-is for backward compatibility but extract its badge/status rendering logic into shared helpers.

**Rationale**: `EnrichedFaultCodeRow` currently renders a single `<li>` row. The new `FaultCodeCard` needs similar rendering (code, status badge, system badge, severity, title/description) but within the context of a control unit card rather than a flat list. The badge styling helpers (`severityBadgeClass`, `systemBadgeClass`) already exist in `lib/fault-codes.ts` and will be reused directly. The status badge rendering will be extracted to a shared helper if needed.

**Alternatives considered**:
- **Replace EnrichedFaultCodeRow entirely**: Risky — the component is used in `FaultCodeList` (OBD dashboard) and the session detail page. Changing it would break both pages during development.
- **Copy-paste EnrichedFaultCodeRow into FaultCodeCard**: Leads to code duplication. Better to extract shared rendering logic.

## R7: ECM/TCM Scan Status Logic

**Decision**: ECM and TCM are the only modules that the OBD-II adapter actually scans. For these modules:
- If faults exist → `FAULTS_FOUND`
- If the scan completed and no faults exist → `NO_FAULTS` ("No faults detected")
- If no scan data exists for the module → `NOT_SCANNED`

For ABS, SRS, BCM, ESP, IC, HVAC:
- Always → `OEM_DIAGNOSTICS_REQUIRED` ("Manufacturer-specific diagnostics required")

**Rationale**: This is the honest representation. Generic OBD-II scans the engine and transmission (ECM/TCM). The other modules require manufacturer-specific protocols. The `NOT_SCANNED` status is reserved for a theoretical case where even ECM/TCM have no data (e.g., scan failed).

**Alternatives considered**:
- **All modules default to NOT_SCANNED**: Dishonest for ECM/TCM — they were scanned.
- **All modules default to OEM_DIAGNOSTICS_REQUIRED**: Dishonest for ECM/TCM — they were scanned.

## R8: Page Integration Strategy

**Decision**: Create a top-level `ControlUnitOverview` component that replaces `FaultCodeList` on the OBD dashboard page and replaces the flat `<ul>` fault code section on the session detail page. Both pages pass their `FaultCode[]` data to `ControlUnitOverview`, which internally calls `buildControlUnitOverview()` and renders `ControlUnitSummaryCards` + individual `ControlUnitCard` components.

**Rationale**: A single `ControlUnitOverview` component provides a consistent experience across both pages. The data source differs (scan results vs. session fault codes), but the grouping and rendering logic is identical. This avoids duplicating the UI.

**Alternatives considered**:
- **Two separate component trees**: Would duplicate grouping logic and visual layout. Maintenance burden.
- **Backend-driven grouping**: Overkill for presentation logic. The frontend has all the data it needs.

## R9: Empty State Handling

**Decision**: When a session has zero fault codes, the `ControlUnitOverview` still renders all 8 known modules with `NOT_SCANNED` status for ECM/TCM and `OEM_DIAGNOSTICS_REQUIRED` for the other 6 modules. Summary cards show all zeros. The page never appears empty.

**Rationale**: The original spec explicitly requires "The page must not look empty when only ECM codes exist" and "User should understand that other modules were considered." A zero-fault session should still show the control unit layout, communicating the scope of the diagnostic tool.

**Alternatives considered**:
- **Hide the section entirely when no faults**: Current behavior. Rejected — it makes the page look broken and doesn't communicate the tool's scope.
- **Show a single "No faults found" message**: Doesn't communicate which modules were or weren't scanned.