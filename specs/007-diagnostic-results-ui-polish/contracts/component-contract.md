# UI Component Contract: Control Unit Overview

**Feature Branch**: `008-diagnostic-results-ui-polish`
**Date**: 2026-06-11
**Status**: Complete

## Overview

This feature introduces **frontend-only** components and a data-shaping helper. There are no new backend API endpoints, no schema changes, and no contract changes to existing APIs. This document defines the component interface contract.

## Backend API Contracts (Unchanged)

The existing endpoints remain unchanged:

- `GET /obd/scans/:id/results` → `{ data: FaultCode[] }` (with enrichment)
- `GET /obd/scans/sessions/:id/results` → `{ data: FaultCode[] }` (with enrichment)

Both endpoints already return the enriched `FaultCode` type with `ecu`, `title`, `description`, `system`, `severity`, etc. No modifications are needed.

## Frontend Data Shaping Contract

### `lib/control-units.ts`

#### Types

```typescript
type ControlUnitStatus =
  | 'FAULTS_FOUND'
  | 'NO_FAULTS'
  | 'NOT_SCANNED'
  | 'OEM_DIAGNOSTICS_REQUIRED';

interface ControlUnitModule {
  code: string;
  name: string;
  group: 'OBD_II' | 'OEM_DIAGNOSTICS';
}

interface ControlUnitResult {
  code: string;
  name: string;
  status: ControlUnitStatus;
  faults: FaultCode[];
  isKnown: boolean;
  group: 'OBD_II' | 'OEM_DIAGNOSTICS';
}

interface ControlUnitSummary {
  modulesWithFaults: number;
  totalFaultCodes: number;
  genericObdModulesChecked: string[];
  oemDiagnosticsRequired: number;
}
```

#### Constants

```typescript
const CONTROL_UNIT_MODULES: ControlUnitModule[] = [
  { code: 'ECM',  name: 'Engine Control Module',           group: 'OBD_II' },
  { code: 'TCM',  name: 'Transmission Control Module',     group: 'OBD_II' },
  { code: 'ABS',  name: 'Anti-lock Brake System',          group: 'OEM_DIAGNOSTICS' },
  { code: 'SRS',  name: 'Supplemental Restraint System',   group: 'OEM_DIAGNOSTICS' },
  { code: 'BCM',  name: 'Body Control Module',             group: 'OEM_DIAGNOSTICS' },
  { code: 'ESP',  name: 'Electronic Stability Program',    group: 'OEM_DIAGNOSTICS' },
  { code: 'IC',   name: 'Instrument Cluster',              group: 'OEM_DIAGNOSTICS' },
  { code: 'HVAC', name: 'Climate Control Module',          group: 'OEM_DIAGNOSTICS' },
];
```

#### Functions

```typescript
/**
 * Groups a flat list of enriched fault codes into control unit results.
 *
 * @param faultCodes - Array of FaultCode objects (already enriched by Feature 005)
 * @param scannedEcuCodes - Optional set of ECU codes that were actually scanned.
 *   Defaults to ['ECM', 'TCM'] for generic OBD-II. This allows future features
 *   to specify which modules were actually scanned.
 * @returns ControlUnitResult[] - Ordered array: known OBD_II modules, then known
 *   OEM_DIAGNOSTICS modules, then dynamic unknown modules.
 */
function buildControlUnitOverview(
  faultCodes: FaultCode[],
  scannedEcuCodes?: Set<string>
): ControlUnitResult[];

/**
 * Computes summary statistics from control unit results.
 *
 * @param results - Array of ControlUnitResult from buildControlUnitOverview()
 * @returns ControlUnitSummary
 */
function computeControlUnitSummary(
  results: ControlUnitResult[]
): ControlUnitSummary;

/**
 * Returns the display label for a ControlUnitStatus.
 */
function getControlUnitStatusLabel(status: ControlUnitStatus): string;

/**
 * Returns the Tailwind CSS classes for a ControlUnitStatus badge.
 */
function getControlUnitStatusBadgeClass(status: ControlUnitStatus): string;

/**
 * Returns the full module name for a given ECU code.
 * Falls back to 'Unknown / Unmapped Control Unit' for unrecognized codes.
 */
function getControlUnitName(ecuCode: string): string;
```

#### Status Labels

| Status | Label | Badge Style |
|-------|-------|-------------|
| `FAULTS_FOUND` | "Faults Found" | Red/danger background |
| `NO_FAULTS` | "No Faults Detected" | Green/success background |
| `NOT_SCANNED` | "Not Scanned" | Gray/muted background |
| `OEM_DIAGNOSTICS_REQUIRED` | "OEM Diagnostics Required" | Amber/warning background |

## Component Contracts

### ControlUnitOverview

```typescript
interface ControlUnitOverviewProps {
  faultCodes: FaultCode[];
  scannedEcuCodes?: Set<string>;  // Default: new Set(['ECM', 'TCM'])
  sessionId?: string;              // For "View Diagnostic Session" link
  scanJobId?: string;              // For "Rescan" action
  vehicleId?: string;              // For "Start Live Data" link
  showNavigation?: boolean;        // Default: true
  title?: string;                  // Default: "Control Unit Overview"
}
```

**Behavior**:
- Calls `buildControlUnitOverview(faultCodes, scannedEcuCodes)` internally.
- Renders `ControlUnitSummaryCards` at top.
- Renders MVP notice banner.
- Renders one `ControlUnitCard` per `ControlUnitResult`.
- Optionally renders navigation actions at bottom.

