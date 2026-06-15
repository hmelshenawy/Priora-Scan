# Feature Specification: Control Unit Discovery Foundation

**Feature Branch**: `019-control-unit-discovery`

**Created**: 2026-06-15

**Status**: Draft

**Input**: User description: "Add a read-only Control Unit Discovery feature to PrioraScan. Discover which diagnostic CAN request IDs have responding ECUs and store the result in a structured JSON format that Feature 020 can build on for ECU inventory, ECU-specific DTC reading, and UDS read-only exploration. This feature moves PrioraScan from an engine-focused scanner toward a full vehicle scanner."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Discover Responding ECUs (Priority: P1)

As a technician connecting an ELM327 adapter to a vehicle, I want to run a control unit discovery scan so that I can see which ECUs respond on the vehicle's CAN bus, including those that respond with negative UDS responses.

**Why this priority**: This is the core value of the feature — without discovery results, nothing else in the feature matters. A negative response (e.g., `7F2211`) proves an ECU exists and is reachable, which is the fundamental insight this feature provides.

**Independent Test**: Can be fully tested by connecting to a real vehicle or simulated adapter, running the discovery scan, and verifying that both positive and negative UDS responses are recorded as discovered ECUs, while `NO DATA` responses are recorded as not found.

**Acceptance Scenarios**:

1. **Given** a vehicle with at least one responding ECU, **When** the technician runs a discovery scan, **Then** the system sends each probe in the configured `probeSequence` to each request ID (1 functional + up to 8 physical = maximum 9 total probes per probe in the sequence), and records at least one discovered ECU with its request ID, response ID, method, status, and response type.
2. **Given** a vehicle where an ECU returns a negative UDS response (e.g., `7E8037F2211`), **When** the discovery scan processes this response, **Then** the ECU is classified as `DISCOVERED` with `responseType: NEGATIVE`, including the negative response code and meaning, and the response is parsed into `rawHeader` (`7E8`), `rawPayload` (`037F2211`), and `rawResponse` (`7E8037F2211`).
3. **Given** a vehicle where a request ID returns `NO DATA`, **When** the discovery scan processes this result, **Then** the probe is classified as `NOT_FOUND` with `responseType: NO_RESPONSE`, and `rawHeader` and `rawPayload` are stored as `null`.
4. **Given** a vehicle where functional addressing via `7DF` returns one or more responses, **When** the discovery scan completes, **Then** all functional responders are recorded with `method: FUNCTIONAL` and `confidence: LOW`.
5. **Given** a vehicle where physical probing confirms a responder also found via functional probing, **When** the discovery scan completes, **Then** the responder's `confidence` is upgraded to `HIGH`, `confirmedByPhysical` is `true`, and the `discoveredBy` array includes entries for both the functional and physical discovery sources.
6. **Given** a vehicle where physical discovery finds a responder not seen via functional probing, **When** the discovery scan completes, **Then** that responder is recorded with `confidence: HIGH` and its `discoveredBy` array includes the physical discovery source entry.
7. **Given** the discovery scan's `probeSequence` contains `22F190` as its only entry (v1 default), **When** the scan runs, **Then** only the `22F190` probe is sent per request ID.
8. **Given** a responder discovered through multiple discovery paths, **When** the responder record is created, **Then** the `discoveredBy` array contains one entry per unique (method, requestId, probe) combination that reached the responder.

---

### User Story 2 - View Discovered Control Units (Priority: P2)

As a technician, I want to view discovered control units (responders) in the UI so I can understand which ECUs are reachable on the vehicle network.

**Why this priority**: Discovery data must be visible to be useful. However, it depends on P1 (discovery must run first before anything can be displayed).

**Independent Test**: Can be tested by providing pre-existing discovery data (mock or stored) and verifying the UI displays responders with response ID, confidence, and status, with optional access to probe history details.

**Acceptance Scenarios**:

