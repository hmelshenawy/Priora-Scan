# Research: ELM327 WiFi Adapter Integration

**Feature**: 010-elm327-wifi-adapter | **Date**: 2026-06-13

## R1 — WiFi ELM327 TCP Connection Protocol

**Decision**: Use Python stdlib `socket` for TCP connection to ELM327 WiFi adapter

**Rationale**: The ELM327 WiFi adapter exposes a TCP server on port 35000 (default) at its IP address (typically 192.168.0.10). The protocol is simple line-based: send command + `\r`, read until `>` prompt. Python's `socket` module provides all needed functionality without external dependencies. The existing `UsbConnection` uses `pyserial`; the WiFi connection uses raw TCP — same logical interface, different transport.

**Alternatives considered**:
- `asyncio` + `aiohttp`: Adds complexity for a single-connection synchronous agent. The existing agent loop is `while True: time.sleep()` based, not async.
- `telnetlib` (deprecated in Python 3.13): Was a convenient wrapper but is removed from stdlib.
- Third-party OBD libraries (python-OBD, obd-universal): Opinionated wrappers that conflict with our existing command dispatch architecture.

**Implementation notes**:
- Socket timeout configured via `OBD_WIFI_TIMEOUT_SECONDS` (default 5s)
- Connection is persistent — keep-alive between commands
- `>` character is the ELM327 prompt delimiter, signaling response complete
- Multi-line responses (e.g., VIN Mode 09) are delimited by `\r\n` between lines, terminated by `>`

## R2 — ELM327 Initialization Sequence

**Decision**: Send ATZ → ATE0 → ATL0 → ATS0 → ATH0 → ATSP0 on connection, validate each response

**Rationale**: Standard ELM327 initialization per the ELM327 datasheet:
- `ATZ`: Reset — clears all settings, returns "ELM327 v2.3" or similar
- `ATE0`: Echo off — prevents command echo in responses (reduces parsing noise)
- `ATL0`: Linefeed off — removes `\n` from response (cleaner parsing)
- `ATS0`: Spaces off — removes spaces from hex response (compact data)
- `ATH0`: Headers off — removes CAN headers from response (data only)
- `ATSP0`: Auto protocol detection — ELM327 selects the best CAN protocol

Each command expects "OK" response (or ">" prompt). "SEARCHING..." means the ELM327 is querying the ECU — wait longer. "?" means command not understood — skip and continue.

**Alternatives considered**:
- `ATSP6` (ISO 15765-4 CAN 11bit 500kb): Hardcoded protocol is faster but fails on vehicles with different protocols. Auto-detect is safer.
- Skip initialization: ELM327 may have stale state from a previous session. Reset ensures clean start.
- Custom init with headers on (ATH1): Useful for debugging but adds parsing complexity. Headers off is the standard production setting.

## R3 — ELM327 Response Parsing

**Decision**: Create a dedicated `elm_parser.py` module with pure functions for each response type

**Rationale**: The existing command modules (`vin.py`, `dtc.py`, `vehicle_data.py`, `clear_dtc.py`) parse raw `bytes` responses directly with ad-hoc string operations. This works for the mock adapter (which returns clean, predictable hex) but fails with real ELM327 responses that include:
- Prompts (`>`)
- "SEARCHING..." interjections
- "NO DATA" for unsupported PIDs
- "?" for invalid commands
- Multi-frame responses with line breaks
- Trailing whitespace and carriage returns

A centralized parser ensures consistent handling across all command modules and makes testing straightforward.

**Parser functions**:
- `clean_raw_response(raw: bytes) -> str`: Strip prompt, whitespace, "SEARCHING...", normalize to hex string
- `parse_vin(response: str) -> str`: Decode Mode 09 multi-frame VIN from hex ASCII
- `parse_dtcs(response: str) -> list[str]`: Parse Mode 03 hex into DTC codes (P/B/C/U format)
- `parse_clear_result(response: str) -> dict`: Parse Mode 04 response (44 = success, 7F = failure)
- `parse_pid_bytes(response: str) -> bytes`: Extract raw PID hex bytes as bytes object
- `parse_supported_pids(response: str) -> list[str]`: Parse PID bitmask into list of supported hex PIDs

**Alternatives considered**:
- Inline parsing in each command module: Current approach, but fragile with real data.
- Regex-based parsing: Overkill and hard to debug for binary data.
- Third-party parser (python-OBD internals): Tight coupling to an external library's internal API.

## R4 — Adapter Factory and Environment Variables

**Decision**: Replace `OBD_MOCK` boolean with `OBD_ADAPTER_TYPE` enum (mock|usb|wifi), with backward compatibility for `OBD_MOCK=true`

**Rationale**: The current `OBD_MOCK` env var is a boolean toggle between mock and USB ELM327. With three adapter types, a string enum is clearer. Backward compatibility: if `OBD_MOCK=true`, treat as `OBD_ADAPTER_TYPE=mock`; otherwise, `OBD_ADAPTER_TYPE` defaults to `wifi` (the new default for real-adapter usage).

