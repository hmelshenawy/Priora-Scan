# Implementation Plan: CAN Sniffer MVP

**Branch**: `021-can-sniffer-mvp` | **Date**: 2026-06-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/021-can-sniffer-mvp/spec.md`

**Note**: This plan covers architecture and execution strategy only. No production code is written in this phase. The specification is the single source of truth and is not modified by this plan.

## Summary

Expand the Feature 020 `prioracan` foundation into a functional, receive-only CAN sniffer by turning the existing lightweight `CaptureSession` model into the **single active runtime object and lifecycle owner**. `CaptureSession` owns the capture loop, lifecycle state, statistics, logger dispatch, cleanup, and cancellation, consuming frames from the existing `CanDriver` abstraction (which already exposes both a bounded `receive()` and a stoppable `iter_frames()`) **without assuming how a driver produces frames**. A new bounded `CaptureStatistics` return type (in a small `statistics.py`) carries per-capture counters (start/end/duration/total/RX/TX/dropped/average rate); it is returned via `session.statistics` and is intentionally **not** added to `prioracan.__all__` (preserving Feature 020's locked public export surface and the "CaptureSession is the only public lifecycle abstraction" rule). The lifecycle state machine (`CaptureState`) and transition checks are **inlined in `session.py`** — no separate validator module, no new error subclass, no public `dispose()` (DISPOSED is reached via context-manager `__exit__`); invalid transitions raise the existing `CanAdapterError`. `ConnectionService` is preserved unchanged. The capture lifecycle is an explicit state machine `CREATED → STARTING → RUNNING → STOPPING → STOPPED → DISPOSED` with deterministic, bounded cancellation and a single defined logger-failure policy. No transmit, CAN FD, ISO-TP, UDS, DBC, replay, filtering, bus statistics, or desktop-agent/backend/frontend integration; all changes are additive and every Feature 020 test continues to pass unmodified. The phase order proves the real capture pipeline (`driver → CaptureSession → logger → saved output`) as early as Phase 3.

## Technical Context

**Language/Version**: Python 3.11+ (inherited from Feature 020; `pyproject.toml` already pins this). No version change.

**Primary Dependencies**: `python-can` (unchanged — still imported **only** inside `drivers/adapters/python_can_adapter.py`). `pytest` + `pytest-cov` (dev/test only, inherited). No new runtime dependencies.

**Storage**: N/A as a database. Optional file-based capture logging via the existing `JsonlLogger` / `AscLogger`. No new persistence.

**Testing**: `pytest`, fully hardware-independent (inherited). `GsUsbDriver` tested via the python-can `"virtual"` bus. New tests use the deterministic `MockDriver`. No real-hardware tests in CI.

**Target Platform**: Cross-platform Python (Windows, Linux, macOS) — unchanged.

**Project Type**: Library (`prioracan`), `src/` layout — unchanged. Feature 021 adds/expands modules inside the existing package; it does not create a new package.

**Performance Goals**: The capture loop must not be a bottleneck under realistic Classic CAN load. Soft target: the mock/virtual-bus capture path sustains ≥ 8 000 frames/s with no loss attributed to `CaptureSession`. Validated via mock/virtual-bus throughput tests, not real hardware.

**Constraints**: Receive-only (no transmit; RX direction enforced by `CanFrame`, TX passively counted only if observed). Classic CAN only. Immutable frames. Hardware-independent CI. Additive only — zero modifications outside `can_usb_adapter/` and `specs/021-can-sniffer-mvp/`. Every Feature 020 test passes unmodified. `prioracan.__all__` unchanged (exactly the 21 Feature 020 names). No singletons / no global mutable state (Feature 020 architecture constraints retained). Every file < 300 lines; every function < 30 lines (Constitution Principle V). **Static-guard lexical constraint**: the existing `test_no_out_of_scope_protocol_identifiers` guard forbids the bare token `stream` (and `isotp`/`uds`/`dbc`) in any `src/prioracan/**/*.py` file, including comments. New code and comments must use "streaming" (which tokenizes as `streaming`, not `stream`), "capture loop", or "frame flow" — never the bare word "stream". `test_no_transmit_style_public_methods` forbids any `FunctionDef` named `transmit`/`send`/`write`/`send_periodic` in `src/prioracan` — `CaptureSession` must not define a method named `write` (it dispatches to `logger.write_frame`). `test_no_module_level_mutable_globals` forbids module-level `[]`/`{}`/`set()` literals in `src/prioracan` — use tuples or class-scoped state.

**Scale/Scope**: One expanded module (`session.py`) and one small new module (`statistics.py`); ~6 new test files. Public surface growth is zero at the top level (`__all__` unchanged); growth is internal plus the `CaptureSession` runtime API.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

This feature is an **isolated engineering capability library**, not a product feature — identical in nature to Feature 020. It introduces no product entity, no HTTP/API endpoint, no tenant-scoped data, no UI, and no business rule. Product integration is explicitly deferred to a future feature that will require PRD/SAD updates first.

- [x] **Does not contradict `docs/PRD.md`, `docs/SAD.md`, `docs/FRONTEND_ARCHITECTURE.md`** — sits outside the documented product roadmap (spec Assumptions). Adds no product behavior and changes no product contract. Consistent with Principle VIII (Scan Source Agnostic) and Principle XIII (Progressive Hardware Integration) as pre-product raw-CAN foundation work. No contradiction.
- [x] **Multi-tenant boundaries defined for all new entities** — N/A. `CaptureSession` (expanded), `CaptureStatistics`, and `CaptureState` are transport-level foundation constructs, not tenant-scoped business entities. Tenant scoping is introduced at product integration (future feature). Documented in data-model.md.
- [x] **API contracts specified before backend implementation** — N/A for HTTP/backend (none). The library's **public Python API** contract is specified in `contracts/library-api-contract.md` before any code. Satisfies the contracts-first intent.
- [x] **AI features include explainability and human-confirmation** — N/A. No AI.
- [x] **No PrioraFlow dependency for core workflows** — PASS. No PrioraFlow dependency and no dependency on any PrioraScan product module.
- [x] **Error handling and audit logging included in the design** — Error handling: PASS — reuses the Feature 020 domain error taxonomy; the logger-failure policy and lifecycle error paths are specified (FR-011, FR-006/FR-007). Audit logging: N/A as business audit; CAN frame logging is an engineering capture log, not a business audit log. Business audit at product integration.

**Additional principle alignment**:
- Principle II (Design Before Implementation): this plan **is** the design; no code before plan + tasks approval.
- Principle III (Layered Architecture): the layering is `CaptureSession → CanDriver → drivers → PythonCanAdapter → python-can`; `CaptureSession` calls only the `CanDriver` abstraction; loggers depend only on `CanFrame`; no bypass.
- Principle IV (Modular Development): one isolated module track; `CaptureSession` is the only public lifecycle abstraction; helpers (if any) are internal.
- Principle V (Code Quality): < 300 lines/file, < 30 lines/function, explicit error paths, no dead code, no hardcoded config, no module-level mutable globals — enforced as phase acceptance criteria and by the inherited static guards.
- Principle XIV (Git & Change Safety): work on branch `021-can-sniffer-mvp`; no change to any existing public contract (`__all__`, `CanFrame`, `CanDriver`, `ConnectionService` method set, `CaptureSession` constructor/`mark_end`); changes are additive.
- Principle XV (Simplicity Over Complexity): the sniffer does one thing — receive and record raw CAN frames — and defers everything else. `CaptureSession`'s responsibility set is frozen (FR-015). The lifecycle machinery is the minimum needed to satisfy the spec (inlined state + transition checks; no validator module, no new error class, no `dispose()`).
- Domain-Driven Implementation: traceable to the Feature 021 specification (itself traced to the Feature 020 foundation); no invented entities, APIs, roles, or business rules.

**Re-check after Phase 1 design**: confirmed — the data model and contracts introduce no product entity, no tenant boundary, and no change to existing public contracts. `prioracan.__all__` is unchanged. No new error subclass is added to the public taxonomy. All gates remain satisfied. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/021-can-sniffer-mvp/
├── spec.md                 # Approved specification (/speckit-specify, revised)
├── plan.md                 # This file (/speckit-plan)
├── research.md             # Phase 0 output (/speckit-plan)
├── data-model.md           # Phase 1 output (/speckit-plan)
├── quickstart.md           # Phase 1 output (/speckit-plan)
├── contracts/
│   └── library-api-contract.md   # Phase 1 output (/speckit-plan)
├── checklists/
│   └── requirements.md     # Spec quality checklist (/speckit-specify)
└── tasks.md                # Phase 2 output (/speckit-tasks - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
can_usb_adapter/                       # existing isolated library (Feature 020) — extended additively
├── pyproject.toml                     # unchanged (no new deps, no version bump required)
├── README.md                          # extended: CAN Sniffer section (Phase 7)
├── src/
│   └── prioracan/
│       ├── __init__.py                # UNCHANGED — __all__ stays exactly the 21 Feature 020 names
│       ├── config.py                  # unchanged (CanUsbConfig) — reused
│       ├── frame.py                   # unchanged (CanFrame) — reused
│       ├── errors.py                  # unchanged (domain taxonomy) — reused; no new error class added
│       ├── status.py                  # unchanged (DriverStatus/DriverState) — reused
│       ├── capabilities.py            # unchanged (DriverCapabilities) — reused
│       ├── session.py                 # EXPANDED: CaptureSession active runtime + inlined CaptureState enum + inlined transition checks + context-manager; no separate lifecycle module, no dispose(), no new error class
│       ├── statistics.py              # NEW (small): CaptureStatistics frozen dataclass + safe rate computation
│       ├── drivers/                   # unchanged except one bounded behavior refinement (see below)
│       │   ├── __init__.py            # unchanged
│       │   ├── base.py                # unchanged (CanDriver Protocol) — reused
│       │   ├── gs_usb.py              # REFINED: iter_frames swallows CanReceiveTimeout (empty bus) and continues until stop/disconnect (signature unchanged; behavior made uniform with MockDriver)
│       │   ├── mock.py                # unchanged (MockDriver) — reused
│       │   └── adapters/
│       │       └── python_can_adapter.py  # unchanged (single python-can seam) — reused
│       ├── logging/                   # unchanged (FrameLogger / JsonlLogger / AscLogger) — reused
│       └── services/
│           └── connection.py          # UNCHANGED — ConnectionService preserved (already thin; exact 4-method set locked by test)
├── examples/
│   ├── capture_mock.py                # NEW: mock capture example (Phase 6)
│   ├── capture_gs_usb.py              # NEW: GS_USB capture example (Phase 6)
│   ├── README.md                      # extended (Phase 7)
│   └── fixtures/                      # optional sanitized sample (demo only, unchanged)
└── tests/
    ├── conftest.py                    # extended: capture session fixtures (deterministic frames reused)
    ├── fixtures/frames.py             # unchanged (deterministic frames) — reused
    ├── test_session.py                # UNCHANGED (Feature 020 regression)
    ├── test_capture_session_runtime.py # NEW: constructor compat, mark_end, CaptureState transitions, start/stop/is_running/context-manager, stop-before-start, repeated stop, double-start, disposed-raises (Phase 1)
    ├── test_capture_loop.py           # NEW: mock capture, stop, timeout, cleanup, bounded cancellation while blocked (Phase 2)
    ├── test_capture_logging.py        # NEW: JSONL/ASC dispatch, multi-logger, no-logger (Phase 3)
    ├── test_logger_failure_policy.py  # NEW: failing-logger policy + partial statistics (Phase 3)
    ├── test_capture_statistics.py     # NEW: counters, timing, rate, empty capture, repeated sessions, no-extra-fields (Phase 4)
    ├── test_capture_gs_usb.py         # NEW: virtual-bus capture, bounded shutdown, disconnect (Phase 5)
    ├── test_capture_examples.py       # NEW: example runnable + docs smoke (Phase 6/8)
    └── (all Feature 020 test files unchanged and re-run as regression)
```

