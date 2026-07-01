# Public API Contract: `prioracan` (CAN USB Adapter Foundation)

**Feature**: 020-can-usb-adapter | **Date**: 2026-06-29 | **Spec**: [spec.md](../spec.md) | **Data model**: [data-model.md](../data-model.md)

This is the **public Python API** contract for the `prioracan` library. It is the library equivalent of an API contract (there is no HTTP API in this feature). The public surface is deliberately narrow and stable. Internal modules under `drivers/adapters/` (e.g. `python_can_adapter`) are **not** public and may change; `python-can` is never re-exported.

**Stability**: `CanFrame`, `DriverStatus`/`DriverState`, `DriverCapabilities`, `CanDriver`, the error taxonomy, `FrameLogger`, and `ConnectionService` are stable contracts. Future drivers, filters, replay, statistics, streaming, and product integration must compose around these without changing their signatures.

## 1. Public exports (`prioracan`)

Imported from the top-level package:

```python
from prioracan import (
    CanFrame,
    CanUsbConfig,
    DriverStatus,
    DriverState,
    DriverCapabilities,
    CaptureSession,
    CanDriver,
    GsUsbDriver,
    MockDriver,
    FrameLogger,
    JsonlLogger,
    AscLogger,
    ConnectionService,
    # errors
    CanAdapterError,
    CanDriverNotFoundError,
    CanDeviceNotFoundError,
    CanPermissionError,
    CanConfigurationError,
    CanConnectionError,
    CanReceiveTimeout,
    CanLoggingError,
)
```

`python-can` is **never** re-exported and never appears in any public signature.

## 2. `CanFrame` (immutable value object)

```python
@dataclass(frozen=True)
class CanFrame:
    timestamp: float
    channel: int | str
    direction: Direction            # RX only in this feature
    arbitration_id: int
    is_extended_id: bool
    is_remote_frame: bool
    is_error_frame: bool
    dlc: int
    data: bytes                     # 0..8 bytes
    bitrate: int | None = None

    # derived read-only properties
    @property
    def arbitration_id_hex(self) -> str: ...   # "0x4D2"
    @property
    def data_hex(self) -> str: ...             # "01 02 03"
```

**Contract**:
- Construction validates (see data-model.md §1); invalid input raises a `CanAdapterError` subclass.
- Instances are immutable and hashable.
- No mutators, no `transmit`/`send`.

## 3. `CanDriver` (abstraction — `Protocol`)

```python
class CanDriver(Protocol):
    def connect(self) -> None: ...
    def disconnect(self) -> None: ...
    def is_connected(self) -> bool: ...
    def receive(self, timeout_seconds: float | None = None) -> CanFrame: ...
    def iter_frames(self, stop_event: threading.Event | None = None) -> Iterator[CanFrame]: ...
    def get_status(self) -> DriverStatus: ...
    def get_capabilities(self) -> DriverCapabilities: ...
```

**Contract**:
- Exactly these seven operations. **No** `transmit`, `send`, `write`, or `send_periodic`.
- `receive` returns one `CanFrame` or raises `CanReceiveTimeout` (no `None` return).
- `iter_frames` is a thin iterator over `receive`, stoppable via `stop_event`; it is **not** a streaming engine and owns no threads.
- `disconnect` is idempotent and safe to call from another thread.
- All failures raise `CanAdapterError` subclasses; no `python-can`/`libusb` types leak.

## 4. `GsUsbDriver`

```python
class GsUsbDriver:
    def __init__(self, config: CanUsbConfig) -> None: ...
    # implements CanDriver
```

**Contract**:
- Uses `python-can` internally via the internal `PythonCanAdapter` (in `drivers/adapters/`); `GsUsbDriver` communicates **only** with `PythonCanAdapter`; consumers never see `python-can`.
- `get_capabilities()` returns GS_USB capabilities: `receive=True, transmit=False, can_fd=False, hardware_filters=False, software_filters=False, replay=False, timestamps=True` (when supported).
- No transmit path.

## 5. `MockDriver`

```python
class MockDriver:
    def __init__(self, frames: Sequence[CanFrame], *, config: CanUsbConfig | None = None) -> None: ...
    # implements CanDriver
```

**Contract**:
- Replays `frames` deterministically in order.
- When exhausted, `receive` raises `CanReceiveTimeout` (immediate by default for fast tests).
- `get_capabilities()` returns mock capabilities (`receive=True`, `replay=True-as-source`, `timestamps=True`, others `False`).
- Hardware-free; optionally loads sanitized sample frames from `examples/fixtures/` for demos (never required by tests).

