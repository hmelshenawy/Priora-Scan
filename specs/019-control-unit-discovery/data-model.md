# Data Model: Feature 019 — Control Unit Discovery Foundation

**Date**: 2026-06-15
**Spec**: [spec.md](./spec.md)

## Entity Changes

### No New Database Entities

Feature 019 adds zero new database tables or schema migrations. All discovery data is stored inside the existing `DiagnosticSession.vehicleDataJson` JSONB column as a new optional key.

### VehicleDataJson Extension

The existing `VehicleDataJson` interface gains one new optional field: `controlUnitDiscovery`.

#### Existing Fields (Unchanged)

All fields from Features 009, 016, 017, and 018 remain unchanged and are not listed here. They include: `batteryVoltage`, `vin`, `readinessMonitors`, `fuelSystemStatus`, `calculatedEngineLoad`, `fuelLevel`, `mileage`, `supportedPids`, `freezeFrame`, `stftBank1`, `ltftBank1`, `stftBank2`, `ltftBank2`, `map`, `maf`, `throttlePosition`.

#### New Fields (All Optional)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `controlUnitDiscovery` | `ControlUnitDiscovery \| undefined` | No | Top-level discovery result container. Absent on sessions created before Feature 019. |

### Interface Definitions

```typescript
// Scan mode type — describes how discovery was executed
type ScanMode =
  | 'FUNCTIONAL_ONLY'          // Functional addressing only (7DF)
  | 'PHYSICAL_ONLY'            // Physical addressing only (7E0-7E7)
  | 'FUNCTIONAL_THEN_PHYSICAL' // v1 default: functional first, then physical fallback
  | 'ADVANCED_RANGE'           // Future: full 700-7FF scan (not in v1)
  | 'TOYOTA_PROFILE'           // Future: Toyota-specific discovery
  | 'MERCEDES_PROFILE';        // Future: Mercedes-specific discovery

// Top-level discovery result container
interface ControlUnitDiscovery {
  version: 1;
  strategy: 'GENERIC_OBD_CAN';           // v1 only. Future: 'TOYOTA', 'MERCEDES', etc.
  scanMode: 'FUNCTIONAL_THEN_PHYSICAL';  // v1 default. Describes how the scan was executed.
  probeSequence: string[];                // v1: ['22F190']. Future probes: '22F187', '22F188', '22F18A'
  startedAt: string;                       // ISO 8601 timestamp
  completedAt: string;                    // ISO 8601 timestamp
  summary: DiscoverySummary;
  probes: ProbeResult[];                  // Full probe history (all 9 probes)
  responders: Responder[];                // Deduplicated unique responders
}

interface DiscoverySummary {
  totalProbes: number;                     // 9 in v1 (1 functional + 8 physical × 1 probe)
  respondersFound: number;
  functionalResponders: number;
  physicalResponders: number;
}

// A single probe attempt. For functional probes (method: FUNCTIONAL, requestId: 7DF),
// the raw response may contain multiple CAN frames (multiple responders), which the UDS
// response parser splits into separate ProbeResult entries — one per unique responseId.
interface ProbeResult {
  method: 'FUNCTIONAL' | 'PHYSICAL';
  requestId: string;                       // CAN request ID: '7DF', '7E0'-'7E7'
  probe: string;                           // UDS service+DID from probeSequence: '22F190'
  responseId: string | null;               // CAN response ID: '7E8', etc. null if NOT_FOUND or ERROR
  status: 'DISCOVERED' | 'NOT_FOUND' | 'UNKNOWN' | 'ERROR';
  responseType: 'POSITIVE' | 'NEGATIVE' | 'NO_RESPONSE' | 'MALFORMED' | 'ERROR';
  negativeResponseCode: string | null;     // Hex NRC: '11', '12', etc. null if not NEGATIVE
  negativeResponseMeaning: string | null;  // Human-readable NRC. null if not NEGATIVE
  rawHeader: string | null;                // Parsed CAN response ID bytes. null if NO_RESPONSE/MALFORMED/ERROR
  rawPayload: string | null;               // Parsed response bytes after header. null if NO_RESPONSE/MALFORMED/ERROR
  rawResponse: string;                     // Full raw response string. 'NO DATA' if no response
  errorCode: string | null;                 // Machine-readable error code. Only set when status is ERROR.
                                           // Allowed values: 'TIMEOUT', 'COMMUNICATION_ERROR',
                                           // 'UNEXPECTED_PAYLOAD', 'ADAPTER_DISCONNECT'. null otherwise.
}

interface DiscoverySource {
  method: 'FUNCTIONAL' | 'PHYSICAL';
  requestId: string;                       // CAN request ID that reached this responder
  probe: string;                           // UDS service+DID that was sent
}

interface Responder {
  responseId: string;                      // CAN response ID (deduplication key in v1)
  discoveredBy: DiscoverySource[];          // All discovery sources that reached this responder
  firstSeenBy: 'FUNCTIONAL' | 'PHYSICAL';
  confirmedByPhysical: boolean;            // true if any physical probe also found this responder
  confidence: 'LOW' | 'HIGH';              // LOW = functional-only, HIGH = physical or confirmed
  ecuName: null;                           // Always null in v1 (no ECU name inference)
  ecuType: null;                           // Always null in v1
  protocol: 'UDS_ON_CAN_11BIT';           // v1 only supports 11-bit CAN
  capabilities: ResponderCapabilities;
}

interface ResponderCapabilities {
  respondedToF190: boolean;                // True if any probe with 22F190 got a response
  positiveF190: boolean;                  // True if any probe with 22F190 got a positive response
  negativeF190: boolean;                  // True if any probe with 22F190 got a negative response
}
```

