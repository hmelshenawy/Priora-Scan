# Data Model: ELM327 WiFi Adapter Integration

**Feature**: 010-elm327-wifi-adapter | **Date**: 2026-06-13

## Summary

No new database tables or schema changes are required for this feature. All adapter state and connection information uses existing models.

## Existing Entities Used

### AdapterConnection (unchanged)

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| organizationId | UUID | Tenant scope |
| agentId | UUID | FK to DesktopAgent |
| adapterType | VarChar(50) | "ELM327", "MOCK" — now also "ELM327_WIFI" |
| connectionType | VarChar(20) | "USB", "MOCK" — now also "WIFI" |
| protocol | VarChar(20)? | "ISO_15765_4_CAN" etc. |
| status | VarChar(20) | "CONNECTED", "DISCONNECTED", "ERROR" |
| startedAt | Timestamptz | When connection established |
| endedAt | Timestamptz? | When connection ended |
| errorMessage | VarChar(500)? | Error details if status is ERROR |

The `connectionType` field is VarChar(20), not an enum, so the new value 'WIFI' requires no migration.

### DesktopAgent (unchanged)

No changes. The `adapterType` and `connectionType` are stored on `AdapterConnection`, not `DesktopAgent`.

## New Runtime Entities (Desktop Agent Local Only)

These entities exist only in the Desktop Agent's memory — no database persistence.

### WifiConnection

| Field | Type | Notes |
|---|---|---|
| host | string | ELM327 IP address (default: 192.168.0.10) |
| port | int | ELM327 TCP port (default: 35000) |
| timeout | float | Socket timeout in seconds (default: 5) |
| _socket | socket.socket? | TCP socket (managed internally) |
| _connected | bool | Current connection state |
| _last_command_at | float? | Timestamp of last command (for inter-command delay) |

### WifiElm327Adapter

| Field | Type | Notes |
|---|---|---|
| connection | WifiConnection | TCP connection manager |
| adapter_type | string | "ELM327_WIFI" |
| protocol | string | Auto-detected (set after ATSP0) |
| _initialized | bool | Whether ELM327 init sequence completed |

### ElmParsedResponse

| Field | Type | Notes |
|---|---|---|
| status | string | "OK", "DATA", "NO_DATA", "ERROR", "SEARCHING" |
| raw | bytes | Original bytes from ELM327 |
| data | string? | Cleaned hex data string (no prompt, spaces, headers) |

## Entity Relationships

```text
DesktopAgent (DB)
  └── AdapterConnection (DB) — one active connection per agent
        └── connectionType: "WIFI" | "USB" | "MOCK"

WifiElm327Adapter (runtime)
  └── WifiConnection (runtime) — TCP socket to ELM327
        └── host:port → ELM327 hardware → Vehicle OBD-II port
```

## Adapter Factory Mapping

| OBD_ADAPTER_TYPE | Adapter Class | Connection Class | connectionType |
|---|---|---|---|
| mock | MockObdAdapter | None (in-memory) | "MOCK" |
| usb | Elm327Adapter | UsbConnection | "USB" |
| wifi | WifiElm327Adapter | WifiConnection | "WIFI" |