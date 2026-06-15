# Vehicle Data API Contract: Feature 019 — Control Unit Discovery

**Date**: 2026-06-15
**Spec**: [spec.md](../spec.md)

## API Endpoint

**No new endpoints.** Feature 019 extends the existing vehicle data endpoint.

### Existing Endpoint (Unchanged)

```
GET /api/v1/diagnostic-sessions/:sessionId/vehicle-data
```

### Agent Command (New)

```
LiveDataCommandType.DISCOVER_CONTROL_UNITS
```

The backend queues a command of type `DISCOVER_CONTROL_UNITS` with `diagnosticSessionId` in the payload. The agent polls the command queue and dispatches to the discovery handler.

### Agent Event (New)

```
ScanEventType.CONTROL_UNIT_DISCOVERY_READ
```

The agent emits this event after completing the discovery scan. The event payload includes `diagnosticSessionId` and the full `controlUnitDiscovery` JSON object.

## Response Shape Extension

### Before 019 (Baseline)

```json
{
  "id": "session-uuid",
  "sessionId": "session-uuid",
  "vehicleDataJson": {
    "batteryVoltage": { "supported": true, "available": true, "value": 12.4, "rawResponse": "1240", "unit": "V" },
    "vin": { "supported": true, "available": true, "value": "JTDBR32E760062156" },
    "readinessMonitors": { ... },
    "supportedPids": { ... },
    "stftBank1": { ... },
    "ltftBank1": { ... },
    "freezeFrame": { ... }
  },
  "vehicleDataReadAt": "2026-06-15T18:19:50.000Z"
}
```

### After 019 (With Control Unit Discovery)

```json
{
  "id": "session-uuid",
  "sessionId": "session-uuid",
  "vehicleDataJson": {
    "batteryVoltage": { "supported": true, "available": true, "value": 12.4, "rawResponse": "1240", "unit": "V" },
    "vin": { "supported": true, "available": true, "value": "JTDBR32E760062156" },
    "readinessMonitors": { ... },
    "supportedPids": { ... },
    "stftBank1": { ... },
    "ltftBank1": { ... },
    "freezeFrame": { ... },
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
            { "method": "FUNCTIONAL", "requestId": "7DF", "probe": "22F190" },
            { "method": "PHYSICAL", "requestId": "7E0", "probe": "22F190" }
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
  },
  "vehicleDataReadAt": "2026-06-15T18:19:57.000Z"
}
```

### After 019 (Zero Responders Found)

```json
{
  "controlUnitDiscovery": {
    "version": 1,
    "strategy": "GENERIC_OBD_CAN",
    "scanMode": "FUNCTIONAL_THEN_PHYSICAL",
    "probeSequence": ["22F190"],
    "startedAt": "2026-06-15T18:30:00.000Z",
    "completedAt": "2026-06-15T18:30:12.000Z",
    "summary": {
      "totalProbes": 9,
      "respondersFound": 0,
      "functionalResponders": 0,
      "physicalResponders": 0
    },
    "probes": [
      {
        "method": "FUNCTIONAL",
        "requestId": "7DF",
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
    "responders": []
  }
}
```

### After 019 (Multiple Functional Responders)

When a single functional probe (`7DF`) returns multiple CAN frames, each frame produces a separate probe result, and each unique `responseId` becomes a separate responder:

