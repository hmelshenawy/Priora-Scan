# Quickstart: Feature 019 — Control Unit Discovery Foundation

**Date**: 2026-06-15
**Spec**: [spec.md](./spec.md)

## Prerequisites

- Desktop Agent environment: Python 3.11+ with ELM327 adapter or `MockObdAdapter`
- Backend environment: NestJS with running PostgreSQL and Prisma
- Frontend environment: Next.js dev server with `npm run dev`

## Desktop Agent — Control Unit Discovery

### Running Discovery with Mock Adapter

```python
from obd.adapter import MockObdAdapter
from obd.commands.control_unit_discovery import read_control_units, GenericObdCanDiscoveryStrategy

adapter = MockObdAdapter(profile="default")
result = read_control_units(adapter, strategy=GenericObdCanDiscoveryStrategy())

# scanMode is always "FUNCTIONAL_THEN_PHYSICAL" in v1
assert result["scanMode"] == "FUNCTIONAL_THEN_PHYSICAL"

# The probe sequence is configuration-driven, not hardcoded in the strategy
# DISCOVERY_PROBE_SEQUENCE = ["22F190"]  (defined in control_unit_discovery.py)
# The strategy receives probe_sequence as a parameter

# Access responders
for responder in result["responders"]:
    print(f"ECU {responder['responseId']}: confidence={responder['confidence']}, "
          f"discovered by {len(responder['discoveredBy'])} source(s)")

# Access probe history
for probe in result["probes"]:
    print(f"  {probe['method']} {probe['requestId']} → {probe['status']} ({probe['responseType']})")
```

### Multiple Functional Responders

A single functional probe (`7DF`) may return multiple CAN response frames. The UDS response parser splits these into individual probe results:

```python
from obd.commands.uds_response_parser import classify_response

# Multiple ECUs responding to a single functional probe
# The adapter may return a multiline response like:
# "7E8037F2211\n7EA037F2211\n7EC037F2211"
# classify_response() must handle this and produce separate results per responseId

# Each unique responseId becomes a separate ProbeResult and Responder
# Responder 7E8: discoveredBy = [{method: FUNCTIONAL, requestId: 7DF, probe: 22F190}]
# Responder 7EA: discoveredBy = [{method: FUNCTIONAL, requestId: 7DF, probe: 22F190}]
# Responder 7EC: discoveredBy = [{method: FUNCTIONAL, requestId: 7DF, probe: 22F190}]
# If physical probes later confirm 7E8 and 7EA, their confidence becomes HIGH
# 7EC (functional-only) remains confidence: LOW
```

### Error Isolation

Discovery never fails the overall diagnostic session. Each probe execution is isolated in its own try/except — a single probe failure never aborts the entire scan. Failures are converted to probe result records:

```python
from obd.commands.control_unit_discovery import read_control_units, GenericObdCanDiscoveryStrategy

# Each probe is isolated. If one probe throws an exception:
#   - Timeout → status: "ERROR", responseType: "ERROR", errorCode: "TIMEOUT"
#   - Communication error → status: "ERROR", responseType: "ERROR", errorCode: "COMMUNICATION_ERROR"
#   - Unexpected payload → status: "ERROR", responseType: "ERROR", errorCode: "UNEXPECTED_PAYLOAD"
#   - Adapter disconnect → status: "ERROR", responseType: "ERROR", errorCode: "ADAPTER_DISCONNECT"
# The scan continues with remaining probes. Only unrecoverable startup failures prevent execution.

# Example: probe 3 times out, but probes 1, 2, and 4-9 still execute:
# probes = [
#   { ..., "status": "DISCOVERED", "errorCode": null },
#   { ..., "status": "DISCOVERED", "errorCode": null },
#   { ..., "status": "ERROR", "errorCode": "TIMEOUT" },       # ← probe 3 failed
#   { ..., "status": "NOT_FOUND", "errorCode": null },        # ← probe 4 still ran
#   ...
# ]

# The backend also applies error isolation:
# processControlUnitDiscovery() catches and logs errors without crashing the session
```

### Response Classification Examples

