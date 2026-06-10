# Data Model: Fault Code Intelligence

**Feature**: Fault Code Intelligence (Phase 005)
**Date**: 2026-06-10
**Spec**: [spec.md](spec.md)
**Plan**: [plan.md](plan.md)

---

## Overview

This document describes the Prisma schema addition required for Feature 005. It introduces a single new model, `MasterFaultCode`, which is **global reference data** (no `organizationId`) and is the only schema-level change in this feature. The existing `SessionFaultCode` model is unchanged.

The seed populates only the directly-imported fields from `code-descriptions.sqlite`. Severity, system, commonCauses, and recommendedChecks are **derived by the enrichment service** at read time, not stored on the row in Feature 005.

---

## New Models

### MasterFaultCode

Global, tenant-independent reference record describing a single OBD-II fault code. Seeded once from the local SQLite asset `backend/data/code-descriptions.sqlite`.

| Field | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK, auto-generated | Unique record identifier |
| `code` | String(10) | UNIQUE, NOT NULL, uppercase | DTC code, e.g., `P0301`. Lookup key. |
| `title` | String(500) | Nullable | Short human-readable name (imported from `codes.desc`) |
| `description` | String(2000) | Nullable | Longer prose (imported from `codes.desc`; may equal `title` in v1) |
| `system` | FaultCodeSystem enum | Default: `UNKNOWN` | Inferred from code prefix by enrichment service. Stored as `UNKNOWN` at seed time; updated on first read (or kept as `UNKNOWN` and overridden at enrichment time — implementation decision in tasks). |
| `severity` | FaultSeverity enum | Default: `UNKNOWN` | Always `UNKNOWN` for seeded rows in Feature 005. |
| `commonCauses` | JSON | Nullable | Always `null` in Feature 005. |
| `recommendedChecks` | JSON | Nullable | Always `null` in Feature 005. |
| `source` | String(50) | NOT NULL | Origin identifier, e.g., `code-descriptions.sqlite` |
| `manufacturer` | String(100) | Nullable | OEM-specific manufacturer; `null` for all imported rows in v1. Forward-looking. |
| `isGeneric` | Boolean | NOT NULL, Default: `true` | `true` for generic OBD-II codes; `false` reserved for OEM-specific codes. |
| `createdAt` | Timestamp | Default: now | Record creation |
| `updatedAt` | Timestamp | Auto-update | Record modification |

**Indexes**:
- `code` (UNIQUE — natural lookup key)

**Notes on field provenance**:

| Field | Imported or derived? | Set in seed? | Set in enrichment service? |
|---|---|---|---|
| `code` | Imported | Yes (from `codes.id`) | n/a |
| `title` | Imported | Yes (from `codes.desc`) | n/a |
| `description` | Imported | Yes (from `codes.desc`) | n/a |
| `source` | Imported | Yes (constant) | n/a |
| `isGeneric` | Imported | Yes (constant `true`) | n/a |
| `manufacturer` | Imported (nullable) | Yes (constant `null`) | n/a |
| `system` | **Derived** | No (stored as `UNKNOWN`) | Yes — inferred from prefix |
| `severity` | **Derived** | No (stored as `UNKNOWN`) | Yes — `UNKNOWN` in v1 |
| `commonCauses` | **Derived** | No (stored as `null`) | Yes — empty `[]` in v1 |
| `recommendedChecks` | **Derived** | No (stored as `null`) | Yes — empty `[]` in v1 |

The seed intentionally leaves the four derived columns in their default state. The enrichment service is the sole source of truth for those values at read time. This keeps the seed a simple, fast, idempotent copy of the asset and lets us add new rule packs for severity/causes/checks in future versions without touching the seed.

---

## New Enums

### FaultSeverity

| Value | Meaning |
|---|---|
| `LOW` | Informational; no immediate action required. Reserved for future use. |
| `MEDIUM` | Should be addressed at next service. Reserved for future use. |
| `HIGH` | Prompt attention recommended. Reserved for future use. |
| `CRITICAL` | Safety-relevant; immediate attention. Reserved for future use. |
| `UNKNOWN` | Default; Feature 005 emits this for all seeded and unknown codes. |