### Response Classification Model

Every probe result falls into exactly one of five states:

| Classification | Raw Response Pattern | `status` | `responseType` | `rawHeader` | `rawPayload` | `responseId` | `errorCode` |
|---|---|---|---|---|---|---|---|
| **Positive** | `6X....` or `7E8 XX 62 F1 90...` | `DISCOVERED` | `POSITIVE` | Extracted from response | Extracted from response | Extracted from response | `null` |
| **Negative** | `7E8 03 7F 22 11` or `7F2211` | `DISCOVERED` | `NEGATIVE` | Extracted from response | Extracted from response | Extracted from response | `null` |
| **No Response** | `NO DATA` | `NOT_FOUND` | `NO_RESPONSE` | `null` | `null` | `null` | `null` |
| **Malformed** | Any unparseable string | `UNKNOWN` | `MALFORMED` | `null` | `null` | Extracted if possible, else `null` | `null` |
| **Error** | Probe execution failed (timeout, adapter error, etc.) | `ERROR` | `ERROR` | `null` | `null` | `null` | `"TIMEOUT"` / `"COMMUNICATION_ERROR"` / `"UNEXPECTED_PAYLOAD"` / `"ADAPTER_DISCONNECT"` |

### Negative Response Code Mapping

| Hex Code | Meaning |
|----------|---------|
| `11` | `SERVICE_NOT_SUPPORTED` |
| `12` | `SUB_FUNCTION_NOT_SUPPORTED` |
| `13` | `INCORRECT_MESSAGE_LENGTH_OR_INVALID_FORMAT` |
| `22` | `CONDITIONS_NOT_CORRECT` |
| `31` | `REQUEST_OUT_OF_RANGE` |
| `33` | `SECURITY_ACCESS_DENIED` |
| `78` | `RESPONSE_PENDING` |
| Any other | `UNKNOWN_NEGATIVE_RESPONSE` |

### Error Code Mapping

When a probe execution fails (as opposed to receiving a valid ECU response or `NO DATA`), the failure is recorded with `status: "ERROR"` and `responseType: "ERROR"`, plus a machine-readable `errorCode`:

| `errorCode` | Meaning |
|---|---|
| `TIMEOUT` | The adapter did not respond within the per-probe timeout (default 2 seconds) |
| `COMMUNICATION_ERROR` | A low-level adapter communication error occurred (e.g., serial/I/O failure) |
| `UNEXPECTED_PAYLOAD` | The response could not be parsed or classified by the UDS parser (distinct from `MALFORMED` — this indicates a probe-level exception rather than a parseable-but-unrecognized response) |
| `ADAPTER_DISCONNECT` | The adapter disconnected mid-scan; this probe and all remaining probes that cannot be sent receive this code |