```python
from obd.commands.uds_response_parser import classify_response, parse_raw_header_payload

# Positive response
result = classify_response("7E8101462F190...", "7E0")
# → status=DISCOVERED, responseType=POSITIVE, responseId=7E8, rawHeader=7E8, rawPayload=101462F190...

# Negative response
result = classify_response("7E8037F2211", "7E0")
# → status=DISCOVERED, responseType=NEGATIVE, responseId=7E8, rawHeader=7E8,
#   rawPayload=037F2211, negativeResponseCode=11, negativeResponseMeaning=SERVICE_NOT_SUPPORTED

# No response
result = classify_response("NO DATA", "7E1")
# → status=NOT_FOUND, responseType=NO_RESPONSE, responseId=null, rawHeader=null, rawPayload=null

# Malformed response
result = classify_response("GARBAGE", "7E2")
# → status=UNKNOWN, responseType=MALFORMED, responseId=null, rawHeader=null, rawPayload=null

# Error response (probe execution failure — not produced by classify_response,
# but by the discovery engine's per-probe exception handler)
# These are created by the discovery engine when a probe throws an exception:
# {
#   "method": "PHYSICAL",
#   "requestId": "7E1",
#   "probe": "22F190",
#   "responseId": null,
#   "status": "ERROR",
#   "responseType": "ERROR",
#   "negativeResponseCode": null,
#   "negativeResponseMeaning": null,
#   "rawHeader": null,
#   "rawPayload": null,
#   "rawResponse": "",
#   "errorCode": "TIMEOUT"  # or "COMMUNICATION_ERROR", "UNEXPECTED_PAYLOAD", "ADAPTER_DISCONNECT"
# }

# Header/payload extraction (reusable for future UDS features)
header, payload = parse_raw_header_payload("7E8037F2211")
# → header="7E8", payload="037F2211"
```

### Building Responders from Probes

```python
from obd.commands.control_unit_discovery import build_responders

responders = build_responders(probes)
# Groups by responseId, computes confidence, aggregates discoveredBy,
# determines firstSeenBy, confirmedByPhysical, and capabilities

# Confidence assignment rules (deterministic):
# - LOW:  responder discovered only through functional probing (7DF)
#         confirmedByPhysical = false
# - HIGH: responder discovered through any physical probe (7E0-7E7),
#         OR discovered functionally and later confirmed physically
#         confirmedByPhysical = true
#
# There is no heuristic or probabilistic scoring.
# Confidence is entirely determined by whether any physical probe reached the responder.
```

## Backend — Processing Discovery Events

### Receiving and Persisting Discovery Data

```typescript
// In VehicleDataService.processControlUnitDiscovery()
// Called by AgentWebhookController when CONTROL_UNIT_DISCOVERY_READ event arrives

const session = await this.repository.findSessionById(sessionId);
const existingData = session.vehicleDataJson || {};

// Merge discovery data into existing vehicle data (additive only)
const updatedData = {
  ...existingData,
  controlUnitDiscovery: eventPayload.controlUnitDiscovery,
};

await this.repository.saveVehicleData(sessionId, updatedData);
```

### Validating Discovery Data

```typescript
// In isValidVehicleDataJson() — add controlUnitDiscovery as optional
if (data.controlUnitDiscovery !== undefined) {
  const cud = data.controlUnitDiscovery;
  // Must have version, strategy, probeSequence, timestamps, summary, probes, responders
  assert(typeof cud.version === 'number');
  assert(Array.isArray(cud.probeSequence));
  assert(Array.isArray(cud.probes));
  assert(Array.isArray(cud.responders));
}
```

## Frontend — Displaying Control Units

### Responder-Focused Default View

```tsx
// ControlUnitsPanel.tsx — default view shows responders only
<table>
  <thead>
    <tr>
      <th>Response ID</th>
      <th>Confidence</th>
      <th>Status</th>
      <th>Protocol</th>
    </tr>
  </thead>
  <tbody>
    {discovery.responders.map((responder) => (
      <tr key={responder.responseId}>
        <td>{responder.responseId}</td>
        <td>{responder.confidence}</td>
        <td>DISCOVERED</td>
        <td>{responder.protocol}</td>
      </tr>
    ))}
  </tbody>
</table>
```

### Optional Probe Details View

```tsx
// Collapsible section below the responders table
<details>
  <summary>Probe Details ({discovery.probes.length} probes)</summary>
  <table>
    <thead>
      <tr>
        <th>Method</th>
        <th>Request ID</th>
        <th>Probe</th>
        <th>Response ID</th>
        <th>Status</th>
        <th>Response Type</th>
        <th>Raw Response</th>
      </tr>
    </thead>
    <tbody>
      {discovery.probes.map((probe, i) => (
        <tr key={i}>
          <td>{probe.method}</td>
          <td>{probe.requestId}</td>
          <td>{probe.probe}</td>
          <td>{probe.responseId ?? '—'}</td>
          <td>{probe.status}</td>
          <td>{probe.responseType}</td>
          <td title={probe.rawResponse}>{probe.rawResponse.substring(0, 20)}</td>
        </tr>
      ))}
    </tbody>
  </table>
</details>
```