### ControlUnitSummaryCards

```typescript
interface ControlUnitSummaryCardsProps {
  summary: ControlUnitSummary;
}
```

**Behavior**:
- Renders 4 cards in a responsive grid (2×2 on mobile, 4 across on desktop).
- Cards: Modules with Faults, Total Fault Codes, Generic OBD Modules Checked, OEM Diagnostics Required.
- Each card shows a numeric count and a label.

### ControlUnitCard

```typescript
interface ControlUnitCardProps {
  result: ControlUnitResult;
  defaultExpanded?: boolean;  // Default: true if FAULTS_FOUND, false otherwise
}
```

**Behavior**:
- Renders module header with: code (visually prominent), name, status badge, fault count (if faults > 0).
- Expands/collapses to show fault code list.
- If `FAULTS_FOUND`: shows each fault as a `FaultCodeCard`.
- If `NO_FAULTS`: shows "No faults detected" with a check icon.
- If `OEM_DIAGNOSTICS_REQUIRED`: shows "Manufacturer-specific diagnostics required" with a lock/info icon.
- If `NOT_SCANNED`: shows "Not scanned" with a muted style.
- Visual styling varies by status (see Visual Design section).

### FaultCodeCard

```typescript
interface FaultCodeCardProps {
  code: FaultCode;
}
```

**Behavior**:
- Renders a single fault code row with: code badge, status badge, system badge, severity badge, title/description.
- Uses existing `readEnrichment()` from `lib/fault-codes.ts` for enrichment parsing.
- Uses existing `severityBadgeClass()` and `systemBadgeClass()` from `lib/fault-codes.ts` for badge styling.
- Falls back to "No description available" for unknown codes.

### MVP Notice Banner

```typescript
// No props — static content
interface MvpNoticeBannerProps {
  // No props needed
}
```

**Behavior**:
- Renders a fixed notice: "Generic OBD-II provides emissions and powertrain diagnostics only. ABS, SRS, BCM, ESP, HVAC and other body/chassis modules require manufacturer-specific diagnostics."
- Styled as an info banner (blue/neutral background, info icon).

## Integration Points

### OBD Dashboard Page (`app/obd/page.tsx`)

**Before**: Uses `<FaultCodeList scanJobId={...} />` when scan is completed.

**After**: Replaces `<FaultCodeList>` with `<ControlUnitOverview faultCodes={...} scanJobId={...} showNavigation={true} />`.

The `faultCodes` prop comes from `useScanResults(activeScanId)` which returns `{ data: FaultCode[] }`.

### Diagnostic Session Detail Page (`app/diagnostic-sessions/[sessionId]/page.tsx`)

**Before**: Renders a flat `<ul>` of `<EnrichedFaultCodeRow>` elements when fault codes exist.

**After**: Replaces the flat `<ul>` section with `<ControlUnitOverview faultCodes={...} sessionId={sessionId} showNavigation={true} />`.

The `faultCodes` prop comes from `useSessionFaultCodes(sessionId)` which returns `{ data: FaultCode[] }`.

### FaultCodeList Component (`components/obd/FaultCodeList.tsx`)

**Status**: Retained but deprecated. The component remains in the codebase for backward compatibility but is no longer rendered by default. It can be removed in a future cleanup task.

### EnrichedFaultCodeRow Component (`components/obd/EnrichedFaultCodeRow.tsx`)

**Status**: Retained. The new `FaultCodeCard` component reuses the badge logic from this component. Both components coexist — `EnrichedFaultCodeRow` for potential standalone use, `FaultCodeCard` for use within `ControlUnitCard`.

## Visual Design Specification

### Status Badge Colors

| Status | Background | Text | Icon |
|--------|-----------|------|------|
| FAULTS_FOUND | `bg-red-100` | `text-red-700` | AlertTriangle |
| NO_FAULTS | `bg-emerald-100` | `text-emerald-700` | CheckCircle |
| NOT_SCANNED | `bg-slate-100` | `text-slate-500` | MinusCircle |
| OEM_DIAGNOSTICS_REQUIRED | `bg-amber-100` | `text-amber-700` | Lock |

### Control Unit Card Styles

| Status | Border | Background | Header Style |
|--------|--------|-----------|-------------|
| FAULTS_FOUND | `border-red-200` | `bg-white` | Bold, red accent |
| NO_FAULTS | `border-emerald-200` | `bg-white` | Normal, green accent |
| NOT_SCANNED | `border-slate-200` | `bg-slate-50` | Muted, gray |
| OEM_DIAGNOSTICS_REQUIRED | `border-amber-200` | `bg-amber-50/30` | Muted, amber accent |

### Summary Card Styles

Uniform cards: `rounded-xl border border-slate-200 bg-white p-4 shadow-sm`.
- Each card has a large numeric value and a small label below.
- Responsive: 2 columns on mobile, 4 columns on desktop.

### Responsive Layout

- **Mobile (<768px)**: Summary cards stack in 2×2 grid. Control unit cards stack vertically. Navigation actions stack vertically.
- **Desktop (≥768px)**: Summary cards in 4-column row. Control unit cards in 2-column grid. Navigation actions in a horizontal row.

## Accessibility Requirements

- All status badges have `aria-label` attributes (e.g., `aria-label="Faults Found"`).
- Collapsible sections use `aria-expanded` and `aria-controls`.
- Color is not the only indicator — icons and text labels accompany all color-coded elements.
- Keyboard navigation: collapsible sections are toggleable via Enter/Space.
- Focus management: expanding a section sets focus to the section header.