**Structure Decision**: No new package; Feature 021 extends the existing `prioracan` package additively. `session.py` is restructured from a minimal slotted dataclass into the active runtime class (preserving the tested public constructor signature `(session_id, start_time, driver, config, *, ...)`, the public attributes `session_id/start_time/driver/config/active/end_time/stats`, and `mark_end()`; `slots=True` is dropped to accommodate private runtime state — an internal change invisible to Feature 020 tests). To stay lean, the `CaptureState` enum and lifecycle transition checks are **inlined in `session.py`** (no separate `lifecycle.py` validator module), invalid transitions raise the **existing** `CanAdapterError` (no new error subclass), and there is **no public `dispose()`** method — DISPOSED is reached via context-manager `__exit__`. One small new module `statistics.py` holds `CaptureStatistics` (a distinct data record, keeping `session.py` under the 300-line limit). `CaptureStatistics` and `CaptureState` are deliberately **not** re-exported from `prioracan.__all__` (locked by `test_public_api.py`); they are accessed via `session.statistics` and are internal types, consistent with "CaptureSession is the only public lifecycle abstraction." `ConnectionService` and `__init__.py` are untouched. The single behavioral refinement to `gs_usb.py` is signature-preserving and covered in research.md. No file outside `can_usb_adapter/` and `specs/021-can-sniffer-mvp/` is created or modified.

