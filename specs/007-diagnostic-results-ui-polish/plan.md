# Implementation Plan: Diagnostic Results UI Polish + Control Unit Overview

**Branch**: `008-diagnostic-results-ui-polish` | **Date**: 2026-06-11 | **Spec**: [specs/007-diagnostic-results-ui-polish/spec.md](spec.md)

**Input**: Feature specification from `/specs/007-diagnostic-results-ui-polish/spec.md`

## Summary

Feature 007 replaces the flat fault-code list on both the OBD scan results page and the Diagnostic Session detail page with a professional **Control Unit Overview** layout. Eight known vehicle control units (ECM, TCM, ABS, SRS, BCM, ESP, IC, HVAC) are displayed as individual cards, each showing module status, fault count, and fault details. Modules that generic OBD-II cannot scan (ABS, SRS, BCM, ESP, IC, HVAC) are marked `OEM_DIAGNOSTICS_REQUIRED` with honest messaging. Unknown ECU codes get their own dynamic cards. Summary statistics cards at the top provide at-a-glance diagnostics. A notice banner explains the OBD-II scope limitation. This is a **frontend presentation-only** feature with no backend schema changes, no new API endpoints, and no database migrations.

## Technical Context

- **Language/Version**: TypeScript 5.x (strict mode)
- **Frontend Framework**: Next.js 14+ (App Router)
- **UI Library**: Tailwind CSS (hand-crafted classes, no shadcn/ui component primitives currently in use)
- **Icon Library**: Lucide React (already installed)
- **State Management**: TanStack Query v5 (already in use for data fetching)
- **Existing Types**: `FaultCode` from `hooks/useObdScan.ts`, `EnrichedFaultCode` from `lib/fault-codes.ts`
- **Testing**: Jest + React Testing Library (frontend)
- **Target Platform**: Web browser (responsive: mobile and desktop)
- **Performance Goals**: Control Unit Overview renders in <100ms for up to 50 fault codes; no layout shift on data load
- **Constraints**: No backend changes. No new npm dependencies. Must reuse existing enrichment helpers (`readEnrichment`, `severityBadgeClass`, `systemBadgeClass`) from `lib/fault-codes.ts`.
- **Scale/Scope**: Single workshop, ≤5 concurrent users, ≤50 fault codes per session

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| # | Gate | Status | Justification |
|---|------|--------|---------------|
| 1 | Documentation First | PASS | Plan references `docs/PRD.md` and `docs/SAD.md`. The spec is approved and references documented entities (DiagnosticSession, FaultCode). |
| 2 | Design Before Implementation | PASS | This plan is the design document. No implementation code has been written. |
| 3 | Layered Architecture | PASS | No backend changes. Frontend changes are presentation-only (no business logic in components). Data shaping is in a pure helper function. |
| 4 | Modular Development | PASS | Feature addresses exactly one module: Control Unit Overview presentation. No cross-module changes except the two integration points (OBD dashboard and session detail page). |
| 5 | Code Quality | PASS | Each new file has single responsibility. `control-units.ts` is pure functions. Components are small and focused. No file exceeds 300 lines. |
| 6 | Multi-Tenant First | PASS | No new entities. Existing tenant-scoped data flow is unchanged. |
| 7 | API First | PASS | No new API endpoints. Frontend consumes existing enriched `FaultCode[]` from Feature 005 endpoints. |
| 8 | Scan Source Agnostic | PASS | Control Unit Overview works regardless of how fault codes were entered (OBD scan, manual entry, upload). |
| 9 | AI Assists, Never Decides | PASS | No AI features in this feature. |
| 10 | Standalone First | PASS | No PrioraFlow dependency. |
| 11 | Auditability | PASS | No audit changes needed. Existing audit flow unchanged. |
| 12 | Security By Default | PASS | No new endpoints. Existing auth/tenant checks on data fetches are unchanged. |
| 13 | Progressive Hardware Integration | PASS | OEM_DIAGNOSTICS_REQUIRED status honestly communicates hardware limitations. |
| 14 | Git & Change Safety | PASS | Working on feature branch. No breaking changes to public contracts. |
| 15 | Simplicity Over Complexity | PASS | Pure frontend helper + components. No database, no API, no external services. |
| 16 | Backend-Centric Business Logic | PASS | No business logic in frontend. The grouping logic is presentation-only (data shaping, not business rules). |

## Project Structure

### Documentation (this feature)

```text
specs/007-diagnostic-results-ui-polish/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── component-contract.md
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

### Source Code (repository root)

```text
frontend/src/
├── lib/
│   ├── control-units.ts                      # NEW: Types, constants, helpers
│   └── fault-codes.ts                        # EXISTING: Enrichment helpers (unchanged)
├── components/
│   └── obd/
│       ├── ControlUnitOverview.tsx            # NEW: Top-level control unit scan layout
│       ├── ControlUnitSummaryCards.tsx        # NEW: Summary statistics cards
│       ├── ControlUnitCard.tsx                # NEW: Single control unit card
│       ├── FaultCodeCard.tsx                  # NEW: Single fault code display
│       ├── MvpNoticeBanner.tsx                # NEW: OBD-II limitation notice
│       ├── EnrichedFaultCodeRow.tsx           # EXISTING: Retained for backward compat
│       └── FaultCodeList.tsx                  # EXISTING: Retained but unused in default flow
├── app/
│   ├── obd/
│   │   └── page.tsx                           # MODIFIED: Replace FaultCodeList with ControlUnitOverview
│   └── diagnostic-sessions/
│       └── [sessionId]/
│           └── page.tsx                        # MODIFIED: Replace flat list with ControlUnitOverview
└── hooks/
    └── useObdScan.ts                          # EXISTING: Unchanged (provides FaultCode type)

frontend/tests/
└── unit/
    ├── control-units.test.ts                  # NEW: Unit tests for grouping helpers
    ├── ControlUnitOverview.test.tsx            # NEW: Component tests
    ├── ControlUnitCard.test.tsx               # NEW: Component tests
    └── FaultCodeCard.test.tsx                 # NEW: Component tests
```

**Structure Decision**: This feature follows the existing project structure (Option 2: Web application). All new files are in the frontend package. No backend changes are required.

## Complexity Tracking

No constitution violations to justify. All gates pass.