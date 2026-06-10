# Feature Specification: Fault Code Intelligence

**Feature Branch**: `005-fault-code-intelligence`
**Created**: 2026-06-10
**Status**: Draft
**Input**: User description: "Fault Code Intelligence — Convert imported `SessionFaultCode` records into enriched diagnostic information using a local fault code knowledge base imported from `backend/data/code-descriptions.sqlite` into a new `MasterFaultCode` application table."

## Context

PrioraScan is a web-first Intelligent Diagnostic Scanner. Feature 004 OBD Foundation is complete and MVP accepted. Today the user can complete a full OBD scan and view the raw fault codes returned by the vehicle, but the codes are displayed as opaque identifiers (`P0301`, `P0171`, `U0100`) with no meaning attached. A technician or service advisor must look every code up externally to understand what it represents, how severe it is, or what subsystem it relates to.

Feature 005 (Fault Code Intelligence) transforms the displayed fault codes from opaque strings into useful diagnostic knowledge by linking each code to a curated, locally-resident knowledge base. The knowledge base is shipped as a SQLite asset (`backend/data/code-descriptions.sqlite`) and is imported into the application database (`MasterFaultCode` table) at seed time. At runtime, every `SessionFaultCode` record is enriched with a human-readable title, description, severity, system/category, common causes, and recommended checks — without any external API dependency.

The user is a multi-tenant SaaS: each workshop belongs to an organization, and scan data is strictly tenant-scoped. `MasterFaultCode` is global reference data, not tenant-owned, because fault-code meanings are industry-standard and identical across all tenants.

### Data Source & Field Provenance

The seed asset `code-descriptions.sqlite` is a thin reference file: it contains only the OBD-II code and a short description. Feature 005 therefore divides `MasterFaultCode` fields into two categories:

| Category | Fields | Source |
|----------|--------|--------|
| **Imported directly from SQLite** | `code`, `title`, `description`, `isGeneric`, `source` | Read from `codes.id` and `codes.desc` at seed time |
| **Derived by the enrichment service** | `system`, `severity`, `commonCauses`, `recommendedChecks` | Computed from the code (prefix, family) at read time by the enrichment service |

The SQLite asset is **not** expected to contain severity, causes, or recommendations. The application owns those rules. This split keeps the asset small and versionable, and keeps severity/causes logic upgradeable without re-seeding.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — View Enriched Fault Code Description (Priority: P1)

A technician opens a completed Diagnostic Session in the web application and sees each fault code displayed with its title, description, severity indicator, and system/category badge — in addition to the raw code, status, and ECU source.

**Why this priority**: This is the core value of the feature. Without the enrichment displayed in the UI, the rest of the feature has no user-facing impact and the workshop is still searching codes externally.

**Independent Test**: Import a known code (`P0301`) into a session, open the session detail page, and verify that the row for `P0301` shows the title "Cylinder 1 Misfire Detected", a non-empty description, severity `UNKNOWN` (per the simplified initial severity strategy — see US1-AC3 below), and system `POWERTRAIN`.

**Acceptance Scenarios**:
1. **Given** a Diagnostic Session containing `P0301` (which exists in the knowledge base), **When** a user opens the session detail page, **Then** the fault code is displayed with a title, description, severity, and system/category.
2. **Given** a Diagnostic Session containing multiple fault codes that all exist in the knowledge base, **When** the user opens the session detail page, **Then** every code is enriched; none are missing the new fields.
3. **Given** a Diagnostic Session containing `P0301` and the user refreshes the page, **When** the page reloads, **Then** the enrichment persists (no recomputation, no regression to raw display) and the severity shown is `UNKNOWN` (Feature 005 does not classify imported codes; severity is intentionally `UNKNOWN` for all ~4,655 imported rows until a future version introduces rule-based overrides).

---

### User Story 2 — Graceful Fallback for Unknown Codes (Priority: P1)

A technician views a Diagnostic Session that contains a fault code that does not exist in the local knowledge base (e.g., a manufacturer-specific code the SQLite asset does not cover). The application must still display the code, its status, and ECU; it must never crash, return a 500, or render an empty row.

