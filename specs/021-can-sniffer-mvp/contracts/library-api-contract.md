# Library API Contract: CAN Sniffer MVP (Feature 021)

**Branch**: `021-can-sniffer-mvp` | **Date**: 2026-06-30 | **Spec**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md)

**Purpose**: Define the public Python API surface Feature 021 adds to the `prioracan` library, and confirm what is **unchanged** from Feature 020. This is a library (not a web service), so the contract is the importable Python API and the observable behavior of its objects. All changes are additive; the top-level export surface (`prioracan.__all__`) is **unchanged**.

---

## 1. Top-level public exports (UNCHANGED)

`prioracan.__all__` remains exactly the 21 Feature 020 names (locked by `test_public_api.py`):

```text
CanFrame, CanUsbConfig, DriverStatus, DriverState, DriverCapabilities,
CaptureSession, CanDriver, GsUsbDriver, MockDriver,
FrameLogger, JsonlLogger, AscLogger, ConnectionService,
CanAdapterError, CanDriverNotFoundError, CanDeviceNotFoundError,
CanConfigurationError, CanConnectionError, CanReceiveTimeout, CanLoggingError
```

**Feature 021 does not add to or remove from this list.** `CaptureStatistics` and `CaptureState` are **not** top-level exports; they are accessed via `session.statistics` and (for advanced use) via their modules `prioracan.statistics` / `prioracan.session` (`CaptureState` is inlined in `session.py`). Documentation imports only `__all__` names from `prioracan` (enforced by the docs-smoke test).

---

## 2. New / expanded public API: `CaptureSession` runtime

`CaptureSession` is imported from `prioracan` (already in `__all__`). Feature 021 expands it from a minimal data model into the active runtime object and single lifecycle owner.

### 2.1 Construction

```python
from prioracan import CaptureSession, CanUsbConfig, MockDriver, JsonlLogger

session = CaptureSession(
    session_id: str,
    start_time: float,            # nominal start (Feature 020 compat)
    driver: CanDriver,
    config: CanUsbConfig,
    *,
    loggers: Sequence[FrameLogger] = (),          # NEW (default empty → optional logging)
    stop_timeout_seconds: float = <default>,      # NEW (bounded stop)
)
```

**Backward compatibility**: `CaptureSession(session_id, start_time, driver, config)` (the Feature 020 positional form) remains valid and produces the same default attribute values (`active=True`, `end_time=None`, `stats=None`, `.driver`, `.config`).

**Validation**:
- `driver` must conform to `CanDriver` (no `transmit`/`send`/`write` attribute — checked via `assert_conforms`).
- `stop_timeout_seconds` must be `>= 0`; otherwise `CanConfigurationError`.
- `loggers` is a sequence of `FrameLogger`; empty is allowed (logging optional).

### 2.2 Public attributes (preserved from Feature 020)

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| `session_id` | `str` | — | |
| `start_time` | `float` | — | nominal start (compat); real start in `CaptureStatistics` |
| `driver` | `CanDriver` | — | |
| `config` | `CanUsbConfig` | — | |
| `active` | `bool` | `True` | Feature 020 "not ended" flag; set `False` by `mark_end`/terminal transitions |
| `end_time` | `float \| None` | `None` | |
| `stats` | `dict \| None` | `None` | preserved for compat; not the source of truth |

### 2.3 Runtime API (new)

| Member | Signature | Behavior |
|--------|-----------|----------|
| `start()` | `-> None` | CREATED → STARTING → RUNNING. Opens loggers, connects driver, runs the capture loop. Raises `CanDeviceNotFoundError`/`CanPermissionError`/`CanConfigurationError`/`CanConnectionError`/`CanLoggingError` on start failures (STARTING → STOPPED with cleanup). Raises `CanAdapterError` if not CREATED. |
| `stop()` | `-> CaptureStatistics` | Requests stop; RUNNING → STOPPING → STOPPED; returns finalized `CaptureStatistics`. **Idempotent**: from STOPPED returns the existing statistics; from CREATED returns zero statistics without raising. Bounded: completes within `stop_timeout_seconds`. |
| `is_running` | `-> bool` (property) | `True` only while state == RUNNING. |
| `statistics` | `-> CaptureStatistics \| None` (property) | Finalized statistics after a capture; `None` before a capture has run. |
| `__enter__` | `-> CaptureSession` | Enters context; does **not** auto-start (caller calls `start()`), or auto-starts per the documented usage (see quickstart). |
| `__exit__` | `-> None` | Calls `stop()` and transitions STOPPED → DISPOSED (automatic cleanup); never raises raw low-level exceptions. This is the **only** path to DISPOSED — there is no public `dispose()` method. |
| `mark_end(end_time)` | `-> None` | Preserved Feature 020 method; sets `end_time`, `active=False`. |

**Forbidden method names** (lexical/contract guard): `stream`, `run`, `iter_frames`, `receive`, `transmit`, `send`, `write`. None of the runtime API uses these names.

### 2.4 Context-managed lifecycle

```python
with CaptureSession("s1", time.monotonic(), driver, config, loggers=[logger]) as session:
    session.start()
    # ... capture runs ...
    # stop() is called automatically on __exit__
stats = session.statistics
```

Alternatively, explicit:

```python
session = CaptureSession("s1", time.monotonic(), driver, config, loggers=[logger])
session.start()
# ... later ...
stats = session.stop()
```

### 2.5 Lifecycle states (observable)

State is exposed internally via `CaptureState` (CREATED/STARTING/RUNNING/STOPPING/STOPPED/DISPOSED), inlined in `session.py`. The minimal observable surface for consumers is `is_running` (bool) and `statistics` (CaptureStatistics | None). Full state is available via `prioracan.session.CaptureState` if needed (internal).