## Complexity Tracking

No Constitution Check violations require justification. Two design choices worth recording (neither is a violation):

| Choice | Why Needed | Simpler Alternative Rejected Because |
|--------|------------|-------------------------------------|
| Drop `slots=True` on `CaptureSession` | The active runtime needs private mutable state (`_stop_event`, `_state`, `_capture_stats`, counters) not expressible cleanly as public dataclass fields; slotted dataclasses forbid free instance attributes. | Keeping `slots=True` with `field(init=False)` private fields is awkward (leading-underscore dataclass fields pollute `repr` and require `default=None` then re-init). Dropping slots is an internal change invisible to all Feature 020 tests (`test_session.py` checks attributes, not `__slots__`). |
| Refine `GsUsbDriver.iter_frames` to swallow `CanReceiveTimeout` (empty bus) and continue | A sniffer must keep listening across empty-bus timeouts until `stop`/disconnect; the current behavior propagates `CanReceiveTimeout`, which would end a live capture on the first quiet bus interval. `MockDriver.iter_frames` already swallows it (returns on exhaustion). | Having `CaptureSession` call `receive()` directly and catch `CanReceiveTimeout` itself cannot distinguish mock stream exhaustion (should end capture) from GS_USB empty bus (should continue) without driver-type knowledge — violating FR-009a. Letting each driver's `iter_frames` encode its own end/continue semantics is the implementation-independent solution. Signature unchanged; the one existing `iter_frames` test (`test_iter_frames_stops_on_stop_event`) sends a frame then stops and remains green. |

## Architecture Constraints

These are non-negotiable, enforced as acceptance criteria and by the inherited Feature 020 static guards plus new guards:

- **Single lifecycle owner.** `CaptureSession` is the only component that owns the capture loop and lifecycle. No separate orchestration component. `ConnectionService` does not own streaming (unchanged).
- **Layering.** `CaptureSession → CanDriver → GsUsbDriver / MockDriver → PythonCanAdapter → python-can → USB → CAN hardware`. `CaptureSession` depends only on `CanDriver` (and `CanFrame`, `CanUsbConfig`, the `FrameLogger` interface, and its own `CaptureStatistics`/`CaptureState`). It never imports `python-can` or references USB/libusb objects.
- **One third-party seam.** `python-can` is imported in exactly one module — `drivers/adapters/python_can_adapter.py` (unchanged). Enforced by `test_python_can_import_only_at_adapter_seam`.
- **Implementation-independent driver consumption (FR-009a).** `CaptureSession` consumes frames via the `CanDriver` abstraction (using `iter_frames(stop_event)` or, equivalently, a bounded `receive()` loop — decision in research.md) without assuming how a driver produces them. The abstraction already supports both; future drivers need not change `CaptureSession`.
- **Receive-only.** No transmit/send/write method on any public surface. `CaptureSession` dispatches to loggers via `logger.write_frame`; it does not define a `write` method. Enforced by `test_no_transmit_style_public_methods` and `assert_conforms`.
- **Lexical guard.** No bare token `stream` / `isotp` / `uds` / `dbc` in `src/prioracan/**/*.py` (including comments). Enforced by `test_no_out_of_scope_protocol_identifiers`.
- **No singletons / no global mutable state.** All state is instance-scoped inside `CaptureSession`. No module-level `[]`/`{}`/`set()`. Enforced by `test_no_module_level_mutable_globals`. Multiple `CaptureSession` instances on different drivers coexist independently.
- **Backward compatibility.** `prioracan.__all__` unchanged (21 names). `ConnectionService` public method set unchanged (exactly `connect`/`receive_once`/`get_status`/`disconnect`). `CaptureSession` constructor signature `(session_id, start_time, driver, config)` and `mark_end()` preserved. `CanFrame`/`CanDriver`/`DriverStatus`/`DriverCapabilities`/`CanUsbConfig`/loggers unchanged. No new error subclass added to the public taxonomy. All Feature 020 tests pass unmodified.
- **Frozen responsibility.** `CaptureSession` does only: receive frames, maintain lifecycle, update statistics, dispatch to loggers, cleanup. No replay/filtering/ISO-TP/UDS/DBC/protocol-parsing/business-logic/product-comms. Future features compose on top, consuming frames from `CaptureSession`.
- **Minimum machinery.** The lifecycle is the smallest implementation that satisfies the spec: `CaptureState` enum + inlined transition checks in `session.py`; context-manager `__enter__`/`__exit__` for automatic cleanup (DISPOSED reached on `__exit__`); no public `dispose()`; no separate validator module; invalid transitions raise the existing `CanAdapterError`.

## Implementation Phases