## 6. `DriverStatus` / `DriverState`

```python
class DriverState(Enum):
    DISCONNECTED = "disconnected"
    CONNECTED = "connected"
    LISTENING = "listening"
    ERROR = "error"

@dataclass(frozen=True)
class DriverStatus:
    state: DriverState
    adapter_name: str | None = None
    serial_number: str | None = None
    firmware: str | None = None
    bitrate: int | None = None
    channel: int | str | None = None
    last_error: CanAdapterError | None = None
    received_frame_count: int = 0
```

**Contract**: immutable snapshot; metadata fields are optional and extensible.

## 7. `DriverCapabilities`

```python
@dataclass(frozen=True)
class DriverCapabilities:
    receive: bool
    transmit: bool
    can_fd: bool
    hardware_filters: bool
    software_filters: bool
    replay: bool
    timestamps: bool

GS_USB_CAPABILITIES: DriverCapabilities   # named constant
MOCK_CAPABILITIES: DriverCapabilities      # named constant
```

## 8. `CaptureSession`

```python
@dataclass
class CaptureSession:
    session_id: str
    start_time: float
    driver: CanDriver
    config: CanUsbConfig
    active: bool = True
    end_time: float | None = None
    stats: dict | None = None

    def mark_end(self) -> None: ...   # sets end_time, active=False
```

**Contract**: minimal — no streaming, no stats computation, no export. Stable for future features to extend.

## 9. `FrameLogger` (interface) + implementations

```python
class FrameLogger(Protocol):
    def open(self) -> None: ...
    def write_frame(self, frame: CanFrame) -> None: ...
    def close(self) -> None: ...

class JsonlLogger:
    def __init__(self, path: str | Path) -> None: ...
    # implements FrameLogger

class AscLogger:
    def __init__(self, path: str | Path) -> None: ...
    # implements FrameLogger (minimal; documented limitations)
```

**Contract**:
- `JsonlLogger` writes one valid JSON object per frame (schema in research.md §10).
- `AscLogger` is a minimal safe implementation with documented foundation limitations.
- Logger failures raise `CanLoggingError`; `close` is safe after an error.
- Logging has **no** dependency on the driver layer and vice versa.

## 10. `ConnectionService` (thin)

```python
class ConnectionService:
    def __init__(self, driver: CanDriver, loggers: Sequence[FrameLogger] | None = None) -> None: ...
    def connect(self) -> None: ...
    def receive_once(self) -> CanFrame: ...   # receives one frame, forwards to loggers, returns it
    def get_status(self) -> DriverStatus: ...
    def disconnect(self) -> None: ...
```

**Contract**:
- Only `connect`, `receive_once`, `get_status`, `disconnect`. **No** `run`, `stream`, `loop`, or state machine.
- `receive_once` forwards the received frame to all injected loggers.
- `disconnect` is idempotent.
- No business logic, no workflow.

## 11. `CanUsbConfig`

```python
@dataclass(frozen=True)
class CanUsbConfig:
    interface: str = "gs_usb"
    channel: int | str = 0
    bitrate: int = 500000
    receive_timeout_seconds: float = 1.0
    log_directory: str | Path | None = None
    jsonl_enabled: bool = False
    asc_enabled: bool = False
```

## 12. Error contract

All public operations that can fail raise `CanAdapterError` or a subclass listed in §1. No public operation raises `python-can`/`libusb` exception types. Underlying causes are chained via `__cause__` for diagnostics.

## 13. Non-goals (contract-level)

The public API must **not** expose: transmit/send/write; CAN FD; ISO-TP; UDS; DBC; replay engine methods; live-streaming methods; any `python-can` type; any desktop-agent/backend/frontend integration point. These are absent from the contract by design.

## 14. Architecture constraints (contract-level)

- **No singletons, no global mutable state.** No public or internal symbol is a shared single instance; no module-level mutable state. All objects are caller-constructed instances.
- **Multi-instance drivers.** Multiple `CanDriver` instances (any mix of `GsUsbDriver`/`MockDriver`/future drivers) MUST be usable simultaneously in one process.
- **Driver independence.** One driver's operations MUST NOT affect another's; no shared lock, bus, or queue at the abstraction level.
- **One third-party seam.** `python-can` is imported only in `drivers/adapters/python_can_adapter.py`; `GsUsbDriver` talks only to `PythonCanAdapter`. Future adapters go under `drivers/adapters/`.