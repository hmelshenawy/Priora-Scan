# VIN Read Result Contract

**Feature**: 012-vin-unsupported-handler | **Date**: 2026-06-14

## Python API: `read_vin()`

### Function Signature

```python
def read_vin(adapter: BaseAdapter) -> VinResult:
    """Read Vehicle Identification Number via Mode 09 PID 02.

    Returns a VinResult instead of raising on unsupported VIN.
    Use VinResult.status to check support, VinResult.vin for the string.
    Only raises RuntimeError for genuine transport/adapter failures.
    """
```

### Return Type: `VinResult`

```python
@dataclass(frozen=True)
class VinResult:
    status: str      # "SUPPORTED" | "UNSUPPORTED"
    vin: str | None  # 17-char VIN string when SUPPORTED, None when UNSUPPORTED
    reason: str | None = None  # "NO_DATA" | "ALL_FF" | "MALFORMED" | "EMPTY_RESPONSE" when UNSUPPORTED

    @classmethod
    def supported(cls, vin: str) -> "VinResult":
        """Create a SUPPORTED result with the decoded VIN."""
        return cls(status="SUPPORTED", vin=vin, reason=None)

    @classmethod
    def unsupported(cls, reason: str) -> "VinResult":
        """Create an UNSUPPORTED result with the given reason."""
        return cls(status="UNSUPPORTED", vin=None, reason=reason)
```

### Behavior Matrix

| Input | Path | Result |
|-------|------|--------|
| Valid 17-char VIN (mock) | `_read_vin_mock` | `VinResult.supported("W1KAF4GB1RF124321")` |
| All-0xFF payload (mock) | `_read_vin_mock` | `VinResult.unsupported("ALL_FF")` |
| Empty response `b""` (mock) | `_read_vin_mock` | `VinResult.unsupported("EMPTY_RESPONSE")` |
| Missing `4902` prefix (mock) | `_read_vin_mock` | `VinResult.unsupported("MALFORMED")` |
| Non-17-char decoded VIN (mock) | `_read_vin_mock` | `VinResult.unsupported("MALFORMED")` |
| Non-printable VIN chars (mock) | `_read_vin_mock` | `VinResult.unsupported("MALFORMED")` |
| "NO DATA" (real ELM327) | `parse_vin` | `VinResult.unsupported("NO_DATA")` |
| "?" unsupported (real ELM327) | `parse_vin` | `VinResult.unsupported("NO_DATA")` |
| Incomplete data (real ELM327) | `parse_vin` | `VinResult.unsupported("MALFORMED")` |
| "STOPPED" (real ELM327) | `parse_vin` | **RuntimeError** — genuine adapter failure |
| Valid multi-frame VIN (real ELM327) | `parse_vin` | `VinResult.supported(vin)` |

### Exception Policy

| Condition | Raises? | Reason |
|-----------|---------|--------|
| Transport/adapter failure | Yes (`RuntimeError`) | Genuine failure — caller cannot continue |
| Adapter returns `ADAPTER_STOPPED` | Yes (`RuntimeError`) | Hardware disconnected |
| VIN not supported (all-FF) | No | Returns `VinResult.unsupported("ALL_FF")` |
| VIN response empty | No | Returns `VinResult.unsupported("EMPTY_RESPONSE")` |
| VIN response malformed | No | Returns `VinResult.unsupported("MALFORMED")` |
| VIN response "NO DATA" | No | Returns `VinResult.unsupported("NO_DATA")` |

## Event Emission Contract

### VIN_READ Event (execute_scan)

**When VIN is supported:**
```json
{
  "scanJobId": "scan-123",
  "event": "VIN_READ",
  "payload": {
    "vin": "W1KAF4GB1RF124321"
  }
}
```

**When VIN is unsupported:**
```json
{
  "scanJobId": "scan-123",
  "event": "VIN_READ",
  "payload": {
    "vin": null,
    "vinStatus": "UNSUPPORTED",
    "reason": "ALL_FF"
  }
}
```

**Change**: The `VIN_READ` event payload adds `vinStatus` and `reason` fields when VIN is unsupported. When VIN is supported, the payload remains backward-compatible (only `vin` field).

### VEHICLE_DATA_READ Event (execute_vehicle_data_read)

**When VIN is supported:**
```json
{
  "vehicleData": {
    "vin": {
      "value": "W1KAF4GB1RF124321",
      "supported": true
    }
  }
}
```

**When VIN is unsupported:**
```json
{
  "vehicleData": {
    "vin": {
      "value": null,
      "supported": false,
      "reason": "ALL_FF"
    }
  }
}
```

**Change**: The `vin` object in `vehicleData` adds an optional `reason` field when unsupported. The existing `value` and `supported` fields remain unchanged.