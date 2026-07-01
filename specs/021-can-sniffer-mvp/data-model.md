# Data Model: CAN Sniffer MVP (Feature 021)

**Branch**: `021-can-sniffer-mvp` | **Date**: 2026-06-30 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

**Purpose**: Define the entities Feature 021 introduces or expands, their fields, validation rules, relationships, and state transitions. Feature 021 is an isolated transport-level library capability; **none** of these entities are tenant-scoped business entities (multi-tenancy is introduced at future product integration). All changes are additive; reused Feature 020 entities are listed for completeness and are **not modified**.

---

## New / Expanded Entities

### CaptureSession (expanded — active runtime object)

The central abstraction and **single lifecycle owner**. An active runtime object (not merely a data model) that owns the capture loop, lifecycle, statistics, logger dispatch, cleanup, and cancellation.

**Module**: `prioracan/session.py`

**Construction** (preserves the Feature 020 signature — first four args positional, new args keyword-only):

```python
CaptureSession(
    session_id: str,
    start_time: float,            # nominal/declared start (Feature 020 compat)
    driver: CanDriver,
    config: CanUsbConfig,
    *,
    loggers: Sequence[FrameLogger] = (),
    stop_timeout_seconds: float = <default>,
)
```

**Public attributes** (Feature 020 compatibility — preserved):
- `session_id: str`
- `start_time: float` — nominal start time passed at construction (compat). The real capture start is recorded on `start()` and exposed via `CaptureStatistics.start_time`.
- `driver: CanDriver` — the driver abstraction reference.
- `config: CanUsbConfig`
- `active: bool = True` — Feature 020 "session not ended" flag. Set `False` by `mark_end()` and by terminal lifecycle transitions.
- `end_time: float | None = None` — set by `mark_end()` / on stop.
- `stats: dict | None = None` — preserved for backward compat; **not** the source of truth. The runtime uses `CaptureStatistics` internally. Remains `None` at construction (Feature 020 test).

**Public runtime API** (new — none named `stream`/`run`/`iter_frames`/`receive`):
- `start() -> None` — CREATED → STARTING → RUNNING; opens loggers, connects driver, runs the capture loop.
- `stop() -> CaptureStatistics` — requests stop; STOPPING → STOPPED; returns finalized statistics. Idempotent; safe before `start()` (returns zero statistics).
- `is_running -> bool` (property) — `True` only while state == RUNNING.
- `statistics -> CaptureStatistics | None` (property) — finalized statistics after a capture, else `None`.
- `__enter__` / `__exit__` — context-managed lifecycle; `__exit__` calls `stop()` and transitions to DISPOSED (automatic cleanup). There is **no public `dispose()`** method — DISPOSED is reached only via `__exit__`.
- `mark_end(end_time: float) -> None` — preserved Feature 020 method; sets `end_time`, `active=False`.

**Private runtime state** (internal, not in `__all__`):
- `_state: CaptureState` — current lifecycle state (CREATED initially).
- `_stop_event: threading.Event` — cancellation signal.
- `_capture_stats: CaptureStatistics | None` — accumulated statistics.
- frame counters (`_total`, `_rx`, `_tx`, `_dropped`), real start/end timestamps.

**Validation rules**:
- Constructor: `driver` must conform to `CanDriver` (via `assert_conforms` — no `transmit`/`send`/`write`); `config` is a `CanUsbConfig`; `stop_timeout_seconds >= 0`.
- State transitions enforced by inline checks in `CaptureSession` (see CaptureState, inlined in `session.py`). Invalid transitions raise the **existing** `CanAdapterError` (no new error subclass is added to the public taxonomy).
- `start()` on a non-CREATED state → `CanAdapterError`.
- Any operation on a DISPOSED session → `CanAdapterError` (or a `CanConnectionError` per the taxonomy).

**Relationships**: composes one `CanDriver`, zero or more `FrameLogger`s, one `CanUsbConfig`, and one `CaptureStatistics`. Sits directly above `CanDriver` (no intermediate orchestration layer). Does **not** import `python-can` or reference USB/libusb.

**Responsibility boundary (FR-015)**: receive frames, maintain lifecycle, update statistics, dispatch to loggers, perform cleanup. **Never**: replay, filtering, ISO-TP, UDS, DBC, protocol parsing, business logic, or product communication. Future features compose on top.

---

### CaptureState (new — lifecycle state machine)

