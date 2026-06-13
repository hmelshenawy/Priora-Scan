# WiFi Adapter Connection Contract

**Feature**: 010-elm327-wifi-adapter | **Date**: 2026-06-13

## Overview

This contract defines the interface between the Desktop Agent's `WifiElm327Adapter` and its `WifiConnection` transport layer, and the agent's heartbeat payload for WiFi adapter status reporting.

## WifiConnection Interface

```python
class WifiConnection:
    def __init__(self, host: str = "192.168.0.10", port: int = 35000, timeout: float = 5.0):
        """Initialize connection configuration."""

    def open(self) -> None:
        """Establish TCP socket connection to ELM327.
        Raises: ConnectionError if connection refused or timeout."""

    def is_open(self) -> bool:
        """Check if socket is connected and valid."""

    def write(self, data: bytes) -> None:
        """Send bytes to ELM327. Enforces 100ms minimum inter-command delay.
        Raises: ConnectionError if socket is closed."""

    def read(self) -> bytes:
        """Read response until '>' prompt delimiter.
        Returns: Raw bytes including prompt.
        Raises: TimeoutError if no response within timeout."""

    def close(self) -> None:
        """Close socket connection. Safe to call multiple times."""
```

## WifiElm327Adapter Interface

```python
class WifiElm327Adapter(BaseAdapter):
    adapter_type: str = "ELM327_WIFI"
    protocol: str  # Set after auto-detect (ATSP0)

    def connect(self) -> bool:
        """Open WiFi connection and run ELM327 init sequence.
        Returns: True if connected and initialized.
        Handles: ATZ, ATE0, ATL0, ATS0, ATH0, ATSP0.
        Retries: 3 attempts with 2s backoff on connection failure."""

    def is_connected(self) -> bool:
        """Check TCP connection + ELM327 responsiveness."""

    def send(self, command: str) -> bytes:
        """Send OBD command and return raw response.
        Enforces inter-command delay via WifiConnection.
        Raises: RuntimeError if not connected."""

    def close(self) -> None:
        """Close TCP connection."""
```

## ELM327 Initialization Sequence

| Step | Command | Expected Response | On Failure |
|---|---|---|---|
| 1 | `ATZ\r` | "ELM327 vX.X" + `>` | Log and continue |
| 2 | `ATE0\r` | "OK" + `>` | Log and continue |
| 3 | `ATL0\r` | "OK" + `>` | Log and continue |
| 4 | `ATS0\r` | "OK" + `>` | Log and continue |
| 5 | `ATH0\r` | "OK" + `>` | Log and continue |
| 6 | `ATSP0\r` | "OK" + `>` | Return False (protocol required) |

## Heartbeat Payload Extension

The Desktop Agent heartbeat (`POST /obd/agents/:id/heartbeat`) gains an explicit `connectionType` field:

```json
{
  "version": "1.0.0",
  "adapterConnected": true,
  "adapterType": "ELM327_WIFI",
  "connectionType": "WIFI",
  "protocol": "ISO_15765_4_CAN"
}
```

### connectionType Values

| Value | Meaning |
|---|---|
| `MOCK` | MockObdAdapter (in-memory simulation) |
| `USB` | Elm327Adapter via UsbConnection (serial) |
| `WIFI` | WifiElm327Adapter via WifiConnection (TCP) |

### Backward Compatibility

- `connectionType` is optional in the heartbeat DTO
- If absent, backend infers: `adapterType === 'MOCK'` → `MOCK`, else → `USB`
- When present, backend uses the explicit value

## Agent Status Response Extension

The `GET /obd/agents` response gains adapter type fields from `AdapterConnection`:

```json
{
  "id": "agent-uuid",
  "name": "Desktop Agent",
  "version": "1.0.0",
  "status": "ONLINE",
  "lastSeenAt": "2026-06-13T10:00:00Z",
  "adapterConnected": true,
  "adapterType": "ELM327_WIFI",
  "connectionType": "WIFI"
}
```

### New Response Fields

| Field | Type | Source |
|---|---|---|
| adapterType | string? | AdapterConnection.adapterType |
| connectionType | string? | AdapterConnection.connectionType |

## ELM327 Response Parser Contract

### Input → Output Examples

| Raw ELM327 Response | Parser | Output |
|---|---|---|
| `7E8 01 42 0C FF 1A\r\r>` | `parse_pid_bytes` | `bytes.fromhex("0CFF1A")` |
| `0142\r012F\r0902 00 00 00 57 4D...\r>` | `clean_raw_response` | `"0142"` (first line only for single-PID) |
| `0 1 3 0 0 0 1 1\r>` | `parse_supported_pids` | `["01", "03", "07"]` |
| `43 01 33 00 01 09 01 01\r>` | `parse_dtcs` | `["P0133", "P0109", "P0101"]` |
| `44\r>` | `parse_clear_result` | `{"success": true}` |
| `7F 04 31\r>` | `parse_clear_result` | `{"success": false, "reason": "ECU rejected (7F 04 31)"}` |
| `NO DATA\r>` | any parser | `{"supported": false}` |
| `SEARCHING...\r0142 0C FF 1A\r>` | `parse_pid_bytes` | `bytes.fromhex("0CFF1A")` (strips SEARCHING) |
| `?\r>` | any parser | `{"error": "unsupported command"}` |
| `0902\r49 02 01 00 00 00 31 44 42...\r49 02 02 ...38 30 31 32 33\r>` | `parse_vin` | `"1DB...80123"` (17 chars) |

## Error Handling Contract

| Condition | Behavior |
|---|---|
| TCP connection refused | `ConnectionError` raised, adapter reports disconnected |
| TCP timeout | `TimeoutError` raised, command returns `{supported: false}` |
| "NO DATA" from ECU | Parser returns `{supported: false}` for the PID |
| "?" from ELM327 | Parser returns `{error: "unsupported command"}`, logged as warning |
| "SEARCHING..." | Parser waits up to 2x timeout, strips from response |
| "STOPPED" from ELM327 | Parser returns `{error: "adapter stopped"}`, triggers reconnect |
| Socket broken pipe | `ConnectionError` raised, adapter reports disconnected, reconnect attempted |
| Partial/truncated hex | Parser returns `{error: "incomplete data"}` for that PID only |