---

## 3. New return type: `CaptureStatistics`

Returned by `CaptureSession.stop()` and `.statistics`. **Not** in `prioracan.__all__`; accessible as `prioracan.statistics.CaptureStatistics`.

```python
@dataclass(frozen=True)
class CaptureStatistics:
    start_time: float
    end_time: float
    duration: float
    total_frames: int
    rx_frames: int
    tx_frames: int
    dropped_frames: int
    average_frame_rate: float
```

**Field contract** (exactly these — guard-asserted):
- `duration == end_time - start_time`
- `average_frame_rate == total_frames / duration` when `duration > 0`, else `0.0` (never raises)
- `dropped_frames` is best-effort; `0` where the underlying stack does not report drops
- `rx_frames + tx_frames <= total_frames` (remote/error frames counted in `total_frames`; RX/TX split applies to directional frames)
- **Excluded fields**: bus utilization, arbitration histograms, bitrate estimation, protocol analysis, message-frequency analysis (future Bus Statistics feature)

---

## 4. New internal type: `CaptureState`

Inlined in `prioracan.session` (internal, not in `__all__`). There is **no** separate `lifecycle.py` module and **no** new error subclass.

```python
class CaptureState(Enum):
    CREATED, STARTING, RUNNING, STOPPING, STOPPED, DISPOSED
```

Invalid lifecycle transitions raise the **existing** `CanAdapterError` (the public error taxonomy in `prioracan.errors` is unchanged — no new subclass is added). `DISPOSED` is reached only via context-manager `__exit__`; there is no public `dispose()` method.

---

## 5. Unchanged Feature 020 API (reaffirmed)

These contracts are **not modified** by Feature 021 (regression-locked):

- **CanFrame** — immutable, validating, RX-only Classic CAN frame. Unchanged.
- **CanDriver** (Protocol) — `connect`, `disconnect`, `is_connected`, `receive(timeout_seconds)`, `iter_frames(stop_event)`, `get_status`, `get_capabilities`. No transmit. Unchanged.
- **GsUsbDriver** — public surface unchanged. One behavior refinement: `iter_frames` now continues across empty-bus `CanReceiveTimeout` until stop/disconnect (signature unchanged; observable only in that a quiet bus no longer ends the iterator).
- **MockDriver** — unchanged.
- **CanUsbConfig** — unchanged.
- **DriverStatus / DriverState / DriverCapabilities** — unchanged.
- **FrameLogger / JsonlLogger / AscLogger** — interface and implementations unchanged.
- **ConnectionService** — public method set exactly `connect`/`receive_once`/`get_status`/`disconnect`. Unchanged.
- **Domain errors** — unchanged (no new subclass added; invalid `CaptureSession` transitions raise the existing `CanAdapterError`).

---

## 6. Error surfacing contract

All capture-path failures surface as named `CanAdapterError` subclasses — never as raw `python-can`, `libusb`, or `USB` exceptions:

| Condition | Error |
|-----------|-------|
| `start()` on a non-CREATED session | `CanAdapterError` |
| Operation on a DISPOSED session | `CanAdapterError` |
| Driver missing / not found | `CanDriverNotFoundError` |
| Device not found | `CanDeviceNotFoundError` |
| Permission denied | `CanPermissionError` |
| Bad configuration | `CanConfigurationError` |
| Connection lost / used while disconnected | `CanConnectionError` |
| No frame within receive timeout (internal; not surfaced as a capture failure) | `CanReceiveTimeout` (handled inside the loop) |
| Logger open/write/close failure | `CanLoggingError` (triggers the logger-failure policy) |

**Logger-failure policy (FR-011)** — single, defined: on any `CanLoggingError` during a capture, `CaptureSession` (1) transitions to STOPPING → STOPPED, (2) raises `CanLoggingError`, (3) flushes and closes the remaining (non-failed) loggers, (4) disconnects the driver, (5) returns/finalizes partial `CaptureStatistics` (counts up to the failing frame). Already-written records are not corrupted.

---

## 7. Architecture contract (enforced)

- `CaptureSession` depends only on `CanDriver`, `CanFrame`, `CanUsbConfig`, the `FrameLogger` interface, and its own `CaptureStatistics`/`CaptureState`. It does **not** import `python-can` or reference USB/libusb.
- `python-can` is imported in exactly one module: `prioracan/drivers/adapters/python_can_adapter.py` (locked by `test_static_guards.py`).
- Loggers depend only on `CanFrame`.
- No layer bypasses the `CanDriver` abstraction.
- No circular dependencies.
- No singletons / no global mutable state; multiple `CaptureSession` instances coexist independently.
- Receive-only: no `transmit`/`send`/`write` method on any public surface.
- Lexical: no bare `stream`/`isotp`/`uds`/`dbc` tokens in `src/prioracan/**/*.py`.

---

## 8. Minimal usage contract (mock, no hardware)

```python
from prioracan import CaptureSession, CanUsbConfig, MockDriver, JsonlLogger
from prioracan.frame import CanFrame, Direction
import time

frames = [CanFrame(0.0, 0, Direction.RX, 0x100, False, False, False, 1, b"\x11")]
driver = MockDriver(frames)
config = CanUsbConfig()
logger = JsonlLogger("capture.jsonl")

session = CaptureSession("s1", time.monotonic(), driver, config, loggers=[logger])
session.start()
stats = session.stop()
assert stats.total_frames == 1
assert stats.rx_frames == 1
```

This is the contract a downstream module or future feature relies on. Future features (replay, filters, ISO-TP, UDS, DBC, product integration) consume frames produced by `CaptureSession` — they do **not** extend `CaptureSession`'s responsibilities (FR-015).