Phases are ordered by dependency. Each phase is independently testable before the next begins. Every phase lists **Dependencies**, **Deliverables**, **Technical risks**, **Validation**, **Testing**, and **Acceptance criteria**. No phase introduces transmit, CAN FD, ISO-TP, UDS, DBC, replay, filtering, bus statistics, or any product integration. Each phase ends with a green test gate and an incremental commit. The order proves the real capture pipeline (`driver → CaptureSession → logger → saved output`) by end of Phase 3.

### Phase 1 — Lifecycle Foundation

**Dependencies**: None (builds on the existing Feature 020 codebase).

**Deliverables**: `session.py` restructured into the active runtime `CaptureSession` preserving the tested constructor and `mark_end()`, with the `CaptureState` enum (`CREATED`, `STARTING`, `RUNNING`, `STOPPING`, `STOPPED`, `DISPOSED`) **inlined** in the same module. Add keyword-only `loggers: Sequence[FrameLogger] = ()` and `stop_timeout_seconds: float` (default from `CanUsbConfig.receive_timeout_seconds` or a small constant). Add a private `_state: CaptureState = CREATED`, `start()`, `stop()`, `is_running` (property), `statistics` (property, returns `None` until a capture has run — `CaptureStatistics` is implemented in Phase 4; here it returns `None`), and `__enter__`/`__exit__` (context-manager lifecycle → `stop()` on exit, then DISPOSED). Transition checks are inline guards in `start()`/`stop()` (e.g. `start()` rejects any state other than CREATED; `stop()` is idempotent and safe from CREATED); invalid transitions raise the existing `CanAdapterError`. No capture loop yet — `start()` may transition CREATED→STARTING→RUNNING but the loop body is a stub that returns immediately to STOPPED in this phase (wired in Phase 2). No `lifecycle.py` module, no `InvalidCaptureTransitionError`, no public `dispose()`.

**Technical risks**: Breaking `test_session.py` (constructor, `mark_end`, no-streaming-methods). Mitigation: preserve `(session_id, start_time, driver, config)` positional signature; keep `active=True`/`end_time=None`/`stats=None` defaults; do not name any method `stream`/`run`/`iter_frames`/`receive`. Breaking `test_public_api.py` by accidentally adding to `__all__`. Mitigation: do not touch `__init__.py`. `slots=True` removal. Mitigation: verified against `test_session.py` (attributes, not slots).

**Validation**: `CaptureSession("s1", 1.0, driver, config)` still constructs with `active is True`, `end_time is None`, `stats is None`, `.driver`/`.config` correct; `mark_end(2.0)` still sets `end_time=2.0`/`active=False`. `start()` moves CREATED→STARTING→RUNNING (stubbed to STOPPED); `stop()` from CREATED is a safe no-op returning zero statistics; repeated `stop()` is idempotent; `start()` on a non-CREATED state raises `CanAdapterError`; operations after `__exit__` (DISPOSED) raise `CanAdapterError`. `prioracan.__all__` is unchanged.

**Testing**: `test_capture_session_runtime.py` — constructor backward compat, `mark_end`, `CaptureState` transitions (valid and invalid), `is_running`, context-manager `__enter__`/`__exit__` + DISPOSED-raises, `start`/`stop` with a stub loop, stop-before-start, repeated stop, double-start. `test_session.py` (Feature 020) re-run unmodified and green.

**Acceptance criteria**:
1. `CaptureState` defines exactly the six states in `session.py`; inline transition guards accept exactly the FR-006 transitions and reject all others with `CanAdapterError`.
2. `CaptureSession` preserves the Feature 020 constructor signature, public attributes, and `mark_end()`; `test_session.py` passes unmodified.
3. `CaptureSession` exposes `start()`, `stop()`, `is_running`, `statistics`, `__enter__`, `__exit__` — and none named `stream`/`run`/`iter_frames`/`receive`. No public `dispose()`.
4. `stop()` before `start()` is a safe no-op; repeated `stop()` is idempotent; double `start()` raises; DISPOSED operations raise.
5. `prioracan.__all__` is unchanged; `ConnectionService` is untouched; no new error subclass is added.
6. No `lifecycle.py` module is created; all tests green; every new file < 300 lines; every function < 30 lines; no module-level mutable globals; no bare `stream` token in `src/prioracan`.

### Phase 2 — Capture Loop & Cancellation

**Dependencies**: Phase 1.

**Deliverables**: The capture loop inside `CaptureSession` (a private method, e.g. `_capture()`) that consumes frames from the driver via the `CanDriver` abstraction using a `threading.Event` stop signal, dispatches each frame to a private `_dispatch(frame)` step that is a **no-op stub** in this phase (logging wired in Phase 3), increments a minimal local `_total` counter (full statistics wired in Phase 4), and transitions RUNNING→STOPPING→STOPPED on stop / driver disconnect / error. `start()` launches the loop (synchronously in-process in this MVP — no thread required; the stop event is set by `stop()` and observed between frames). `stop()` sets the stop event and waits for the loop to drain within `stop_timeout_seconds` (bounded). `GsUsbDriver.iter_frames` refined to swallow `CanReceiveTimeout` (empty bus) and continue until stop/disconnect, making its behavior uniform with `MockDriver` (signature unchanged). Graceful cleanup in a `finally` block: driver disconnected (the "loggers closed" step is wired in Phase 3; here loggers are not yet opened). Automatic cleanup on context-manager exit and on process interrupt via `__exit__`/`finally` semantics.

**Technical risks**: Busy-loop on mock exhaustion if `receive()` is called directly. Mitigation: consume via `driver.iter_frames(self._stop_event)` so each driver encodes its own end/continue semantics (mock returns on exhaustion; GS_USB continues across empty-bus timeouts). Blocking receive preventing shutdown. Mitigation: the driver's `receive_timeout_seconds` bounds each receive; the loop checks the stop event between iterations, so `stop()` completes within `stop_timeout_seconds`. Breaking `test_iter_frames_stops_on_stop_event`. Mitigation: the refinement swallows `CanReceiveTimeout` only; the existing test sends a frame then sets stop and expects `StopIteration` — unaffected (verified). Thread-safety. Mitigation: synchronous MVP — `start()` runs the loop in the calling thread; `stop()` is called from the same thread (test-driven via a frame-count limit / stop event set from a helper thread only in cancellation tests). No async/threads mandated by the spec; the implementation choice is documented in research.md.

