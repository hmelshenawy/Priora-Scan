# Data Model: CAN USB Adapter Foundation

**Feature**: 020-can-usb-adapter | **Date**: 2026-06-29 | **Spec**: [spec.md](spec.md) | **Research**: [research.md](research.md)

This is a **foundation library**, not a product feature. The entities below are transport-level Python value objects and abstractions — there is **no database, no tenant, no HTTP API, and no persistence** in this feature. Tenant scoping, persistence, and business semantics are introduced at product integration (future feature 030), not here. All entities are designed as **stable long-term contracts**: future drivers, filters, replay, and statistics must be addable without changing the core shapes below.

Conventions: immutable value objects use `@dataclass(frozen=True, slots=True)`. Validation happens at construction; invalid input raises a domain error from `errors.py`. Sizes are Classic CAN only (0–8 bytes). Direction is `RX` only in this feature.

---

## 1. CanFrame

The immutable record describing one received Classic CAN frame. The core shape is stable; future replay/filtering extend via composition, not by editing this entity.

| Field | Type | Notes |
|---|---|---|
| `timestamp` | `float` | Receive timestamp, seconds. Source-dependent (stack or monotonic fallback). |
| `channel` | `int \| str` | Numeric index **or** bus/channel name string. Preserved as given. |
| `direction` | `Direction` | Enum; `RX` is the **only** allowed value in this feature. `TX` reserved for future (out of scope). |
| `arbitration_id` | `int` | Standard 11-bit (`0..0x7FF`) or extended 29-bit (`0..0x1FFFFFFF`). |
| `is_extended_id` | `bool` | Selects which range applies. |
| `is_remote_frame` | `bool` | RTR flag. Remote frames carry no payload (DLC may be > 0 but `data` is empty). |
| `is_error_frame` | `bool` | Bus-error frame flag. |
| `dlc` | `int` | Data Length Code. MUST equal `len(data)`. `0..8`. |
| `data` | `bytes` | Payload, 0–8 bytes. `bytes` (not `bytearray`) to preserve immutability. |
| `bitrate` | `int \| None` | Optional. Channel bitrate when known. |

**Derived (read-only properties)**:
- `arbitration_id_hex` → uppercase `"0x4D2"` (with `0x` prefix).
- `data_hex` → uppercase space-separated payload, e.g. `"01 02 03"`; `""` for empty.

**Validation (in `__post_init__`, raises mapped domain errors)**:
1. `direction == RX` (else `CanConfigurationError`).
2. If `is_extended_id`: `0 <= arbitration_id <= 0x1FFFFFFF`; else `0 <= arbitration_id <= 0x7FF`.
3. `0 <= len(data) <= 8`.
4. `dlc == len(data)`.
5. `data` is `bytes`.

**Immutability**: `frozen=True`; mutation raises `dataclasses.FrozenInstanceError`. Hashable.

**Relationships**: produced by `CanDriver` implementations; consumed by `FrameLogger` implementations and `ConnectionService`; held by `CaptureSession` (indirectly, via stats in future features).

**Extensibility for future replay/filtering**: the stable shape (id, flags, dlc, data, timestamp, channel, direction) is sufficient to filter by id/mask/whitelist/blacklist and to replay recorded frames without changes to `CanFrame`. Future filter/replay features compose around this entity; they do not edit it.

---

## 2. CanUsbConfig

Configuration for one capture session. Carries defaults so a consumer can connect with minimal setup.

| Field | Type | Default |
|---|---|---|
| `interface` | `str` | `"gs_usb"` (first supported interface) |
| `channel` | `int \| str` | `0` |
| `bitrate` | `int` | `500000` |
| `receive_timeout_seconds` | `float` | `1.0` |
| `log_directory` | `str \| Path \| None` | `None` |
| `jsonl_enabled` | `bool` | `False` |
| `asc_enabled` | `bool` | `False` |

**Validation**: `bitrate > 0`; `receive_timeout_seconds >= 0`; `interface` non-empty. Invalid → `CanConfigurationError`.

**Relationships**: passed to driver construction; referenced by `CaptureSession`.

**Design note**: enable flags are independent per format; a future logging feature can add more without changing this shape (additive fields only).

---

## 3. DriverStatus

First-class status model reported by every driver.

**State enum** (`DriverState`):
- `DISCONNECTED`
- `CONNECTED`
- `LISTENING`
- `ERROR`

| Field | Type | Notes |
|---|---|---|
| `state` | `DriverState` | Current state. |
| `adapter_name` | `str \| None` | Extensible metadata. |
| `serial_number` | `str \| None` | Extensible metadata. |
| `firmware` | `str \| None` | Extensible metadata. |
| `bitrate` | `int \| None` | Extensible metadata. |
| `channel` | `int \| str \| None` | Extensible metadata. |
| `last_error` | `CanAdapterError \| None` | Set when `state == ERROR`. |
| `received_frame_count` | `int` | Defaults to `0`; drivers increment. |