1. **Given** discovery results with at least one discovered responder, **When** the technician views the Control Units section, **Then** the default view displays responders from the `responders` array showing Response ID, Confidence, and Status for each unique responder.
2. **Given** discovery results where zero ECUs were found, **When** the technician views the Control Units section, **Then** the UI displays an empty state message indicating no control units were discovered.
3. **Given** a responder that returned a negative response, **When** the technician views the responder details, **Then** the negative response code and meaning are visible.
4. **Given** discovery results, **When** the technician views the Control Units section, **Then** no inferred ECU names or guessed module names are displayed.
5. **Given** a responder discovered only via functional probing, **When** the technician views the Control Units section, **Then** the responder is shown with `confidence: LOW`.
6. **Given** a responder confirmed by physical probing, **When** the technician views the Control Units section, **Then** the responder is shown with `confidence: HIGH`.
7. **Given** the technician wants to inspect probe-level detail, **When** they expand or navigate to an optional details view, **Then** the full `probes` array becomes visible with probe history, raw responses, and discovery details including the `scanMode` metadata.

---

### User Story 3 - Store Discovery for Future Features (Priority: P3)

As a developer, I want discovery results stored in a structured JSON format so Feature 020 can extend the data model without redesigning it.

**Why this priority**: This is a structural/data concern that enables future features but doesn't directly deliver user-visible value beyond what P1 and P2 already provide.

**Independent Test**: Can be tested by verifying the persisted JSON contains `probes` array, `responders` array with `discoveredBy` sources, `probeSequence` field, `scanMode` field, parsed raw data fields (`rawHeader`, `rawPayload`), and `confidence` field, and that existing vehicle health data remains unaffected.

**Acceptance Scenarios**:

1. **Given** a completed discovery scan, **When** the results are persisted, **Then** the JSON structure includes both `probes` (full history) and `responders` (unique responders) arrays.
2. **Given** a completed discovery scan, **When** the results are persisted, **Then** the JSON structure includes the `probeSequence` field listing the probes that were sent (v1: `["22F190"]`).
3. **Given** a discovered responder, **When** the responder record is stored, **Then** it includes the `confidence` field (`LOW` or `HIGH`), a `discoveredBy` array listing each discovery source (method, requestId, probe) that reached the responder, and the `scanMode` field is set to `"FUNCTIONAL_THEN_PHYSICAL"`.
4. **Given** existing vehicle health data in the diagnostic session, **When** discovery results are stored under `controlUnitDiscovery`, **Then** the existing health, DTC, freeze frame, readiness, and extended PID data remains unchanged.
5. **Given** a diagnostic session without discovery results, **When** the session data is retrieved, **Then** the system handles the missing `controlUnitDiscovery` field gracefully without errors.

---

### Edge Cases

- What happens when the vehicle returns no responses at all (all `NO DATA`)? → The scan completes successfully with zero discovered ECUs, summary shows `respondersFound: 0`, and the UI shows an empty state.
- What happens when a response is malformed (unparseable hex)? → The system classifies it as `UNKNOWN`/`MALFORMED` and never crashes; `rawHeader` and `rawPayload` are stored as `null` if parsing fails.
- What happens when a probe execution fails (timeout, communication error, unexpected payload)? → The system classifies it as `ERROR`/`ERROR` with a machine-readable `errorCode` (`TIMEOUT`, `COMMUNICATION_ERROR`, `UNEXPECTED_PAYLOAD`, or `ADAPTER_DISCONNECT`). The scan continues with remaining probes.
- What happens when functional discovery returns multiple responders on a single request? → All response IDs are captured and recorded as separate probe entries. Each unique `responseId` becomes a separate `ProbeResult` and later a separate `Responder` entry with its own `discoveredBy` sources.
- What happens if the adapter disconnects mid-scan? → The scan reports whatever was collected up to the disconnection point; partial results are still valid. Probes that could not be completed are recorded with `status: "ERROR"`, `responseType: "ERROR"`, and `errorCode: "ADAPTER_DISCONNECT"`. The overall diagnostic session continues unaffected — discovery failure is isolated to the probe level.
- What happens when the same ECU responds to both functional and physical probes? → The responder appears once in the `responders` array with `confidence: HIGH`, `confirmedByPhysical: true`, and the `discoveredBy` array includes entries for both discovery sources.
- What happens when `probeSequence` contains multiple probes (future)? → The discovery engine iterates over each probe in the sequence for each request ID; v1 sends only `22F190`.

## Data Model Notes

### Responder Uniqueness

Responder uniqueness strategy is implementation-defined in v1. The minimum requirement is `responseId`-based deduplication: probes that return the same `responseId` are merged into a single responder entry. Future versions may introduce additional identifiers (e.g., for 29-bit CAN, gateway routing, or manufacturer-specific addressing) without requiring a data migration.

