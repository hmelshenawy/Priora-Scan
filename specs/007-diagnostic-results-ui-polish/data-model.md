# Data Model: Diagnostic Results UI Polish + Control Unit Overview

**Feature Branch**: `008-diagnostic-results-ui-polish`
**Date**: 2026-06-11
**Status**: Complete

## Overview

This feature is **frontend presentation-only**. No new database tables, no schema migrations, no backend API changes. The data model defines TypeScript interfaces for the frontend data shaping layer and the static control unit catalog.

## Existing Entities (Unchanged)

### FaultCode (Frontend Type)

Source: `frontend/src/hooks/useObdScan.ts`

```typescript
interface FaultCode {
  id: string;
  code: string;
  status: string;       // 'ACTIVE' | 'PENDING' | 'PERMANENT'
  ecu?: string;         // e.g., 'ECM', 'TCM', 'RADAR'
  source: string;
  importedAt: string;
  // Feature 005 enrichment (optional)
  title?: string | null;
  description?: string | null;
  system?: string;      // 'POWERTRAIN' | 'BODY' | 'CHASSIS' | 'NETWORK' | 'UNKNOWN'
  severity?: string;    // 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN'
  commonCauses?: string[];
  recommendedChecks?: string[];
  isGeneric?: boolean;
  manufacturer?: string | null;
  hasDescription?: boolean;
}
```

### EnrichedFaultCode (Frontend Type)

Source: `frontend/src/lib/fault-codes.ts`

```typescript
type FaultSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
type FaultCodeSystem = 'POWERTRAIN' | 'BODY' | 'CHASSIS' | 'NETWORK' | 'UNKNOWN';

interface EnrichedFaultCode {
  code: string;
  title: string | null;
  description: string | null;
  system?: FaultCodeSystem | string;
  severity?: FaultSeverity | string;
  commonCauses?: string[];
  recommendedChecks?: string[];
  isGeneric?: boolean;
  manufacturer?: string | null;
  source?: string | null;
  hasDescription?: boolean;
}
```

## New Entities (Frontend-Only)

### ControlUnitModule (Static Constant)

Defines the 8 known OBD-II control unit modules. This is a TypeScript constant, not a database table.

```typescript
interface ControlUnitModule {
  code: string;   // Short code: 'ECM', 'TCM', 'ABS', etc.
  name: string;   // Full name: 'Engine Control Module', etc.
  group: 'OBD_II' | 'OEM_DIAGNOSTICS';  // Whether this module is scanned by generic OBD-II
}

const CONTROL_UNIT_MODULES: ControlUnitModule[] = [
  { code: 'ECM',  name: 'Engine Control Module',           group: 'OBD_II' },
  { code: 'TCM',  name: 'Transmission Control Module',     group: 'OBD_II' },
  { code: 'ABS',  name: 'Anti-lock Brake System',          group: 'OEM_DIAGNOSTICS' },
  { code: 'SRS',  name: 'Supplemental Restraint System',    group: 'OEM_DIAGNOSTICS' },
  { code: 'BCM',  name: 'Body Control Module',              group: 'OEM_DIAGNOSTICS' },
  { code: 'ESP',  name: 'Electronic Stability Program',     group: 'OEM_DIAGNOSTICS' },
  { code: 'IC',   name: 'Instrument Cluster',               group: 'OEM_DIAGNOSTICS' },
  { code: 'HVAC', name: 'Climate Control Module',           group: 'OEM_DIAGNOSTICS' },
];
```

**Design notes**:
- `group: 'OBD_II'` means generic OBD-II can read faults from this module. Only ECM and TCM.
- `group: 'OEM_DIAGNOSTICS'` means manufacturer-specific protocols are required. These modules always show `OEM_DIAGNOSTICS_REQUIRED` status.
- The `group` field determines the status logic in `buildControlUnitOverview()`.

### ControlUnitResult (Derived Shape)

The output of `buildControlUnitOverview()`. This is a frontend-only data shape, not a database entity.

```typescript
type ControlUnitStatus =
  | 'FAULTS_FOUND'            // Module has fault codes
  | 'NO_FAULTS'               // Module was scanned and has no faults (ECM/TCM only)
  | 'NOT_SCANNED'             // Module was not scanned (ECM/TCM with no data)
  | 'OEM_DIAGNOSTICS_REQUIRED'; // Module requires manufacturer-specific diagnostics

interface ControlUnitResult {
  code: string;           // 'ECM', 'TCM', 'ABS', 'RADAR', etc.
  name: string;           // 'Engine Control Module', 'Unknown / Unmapped Control Unit', etc.
  status: ControlUnitStatus;
  faults: FaultCode[];    // Fault codes grouped under this module
  isKnown: boolean;      // true if code matches CONTROL_UNIT_MODULES, false for dynamic cards
  group: 'OBD_II' | 'OEM_DIAGNOSTICS';  // Inherited from catalog or 'OBD_II' for unknown modules with faults
}
```

### ControlUnitSummary (Derived Shape)