**Validation**: A `MockDriver` with N deterministic frames: `start()` runs to exhaustion → STOPPED with N frames counted; `stop()` before exhaustion → STOPPED promptly; empty mock (0 frames) → STOPPED with 0 frames; `stop()` before `start()` → safe no-op. A virtual-bus `GsUsbDriver`: capture across an empty-bus timeout continues until `stop()` (does not end on the first timeout). Cancellation test: `stop()` from a helper thread while the loop is blocked in `receive()` completes within `stop_timeout_seconds`.

**Testing**: `test_capture_loop.py` — mock capture to exhaustion, stop mid-capture, empty capture, cleanup, bounded cancellation while blocked, stop event observed, cleanup always runs. `test_gs_usb_driver.py` (Feature 020) re-run unmodified and green (including `test_iter_frames_stops_on_stop_event`).

**Acceptance criteria**:
1. `CaptureSession` consumes frames from `CanDriver` without assuming how the driver produces them (via `iter_frames(stop_event)`); it does not type-check the driver or branch on driver kind.
2. Mock capture yields frames in order and ends cleanly on exhaustion; empty capture ends cleanly with zero frames.
3. `stop()` completes within `stop_timeout_seconds` even while a receive is in progress; cleanup (`finally`) always disconnects the driver.
4. `GsUsbDriver.iter_frames` continues across empty-bus `CanReceiveTimeout` until stop/disconnect; signature unchanged; `test_iter_frames_stops_on_stop_event` passes unmodified.
5. No bare `stream` token; no `transmit`/`send`/`write` method names; no module-level mutable globals.
6. All tests green (Feature 020 regression unmodified); size limits met.

### Phase 3 — Logger Integration & Failure Policy

**Dependencies**: Phase 2.

**Deliverables**: Wire logger open/dispatch/close into `CaptureSession`: `start()` opens all configured loggers (CREATED→STARTING opens loggers then connects driver; on open failure → STARTING→STOPPED with `CanLoggingError`). The `_dispatch(frame)` step (stubbed in Phase 2) now calls `logger.write_frame(frame)` for each configured logger. `stop()`/cleanup flushes and closes loggers in `finally`. Implement the single logger-failure policy (FR-011): if any `logger.write_frame` raises `CanLoggingError` (or `OSError` mapped to it), the loop transitions to STOPPING, flushes/closes the **remaining** (non-failed) loggers, disconnects the driver, finalizes partial counters (full `CaptureStatistics` is wired in Phase 4; here partial totals are returned as a minimal summary), and re-raises the `CanLoggingError`. No-logger path verified (capture works and counts without any logger). Multi-logger path verified (JSONL + ASC simultaneously). **End of Phase 3 proves the full capture pipeline**: `driver → CaptureSession → logger → saved capture output`.

**Technical risks**: Partial-statistics accuracy on failure. Mitigation: counters are updated before dispatch so partial counts reflect frames received up to the failing frame (full statistics finalized in Phase 4). Corrupting already-written records. Mitigation: each logger writes one record per frame independently; a failing logger does not touch others' files. Leaving the session running after a logger failure. Mitigation: the policy mandates STOPPING→STOPPED. Logger `open` failure vs `write_frame` failure. Mitigation: both map to `CanLoggingError`; open failure aborts start (STARTING→STOPPED) before the loop runs.

**Validation**: JSONL capture → one valid record per frame, parseable. ASC capture → records via the same interface. JSONL + ASC together → both receive every frame. No logger → capture completes, counts correct. Failing logger (injected) mid-capture → `CanLoggingError` raised, remaining loggers flushed/closed, driver disconnected, partial counts reflected, session is STOPPED (not RUNNING).

**Testing**: `test_capture_logging.py` (JSONL, ASC, multi-logger, no-logger), `test_logger_failure_policy.py` (write failure → policy executed; open failure → start aborts; partial counts; session stopped). `test_connection_service.py` and `test_jsonl_logger.py`/`test_asc_logger.py` (Feature 020) re-run unmodified.

**Acceptance criteria**:
1. Every received frame is forwarded to each configured logger as one record; multiple loggers are supported simultaneously.
2. No-logger capture works and counts frames.
3. The logger-failure policy (FR-011) executes exactly: stop gracefully, raise `CanLoggingError`, flush+close remaining loggers, release driver, return partial counts; the session is STOPPED afterward.
4. Already-written records are not corrupted.
5. Logging does not import or depend on the driver layer; `CaptureSession` depends on the `FrameLogger` interface only.
6. The pipeline `driver → CaptureSession → logger → saved output` is demonstrable end-to-end with a mock driver and a JSONL file.
7. All tests green (Feature 020 regression unmodified); size limits met; no bare `stream` token.

### Phase 4 — Capture Statistics

**Dependencies**: Phase 2 (capture loop). Integrates with Phase 3's dispatch path.

**Deliverables**: `statistics.py` — `CaptureStatistics` frozen dataclass with exactly: `start_time`, `end_time`, `duration`, `total_frames`, `rx_frames`, `tx_frames`, `dropped_frames`, `average_frame_rate`. A small builder computes `duration = end_time - start_time` and `average_frame_rate = total_frames / duration` with a safe zero-duration fallback (0.0, no division error). `CaptureSession` accumulates counts during the loop (total, RX, TX by `frame.direction`, dropped where detectable) and builds/returns `CaptureStatistics` on stop, replacing the minimal counters from Phases 2–3. `session.statistics` returns the finalized `CaptureStatistics` (or `None` before a capture has run). `session.stats` (the Feature 020 dict-or-None field) is preserved for backward compat and is not the source of truth. A "dropped frames" detection hook is documented as best-effort (0 where the underlying stack does not report drops — honest zero, never fabricated).