The `discoveredBy` array provides the full discovery source history per responder, enabling future features to reconstruct exactly how each ECU was found without relying solely on `responseId` for identity.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST run ECU discovery using a two-step strategy: (1) functional discovery using request ID `7DF`, followed by (2) physical fallback discovery using request IDs `7E0` through `7E7`.
- **FR-002**: The system MUST use a configurable `probeSequence` to determine which probes to send per request ID. In v1, `probeSequence` contains only `22F190` (UDS ReadDataByIdentifier — VIN). The architecture MUST NOT assume a single probe; it MUST iterate over the sequence.
- **FR-003**: The system MUST treat both positive and negative UDS responses as discovered ECUs.
- **FR-004**: The system MUST treat `NO DATA` as not found (no ECU discovered for that probe).
- **FR-005**: The system MUST extract response IDs from header-enabled responses (e.g., `7E8` from `7E8037F2211`).
- **FR-006**: The system MUST store the raw response string for every probe. For discovered responses, the system MUST also store the parsed `rawHeader` and `rawPayload` fields alongside `rawResponse` so future features can perform additional UDS parsing without reprocessing original strings.
- **FR-007**: The system MUST store discovery results in a JSON structure under the diagnostic session at the path `vehicleDataJson.controlUnitDiscovery`.
- **FR-008**: The system MUST store both the full probe history (in `probes`) and deduplicated unique responders (in `responders`).
- **FR-009**: The system MUST NOT infer ECU names or module names in v1; all naming fields must be stored as `null`.
- **FR-010**: The system MUST expose discovery results to the frontend through existing diagnostic session/vehicle data API paths.
- **FR-011**: The frontend default Control Units view MUST display responders from the `responders` array showing Response ID, Confidence, and Status. The `scanMode` field MUST be shown in the discovery metadata. Probe history (`probes`) MUST be accessible via an optional details view but MUST NOT be the default display.
- **FR-012**: The discovery logic MUST be strategy-based (using a `DiscoveryStrategy` pattern) so that future manufacturer-specific strategies can be added without rewriting the feature.
- **FR-013**: The discovery scan MUST NOT send forbidden services: `27` (SecurityAccess), `2E` (WriteDataByIdentifier), `31` (RoutineControl), `11` (ECUReset), `14` (ClearDiagnosticInformation), `2F` (InputOutputControl).
- **FR-014**: The discovery scan MUST complete successfully even if zero ECUs are found.
- **FR-015**: The system MUST NOT run a full `700-7FF` brute-force scan; the maximum is 1 functional + 8 physical = 9 request IDs, each probed with every probe in the `probeSequence` (v1: 9 × 1 = 9 total probes).
- **FR-016**: The system MUST classify responses into five categories: `POSITIVE` (service supported), `NEGATIVE` (service not supported but ECU exists), `NO_RESPONSE` (no ECU), `MALFORMED` (unparseable), and `ERROR` (probe execution failed).
- **FR-017**: The system MUST map negative response codes to human-readable meanings, supporting at minimum: `11` = SERVICE_NOT_SUPPORTED, `12` = SUB_FUNCTION_NOT_SUPPORTED, `13` = INCORRECT_MESSAGE_LENGTH_OR_INVALID_FORMAT, `22` = CONDITIONS_NOT_CORRECT, `31` = REQUEST_OUT_OF_RANGE, `33` = SECURITY_ACCESS_DENIED, `78` = RESPONSE_PENDING.
- **FR-018**: Unknown negative response codes MUST be stored as `UNKNOWN_NEGATIVE_RESPONSE`.
- **FR-019**: The discovery JSON MUST include version, strategy name, `scanMode`, `probeSequence`, timestamps, summary counts, and responder capability flags.
- **FR-020**: The system MUST assign a `confidence` level to each responder using deterministic rules: `LOW` when discovered only through functional probing (`7DF`), `HIGH` when discovered through any physical probing (`7E0`-`7E7`) or confirmed by both functional and physical probing. There is no heuristic or probabilistic scoring — confidence is entirely determined by whether any physical probe reached the responder.
- **FR-021**: For discovered responses where the raw response can be parsed, the system MUST store `rawHeader` (the response CAN ID) and `rawPayload` (the response bytes after the header) in addition to `rawResponse` (the full response string). For `NO_RESPONSE` and `MALFORMED` results, `rawHeader` and `rawPayload` MUST be stored as `null`.
- **FR-022**: The discovery engine MUST NOT assume a single probe in the `probeSequence`; it MUST iterate over all entries even when v1 contains only one entry.
- **FR-023**: The responder records MUST NOT include `future` placeholders for Feature 020 data (inventory, dtcScan). Feature 020 will extend the responder schema when those features are implemented.
- **FR-024**: Each responder record MUST include a `discoveredBy` array containing one entry per unique discovery source (method, requestId, probe) that reached the responder. This replaces the previous `requestIds` flat array.
- **FR-025**: Responder deduplication in v1 MUST use `responseId`-based deduplication as the minimum strategy. The architecture MUST NOT hardcode `responseId` as the only possible uniqueness key forever; future versions may use additional identifiers.
- **FR-026**: The discovery JSON MUST include a `scanMode` field describing how the scan was executed. In v1, `scanMode` MUST be `"FUNCTIONAL_THEN_PHYSICAL"`. Future values may include `FUNCTIONAL_ONLY`, `PHYSICAL_ONLY`, `ADVANCED_RANGE`, `TOYOTA_PROFILE`, and `MERCEDES_PROFILE`.
- **FR-027**: Each probe execution MUST be isolated — a single probe failure MUST NOT abort the entire discovery scan. Failures (timeout, communication error, unexpected payload, adapter disconnect) MUST be converted into `ProbeResult` records with `status: "ERROR"`, `responseType: "ERROR"`, and a machine-readable `errorCode`. The scan MUST continue with remaining probes. Only unrecoverable startup failures (adapter never connects) MAY prevent discovery execution entirely.
- **FR-028**: The `errorCode` field on `ProbeResult` MUST be `null` for all non-ERROR statuses. When `status` is `"ERROR"`, `errorCode` MUST be one of: `"TIMEOUT"` (adapter did not respond within per-probe timeout), `"COMMUNICATION_ERROR"` (low-level adapter I/O failure), `"UNEXPECTED_PAYLOAD"` (response could not be parsed or classified), or `"ADAPTER_DISCONNECT"` (adapter disconnected mid-scan; applied to the failed probe and all remaining probes that cannot be sent).