The lifecycle state enum and the inline transition checks that govern it. **Inlined in `prioracan/session.py`** — there is no separate `lifecycle.py` module, no `InvalidCaptureTransitionError` subclass, and no public `dispose()` method. Invalid transitions raise the existing `CanAdapterError`.

**Module**: `prioracan/session.py` (inlined)

**States**:
- `CREATED` — constructed, not started; resources not acquired.
- `STARTING` — `start()` requested; driver connecting, loggers opening.
- `RUNNING` — capture loop active; frames received, dispatched, counted.
- `STOPPING` — stop requested or termination triggered; loop draining, resources releasing.
- `STOPPED` — cleanup complete; resources released; statistics finalized. Terminal for this instance (no restart).
- `DISPOSED` — fully released and unusable; any operation raises. Reached only via context-manager `__exit__`.

**Valid transitions** (exactly these, per spec FR-006):
- CREATED → STARTING
- STARTING → RUNNING
- STARTING → STOPPED (start failed; cleanup ran; failure surfaced as a domain error)
- RUNNING → STOPPING (stop requested, OR driver disconnect, OR logger failure, OR interrupt)
- STOPPING → STOPPED
- STOPPED → DISPOSED (via `__exit__`)
- CREATED → DISPOSED (disposed via `__exit__` without ever starting)

All other transitions are **invalid** → existing `CanAdapterError`.

**Transition enforcement**: inline guards inside `CaptureSession.start()`/`stop()`/`__exit__` (e.g. `start()` accepts only CREATED; `stop()` is idempotent and safe from CREATED/STOPPED). No standalone validator module or helper is exposed. Invalid transitions raise `CanAdapterError`.

**Lifecycle behaviors (FR-007)**:
- `stop()` before `start()` (from CREATED): safe no-op, zero statistics, no raise.
- Repeated `stop()` (from STOPPED): idempotent, no raise, no re-cleanup.
- Double `start()` (from STARTING/RUNNING/STOPPED): rejected → `CanAdapterError`. A `CaptureSession` is single-use; repeated captures create new instances.
- Automatic cleanup: on abandon/interrupt, `finally`/`__exit__` runs cleanup (driver disconnect, loggers closed) and transitions to DISPOSED.
- DISPOSED operations raise `CanAdapterError`.

---

### CaptureStatistics (new — bounded per-capture summary)

The summary record returned at capture end. Intentionally limited to per-capture counters (FR-012/FR-014). **Not** in `prioracan.__all__`; accessed via `session.statistics`.

**Module**: `prioracan/statistics.py`

**Fields** (exactly these — frozen dataclass):
- `start_time: float` — real capture start (recorded on `start()`).
- `end_time: float` — real capture end (recorded on stop).
- `duration: float` — `end_time - start_time`.
- `total_frames: int`
- `rx_frames: int` — frames with `direction == RX`.
- `tx_frames: int` — frames with `direction == TX` (passively observed; never sent by this feature).
- `dropped_frames: int` — best-effort; 0 where the underlying stack does not report drops (honest zero).
- `average_frame_rate: float` — `total_frames / duration` with a 0.0 fallback when `duration <= 0`.

**Validation / computation rules**:
- Immutable (frozen).
- `average_frame_rate` must never raise (safe division).
- No other public fields (guard-asserted). **Excluded**: bus utilization, arbitration histograms, bitrate estimation, protocol analysis, message-frequency analysis (future Bus Statistics feature).

**Relationships**: produced by `CaptureSession`; returned by `stop()` and `session.statistics`.

---

## Reused Feature 020 Entities (unchanged)

These are **not modified** by Feature 021; they are consumed as-is.