## Running Tests

### Agent Tests

```bash
cd desktop-agent
python -m pytest tests/test_control_unit_discovery.py -v
python -m pytest tests/test_scan_events.py -v -k "control_unit"
```

### Backend Tests

```bash
cd backend
npx jest --testPathPattern="vehicle-data" --verbose
npx jest --testPathPattern="agent-webhook" --verbose
```

### Frontend Tests

```bash
cd frontend
npx jest --testPathPattern="ControlUnitsPanel" --verbose
npx jest --testPathPattern="VehicleHealthPanel" --verbose
```

### Full Regression

```bash
cd backend && npx jest --verbose
cd frontend && npx jest --verbose
cd desktop-agent && python -m pytest tests/ -v
```

## Key Files

| File | Purpose | Feature |
|------|---------|---------|
| `desktop-agent/src/obd/commands/uds_response_parser.py` | Reusable UDS response parser: classify_response, parse_raw_header_payload, NEGATIVE_RESPONSE_CODES, extract_negative_response | 019 NEW (shared for 020, 021, 022) |
| `desktop-agent/src/obd/commands/control_unit_discovery.py` | Discovery engine, strategy pattern, responder builder (consumes uds_response_parser) | 019 NEW |
| `desktop-agent/src/obd/mock_profiles/control_unit_discovery_profile.py` | Mock profile for discovery testing | 019 NEW |
| `desktop-agent/src/obd/mock_profiles/profile_registry.py` | Register new discovery profile | 019 MODIFY |
| `desktop-agent/src/agent/scan_executor.py` | `execute_control_unit_discovery()` handler | 019 MODIFY |
| `desktop-agent/src/agent/event_publisher.py` | Emit `CONTROL_UNIT_DISCOVERY_READ` event | 019 MODIFY |
| `desktop-agent/src/live_data/queue.py` | Dispatch `DISCOVER_CONTROL_UNITS` command | 019 MODIFY |
| `backend/src/vehicle-data/dtos/vehicle-data-response.dto.ts` | Add `ControlUnitDiscovery` interface (with scanMode), extend `VehicleDataJson`, update validator | 019 MODIFY |
| `backend/src/vehicle-data/services/vehicle-data.service.ts` | Add `processControlUnitDiscovery()` method | 019 MODIFY |
| `backend/src/obd/controllers/agent-webhook.controller.ts` | Route `CONTROL_UNIT_DISCOVERY_READ` event | 019 MODIFY |
| `backend/src/obd/types/scan-event-type.enum.ts` | Add `CONTROL_UNIT_DISCOVERY_READ` | 019 MODIFY |
| `backend/src/live-data/types/live-data-command-type.enum.ts` | Add `DISCOVER_CONTROL_UNITS` | 019 MODIFY |
| `frontend/src/services/vehicle-data-api.ts` | Extend `VehicleDataJson` type with `controlUnitDiscovery` (including scanMode) | 019 MODIFY |
| `frontend/src/components/vehicle-data/ControlUnitsPanel.tsx` | New component: responders table + probe details + scan mode display | 019 NEW |
| `frontend/src/components/vehicle-data/VehicleHealthPanel.tsx` | Integrate `ControlUnitsPanel` | 019 MODIFY |
| `desktop-agent/tests/test_uds_response_parser.py` | Reusable UDS parser unit tests | 019 NEW |
| `desktop-agent/tests/test_control_unit_discovery.py` | Agent discovery unit tests | 019 NEW |
| `backend/tests/unit/vehicle-data/vehicle-data.service.unit.test.ts` | Service tests for discovery processing | 019 MODIFY |
| `backend/tests/unit/vehicle-data/vehicle-data-response.dto.unit.test.ts` | DTO validation tests for discovery shape (including scanMode) | 019 MODIFY |
| `backend/tests/unit/obd/agent-webhook.controller.unit.test.ts` | Webhook routing tests for new event type | 019 MODIFY |
| `frontend/src/components/vehicle-data/__tests__/ControlUnitsPanel.test.tsx` | Frontend rendering tests | 019 NEW |