**Why this priority**: Vehicles routinely report codes that the generic OBD-II knowledge base does not include. A crash on an unknown code would break the scan-results page — exactly the failure mode that frustrates technicians in legacy tools.

**Independent Test**: Manually insert a session fault code whose value is `X9999` (not in the knowledge base), open the session detail page, and verify the page renders, the code `X9999` is shown, status and ECU are shown, severity is `UNKNOWN`, system is inferred from the prefix (or `UNKNOWN`), and a "No description available" indicator is shown for the description fields.

**Acceptance Scenarios**:
1. **Given** a session contains a fault code that is not in `MasterFaultCode`, **When** the user opens the session, **Then** the code, status, and ECU are displayed, severity is `UNKNOWN`, and a clear "No description available" indicator is shown.
2. **Given** a session contains a fault code with an unrecognized prefix (not `P`, `B`, `C`, or `U`), **When** the user opens the session, **Then** the code is still displayed and system is shown as `UNKNOWN` (not blank, not crashing).
3. **Given** the knowledge base table is empty (e.g., the seed script has not yet been run), **When** the user opens any session, **Then** every fault code falls back to the "unknown code" display rather than throwing.

---

### User Story 3 — Enrichment Visible on OBD Scan Results (Priority: P1)

After a scan completes, the OBD scan-results page (the page shown immediately after a scan finishes, before navigating to the full Diagnostic Session) shows the same enriched fault-code information as the Diagnostic Session detail page.

**Why this priority**: A technician who has just completed a scan expects to see the diagnosis there and then, not only after opening the full session. Both pages must stay in sync to avoid the impression that enrichment is partial.

**Independent Test**: Run a scan that returns `P0301`, view the post-scan results page, and verify the same title/description/severity/system fields are shown for that code as on the Diagnostic Session detail page.

**Acceptance Scenarios**:
1. **Given** a completed scan that imported fault codes, **When** the user views the scan results page, **Then** every code is displayed with the enriched fields.
2. **Given** a completed scan whose codes include one unknown code, **When** the user views the scan results page, **Then** the unknown code is rendered with the same fallback behavior as on the session page.

---

### User Story 4 — Seed the Local Knowledge Base (Priority: P2)

A system administrator (or a CI/release pipeline) runs the seed script and the local `code-descriptions.sqlite` asset is imported into the `MasterFaultCode` table. The import is repeatable: re-running the script updates existing codes and adds new ones, never producing duplicate rows. The seed only populates the directly-imported fields (`code`, `title`, `description`, `isGeneric=true`, `source`); severity and the related rule-based fields are not derived at seed time.

**Why this priority**: Without the seed, the feature has no data. The seed is a one-shot operational task rather than a per-user interaction, so it ranks just below the user-facing stories.

**Independent Test**: From an empty `MasterFaultCode` table, run the seed script; verify the row count matches the SQLite asset (~4,655 codes) and a known sample row is present. Run the script a second time and verify the row count is unchanged and the sample row's fields are still correct (idempotency).

**Acceptance Scenarios**:
1. **Given** an empty `MasterFaultCode` table, **When** the seed script runs, **Then** approximately 4,655 rows are inserted and a known sample (e.g., `P0301`) is present with a non-empty title and description; `isGeneric` is `true` and `manufacturer` is `null`; `severity` is `UNKNOWN`.
2. **Given** a `MasterFaultCode` table already populated, **When** the seed script runs again, **Then** no duplicate rows are created and existing rows whose source data has not changed are preserved (idempotent upsert).
3. **Given** the SQLite source file is missing or unreadable, **When** the seed script runs, **Then** the script exits with a clear, non-zero error and a message identifying the missing file — it does not silently truncate the table.

---

### User Story 5 — Look Up a Code by Value (Priority: P3)

An internal API consumer (e.g., the future "live data" or "AI" features) requests the enriched information for a specific fault code value via an authenticated endpoint, without first needing a session or scan job.

**Why this priority**: This is plumbing for downstream features. It is testable in isolation and adds little user-facing value on its own, so it is the lowest priority of the in-scope work.