**Technical risks**: Over-including fields (scope creep into bus statistics). Mitigation: `CaptureStatistics` is frozen to exactly the eight FR-012 fields; a test asserts no extra public fields. `average_frame_rate` divergence on zero duration. Mitigation: explicit safe fallback. `session.stats` vs `statistics` confusion. Mitigation: documented in data-model.md and docstrings; `stats` stays None-by-default for the Feature 020 test.

**Validation**: Mock capture with a known RX/TX mix → `statistics` returns matching counts, duration > 0, rate ≈ total/duration. Empty capture → zero totals, rate 0.0 (no error). Repeated `CaptureSession` instances on the same driver → no count bleed. `session.stats` is still `None` right after construction (Feature 020 compat). Logger-failure partial statistics now returned as a full `CaptureStatistics` with counts up to the failure.

**Testing**: `test_capture_statistics.py` (counters, timing, rate tolerance, empty capture, repeated sessions, no-extra-fields, dropped-frames-honest-zero, partial statistics on logger failure). `test_session.py` re-run unmodified (`session.stats is None` at construction). `test_logger_failure_policy.py` (Phase 3) re-run to confirm partial `CaptureStatistics` is now returned.

**Acceptance criteria**:
1. `CaptureStatistics` exposes exactly the eight FR-012 fields and no others; it is immutable.
2. Counts match a known mock stream; RX/TX split by `frame.direction`; duration and average rate are correct within tolerance.
3. Empty capture returns zero totals and a safe 0.0 average rate (no exception).
4. Repeated sessions on the same driver do not share counters.
5. `CaptureStatistics` is **not** in `prioracan.__all__`; `session.statistics` is the access path; `session.stats` remains None at construction (Feature 020 compat).
6. No bus-utilization/histogram/bitrate/protocol/frequency fields exist (grep guard).
7. All tests green; size limits met; no bare `stream` token.

### Phase 5 — GS_USB Validation

**Dependencies**: Phases 1–4.

**Deliverables**: `test_capture_gs_usb.py` — end-to-end capture against a python-can `"virtual"` bus (no hardware): open a `GsUsbDriver`, run a `CaptureSession`, have a sender bus push frames, stop, verify counts + JSONL output. Bounded-shutdown test: `stop()` while the virtual bus is idle (empty-bus timeouts) completes within `stop_timeout_seconds`. Disconnect-mid-capture test: `driver.disconnect()` from a helper while the loop runs → session surfaces `CanConnectionError`, stops, cleans up. (Optional, marked `skip` unless a real device env var is set) a real-hardware smoke hook — not required for CI. No production code change beyond the Phase 2 `iter_frames` refinement; this phase is validation + any small adapter needed for disconnect detection (if `GsUsbDriver.receive` already raises `CanConnectionError` on a closed bus, no change).

**Technical risks**: Virtual-bus timing flakiness. Mitigation: explicit short timeouts; deterministic frame counts; no sleeps on the critical path. Disconnect detection semantics. Mitigation: rely on `GsUsbDriver.receive`/`is_connected` to surface disconnection; map to `CanConnectionError`; documented in research.md. Accidentally requiring hardware in CI. Mitigation: all CI tests use the virtual bus; real-hardware hooks are opt-in via env var and skipped otherwise.

**Validation**: Virtual-bus capture returns the sent frames with correct statistics and a valid JSONL log. Bounded shutdown on an idle bus is verified. Disconnect mid-capture is surfaced as a domain error with cleanup.

**Testing**: `test_capture_gs_usb.py` (virtual-bus capture, bounded shutdown, disconnect mid-capture). `test_gs_usb_driver.py` (Feature 020) re-run unmodified.

**Acceptance criteria**:
1. `CaptureSession` captures from a virtual-bus `GsUsbDriver` with correct counts and JSONL output, no USB hardware.
2. `stop()` on an idle bus completes within `stop_timeout_seconds`.
3. Driver disconnect mid-capture surfaces `CanConnectionError` and triggers cleanup; no raw `python-can`/libusb exception leaks.
4. No CI test requires real hardware; real-hardware hooks are opt-in and skipped by default.
5. All tests green (Feature 020 regression unmodified); size limits met; no bare `stream` token; `python-can` still imported only at the seam.

### Phase 6 — Examples

**Dependencies**: Phases 1–5.

**Deliverables**: `examples/capture_mock.py` — opens a `CaptureSession` on a `MockDriver` with a small deterministic frame set, starts, stops, prints `statistics`, exits cleanly; runnable with no hardware. `examples/capture_gs_usb.py` — opens a `GsUsbDriver` with `CanUsbConfig`, captures for a configurable duration (CLI arg), saves a JSONL log, prints a summary, releases the device. Neither imports the Desktop Agent/backend/frontend. Both use only the public `prioracan` API (the `CaptureSession` runtime).

**Technical risks**: Examples drift from the real API. Mitigation: a docs-smoke test imports the symbols used and runs the mock example. GS_USB example not runnable in CI. Mitigation: the mock example is the CI-runnable one; the GS_USB example is structurally validated (imports + arg parsing) and runs only with hardware.

**Validation**: `python examples/capture_mock.py` runs with no hardware and prints a statistics summary. `capture_gs_usb.py --duration 2` is structurally valid (imports resolve, args parse) and would run with a real adapter.

**Testing**: `test_capture_examples.py` — runs the mock example (subprocess or importable `main`), asserts it exits 0 and prints statistics; asserts the GS_USB example imports and parses args without hardware.

**Acceptance criteria**:
1. The mock example runs with no hardware, prints statistics, and exits cleanly.
2. The GS_USB example is structurally valid and runnable with hardware; it saves JSONL and prints a summary.
3. Neither example depends on the Desktop Agent, backend, or frontend.
4. Examples use only the public `prioracan` API.
5. All tests green; size limits met.

### Phase 7 — Documentation

**Dependencies**: Phases 1–6.

**Deliverables**: `README.md` extended with a CAN Sniffer overview, the `CaptureSession` API (`start`/`stop`/`is_running`/`statistics`, context-manager usage), the capture lifecycle state machine (CREATED→STARTING→RUNNING→STOPPING→STOPPED→DISPOSED), a mock capture example, a GS_USB capture example, logger usage, expected output, and troubleshooting. `examples/README.md` extended. Docstrings on all new public surface (`CaptureSession.start/stop/is_running/statistics/__enter__/__exit__`, `CaptureStatistics`). ASCII architecture + lifecycle diagrams.