### Key Entities

- **DiscoveryResult**: The top-level container for a discovery scan, including version, strategy, `scanMode`, `probeSequence`, timestamps, summary statistics, probe history, and unique responders.
- **ScanMode**: An enumeration describing how the discovery scan was executed. v1 supports `FUNCTIONAL_THEN_PHYSICAL`. Future values may include `FUNCTIONAL_ONLY`, `PHYSICAL_ONLY`, `ADVANCED_RANGE`, `TOYOTA_PROFILE`, and `MERCEDES_PROFILE`.
- **ProbeSequence**: An ordered list of UDS service+DID pairs to send per request ID during discovery. v1 contains only `["22F190"]`. Future features may add additional read-only probes (e.g., `22F187`, `22F188`, `22F18A`). The discovery engine iterates over all entries in the sequence for each request ID.
- **Probe**: A single probe attempt recording the method (FUNCTIONAL/PHYSICAL), request ID, the probe sent (from `probeSequence`), the response received, response classification, and raw response data including `rawHeader`, `rawPayload`, and `rawResponse`.
- **Responder**: A unique responding ECU aggregated from probes, recording its `responseId`, `discoveredBy` array (listing each discovery source that reached it: method, requestId, probe), `firstSeenBy`, whether it was confirmed by physical probing, its `confidence` level (`LOW` or `HIGH`), its protocol, and capability flags. Responder uniqueness uses `responseId`-based deduplication in v1; future versions may use additional identifiers.
- **DiscoverySource**: A single discovery path within a responder's `discoveredBy` array, containing `method` (FUNCTIONAL/PHYSICAL), `requestId`, and `probe` (the UDS service+DID that was sent).
- **DiscoveryStrategy**: An abstract concept defining how probes are generated and responses are classified. v1 implements `GENERIC_OBD_CAN` using functional addressing + physical fallback with the configured `probeSequence`.
- **NegativeResponseCode**: A mapping of UDS NRC hex codes to human-readable meanings (e.g., `11` → `SERVICE_NOT_SUPPORTED`).
- **UDS Response Parser**: A reusable module (`uds_response_parser`) that provides `classify_response()`, `parse_raw_header_payload()`, `extract_negative_response()`, and the `NEGATIVE_RESPONSE_CODES` mapping. This module is shared infrastructure — Feature 019 consumes it, and Features 020, 021, and 022 will also import from it. The discovery module (`control_unit_discovery`) must NOT reimplement UDS parsing logic.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Discovery scan completes with a maximum of 9 request IDs × probes in `probeSequence` (v1: 9 × 1 = 9 total probes) and returns structured results within a vehicle diagnostic session.
- **SC-002**: Both positive UDS responses and negative UDS responses are correctly classified as discovered ECUs; `NO DATA` responses are classified as not found.
- **SC-003**: Discovery results are stored under the diagnostic session JSON with `scanMode`, `probeSequence`, `discoveredBy`, `rawHeader`, `rawPayload`, `confidence`, and `responders` fields, and are retrievable by the frontend without breaking existing vehicle health, DTC, freeze frame, readiness, or extended PID data.
- **SC-004**: The default Control Units view in the UI displays responders (not probe history) with Response ID, Confidence, and Status — with no inferred ECU names. Probe history is accessible via an optional details view.
- **SC-005**: The scan completes successfully and returns valid results even when zero ECUs respond (all probes return `NO DATA`).
- **SC-006**: All agent tests, backend tests, and frontend tests pass, covering the test cases specified in the feature description.
- **SC-007**: Responders discovered only via functional probing are assigned `confidence: LOW`; responders discovered via physical probing or confirmed by both are assigned `confidence: HIGH`.
- **SC-008**: For every discovered response, `rawHeader`, `rawPayload`, and `rawResponse` are all stored; for `NO_RESPONSE` and `MALFORMED` results, `rawHeader` and `rawPayload` are `null`.
- **SC-009**: Each responder record includes a `discoveredBy` array with one entry per unique (method, requestId, probe) combination that reached the responder, providing full discovery source traceability.