```json
{
  "controlUnitDiscovery": {
    "version": 1,
    "strategy": "GENERIC_OBD_CAN",
    "scanMode": "FUNCTIONAL_THEN_PHYSICAL",
    "probeSequence": ["22F190"],
    "startedAt": "2026-06-15T18:20:00.000Z",
    "completedAt": "2026-06-15T18:20:08.000Z",
    "summary": {
      "totalProbes": 11,
      "respondersFound": 3,
      "functionalResponders": 3,
      "physicalResponders": 2
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
        "method": "FUNCTIONAL",
        "requestId": "7DF",
        "probe": "22F190",
        "responseId": "7EA",
        "status": "DISCOVERED",
        "responseType": "NEGATIVE",
        "negativeResponseCode": "11",
        "negativeResponseMeaning": "SERVICE_NOT_SUPPORTED",
        "rawHeader": "7EA",
        "rawPayload": "037F2211",
        "rawResponse": "7EA037F2211",
        "errorCode": null
      },
      {
        "method": "FUNCTIONAL",
        "requestId": "7DF",
        "probe": "22F190",
        "responseId": "7EC",
        "status": "DISCOVERED",
        "responseType": "NEGATIVE",
        "negativeResponseCode": "11",
        "negativeResponseMeaning": "SERVICE_NOT_SUPPORTED",
        "rawHeader": "7EC",
        "rawPayload": "037F2211",
        "rawResponse": "7EC037F2211",
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
        "requestId": "7E2",
        "probe": "22F190",
        "responseId": "7EA",
        "status": "DISCOVERED",
        "responseType": "NEGATIVE",
        "negativeResponseCode": "11",
        "negativeResponseMeaning": "SERVICE_NOT_SUPPORTED",
        "rawHeader": "7EA",
        "rawPayload": "037F2211",
        "rawResponse": "7EA037F2211",
        "errorCode": null
      }
    ],
    "responders": [
      {
        "responseId": "7E8",
        "discoveredBy": [
          { "method": "FUNCTIONAL", "requestId": "7DF", "probe": "22F190" },
          { "method": "PHYSICAL", "requestId": "7E0", "probe": "22F190" }
        ],
        "firstSeenBy": "FUNCTIONAL",
        "confirmedByPhysical": true,
        "confidence": "HIGH",
        "ecuName": null,
        "ecuType": null,
        "protocol": "UDS_ON_CAN_11BIT",
        "capabilities": { "respondedToF190": true, "positiveF190": false, "negativeF190": true }
      },
      {
        "responseId": "7EA",
        "discoveredBy": [
          { "method": "FUNCTIONAL", "requestId": "7DF", "probe": "22F190" },
          { "method": "PHYSICAL", "requestId": "7E2", "probe": "22F190" }
        ],
        "firstSeenBy": "FUNCTIONAL",
        "confirmedByPhysical": true,
        "confidence": "HIGH",
        "ecuName": null,
        "ecuType": null,
        "protocol": "UDS_ON_CAN_11BIT",
        "capabilities": { "respondedToF190": true, "positiveF190": false, "negativeF190": true }
      },
      {
        "responseId": "7EC",
        "discoveredBy": [
          { "method": "FUNCTIONAL", "requestId": "7DF", "probe": "22F190" }
        ],
        "firstSeenBy": "FUNCTIONAL",
        "confirmedByPhysical": false,
        "confidence": "LOW",
        "ecuName": null,
        "ecuType": null,
        "protocol": "UDS_ON_CAN_11BIT",
        "capabilities": { "respondedToF190": true, "positiveF190": false, "negativeF190": true }
      }
    ]
  }
}
```

### After 019 (Partial Results — Adapter Disconnect)

When the adapter disconnects mid-scan, probes collected before the disconnect are still persisted. The `completedAt` timestamp reflects when the error occurred:

```json
{
  "controlUnitDiscovery": {
    "version": 1,
    "strategy": "GENERIC_OBD_CAN",
    "scanMode": "FUNCTIONAL_THEN_PHYSICAL",
    "probeSequence": ["22F190"],
    "startedAt": "2026-06-15T18:25:00.000Z",
    "completedAt": "2026-06-15T18:25:04.000Z",
    "summary": {
      "totalProbes": 3,
      "respondersFound": 1,
      "functionalResponders": 1,
      "physicalResponders": 0
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
        "responseId": null,
        "status": "NOT_FOUND",
        "responseType": "NO_RESPONSE",
        "negativeResponseCode": null,
        "negativeResponseMeaning": null,
        "rawHeader": null,
        "rawPayload": null,
        "rawResponse": "NO DATA",
        "errorCode": null
      },
      {
        "method": "PHYSICAL",
        "requestId": "7E1",
        "probe": "22F190",
        "responseId": null,
        "status": "ERROR",
        "responseType": "ERROR",
        "negativeResponseCode": null,
        "negativeResponseMeaning": null,
        "rawHeader": null,
        "rawPayload": null,
        "rawResponse": "",
        "errorCode": "ADAPTER_DISCONNECT"
      }
    ],
    "responders": [
      {
        "responseId": "7E8",
        "discoveredBy": [
          { "method": "FUNCTIONAL", "requestId": "7DF", "probe": "22F190" }
        ],
        "firstSeenBy": "FUNCTIONAL",
        "confirmedByPhysical": false,
        "confidence": "LOW",
        "ecuName": null,
        "ecuType": null,
        "protocol": "UDS_ON_CAN_11BIT",
        "capabilities": { "respondedToF190": true, "positiveF190": false, "negativeF190": true }
      }
    ]
  }
}
```

### After 019 (Pre-019 Data, Backward Compatible)

```json
{
  "id": "session-uuid",
  "sessionId": "session-uuid",
  "vehicleDataJson": {
    "batteryVoltage": { "supported": true, "available": true, "value": 12.4, "rawResponse": "1240", "unit": "V" },
    "vin": { "supported": true, "available": true, "value": "JTDBR32E760062156" }
  },
  "vehicleDataReadAt": "2026-06-10T12:00:00.000Z"
}
```

No `controlUnitDiscovery` key. The frontend must treat this as "discovery not yet run" and display an appropriate empty state.

## Contract Rules