**Technical risks**: Documenting symbols not in `__all__`. Mitigation: `CaptureStatistics`/`CaptureState` are documented as return/internal types accessed via `session.statistics`; the docs-smoke test checks that symbols imported from `prioracan` in docs are within `__all__` (so docs must import `CaptureSession`, not `CaptureStatistics`, from `prioracan`). Drift. Mitigation: tie examples to the mock driver so they run in CI.

**Validation**: `test_documented_top_level_symbols_are_public` passes (any `from prioracan import ...` in README/examples uses only `__all__` names). `test_all_public_symbols_have_docstrings` passes. The mock example in docs runs.

**Testing**: `test_docs_smoke.py` (Feature 020) re-run unmodified and green; `test_capture_examples.py` covers the documented mock example.

**Acceptance criteria**:
1. README documents the sniffer overview, `CaptureSession` API, lifecycle diagram, mock + GS_USB examples, logger usage, expected output, troubleshooting.
2. All `__all__` symbols have docstrings; all new public methods have docstrings.
3. Docs import only `__all__` symbols from `prioracan`; the docs-smoke test passes.
4. The documented mock example runs with no hardware.
5. No bare `stream` token in any `src/prioracan` docstring (lexical guard).

### Phase 8 — Quality, Guards & Regression

**Dependencies**: Phases 1–7.

**Deliverables**: Final regression run of the entire Feature 020 suite unmodified; coverage report; strengthened/extended static guards (assert `CaptureStatistics` not in `__all__`; assert `CaptureSession` has no `stream`/`run`/`iter_frames`/`receive` methods — already covered by `test_session.py`; assert `prioracan.__all__` unchanged — already covered by `test_public_api.py`; assert no bus-statistics fields on `CaptureStatistics`; assert `ConnectionService` method set unchanged — already covered by `test_connection_service.py`; assert no new error subclass was added to `errors.py`). A multi-instance test: two `CaptureSession` instances on two `MockDriver`s (and one mock + one virtual-bus `GsUsbDriver`) run simultaneously without interference. Public API validation: `prioracan.__all__` exactly the 21 names; `CaptureSession` runtime API present; `ConnectionService` unchanged. Documentation validation via the docs-smoke tests.

**Technical risks**: Coverage drop below 90% on new modules. Mitigation: target ≥ 90% on `session.py`/`statistics.py` and the new capture code; exclude only the python-can seam's hardware-only branches (inherited exclusion). Guard brittleness. Mitigation: reuse the existing AST-based guard style.

**Validation**: `pytest -q` exits 0 on a machine with no USB-CAN adapter and no external file. Coverage ≥ 90% on the new capture modules. Every Feature 020 test file runs unmodified and green. Static guards green.

**Testing**: This phase **is** the quality gate; it consolidates regression, coverage, guards, multi-instance, and docs validation.

**Acceptance criteria**:
1. The entire suite passes with no USB-CAN adapter and no external file path.
2. Every Feature 020 test file passes unmodified (no edit to any existing `test_*.py`).
3. `prioracan.__all__` is exactly the 21 Feature 020 names; `ConnectionService`'s public method set is exactly the 4 Feature 020 methods; `CaptureSession`'s constructor and `mark_end` are unchanged; no new error subclass was added to `errors.py`.
4. Coverage ≥ 90% on `session.py`, `statistics.py`, and the new capture test targets.
5. `python-can` is imported only at `drivers/adapters/python_can_adapter.py`; no `transmit`/`send`/`write` method names; no bare `stream`/`isotp`/`uds`/`dbc` tokens; no module-level mutable globals in `src/prioracan`.
6. Multi-instance: two `CaptureSession` instances run simultaneously without interference.
7. No transmit/ISO-TP/UDS/DBC/replay/filtering/bus-statistics/product-integration code exists anywhere (grep guard).

## Cross-Cutting Technical Risks

- **Backward-compatibility regression**: the highest-priority risk is breaking a Feature 020 test (`test_public_api.py`, `test_session.py`, `test_connection_service.py`, `test_static_guards.py`, `test_gs_usb_driver.py`). Mitigation: the plan locks `__all__`, the `CaptureSession` constructor/`mark_end`/no-streaming-methods, the `ConnectionService` 4-method set, and the static guards; every phase re-runs the Feature 020 suite unmodified.
- **Lexical guard (`stream` token)**: easy to trip in a comment. Mitigation: documented constraint; use "streaming"/"capture loop"; the guard runs every phase.
- **Driver consumption coupling**: calling `receive()` directly would couple to polling and break the mock-exhaustion vs empty-bus distinction. Mitigation: consume via `iter_frames(stop_event)`; refine `GsUsbDriver.iter_frames` to swallow empty-bus timeout (signature-preserving).
- **`CaptureStatistics` scope creep**: risk of growing into bus statistics. Mitigation: frozen to eight fields; guard asserting no extra fields.
- **Cancellation determinism**: risk of unbounded shutdown. Mitigation: bounded `receive_timeout_seconds` + stop event + `stop_timeout_seconds` with forced cleanup.
- **Over-engineering the lifecycle**: risk of building validator modules / extra error classes / `dispose()` the spec does not require. Mitigation: `CaptureState` and transition checks inlined in `session.py`; invalid transitions raise the existing `CanAdapterError`; DISPOSED reached via `__exit__`; no `dispose()`, no `lifecycle.py`, no new error subclass.

## Validation Strategy