## Assumptions

- The ELM327 WiFi adapter is already connected and configured, as established in previous features (010, 013).
- The adapter has headers enabled (`ATSH` is available) so response IDs can be extracted from responses.
- Functional addressing (`7DF`) will work on most OBD-II compliant vehicles to discover at least the primary ECU.
- Physical fallback discovery using `7E0-7E7` covers the most common diagnostic request IDs; additional IDs can be added in future features or strategies.
- The existing `vehicleDataJson` field on the `DiagnosticSession` entity is the appropriate storage location for v1, avoiding the need for a new database table.
- The desktop agent sends discovery results to the backend via the existing agent webhook infrastructure.
- The frontend already has a vehicle data display context where the Control Units section can be added.
- Negative response code `78` (RESPONSE_PENDING) will be recorded but not treated as a final response; the agent should wait for the actual response. However, for v1 simplicity, it is classified and stored.
- The `probeSequence` in v1 contains only `22F190`. The architecture supports adding additional read-only probes (e.g., `22F187`, `22F188`, `22F18A`) in future features without redesign. The agent module defines `DISCOVERY_PROBE_SEQUENCE = ["22F190"]` as a configuration constant; the strategy receives `probe_sequence` as a parameter and does not hardcode probe values in its execution logic.
- Feature 020 will extend the responder schema to add inventory and ECU-specific DTC scanning data when those features are implemented; Feature 019 does not include placeholder fields for this future data.
- Responder deduplication in v1 uses `responseId` as the uniqueness key. Future versions may introduce additional identifiers for 29-bit CAN, gateway routing, or manufacturer-specific addressing. The `discoveredBy` array provides full discovery source traceability so future features can understand exactly how each ECU was found.
- The default UI view displays responders, not individual probes. Probe history remains available in an optional details view for diagnostics and troubleshooting.
- The `DISCOVER_CONTROL_UNITS` command type is added to the existing `LiveDataCommandType` enum. Although "live data" and "discovery" are conceptually different operations, the existing command queue infrastructure is reused because it is the sole agent command mechanism. No new queue, scheduler, dispatcher, or command transport layer is introduced.
- UDS response parsing logic (`classify_response`, `parse_raw_header_payload`, `NEGATIVE_RESPONSE_CODES`, `extract_negative_response`) is extracted into a reusable `uds_response_parser` module. The discovery module imports from this parser and does not own UDS parsing logic. Future features (020, 021, 022) will also import from it.
- A single functional probe (`7DF`) may return multiple CAN response frames from different ECUs (e.g., `7E8`, `7EA`, `7EC` all responding to `7DF` → `22F190`). The UDS response parser must parse multiline responses into individual probe results. Each unique `responseId` becomes a separate `ProbeResult` entry and later a separate `Responder` entry.
- Discovery never fails the overall diagnostic session. Individual probe-level failures (timeout, `NO DATA`, malformed response, adapter disconnect) are converted into `ProbeResult` records with appropriate status (`NOT_FOUND`, `MALFORMED`, or `ERROR`). Partial results — probes collected before a failure — are always persisted. Only unrecoverable startup failures (e.g., adapter never connects) prevent discovery execution entirely. The backend's `processControlUnitDiscovery()` method also applies error isolation: malformed discovery data is logged but does not crash the session or webhook handler.
- Each probe execution is isolated in its own try/except. A single probe failure (timeout, communication error, unexpected payload) produces a `ProbeResult` with `status: "ERROR"`, `responseType: "ERROR"`, and a machine-readable `errorCode` (`"TIMEOUT"`, `"COMMUNICATION_ERROR"`, `"UNEXPECTED_PAYLOAD"`, or `"ADAPTER_DISCONNECT"`). The discovery scan continues with remaining probes. Only unrecoverable startup failures prevent the entire scan.