Summary statistics computed from `ControlUnitResult[]`.

```typescript
interface ControlUnitSummary {
  modulesWithFaults: number;        // Count of modules where status === 'FAULTS_FOUND'
  totalFaultCodes: number;          // Total count of fault codes across all modules
  genericObdModulesChecked: string[]; // ['ECM', 'TCM'] — modules that were actually checked
  oemDiagnosticsRequired: number;   // Count of modules with status 'OEM_DIAGNOSTICS_REQUIRED'
}
```

## Grouping Logic: buildControlUnitOverview()

### Algorithm

```
INPUT: FaultCode[] (enriched)
OUTPUT: ControlUnitResult[]

1. Create a Map<string, FaultCode[]> grouped by faultCode.ecu?.toUpperCase() || 'UNKNOWN'

2. Build result array:
   a. For each module in CONTROL_UNIT_MODULES:
      - If module.group === 'OBD_II' (ECM, TCM):
        - If faults exist in the map for this code:
          status = FAULTS_FOUND
          Remove code from the map (consumed)
        - Else:
          status = NO_FAULTS
        - faults = faults from map (or empty array)
      - If module.group === 'OEM_DIAGNOSTICS' (ABS, SRS, BCM, ESP, IC, HVAC):
        - If faults exist in the map for this code (edge case: future OEM scan):
          status = FAULTS_FOUND
          Remove code from the map (consumed)
        - Else:
          status = OEM_DIAGNOSTICS_REQUIRED
        - faults = faults from map (or empty array)

   b. For each remaining entry in the map (unmatched ECU codes):
      - Create a dynamic card:
        code = the raw ECU value
        name = 'Unknown / Unmapped Control Unit'
        status = FAULTS_FOUND (if faults exist) or NO_FAULTS (if empty — unlikely)
        faults = the array of fault codes
        isKnown = false
        group = 'OBD_II' (unknown modules with faults are displayed like OBD modules)

3. Return the result array
```

### Status Determination Rules

| Module Type | Faults Exist | No Faults (scanned) | No Scan Data |
|-------------|-------------|---------------------|--------------|
| OBD_II (ECM, TCM) | FAULTS_FOUND | NO_FAULTS | NOT_SCANNED |
| OEM_DIAGNOSTICS (ABS, SRS, etc.) | FAULTS_FOUND* | OEM_DIAGNOSTICS_REQUIRED | OEM_DIAGNOSTICS_REQUIRED |
| Unknown ECU | FAULTS_FOUND | NO_FAULTS** | — |

*Edge case: if a fault code arrives with ECU='ABS', it means the data was provided somehow. Show FAULTS_FOUND.
**Extremely unlikely — unknown modules only appear if there's data.

### ECU Field Matching

The `ecu` field on `FaultCode` stores the module short code (e.g., "ECM", "TCM") as populated by the OBD scan import. The grouping helper matches case-insensitively:

- `ecu` value "ECM" → matches `CONTROL_UNIT_MODULES` entry with `code: 'ECM'`
- `ecu` value "ecm" → also matches (case-insensitive comparison)
- `ecu` value "RADAR" → no match → dynamic card created
- `ecu` value `undefined`, `null`, or `""` → grouped under `code: 'UNKNOWN'`

### Summary Calculation

```
modulesWithFaults = result.filter(r => r.status === 'FAULTS_FOUND').length
totalFaultCodes = result.reduce((sum, r) => sum + r.faults.length, 0)
genericObdModulesChecked = ['ECM', 'TCM']  // static, always these two
oemDiagnosticsRequired = result.filter(r => r.status === 'OEM_DIAGNOSTICS_REQUIRED').length
```

## Backend Impact

**None.** This feature does not modify any backend files, database schema, or API contracts. The `buildControlUnitOverview()` function operates entirely on the existing `FaultCode[]` data that is already fetched and enriched by Feature 005 endpoints.

## Component Tree

```
ControlUnitOverview
├── ControlUnitSummaryCards
│   ├── modulesWithFaults card
│   ├── totalFaultCodes card
│   ├── genericObdModulesChecked card
│   └── oemDiagnosticsRequired card
├── MVP Notice Banner
├── ControlUnitCard (repeated for each module)
│   ├── Module header (code + name + status badge + fault count)
│   ├── Collapsible fault list (if faults exist)
│   │   └── FaultCodeCard (repeated for each fault)
│   │       ├── Code badge
│   │       ├── Status badge
│   │       ├── System badge
│   │       ├── Severity badge
│   │       └── Title/description
│   └── Status message (if no faults)
│       ├── "No faults detected" (NO_FAULTS)
│       ├── "Manufacturer-specific diagnostics required" (OEM_DIAGNOSTICS_REQUIRED)
│       └── "Not scanned" (NOT_SCANNED)
└── Navigation Actions
    ├── Back to OBD Dashboard
    ├── View Diagnostic Session
    ├── Start Live Data
    ├── Rescan
    └── Export/Report (disabled)
```