- **CanFrame** (`prioracan/frame.py`) — immutable validated Classic CAN receive frame. `CaptureSession` and loggers consume it. Core shape and validation unchanged. Direction RX enforced (TX only passively counted if observed from the stack).
- **CanDriver** (`prioracan/drivers/base.py`) — vendor-independent Protocol: `connect`, `disconnect`, `is_connected`, `receive(timeout_seconds)`, `iter_frames(stop_event)`, `get_status`, `get_capabilities`. No transmit. `CaptureSession` consumes frames via this abstraction (uses `iter_frames`).
- **GsUsbDriver** (`prioracan/drivers/gs_usb.py`) — concrete GS_USB driver. One **behavior refinement** (not a signature change): `iter_frames` swallows empty-bus `CanReceiveTimeout` and continues until stop/disconnect (R5). Capabilities unchanged.
- **MockDriver** (`prioracan/drivers/mock.py`) — deterministic hardware-free driver. Unchanged. `iter_frames` ends on exhaustion (finite stream) — correct for mock.
- **PythonCanAdapter** (`prioracan/drivers/adapters/python_can_adapter.py`) — the single `python-can` seam. Unchanged.
- **CanUsbConfig** (`prioracan/config.py`) — configuration. Unchanged; reused by `CaptureSession`.
- **DriverStatus / DriverState** (`prioracan/status.py`) — driver status model. Unchanged; surfaced by `CaptureSession` via `driver.get_status()`.
- **DriverCapabilities** (`prioracan/capabilities.py`) — capability model. Unchanged.
- **FrameLogger / JsonlLogger / AscLogger** (`prioracan/logging/`) — logger interface and implementations. Unchanged; `CaptureSession` dispatches via `write_frame`.
- **ConnectionService** (`prioracan/services/connection.py`) — thin receive-once helper. **Unchanged** (already satisfies the thin-wrapper requirement; its exact 4-method public set is locked by a Feature 020 test).
- **Domain Error Taxonomy** (`prioracan/errors.py`) — `CanAdapterError` and subclasses. **Unchanged** — Feature 021 adds **no** new error subclass. Invalid `CaptureSession` lifecycle transitions raise the existing `CanAdapterError`. All capture failures map onto this taxonomy; no raw `python-can`/libusb exceptions leak.

---

## State Transition Diagram (CaptureSession)

```text
                 start()
        CREATED ─────────► STARTING
          │                   │
          │                   │ start() succeeded
          │                   ▼
          │                 RUNNING
          │                   │
          │                   │ stop() / disconnect / logger failure / interrupt
          │                   ▼
          │                 STOPPING
          │                   │
          │                   │ cleanup complete
          │                   ▼
          │                 STOPPED
          │                   │
          │                   │ __exit__  (no public dispose())
          │                   ▼
          └──────────────► DISPOSED

        STARTING ─► STOPPED   (start() failed → cleanup → domain error)
        CREATED  ─► DISPOSED  (__exit__ without starting)

        Invalid (rejected with the existing CanAdapterError):
          RUNNING → STARTING, STOPPED → STARTING, DISPOSED → *,
          STARTING → STARTING, and all transitions not listed above.
```

---

## Entity Relationship Summary

```text
CanUsbConfig ──used by──► CaptureSession ──composes──► CanDriver (abstraction)
                               │                          ▲
                               │                          │ implements
                               │                     ┌────┴─────┐
                               │                GsUsbDriver   MockDriver
                               │                     │
                               │                PythonCanAdapter ──► python-can (only seam)
                               │
                               ├──composes──► FrameLogger* (JSONL / ASC)
                               │                  │
                               │                  └──depends on──► CanFrame
                               │
                               └──produces──► CaptureStatistics (returned via stop()/statistics)

CaptureState (inlined in session.py) ──governs──► CaptureSession lifecycle
CanAdapterError (existing, unchanged) ──raised on──► invalid transitions
```

---

## Multi-Tenancy Note

None of the entities above are tenant-scoped. `CaptureSession`, `CaptureStatistics`, `CaptureState`, `CanFrame`, and the driver/loggers are transport-level foundation constructs. Organization/tenant scoping is introduced at future product integration (Feature 029, provisional) when captures become business data, at which point the PRD/SAD will be updated first per the constitution.

---

## Validation Rules Summary

| Entity | Key validations |
|--------|-----------------|
| CaptureSession | constructor signature/defaults preserved (Feature 020 test); `driver` conforms to `CanDriver` (no transmit/send/write); `stop_timeout_seconds >= 0`; no methods named stream/run/iter_frames/receive; no public `dispose()`; state transitions enforced |
| CaptureState | exactly six states; only the listed transitions valid; invalid → existing `CanAdapterError`; inlined in `session.py` (no `lifecycle.py`) |
| CaptureStatistics | frozen; exactly eight fields; safe average-rate division; honest-zero drops; no bus-statistics fields |
| CaptureSession lifecycle | stop-before-start safe no-op; repeated stop idempotent; double start rejected; DISPOSED operations raise; cleanup always runs; DISPOSED reached via `__exit__` |