### Confidence Assignment Rules

Confidence is assigned deterministically by `build_responders()` based on the discovery sources:

| Discovery Path | `confidence` | `confirmedByPhysical` | Rule |
|---|---|---|---|
| Functional only (`7DF`) | `LOW` | `false` | Responder was discovered exclusively through functional addressing; no physical probe confirmed its existence |
| Physical only (`7E0`-`7E7`) | `HIGH` | `true` | Responder was discovered through a physical probe; physical addressing provides direct ECU identification |
| Both functional and physical | `HIGH` | `true` | Responder was found by both functional and physical probes; physical confirmation overrides functional-only confidence |

These rules are deterministic — there is no heuristic or probabilistic scoring. A responder's confidence is entirely determined by whether any physical probe reached it.

### Multiple Functional Responders

A single functional probe (sent to request ID `7DF`) may return multiple CAN response frames, one from each ECU that responds to the functional address. For example, `7DF` → `22F190` might return responses from `7E8`, `7EA`, and `7EC` simultaneously. The UDS response parser (`classify_response()`) must parse multiline responses into individual probe results. Each unique `responseId` becomes a separate `ProbeResult` entry, and each is later deduplicated into a separate `Responder` entry with its own `discoveredBy` sources.

### Discovery Resilience

Discovery never fails the overall diagnostic session. Each probe execution is isolated — a single probe failure never aborts the entire discovery scan. The discovery engine wraps each probe in its own try/except:

- **Timeout**: Per-probe timeout (default 2s). If the adapter doesn't respond, the probe is recorded with `status: "ERROR"`, `responseType: "ERROR"`, `errorCode: "TIMEOUT"`. The scan continues with remaining probes.
- **Communication error**: Low-level adapter I/O failure. Recorded with `errorCode: "COMMUNICATION_ERROR"`. The scan continues.
- **Unexpected payload**: An exception during response parsing or classification. Recorded with `errorCode: "UNEXPECTED_PAYLOAD"`. The scan continues.
- **Adapter disconnect**: The adapter disconnects mid-scan. The failed probe gets `errorCode: "ADAPTER_DISCONNECT"`. Remaining probes that cannot be sent also get `errorCode: "ADAPTER_DISCONNECT"`. Partial results (all probes collected so far) are persisted with `completedAt` set to the disconnect timestamp.
- **Unrecoverable startup failure**: If the adapter never connects or strategy initialization fails, the entire discovery scan is prevented. This is the only case where discovery does not execute.

Partial results are always persisted — probes collected before a failure remain in the result. The backend's `processControlUnitDiscovery()` method also applies error isolation: malformed discovery data is logged but does not crash the session or webhook handler.

### Responder Deduplication

v1 uses `responseId`-based deduplication. Probes that return the same `responseId` are merged into a single `Responder` entry. The `discoveredBy` array collects all unique `(method, requestId, probe)` tuples that reached the same `responseId`.

Future versions may introduce additional identifiers for 29-bit CAN, gateway routing, or manufacturer-specific addressing. The `discoveredBy` array provides full source traceability.

### Relationships

```
DiagnosticSession
  └── vehicleDataJson (Json?)
        ├── [existing health/readiness/freeze-frame/extended-PID fields]
        └── controlUnitDiscovery? (ControlUnitDiscovery)
              ├── version
              ├── strategy
              ├── scanMode — FUNCTIONAL_THEN_PHYSICAL in v1
              ├── probeSequence
              ├── startedAt / completedAt
              ├── summary (DiscoverySummary)
              ├── probes[] (ProbeResult) — full history, all 9 entries in v1
              └── responders[] (Responder) — deduplicated, one per responseId
                    ├── discoveredBy[] (DiscoverySource)
                    └── capabilities (ResponderCapabilities)
```

### Backward Compatibility

- Sessions created before Feature 019 will have `vehicleDataJson` without a `controlUnitDiscovery` key.
- The backend `isValidVehicleDataJson()` function must accept sessions without `controlUnitDiscovery`.
- The frontend must handle `controlUnitDiscovery` being `undefined` or missing — display an empty state or "Not yet scanned" message.
- No existing fields in `vehicleDataJson` are modified or removed.