**New environment variables**:
```
OBD_ADAPTER_TYPE=mock|usb|wifi  (default: wifi if OBD_MOCK is not set)
OBD_WIFI_HOST=192.168.0.10     (default: 192.168.0.10)
OBD_WIFI_PORT=35000            (default: 35000)
OBD_WIFI_TIMEOUT_SECONDS=5     (default: 5)
```

**Backward compatibility**:
- `OBD_MOCK=true` → `OBD_ADAPTER_TYPE=mock`
- `OBD_MOCK` absent/false → `OBD_ADAPTER_TYPE=wifi` (changed default from USB to WiFi, since WiFi is the target use case for this feature)

**Alternatives considered**:
- Keep `OBD_MOCK` + add `OBD_WIFI_HOST`: Two separate toggles is confusing. What happens when `OBD_MOCK=false` and `OBD_WIFI_HOST` is set? Unclear.
- Auto-detect adapter type: Not possible — WiFi and USB use different connection mechanisms and the agent needs to know which to use at startup.

## R5 — Dynamic Heartbeat Adapter Status

**Decision**: Modify heartbeat loop to call `adapter.is_connected()` dynamically each beat instead of passing a static boolean

**Rationale**: The current `heartbeat_loop` receives `adapter_connected`, `adapter_type`, and `protocol` as static values captured at agent startup. For a WiFi adapter that can disconnect and reconnect, the heartbeat must report the current state, not the startup state. The fix: pass the adapter instance (or a callable) so the heartbeat re-evaluates connection status each cycle.

**Alternatives considered**:
- Separate "adapter monitor" thread: Adds complexity for a simple check.
- Poll in the main loop: Heartbeat already runs on a 30-second interval — adding the check there is sufficient.

## R6 — Live Data with Real Adapter

**Decision**: Add a real-data polling path to `LiveDataPoller` that uses `adapter.send()` for each PID, falling back to `MockLiveDataGenerator` when `OBD_ADAPTER_TYPE=mock`

**Rationale**: The existing `LiveDataPoller` bypasses the adapter entirely — it uses `MockLiveDataGenerator` to produce fake hex bytes. For WiFi/USB adapters, the poller must send real PID commands and parse real responses. The simplest approach: when `adapter.adapter_type != "MOCK"`, the poller sends real commands per PID at the configured interval.

**Alternatives considered**:
- Separate `RealLiveDataPoller` class: Code duplication. Better to add a mode switch inside the existing poller.
- Keep mock generator always, add separate real-data queue command: Doesn't match the live-data streaming UX — the user expects continuous updates, not discrete commands.

## R7 — Frontend Adapter Type Display

**Decision**: Add `adapterType` and `connectionType` fields to `AgentStatusResponseDto` and the frontend `AgentStatus` interface, then render in `AgentStatusCard` and `ScanControlPanel`

**Rationale**: The backend already stores `adapterType` and `connectionType` in the `AdapterConnection` table (written by `AgentHeartbeatService`). The `AgentStatusResponseDto` currently only exposes `adapterConnected: boolean`. Adding these fields requires:
1. Backend: Include `adapterType` and `connectionType` from the latest `AdapterConnection` in the agent list response
2. Frontend: Add fields to `AgentStatus` interface and render in UI

**Alternatives considered**:
- Separate `/adapter-status` endpoint: Over-engineering for two extra fields.
- Store on DesktopAgent model: Would require migration. AdapterConnection already has the data.

## R8 — Inter-Command Delay

**Decision**: Enforce 100ms minimum delay between ELM327 commands in `WifiConnection` and `UsbConnection`

**Rationale**: The ELM327 datasheet recommends a minimum delay between commands to allow the chip to process and the ECU to respond. Without this delay, rapid-fire commands can cause buffer overflows, corrupted responses, or adapter hangs. The `send()` method should enforce this delay internally so callers don't need to remember it.

**Alternatives considered**:
- Delay in each command function: Error-prone — every new command must remember to add it.
- No delay: Works on some adapters but causes intermittent failures on others. Not reliable.

## R9 — Connection Type in Heartbeat Service

**Decision**: Update `AgentHeartbeatService` to map `adapterType === 'MOCK'` → `connectionType='MOCK'`, `adapter_type` containing 'ELM327' with WiFi config → `connectionType='WIFI'`, otherwise `connectionType='USB'`

**Rationale**: The current heartbeat service hardcodes `connectionType: dto.adapterType === 'MOCK' ? 'MOCK' : 'USB'`. With WiFi support, the mapping must also produce 'WIFI'. The Desktop Agent should explicitly report its connection type in the heartbeat payload, or the backend can infer it from `adapter_type` + presence of WiFi configuration fields.

**Preferred approach**: Have the Desktop Agent send `connectionType` explicitly in the heartbeat payload alongside `adapterType`. This is unambiguous and doesn't require the backend to guess.

**Alternatives considered**:
- Infer from adapter type string: 'ELM327_WIFI' vs 'ELM327_USB' — requires new adapter type strings, breaks existing 'ELM327' value.
- Backend infers from IP/host metadata: Backend doesn't have this information.