**State transitions**:
```text
DISCONNECTED --connect()--> CONNECTED --start listening--> LISTENING
LISTENING/CONNECTED --disconnect()--> DISCONNECTED
any --failure--> ERROR --disconnect()--> DISCONNECTED
```
Transitions are driver-owned; `DriverStatus` is a value object snapshot, not a state machine.

**Immutability**: frozen value object; drivers build a new snapshot on each `get_status()` call.

**Relationships**: produced by `CanDriver.get_status()`; surfaced by `ConnectionService.get_status()`.

---

## 4. DriverCapabilities

First-class capability model describing what a driver supports. Downstream code queries this instead of inferring from concrete types.

| Field | Type | GS_USB value | Notes |
|---|---|---|---|
| `receive` | `bool` | `True` | Receive frames. |
| `transmit` | `bool` | `False` | Future; `False` for every driver in this feature (read-only). |
| `can_fd` | `bool` | `False` | CAN FD support (out of scope now). |
| `hardware_filters` | `bool` | `False` | Hardware ID filters (future feature 025). |
| `software_filters` | `bool` | `False` | Software filters (future feature 025). |
| `replay` | `bool` | `False` | Act as a replay source (future feature 024). |
| `timestamps` | `bool` | `True` (when stack supports) | Reliable hardware/stack timestamps. |

**Named constants**: `GS_USB_CAPABILITIES`, `MOCK_CAPABILITIES` (mock: `receive=True, transmit=False, replay=True-as-source, timestamps=True`, others `False`).

**Immutability**: frozen. Future drivers construct their own; the shape is stable.

**Relationships**: produced by `CanDriver.get_capabilities()`.

---

## 5. CaptureSession

Lightweight entity representing one connection/capture lifecycle. **Intentionally minimal** — not a workflow engine.

| Field | Type | Notes |
|---|---|---|
| `session_id` | `str` | Unique identifier for the session. |
| `start_time` | `float` | Session start, seconds. |
| `end_time` | `float \| None` | Set on close. `None` while active. |
| `active` | `bool` | `True` while the session is open. |
| `stats` | `dict \| None` | Opaque, reserved for future Bus Statistics (feature 026). `None` now. |
| `driver` | `CanDriver` ref | Associated driver. |
| `config` | `CanUsbConfig` ref | Associated configuration. |

**Behavior (minimal)**: `mark_end()` sets `end_time` and `active=False`. No streaming, no statistics computation, no export, no diagnostics logic. Those are future features (022/024/026) that will compose around this entity.

**Relationships**: associated with one `CanDriver` and one `CanUsbConfig`; optionally held by `ConnectionService`.

---

## 6. Domain Error Taxonomy

All errors derive from `CanAdapterError`. Consumers catch PrioraCAN errors only; underlying `python-can`/`libusb` exceptions are chained via `raise ... from original` at the single seam and never leak as their raw types.

| Error | Raised when |
|---|---|
| `CanAdapterError` | Base for all PrioraCAN CAN errors; also the fallback for unmapped low-level exceptions. |
| `CanDriverNotFoundError` | The requested interface/backend (e.g. `gs_usb`) is not installed or unavailable. |
| `CanDeviceNotFoundError` | No adapter device found on the bus/USB. |
| `CanPermissionError` | Permission/access denied (e.g. cannot claim USB interface, `udev`/driver rights). |
| `CanConfigurationError` | Invalid config (unknown interface/channel/bitrate, bad frame values, non-RX direction). |
| `CanConnectionError` | Connection lost or operation attempted while disconnected. |
| `CanReceiveTimeout` | `receive()` got no frame within the timeout (including mock empty-bus). |
| `CanLoggingError` | A logger failed to open/write/close. |

**Hierarchy**: `CanDriverNotFoundError`, `CanDeviceNotFoundError`, `CanPermissionError`, `CanConfigurationError`, `CanConnectionError`, `CanReceiveTimeout`, `CanLoggingError` all subclass `CanAdapterError`.

**Relationships**: raised by drivers, the python-can seam, loggers, and the connection service; referenced by `DriverStatus.last_error`.

---

## Entity relationship summary

```text
CanUsbConfig ──used by──> CanDriver (abstraction)
                              ├── GsUsbDriver ──> PythonCanAdapter ──> python-can
                              └── MockDriver
CanDriver.get_status()      --> DriverStatus
CanDriver.get_capabilities()--> DriverCapabilities
CanDriver.receive()         --> CanFrame
CanFrame ──written by──> FrameLogger (JsonlLogger | AscLogger)
ConnectionService ──composes──> CanDriver + FrameLogger*
CaptureSession ──refs──> CanDriver + CanUsbConfig
All errors ──subclass──> CanAdapterError
```

**Stability guarantee**: `CanFrame`, `DriverStatus`, `DriverCapabilities`, `CanDriver`, and the error taxonomy are stable contracts. `CanUsbConfig` and `CaptureSession` are extensible by additive fields. Future drivers, filters, replay, statistics, streaming, and product integration compose around these without editing their core shapes.