1. The `controlUnitDiscovery` field is **optional**. Responses from sessions created before Feature 019 will not include it.
2. When `controlUnitDiscovery` is present, it must conform to the TypeScript interfaces defined in [data-model.md](../data-model.md). Validation must reject malformed structures.
3. No new API endpoints are created. Discovery data is retrieved through the existing `GET /api/v1/diagnostic-sessions/:sessionId/vehicle-data` endpoint.
4. No existing `vehicleDataJson` fields are modified or removed. Adding `controlUnitDiscovery` is additive only.
5. The `probes` array always contains exactly 9 entries in v1 (1 functional + 8 physical × 1 probe). Future versions may have more entries when `probeSequence` is extended.
6. The `responders` array may be empty (zero responders found) but must always be present when `controlUnitDiscovery` is present.
7. The `ecuName` and `ecuType` fields on responders are always `null` in Feature 019. Feature 020 will populate these.
8. The `probeSequence` array in v1 always contains exactly `["22F190"]`. Future features may add additional probes.
9. The `confidence` field must be `LOW` for responders discovered only through functional probing and `HIGH` for responders discovered through physical probing or confirmed by both.
10. The `scanMode` field must be present when `controlUnitDiscovery` is present. In v1, the value is always `"FUNCTIONAL_THEN_PHYSICAL"`. Future features may add other scan modes without changing the field name.
11. A single functional probe (`7DF`) may return multiple CAN response frames from different ECUs. Each frame must be parsed into a separate `ProbeResult` entry with its own `responseId`, and each unique `responseId` must become a separate `Responder` entry in the `responders` array.
12. Discovery never fails the overall diagnostic session. Probe-level failures (timeout, `NO DATA`, malformed response, adapter disconnect) produce `ProbeResult` records with appropriate status (`NOT_FOUND`, `MALFORMED`, or `ERROR`). Partial results — probes collected before a failure — are always persisted. Only unrecoverable startup failures (e.g., adapter never connects) prevent discovery execution entirely.
13. The `probeSequence` field in the persisted JSON reflects the configuration that was used for the scan. The agent's `DISCOVERY_PROBE_SEQUENCE` constant (v1: `["22F190"]`) is the configuration source; the strategy receives `probe_sequence` as a parameter and does not hardcode probe values in its execution logic.
14. Confidence is assigned deterministically: `LOW` for responders discovered only through functional probing, `HIGH` for responders discovered through any physical probing or confirmed by both functional and physical probing. There is no heuristic or probabilistic scoring.
15. Each probe execution is isolated — a single probe failure never aborts the entire discovery scan. Failures produce `ProbeResult` records with `status: "ERROR"`, `responseType: "ERROR"`, and a machine-readable `errorCode`. The scan continues with remaining probes. Only unrecoverable startup failures prevent discovery execution entirely.
16. The `errorCode` field on `ProbeResult` is `null` for all non-ERROR statuses (`DISCOVERED`, `NOT_FOUND`, `UNKNOWN`). When `status` is `"ERROR"`, `errorCode` must be one of: `"TIMEOUT"`, `"COMMUNICATION_ERROR"`, `"UNEXPECTED_PAYLOAD"`, or `"ADAPTER_DISCONNECT"`.

## Architecture Note: Command Queue Reuse

Feature 019 introduces `DISCOVER_CONTROL_UNITS` inside the existing `LiveDataCommandType` enum. Although "live data" and "discovery" are conceptually different operations, the existing command queue infrastructure is reused because it is the established agent command mechanism. **No new queue, scheduler, dispatcher, or command transport layer is introduced.** The `LiveDataCommandType` name is a legacy artifact; the command queue is the sole transport for all agent commands regardless of whether they relate to live data. Future features should also reuse this mechanism rather than creating parallel queue systems.

## Agent Event Contract

### Data Flow

```
Backend → LiveDataCommand (type: DISCOVER_CONTROL_UNITS)
  → Agent polls command queue
  → queue.py dispatches to discovery handler
  → scan_executor.execute_control_unit_discovery(adapter, session_id)
  → control_unit_discovery.read_control_units(adapter, strategy=GenericObdCanDiscoveryStrategy)
  → emit_session_event(event_type='CONTROL_UNIT_DISCOVERY_READ', payload={diagnosticSessionId, controlUnitDiscovery: {...}})
  → Backend AgentWebhookController routes CONTROL_UNIT_DISCOVERY_READ
  → VehicleDataService.processControlUnitDiscovery()
  → Persist to DiagnosticSession.vehicleDataJson.controlUnitDiscovery
```

### Event Payload Shape

```python
{
    "diagnosticSessionId": "uuid-string",
    "controlUnitDiscovery": {
        "version": 1,
        "strategy": "GENERIC_OBD_CAN",
        "scanMode": "FUNCTIONAL_THEN_PHYSICAL",
        "probeSequence": ["22F190"],
        "startedAt": "2026-06-15T18:19:54.000Z",
        "completedAt": "2026-06-15T18:19:57.000Z",
        "summary": { ... },
        "probes": [ ... ],
        "responders": [ ... ]
    }
}
```