### FaultCodeSystem

| Value | Meaning |
|---|---|
| `POWERTRAIN` | Engine, transmission, emissions (prefix `P`) |
| `BODY` | Body control, lighting, airbags (prefix `B`) |
| `CHASSIS` | Brakes, steering, suspension (prefix `C`) |
| `NETWORK` | Communication bus / ECU interconnect (prefix `U`) |
| `UNKNOWN` | Unrecognized prefix or no code match |

---

## Unchanged Models

### SessionFaultCode

No schema change. Existing tenant-scoped model continues to hold the raw imported DTC. Enrichment is computed at read time by joining/looking up `MasterFaultCode` on `code`. The combination is returned to the UI as an `EnrichedFaultCode` DTO (no persistence).

### DiagnosticSession, ScanJob, DesktopAgent, Vehicle, PairingToken, AdapterConnection, all `*AuditRecord` models

No schema changes.

---

## Entity Relationship Diagram

```
┌────────────────────────────┐
│  MasterFaultCode           │   ◄── global, no organizationId
│  (reference data)          │
└────────────────────────────┘
            ▲
            │ lookup by code (at read time, not a FK)
            │
┌────────────────────────────┐    organizationId    ┌──────────────────────────┐
│  SessionFaultCode          │ ───────────────────► │  Organization            │
│  (tenant-scoped)           │                      │  (tenant)                │
└────────────────────────────┘                      └──────────────────────────┘
            │
            │ diagnosticSessionId, scanJobId
            ▼
┌────────────────────────────┐
│  DiagnosticSession +       │
│  ScanJob (tenant-scoped)   │
└────────────────────────────┘
```

`MasterFaultCode` is **deliberately not a foreign-key target** for `SessionFaultCode.code`. This keeps the model global (no tenant scope on the reference data) and avoids foreign-key constraints that would block feature work like OEM-specific code sets in future versions. The enrichment service performs a case-normalized lookup at read time.

---

## Validation Rules

### Model-Level

| Model | Field | Rule |
|---|---|---|
| `MasterFaultCode` | `code` | 5–10 characters; uppercase; unique; `^[PBCU][0-9A-Z]{3,9}$` for prefix-aware codes, or free-form for future OEM codes |
| `MasterFaultCode` | `title` | 1–500 characters; nullable |
| `MasterFaultCode` | `description` | 1–2000 characters; nullable |
| `MasterFaultCode` | `source` | 1–50 characters; not null |
| `MasterFaultCode` | `manufacturer` | 0–100 characters; nullable |

### Cross-Model

- `SessionFaultCode.organizationId` MUST equal the parent `DiagnosticSession.organizationId` (unchanged from Feature 004).
- `MasterFaultCode` is global; queries against it MUST NOT filter by `organizationId`.

---

## Migration Impact

### Additive Changes

All changes are additive. No existing tables are altered.

### New Tables

1. `MasterFaultCode`

### New Enums

1. `FaultSeverity`
2. `FaultCodeSystem`

### Backward Compatibility

- Existing APIs and frontend pages are unchanged.
- The new `GET /fault-codes/{code}` endpoint is additive.
- The Diagnostic Session detail page and OBD scan-results page are updated to display enriched fields; if the enrichment service is unavailable, the existing fault-code list is still returned (graceful fallback).
- All Feature 004 tests continue to pass.

---

## Forward Compatibility Notes

The schema is designed to accommodate future features without migration:

- **`manufacturer` and `isGeneric`** enable OEM-specific code imports (Mercedes, BMW, Toyota, etc.) by a future feature. The enrichment service can then prioritize manufacturer-specific titles over generic ones, or filter by manufacturer in a future search UI.
- **`commonCauses` and `recommendedChecks` (JSON)** allow future rule packs to attach arbitrary lists of strings per code without schema changes.
- **`severity` already enumerates** the full future range (`LOW`/`MEDIUM`/`HIGH`/`CRITICAL`/`UNKNOWN`) so adding a rule pack that sets severities is a data-only change.
- The enrichment service is a separate layer; future caching (in-memory or Redis) can be added by wrapping the service interface without API contract changes.