- **Per-phase**: each phase has explicit acceptance criteria and a test gate; no phase starts until the previous phase's tests are green.
- **Integration**: `CaptureSession` + `MockDriver` + `JsonlLogger` is the smallest end-to-end slice (Phase 3 — the pipeline-proof milestone); `CaptureSession` + virtual-bus `GsUsbDriver` + `JsonlLogger` is the hardware-free integration slice (Phase 5).
- **Hardware-free guarantee**: every CI test runs without a USB-CAN adapter; `GsUsbDriver` is tested via the python-can virtual bus.
- **Regression**: the full Feature 020 suite is re-run unmodified at every phase; no Feature 020 test file is edited.
- **Static guards**: (a) `python-can` only at the seam; (b) no `transmit`/`send`/`write` method names; (c) no `stream`/`isotp`/`uds`/`dbc` tokens; (d) no module-level mutable globals; (e) `__all__` unchanged; (f) `ConnectionService` method set unchanged; (g) no bus-statistics fields on `CaptureStatistics`; (h) no new error subclass in `errors.py`; (i) no modifications outside `can_usb_adapter/` + `specs/021-can-sniffer-mvp/`.
- **Constitution compliance**: file < 300 lines, function < 30 lines, explicit error paths, no hardcoded config — checked per phase.

## Testing Strategy

- **Runtime/lifecycle tests**: `test_capture_session_runtime.py` (constructor compat, `mark_end`, `CaptureState` transitions, context-manager, DISPOSED).
- **Loop/cancellation tests**: `test_capture_loop.py` (mock capture, stop, timeout, cleanup, bounded cancellation).
- **Logging tests**: `test_capture_logging.py`, `test_logger_failure_policy.py`.
- **Statistics tests**: `test_capture_statistics.py`.
- **Driver-integration tests**: `test_capture_gs_usb.py` (virtual bus), `test_gs_usb_driver.py` (Feature 020, unmodified).
- **Example/docs tests**: `test_capture_examples.py`, `test_docs_smoke.py` (Feature 020, unmodified).
- **Fixtures**: reuse `tests/fixtures/frames.py` (deterministic); no example-fixture imports in tests (guard).
- **CI**: fully hardware-independent; `pytest -q` exits 0 on a clean machine; coverage report generated; static guards run.
- **No real-hardware tests** required or permitted in CI; real-hardware smoke hooks are opt-in (env var) and skipped by default.

## Regression Strategy

- Every phase re-runs the **entire** Feature 020 test suite unmodified: `test_frame.py`, `test_config.py`, `test_errors.py`, `test_status.py`, `test_capabilities.py`, `test_session.py`, `test_mock_driver.py`, `test_jsonl_logger.py`, `test_asc_logger.py`, `test_connection_service.py`, `test_gs_usb_driver.py`, `test_driver_contract.py`, `test_pythoncan_adapter.py`, `test_public_api.py`, `test_docs_smoke.py`, `test_multi_instance.py`, `test_sample_fixture_optional.py`, `test_static_guards.py`.
- No Feature 020 `test_*.py` file is edited. New tests live in new files.
- The locked contracts are asserted by existing tests (re-used as regression): `test_public_api.py` (`__all__`), `test_session.py` (constructor/`mark_end`/no-streaming-methods), `test_connection_service.py` (4-method set), `test_static_guards.py` (seam/lexicon/mutable-globals), `test_gs_usb_driver.py` (iter_frames stop).
- Existing PrioraScan tests outside `can_usb_adapter/` are unaffected (zero modifications outside the library and its spec).

## Risk Analysis

| Risk | Likelihood | Impact | Mitigation | Owner phase |
|------|-----------|--------|------------|-------------|
| Break a Feature 020 test | Medium | High | Locked contracts; per-phase regression; additive-only | All phases |
| Trip the `stream` lexical guard | Medium | Low | Use "streaming"/"capture loop"; guard per phase | All phases |
| Mock busy-loop / wrong end semantics | Medium | Medium | Consume via `iter_frames`; refine GS_USB iter_frames | Phase 2 |
| Logger-failure partial stats incorrect | Low | Medium | Update counters before dispatch; policy test | Phase 3/4 |
| Unbounded shutdown | Low | High | Bounded receive timeout + stop event + stop_timeout | Phase 2 |
| `CaptureStatistics` scope creep | Low | Medium | Frozen fields; guard | Phase 4/8 |
| Over-built lifecycle machinery | Medium | Low | Inline `CaptureState` + checks; reuse `CanAdapterError`; no `dispose()`/`lifecycle.py` | Phase 1/8 |
| Coverage < 90% | Low | Low | Targeted tests; exclude seam hardware branches | Phase 8 |
| Real-hardware required in CI | Low | Medium | Virtual bus only; opt-in hardware hooks | Phase 5 |

## Out of Scope (reaffirmed)

This plan and every phase within it must **not** introduce: transmit/write support; CAN FD; ISO-TP; UDS; DBC decoding; a replay engine; frame filtering; bus statistics; AI analysis; desktop-agent integration; backend integration; frontend integration; any modification to the existing ELM327 adapter; any change to `prioracan.__all__` or the `ConnectionService` public method set or `errors.py`; any edit to a Feature 020 test file; any change outside `can_usb_adapter/` and `specs/021-can-sniffer-mvp/`. Product integration requires PRD/SAD updates first (deferred to a future feature).

## Phase Dependency Order

```text
Phase 1 (lifecycle foundation)
  └─ Phase 2 (capture loop + cancellation)
       ├─ Phase 3 (logging + failure policy)   [pipeline proof: driver → CaptureSession → logger → file]
       │    └─ Phase 4 (statistics)             [needs Phase 2 loop; integrates with Phase 3 dispatch]
       │         └─ Phase 5 (GS_USB validation) [needs 1–4]
       │              └─ Phase 6 (examples)     [needs 1–5]
       │                   └─ Phase 7 (docs)    [needs 1–6]
       │                        └─ Phase 8 (quality/guards/regression) [needs 1–7]
```

Each phase is independently completable and testable before the next begins, with an incremental commit at each phase boundary. The project remains releasable after every milestone: after Phase 1 the runtime skeleton exists; after Phase 2 mock capture runs; after Phase 3 the full pipeline (driver → `CaptureSession` → logger → saved output) is proven; after Phase 4 statistics are available; after Phase 5 hardware-free GS_USB capture is validated; after Phase 6–7 it is usable and documented; after Phase 8 it is production-quality.