## JSON Storage Format Reference

Store discovery under:

```json
{
  "controlUnitDiscovery": {
    "version": 1,
    "strategy": "GENERIC_OBD_CAN",
    "scanMode": "FUNCTIONAL_THEN_PHYSICAL",
    "probeSequence": ["22F190"],
    "startedAt": "2026-06-15T18:19:54.000Z",
    "completedAt": "2026-06-15T18:19:57.000Z",
    "summary": {
      "totalProbes": 9,
      "respondersFound": 1,
      "functionalResponders": 1,
      "physicalResponders": 1
    },
    "probes": [
      {
        "method": "FUNCTIONAL",
        "requestId": "7DF",
        "probe": "22F190",
        "responseId": "7E8",
        "status": "DISCOVERED",
        "responseType": "NEGATIVE",
        "negativeResponseCode": "11",
        "negativeResponseMeaning": "SERVICE_NOT_SUPPORTED",
        "rawHeader": "7E8",
        "rawPayload": "037F2211",
        "rawResponse": "7E8037F2211",
        "errorCode": null
      },
      {
        "method": "PHYSICAL",
        "requestId": "7E0",
        "probe": "22F190",
        "responseId": "7E8",
        "status": "DISCOVERED",
        "responseType": "NEGATIVE",
        "negativeResponseCode": "11",
        "negativeResponseMeaning": "SERVICE_NOT_SUPPORTED",
        "rawHeader": "7E8",
        "rawPayload": "037F2211",
        "rawResponse": "7E8037F2211",
        "errorCode": null
      },
      {
        "method": "PHYSICAL",
        "requestId": "7E1",
        "probe": "22F190",
        "responseId": null,
        "status": "NOT_FOUND",
        "responseType": "NO_RESPONSE",
        "negativeResponseCode": null,
        "negativeResponseMeaning": null,
        "rawHeader": null,
        "rawPayload": null,
        "rawResponse": "NO DATA",
        "errorCode": null
      }
    ],
    "responders": [
      {
        "responseId": "7E8",
        "discoveredBy": [
          {
            "method": "FUNCTIONAL",
            "requestId": "7DF",
            "probe": "22F190"
          },
          {
            "method": "PHYSICAL",
            "requestId": "7E0",
            "probe": "22F190"
          }
        ],
        "firstSeenBy": "FUNCTIONAL",
        "confirmedByPhysical": true,
        "confidence": "HIGH",
        "ecuName": null,
        "ecuType": null,
        "protocol": "UDS_ON_CAN_11BIT",
        "capabilities": {
          "respondedToF190": true,
          "positiveF190": false,
          "negativeF190": true
        }
      }
    ]
  }
}
```