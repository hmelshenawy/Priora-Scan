# Specification Quality Checklist: Control Unit Discovery Foundation

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-06-15
**Updated**: 2026-06-15 (corrections 1–8 applied; plan corrections 1–3 applied)
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- All items pass validation after corrections 1–7 and plan corrections 1–3.
- **Correction 1 (Extract Reusable UDS Response Parser)**: UDS parsing logic (`NEGATIVE_RESPONSE_CODES`, `classify_response()`, `parse_raw_header_payload()`, `extract_negative_response()`) is extracted into `desktop-agent/src/obd/commands/uds_response_parser.py`. Discovery module imports from it. Key entity added to spec. Plan Phase 2 split into parser creation (step 1) and discovery engine creation (step 2). New test file `test_uds_response_parser.py` added. Dependency table updated.
- **Correction 2 (Clarify Existing Command Queue Usage)**: Architecture note added to plan Technical Context section explaining that `LiveDataCommandType` is reused as the sole agent command mechanism. No new queue, scheduler, dispatcher, or transport layer. Assumption added to spec. Contract file updated with architecture note. Plan dependencies updated.
- **Correction 3 (Persist Discovery Scan Mode)**: `scanMode` field (`"FUNCTIONAL_THEN_PHYSICAL"` in v1) added to `ControlUnitDiscovery` interface in data-model.md, all JSON examples in spec/contracts/quickstart, FR-026 added, FR-019 updated, SC-003 updated, US2 scenario 7 updated, US3 scenario 3 updated, US3 independent test updated, FR-011 updated, Key Entities updated with ScanMode type, assumptions updated. Future scan mode values documented (`FUNCTIONAL_ONLY`, `PHYSICAL_ONLY`, `ADVANCED_RANGE`, `TOYOTA_PROFILE`, `MERCEDES_PROFILE`).
- **Correction 4 (Configuration-Driven Probe Sequence)**: `DISCOVERY_PROBE_SEQUENCE = ["22F190"]` is a module-level configuration constant in `control_unit_discovery.py`. The strategy receives `probe_sequence` as a parameter and does not hardcode probe values in its execution logic. Plan Phase 2 Step 2 documents this. Quickstart updated. Data model `probeSequence` field references configuration source. Contract rule 13 added.
- **Correction 5 (Explicit Confidence Rules)**: Deterministic confidence assignment rules documented in data model (Confidence Assignment Rules table with Rule column), plan Phase 2 Step 2, quickstart, and contract rule 14. LOW = functional-only (no physical confirmation), HIGH = any physical probe or functional+physical confirmed. No heuristic or probabilistic scoring.
- **Correction 6 (Multiple Functional Responders)**: A single functional probe (`7DF`) may return multiple CAN response frames from different ECUs. The UDS response parser (`classify_response()`) parses multiline responses into individual probe results. Each unique `responseId` becomes a separate `ProbeResult` and `Responder`. Data model adds multiple responders note to ProbeResult description. Contracts adds a multi-responder JSON example. Quickstart adds a multiple responders example section. Plan adds test scenarios and mock profile for 3-functional-responder case. Spec edge case confirms this behavior. Risk assessment updated.
- **Correction 7 (Discovery Never Fails Session)**: Probe-level failures (timeout, NO DATA, malformed response, adapter disconnect) are converted into probe result records with appropriate status (`NOT_FOUND`, `MALFORMED`, or `ERROR`). Partial results are always persisted. Only unrecoverable startup failures prevent discovery execution. Backend `processControlUnitDiscovery()` also applies error isolation. Data model adds Discovery Resilience section. Contracts adds partial results JSON example and contract rules 11–12. Quickstart adds error isolation example. Plan adds error isolation to Phase 2 Step 5, Phase 3 Steps 4–5, and risk assessment. Tests added for error isolation scenarios.
- No references remain to: `future.inventory`, `future.dtcScan`, single fixed probe architecture, `requestIds` flat array, probe history as default UI view, `responseId`-only uniqueness constraint, UDS parsing logic inside discovery module, hardcoded probe values in strategy logic, heuristic confidence scoring, single-responder functional assumption, session-crashing discovery failures, probe failures aborting entire scan.
- **Correction 8 (Probe-Level Failure Isolation)**: Each probe execution is isolated in its own try/except — a single probe failure never aborts the entire discovery scan. Failures produce `ProbeResult` records with `status: "ERROR"`, `responseType: "ERROR"`, and a machine-readable `errorCode` field (`TIMEOUT`, `COMMUNICATION_ERROR`, `UNEXPECTED_PAYLOAD`, `ADAPTER_DISCONNECT`). The scan continues with remaining probes. Only unrecoverable startup failures prevent discovery execution. `errorCode` is `null` for all non-ERROR statuses. Data model adds ERROR to status/responseType enums, errorCode field, and Error Code Mapping table. Contracts add `errorCode` to all probe examples, add probe isolation contract rules 15-16, update partial results example to use `ERROR`/`ADAPTER_DISCONNECT` instead of `UNKNOWN`/`MALFORMED`. Spec adds FR-027 (probe isolation), FR-028 (errorCode), updates FR-016 (five categories), adds ERROR edge case. Plan adds probe-level isolation to Phase 2 Step 2 and Step 5, updates test matrix with error isolation tests, adds errorCode validation to Phase 3, adds error probe display to Phase 4, updates risk assessment and regression checklist. Quickstart adds ERROR probe example and per-probe isolation explanation.