**Independent Test**: Authenticated `GET /fault-codes/{code}` for a known code returns the full enriched payload. For an unknown code, the endpoint returns 200 with a payload that has `severity: UNKNOWN`, `system: <prefix-inferred or UNKNOWN>`, and `title: null` / `description: null` (i.e., graceful fallback, not 404).

**Acceptance Scenarios**:
1. **Given** a user is authenticated, **When** they request `GET /fault-codes/P0301`, **Then** the response includes the stored title, description, system, severity, common causes, and recommended checks for that code.
2. **Given** a user is authenticated, **When** they request `GET /fault-codes/X9999` (unknown), **Then** the response is HTTP 200 with a payload shaped like an enriched code but with `severity: UNKNOWN`, `system: UNKNOWN`, and null title/description.
3. **Given** an unauthenticated request, **When** the user calls the endpoint, **Then** the response is HTTP 401 and no enrichment data is leaked.

---

### Edge Cases

- **Code not in knowledge base**: Code is still displayed with `severity: UNKNOWN`, system inferred from prefix when possible, and a "No description available" indicator. See US2.
- **Malformed code (non-alphanumeric or wrong length)**: System stores the code as-is on import; the enrichment layer treats it as unknown and infers system as `UNKNOWN`. No crash.
- **Prefix mapping fallback**: Codes starting with `P` → `POWERTRAIN`, `B` → `BODY`, `C` → `CHASSIS`, `U` → `NETWORK`. Any other prefix or empty code → `UNKNOWN`.
- **Empty knowledge base**: If the seed has not been run, enrichment behaves as if every code is unknown. No null-reference errors, no 500s.
- **Re-import with changed data**: Re-running the seed updates the title/description of existing codes but does not touch the `createdAt` of unchanged rows; the `updatedAt` reflects the most recent sync.
- **Case sensitivity in lookups**: Codes are normalized to uppercase before lookup. A stored `p0301` and an incoming `P0301` resolve to the same enriched record.
- **Tenant isolation**: A user in tenant A querying their session's fault codes never sees another tenant's session codes. The enrichment layer is global reference data and does not break this — but the underlying session fault codes remain tenant-scoped.
- **Seed failure mid-run**: The seed runs in a single transaction. If any row fails, the whole import is rolled back and the table is left in its pre-seed state.
- **Imported `isGeneric` is `true` for all ~4,655 codes from the SQLite asset**: the asset only contains generic OBD-II codes. `manufacturer` is `null` for all imported rows. Future code sets (e.g., Mercedes, BMW, Toyota OEM-specific codes) are not in scope for this feature but the schema is forward-compatible with them.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST persist a `MasterFaultCode` reference table containing at minimum: `id`, `code` (unique, uppercase, non-null), `title`, `description`, `system` (enum), `severity` (enum), `commonCauses` (JSON list or null), `recommendedChecks` (JSON list or null), `source` (string identifying the data origin, e.g., `code-descriptions.sqlite`), `manufacturer` (nullable string for OEM-specific codes), `isGeneric` (boolean flag for OBD-II generic codes), `createdAt`, `updatedAt`.
- **FR-002**: The system MUST provide a seed/import script that reads `backend/data/code-descriptions.sqlite` and upserts all rows into `MasterFaultCode` idempotently (no duplicates on re-run). The seed MUST only populate fields imported directly from the asset (`code`, `title`, `description`, `isGeneric=true`, `source`); it MUST NOT attempt to compute or assign severity, system, commonCauses, or recommendedChecks at seed time.
- **FR-003**: The seed script MUST read the SQLite `codes` table, mapping `id` → `MasterFaultCode.code` and `desc` → `MasterFaultCode.title` and `description` (the exact split between title and description is a planning decision; both are populated from the asset's `desc` value).
- **FR-004**: The seed script MUST run inside a single database transaction. On any failure, the entire import MUST roll back and the table MUST be left unchanged.
- **FR-005**: The seed script MUST exit with a non-zero code and a clear error message if the SQLite file is missing, unreadable, or does not contain a `codes` table with `id` and `desc` columns.
- **FR-006**: The system MUST expose an authenticated API endpoint `GET /fault-codes/{code}` that returns the enriched record for a given fault code, including `code`, `title`, `description`, `system`, `severity`, `commonCauses`, `recommendedChecks`, `isGeneric`, `manufacturer`, and `source`. For an unknown code, the endpoint MUST return HTTP 200 with `severity: UNKNOWN`, system inferred from the code prefix, and a null/empty payload for the description fields rather than HTTP 404.
- **FR-007**: The Diagnostic Session detail page and the post-scan OBD results page MUST display, for each `SessionFaultCode` row, the raw code, status, ECU source, the enriched title, description, severity indicator, and system/category badge.
- **FR-008**: The enrichment service MUST derive the system/category from the first character of the code: `P` → `POWERTRAIN`, `B` → `BODY`, `C` → `CHASSIS`, `U` → `NETWORK`. Any other prefix (or empty code) MUST yield `UNKNOWN`.
- **FR-009**: The enrichment service MUST normalize incoming codes to uppercase before lookup. If no matching `MasterFaultCode` is found, the service MUST return an "unknown" enrichment (severity `UNKNOWN`, system inferred from prefix, null title/description, empty commonCauses/recommendedChecks).
- **FR-010**: Severity values MUST be one of: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`, `UNKNOWN`. System/category values MUST be one of: `POWERTRAIN`, `BODY`, `CHASSIS`, `NETWORK`, `UNKNOWN`.
- **FR-011**: The enrichment service MUST NOT call any external service at runtime. All enrichment data MUST be served from the local application database.
- **FR-012**: `MasterFaultCode` is global reference data and MUST NOT be tenant-scoped. `SessionFaultCode` and its parent entities (`DiagnosticSession`, `ScanJob`) MUST remain tenant-scoped. Tenant isolation on sessions and scans MUST NOT be weakened.
- **FR-013**: The existing Feature 004 scan flow (adapter connect → VIN read → fault-code import → view results) MUST continue to work unchanged when this feature ships. Importing fault codes into a session MUST NOT require the enrichment layer to be present.
- **FR-014**: The seed script MUST be runnable on a fresh database and MUST be re-runnable against an existing populated database without manual cleanup.
- **FR-015**: The session-detail and scan-results pages MUST render successfully for any combination of known and unknown fault codes. A page that contains only unknown codes MUST still render the code, status, ECU, severity `UNKNOWN`, and a "No description available" indicator.
- **FR-016**: The feature MUST NOT introduce any new permission requirement on the scan/session endpoints. If a new endpoint is added (FR-006), it MUST be reachable by the same authenticated users who can view scan results in their tenant; it MUST NOT require an admin or elevated role.
- **FR-017**: The feature MUST NOT introduce any of the following: Live Data, PID polling, VIN decoding with VPIC, AI analysis, PDF reports, PrioraFlow integration, Freeze frame data, Graphing, Programming, Coding, Flashing, or OEM-specific repair procedures. These remain in future roadmap phases (Live Data & Sensor Monitoring, AI Analysis, Reports, PrioraFlow Integration).
- **FR-018**: The initial severity for all imported `MasterFaultCode` rows from the `code-descriptions.sqlite` asset MUST be `UNKNOWN`. Feature 005 MUST NOT classify, score, or assign severity to imported codes; the enrichment goal is knowledge enrichment, not diagnostic severity modeling. A future feature may introduce rule-based severity overrides for selected codes and code families (e.g., `P0300`–`P0308`, `P0562`, `P0606`), but such rules are out of scope for Feature 005.
- **FR-019**: Imported `MasterFaultCode` rows MUST set `isGeneric = true` and `manufacturer = null`. The `manufacturer` and `isGeneric` fields are forward-looking: future code sets (e.g., Mercedes, BMW, Toyota OEM-specific codes) may set `manufacturer` to a non-null value and `isGeneric` to `false` without requiring a schema migration.
- **FR-020**: The enrichment service MUST be designed so that future caching (in-memory or Redis) can be added without changing the public API contract or the controller-level response shape. `MasterFaultCode` is global, read-heavy, and rarely updated; the service interface MUST allow a caching decorator to be slotted in transparently. Caching itself is NOT implemented in Feature 005.

### Key Entities *(include if feature involves data)*

- **MasterFaultCode**: A global, tenant-independent reference record describing a single OBD-II fault code. Attributes:
  - `id`
  - `code` (unique key, uppercase, e.g., `P0301`)
  - `title` (short human-readable name; imported from `codes.desc`)
  - `description` (longer prose; imported from `codes.desc`; in Feature 005 typically equal to `title`)
  - `system` — **derived** by the enrichment service from the code prefix (`POWERTRAIN` / `BODY` / `CHASSIS` / `NETWORK` / `UNKNOWN`)
  - `severity` — **derived** by the enrichment service; in Feature 005 this is always `UNKNOWN` for imported rows
  - `commonCauses` — **derived** by the enrichment service (rule-based on the code family); null/empty in Feature 005
  - `recommendedChecks` — **derived** by the enrichment service (rule-based on the code family); null/empty in Feature 005
  - `source` (data origin identifier, e.g., `code-descriptions.sqlite`; imported)
  - `manufacturer` (nullable string for OEM-specific codes; `null` for the ~4,655 generic OBD-II rows)
  - `isGeneric` (boolean; `true` for imported generic rows)
  - `createdAt`, `updatedAt`
  - Seeded once from a local SQLite asset; never tenant-scoped.
- **SessionFaultCode** (existing, no schema change): A tenant-scoped record of a fault code read during a scan. Attributes: `id`, `organizationId`, `diagnosticSessionId`, `scanJobId`, `code`, `status` (ACTIVE/PENDING/PERMANENT), `ecu`, `source`, `importedAt`, `createdAt`. Enrichment is computed by looking up `MasterFaultCode` on `code` (and applying prefix/system rules) at read time.
- **EnrichedFaultCode** (read-model / DTO, not a stored entity): The combined view of a `SessionFaultCode` plus its enrichment, returned to the UI. Attributes include everything from `SessionFaultCode` plus `title`, `description`, `system`, `severity`, `commonCauses`, `recommendedChecks`, `isGeneric`, `manufacturer`, and a `hasDescription` boolean used by the UI to render the "No description available" indicator.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After running the seed script once on a fresh database, at least 4,000 distinct fault codes are present in `MasterFaultCode` and a known sample code (`P0301`) returns a non-empty title and description via the enrichment endpoint.
- **SC-002**: Running the seed script a second time against the same database produces zero new rows and zero duplicate `code` values (idempotency).
- **SC-003**: 100% of fault codes displayed on the Diagnostic Session detail page and the post-scan OBD results page include the enriched `title`, `description`, `severity`, and `system` fields — either populated from the knowledge base or explicitly marked as `UNKNOWN`/unavailable.
- **SC-004**: A session containing only unknown fault codes (codes not in `MasterFaultCode`) renders the page successfully with HTTP 200 and no 5xx errors in the server log; the page shows the raw code, status, ECU, `severity: UNKNOWN`, and a "No description available" indicator.
- **SC-005**: The enriched fault-code endpoint responds in under 200 ms p95 for a code lookup in a warm database.
- **SC-006**: The Feature 004 scan flow (adapter connect → VIN read → fault-code import → view results) remains functional after Feature 005 ships; existing scan-related tests continue to pass.
- **SC-007**: No new external network calls are introduced at runtime. All enrichment data is served from the local application database, verifiable by inspecting the network log of a single request that returns enriched fault codes.
- **SC-008**: A user in tenant A cannot retrieve enrichment data through a request bound to tenant B's session/scan. The existing tenant-isolation tests for `SessionFaultCode` continue to pass.
- **SC-009**: 100% of rows in `MasterFaultCode` seeded from `code-descriptions.sqlite` have `severity = UNKNOWN`, `isGeneric = true`, and `manufacturer = null` immediately after the seed runs; no severity, system, commonCauses, or recommendedChecks values are computed or assigned by the seed.
- **SC-010**: The enrichment service can be wrapped in a caching decorator (in-memory or Redis) by adding a new module wrapping the existing service interface, with zero changes to the controllers, DTOs, or HTTP responses.

## Assumptions

- The user is multi-tenant (organization-scoped) and the existing tenant-isolation model in `DiagnosticSession` / `ScanJob` / `SessionFaultCode` is unchanged by this feature.
- The `code-descriptions.sqlite` file is read-only, versioned with the application, and is the canonical source of fault-code knowledge for this feature. Updates to the file ship as new versions of the application and are applied by re-running the seed.
- The `codes.id` column contains exactly the 5-character OBD-II code format (one letter, four digits, e.g., `P0301`). The mapping `id → code` is a 1:1 verbatim copy (no transformations other than case normalization).
- The `desc` column is a short English-language description. The seed populates both `title` and `description` from this value; the exact split is a planning decision (e.g., title = first sentence, description = full string, or title = description = full string).
- Feature 005's enrichment goal is **knowledge enrichment, not diagnostic severity modeling**. The seed deliberately does not classify or score the ~4,655 imported codes. Future feature versions may introduce rule-based severity overrides for selected codes and code families (e.g., `P0300`–`P0308` for cylinder misfires, `P0562` for system voltage low, `P0606` for PCM processor fault), but those rules are explicitly out of scope for Feature 005.
- The `manufacturer` and `isGeneric` fields are forward-looking. The current SQLite asset contains only generic OBD-II codes (`isGeneric=true`, `manufacturer=null`). Future support for Mercedes, BMW, Toyota, and other OEM-specific fault codes is enabled by the schema without requiring a migration in Feature 005.
- The new read-only enrichment endpoint (`GET /fault-codes/{code}`) is reachable by any authenticated user in the tenant. No new permission is required.
- The feature is implemented within the existing NestJS service / repository / DTO layers and the existing Next.js frontend pages; no new architectural patterns are introduced.
- The seed script is run as part of the deployment pipeline (or manually by an operator) and is not invoked from the web application or the Desktop Agent.
- The Diagnostic Session detail page and the OBD scan-results page already exist (delivered in Feature 004) and only need enrichment data added to their existing fault-code lists; no new pages or major layout changes are required.
- `MasterFaultCode` is global, read-heavy, and rarely updated. Feature 005 designs the enrichment service so that a future caching layer (in-memory or Redis) can be added without changing the public API contract; caching itself is not implemented in this feature.

## Out of Scope (Confirmed Exclusions)

Feature 005 explicitly does **NOT** include any of the following; they remain in future roadmap phases:

- **Live Data** / **PID polling** (Feature 006 — Live Data & Sensor Monitoring)
- **VIN decoding with VPIC** (Feature 006 — Live Data & Sensor Monitoring)
- **AI diagnosis / analysis** (Feature 007 — AI Analysis)
- **PDF / digital reports** (Feature 008 — Reports)
- **PrioraFlow integration** (Feature 009 — PrioraFlow Integration)
- **Freeze frame data**
- **Graphing** of live or historical sensor streams
- **Programming**, **Coding**, **Flashing** of ECUs
- **OEM-specific repair procedures** (Mercedes, BMW, Toyota, etc.) — the schema accommodates them, but importing the corresponding code sets is a future activity

## Future Enhancements (Roadmap Notes)

The following items are NOT part of Feature 005, but are recorded here so the design leaves room for them:

- **Search/list endpoint** — `GET /fault-codes?query=P03` (substring/prefix search across `code`, `title`, `description`) to power a future code-search UI for technicians who do not know the exact code. Out of scope for Feature 005; the existing endpoint remains `GET /fault-codes/{code}`.
- **Caching layer** — in-memory or Redis cache in front of the enrichment service, leveraging the global, read-heavy, rarely-updated nature of `MasterFaultCode`. The service interface is designed to accept a caching decorator without API contract changes.
- **Rule-based severity overrides** — selected codes and code families (e.g., `P0300`–`P0308`, `P0562`, `P0606`) may be classified with explicit severity values in a future version. In Feature 005, all imported codes are `severity = UNKNOWN`.
- **OEM-specific code sets** — future imports for manufacturer-specific fault codes (Mercedes, BMW, Toyota, etc.), with `manufacturer` populated and `isGeneric = false`.
- **Common causes & recommended checks** — rule-based content for high-traffic code families; empty in Feature 005, populated by future rule packs.
