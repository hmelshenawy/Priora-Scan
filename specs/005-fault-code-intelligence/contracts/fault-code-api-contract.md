# Fault Code Intelligence API Contract

**Feature**: Fault Code Intelligence (Phase 005)
**Date**: 2026-06-10
**Audience**: Frontend developers, internal API consumers (live data, AI features), backend developers

---

## Overview

Feature 005 introduces one new public endpoint and updates two existing response shapes. All endpoints are authenticated via the existing session cookie / JWT mechanism used elsewhere in PrioraScan. No new permission is required to read fault-code intelligence.

The endpoint is **read-only** and **global** (the `MasterFaultCode` table has no `organizationId`). The endpoint is reachable by any authenticated user; however, the code-by-code data is industry-standard and not tenant-specific, so leakage across tenants is by design for the reference data itself. Tenant isolation is preserved on the *parent* `SessionFaultCode` and `DiagnosticSession` rows that this endpoint may be used alongside.

---

## Endpoints

### 1. Get Enriched Fault Code by Value

```
GET /fault-codes/{code}
Authorization: <session cookie or bearer JWT>
```

**Path Parameter**:
- `code` (string, required) — the OBD-II fault code, e.g., `P0301`. Case-insensitive (server uppercases before lookup).

**Response (200 OK)** — known code:

```json
{
  "code": "P0301",
  "title": "Cylinder 1 Misfire Detected",
  "description": "Cylinder 1 Misfire Detected",
  "system": "POWERTRAIN",
  "severity": "UNKNOWN",
  "commonCauses": [],
  "recommendedChecks": [],
  "isGeneric": true,
  "manufacturer": null,
  "source": "code-descriptions.sqlite",
  "hasDescription": true
}
```

**Response (200 OK)** — unknown code (graceful fallback, NOT 404):

```json
{
  "code": "X9999",
  "title": null,
  "description": null,
  "system": "UNKNOWN",
  "severity": "UNKNOWN",
  "commonCauses": [],
  "recommendedChecks": [],
  "isGeneric": false,
  "manufacturer": null,
  "source": null,
  "hasDescription": false
}
```

**Response (401 Unauthorized)**:

```json
{
  "code": "UNAUTHENTICATED",
  "message": "Authentication required."
}
```

**Notes**:
- A response of HTTP 200 with `hasDescription: false` is the canonical "unknown" signal. HTTP 404 is reserved for genuinely unreachable resources; unknown codes are a normal and expected case.
- `commonCauses` and `recommendedChecks` are always returned as arrays (possibly empty). They are never `null` in the response shape.
- The response is cache-friendly: the controller does not include any volatile fields (timestamps, request IDs) on the success body. Future caching layers can cache by `(code)` key safely.

---

## Updated Response Shapes (Existing Endpoints)

### 2. Get Diagnostic Session

```
GET /diagnostic-sessions/{sessionId}
```

The existing response shape is **extended** with enriched fault-code fields. The original `SessionFaultCode` fields are preserved (no field removals).

**New `faultCodes[i]` shape**:

```json
{
  "id": "uuid",
  "code": "P0301",
  "status": "ACTIVE",
  "ecu": "ECM",
  "source": "OBD_SCAN",
  "importedAt": "2026-06-10T12:00:00Z",

  "title": "Cylinder 1 Misfire Detected",
  "description": "Cylinder 1 Misfire Detected",
  "system": "POWERTRAIN",
  "severity": "UNKNOWN",
  "commonCauses": [],
  "recommendedChecks": [],
  "isGeneric": true,
  "manufacturer": null,
  "hasDescription": true
}
```

For unknown codes, the enriched fields follow the same fallback shape as endpoint (1). The Diagnostic Session endpoint continues to enforce tenant isolation on the session itself; the enrichment data is global reference data and does not change tenant scope.

### 3. Get OBD Scan Result

```
GET /obd/scan-jobs/{scanJobId}
```

The existing response shape is **extended** with the same enriched fault-code fields as endpoint (2). The scan-result page reads from this endpoint and renders the enriched list.

---

## DTO Conventions

- All response fields use camelCase.
- Enum values are returned as uppercase strings (`"POWERTRAIN"`, `"UNKNOWN"`).
- `null` is used for missing/empty imported fields (`title`, `description`, `manufacturer`).
- `[]` (empty array) is used for missing/empty derived lists (`commonCauses`, `recommendedChecks`).
- `hasDescription` is computed at the controller/service boundary and is always present in responses that include enriched fault codes.

---

## Future-Only Endpoints (Not Implemented in Feature 005)

The following endpoints are listed here for forward planning only. They are **out of scope** for Feature 005 and MUST NOT be implemented as part of this feature:

- `GET /fault-codes?query=P03` — substring/prefix search for a future lookup UI.
- `GET /fault-codes?manufacturer=BMW` — manufacturer-filtered listing for OEM code sets.
- `POST /fault-codes/import` — administrative re-seed endpoint (the seed in Feature 005 is a CLI script, not an API call).

The MVP endpoint surface is the single `GET /fault-codes/{code}` plus the two enriched extensions to existing endpoints.

---

## Cache-Friendliness Notes (for Future Implementation)

The response shape and controller are designed so a future caching decorator can wrap the enrichment service without altering the API contract. Specifically:

- Response is a pure function of `code`. No volatile fields are mixed in.
- `hasDescription` is deterministic given `(code, knowledgeBase)`.
- The service interface should accept a wrapper (e.g., a NestJS provider that delegates to the underlying service) and the controller should depend on the interface symbol, not the concrete class. This swap is a future task; Feature 005 does not implement caching.

---

## Error Handling

| Error case | Status | Body |
|---|---|---|
| Unauthenticated request | 401 | `{ "code": "UNAUTHENTICATED", "message": "..." }` |
| Invalid `code` path param (non-string, empty, length > 10) | 400 | `{ "code": "INVALID_CODE", "message": "..." }` |
| Unknown code (graceful) | 200 | `hasDescription: false` payload |
| Internal server error | 500 | `{ "code": "INTERNAL_ERROR", "message": "..." }` (no enrichment data leaked) |

Unknown codes are never an error condition.
