# Research: CAN Sniffer MVP (Feature 021)

**Branch**: `021-can-sniffer-mvp` | **Date**: 2026-06-30 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

**Purpose**: Resolve every design unknown and confirm the implementation choices that keep Feature 021 additive, backward-compatible, and consistent with the Feature 020 architecture and its static guards. Each item records **Decision**, **Rationale**, and **Alternatives considered**. No code is written in this phase.

---

## R1 — How does `CaptureSession` consume frames from `CanDriver` without coupling to a polling implementation?

**Decision**: `CaptureSession` consumes frames via `driver.iter_frames(self._stop_event)`. It does **not** call `driver.receive()` in a hand-written loop and does **not** branch on the concrete driver type.

**Rationale**: The Feature 020 `CanDriver` Protocol already exposes two implementation-independent mechanisms — a bounded `receive(timeout_seconds)` and a stoppable `iter_frames(stop_event)` — so FR-009a ("consume frames from the abstraction without assuming how the driver produces them") is satisfiable today without changing the abstraction. Using `iter_frames` lets each concrete driver encode its own end/continue semantics inside the iterator, which is exactly what distinguishes a finite mock from an infinite hardware listener (see R5). `CaptureSession` therefore stays decoupled from the production mechanism; future drivers (SocketCAN, PCAN, Vector, Kvaser, Serial CAN, MCP2515, `ReplayDriver`) can expose `iter_frames` however they like without `CaptureSession` changing.

**Alternatives considered**:
- *Call `receive()` directly and catch `CanReceiveTimeout`*: rejected because `CanReceiveTimeout` is overloaded — mock raises it on stream exhaustion (capture should end) while GS_USB raises it on an empty bus (capture should continue listening). Distinguishing the two without driver-type knowledge is impossible, so this would couple `CaptureSession` to driver-specific semantics and violate FR-009a.
- *Add a new streaming method to `CanDriver`*: rejected — it would change the Feature 020 public contract (FR-015/FR-019) and is unnecessary since `iter_frames` already exists.

---

## R2 — Where does `CaptureStatistics` live, and is it exported from `prioracan.__all__`?

**Decision**: `CaptureStatistics` is a new class in `prioracan/statistics.py`, returned by `session.statistics`, and is **not** added to `prioracan.__all__`. The `CaptureState` lifecycle enum is **inlined in `prioracan/session.py`** (no separate `lifecycle.py` module) and is likewise not added to `__all__`.

**Rationale**: `test_public_api.py::test_current_public_api_exports` asserts `list(prioracan.__all__) == [<exactly 21 Feature 020 names>]` (exact equality). Adding any name to `__all__` would break that Feature 020 test, violating the "Feature 020 tests pass unmodified" requirement (SC-007 / regression strategy). Keeping `CaptureStatistics` and `CaptureState` out of `__all__` is also consistent with FR-002: "`CaptureSession` is the only public lifecycle abstraction." `CaptureStatistics` is a return value / data record, not a peer lifecycle abstraction, so it does not need top-level re-export. Consumers obtain it via `session.statistics`; advanced users can import it from its module (`prioracan.statistics.CaptureStatistics`) if needed. `CaptureState` is an internal enum inlined in `session.py` (`prioracan.session.CaptureState`). The docs will import only `CaptureSession` from `prioracan` (the docs-smoke test enforces that documented `from prioracan import …` names are within `__all__`).

**Alternatives considered**:
- *Add `CaptureStatistics` to `__all__` and update `test_public_api.py`*: rejected — editing a Feature 020 test file violates the unmodified-regression rule.
- *Put `CaptureStatistics` inside `session.py`*: acceptable but rejected on file-size/responsibility grounds — `session.py` is already the largest new module; splitting statistics into `statistics.py` keeps each file < 300 lines (Constitution Principle V) and gives statistics a single responsibility. (`CaptureState`, by contrast, is small and tightly coupled to `CaptureSession`, so it is inlined in `session.py` rather than split into its own module.)

---

## R3 — How is `CaptureSession` restructured without breaking `test_session.py`?

**Decision**: Convert `CaptureSession` from a minimal `@dataclass(slots=True)` into an active runtime class that **preserves** the tested public surface: constructor `CaptureSession(session_id, start_time, driver, config, *, loggers=(), stop_timeout_seconds=…)` (the first four positional args unchanged), public attributes `session_id`, `start_time`, `driver`, `config`, `active` (default `True`), `end_time` (default `None`), `stats` (default `None`), and the `mark_end(end_time)` method. New runtime API: `start()`, `stop()`, `is_running` (property), `statistics` (property), `__enter__`/`__exit__`. There is **no public `dispose()`** — the DISPOSED state is reached via context-manager `__exit__`. The `CaptureState` enum and inline transition checks live in `session.py`; invalid transitions raise the **existing** `CanAdapterError` (no new error subclass, no `lifecycle.py` module). Drop `slots=True` to allow private runtime attributes (`_stop_event`, `_state`, `_capture_stats`, etc.). Do **not** name any method `stream`, `run`, `iter_frames`, or `receive` (forbidden by `test_session.py::test_session_has_no_streaming_methods`).

**Rationale**: `test_session.py` asserts (a) `CaptureSession("s1", 1.0, driver, config)` yields `active is True`, `end_time is None`, `stats is None`, `.driver`/`.config` correct; (b) `mark_end(2.0)` sets `end_time=2.0` and `active=False`; (c) `CaptureSession` has no attribute named `stream`/`run`/`iter_frames`/`receive`. The constructor signature, the default values, `mark_end`, and the no-streaming-methods rule are therefore hard locks. Dropping `slots=True` is an internal change — the test checks attributes, not `__slots__`, so it stays green. `active` retains its Feature 020 meaning ("session not ended"); `is_running` is a **new, separate** property meaning "capture loop currently RUNNING." `mark_end` continues to set `active=False` and is also used internally to drive the STOPPED/DISPOSED transitions. Invalid lifecycle transitions raise the existing `CanAdapterError` (the public error taxonomy in `errors.py` is unchanged — no new subclass is added); DISPOSED is reached only via `__exit__`, so no public `dispose()` method is exposed.

**Alternatives considered**:
- *Keep `slots=True` and add private fields via `field(init=False, default=None)`*: rejected — leading-underscore dataclass fields are awkward, pollute `repr`, and require re-initialization in `__post_init__`; not worth the friction for an internal-only concern.
- *Replace `active` with `is_running`*: rejected — breaks `test_session.py` (`active is True` at construction).
- *Make `start_time` the real capture start*: rejected — the constructor's `start_time` parameter is a Feature 020 contract; the real capture start is recorded internally on `start()` and exposed via `CaptureStatistics.start_time`. The two coexist (see data-model.md).

---

## R4 — Is `ConnectionService` changed to "delegate to `CaptureSession`"?

**Decision**: `ConnectionService` is **left unchanged**. It already satisfies the spec's thin-wrapper requirement: it exposes exactly `connect`/`receive_once`/`get_status`/`disconnect`, owns no streaming loop, and never will.

**Rationale**: `test_connection_service.py::test_connection_service_exposes_only_thin_methods` asserts `ConnectionService.__dict__` public functions equal **exactly** `{"connect", "receive_once", "get_status", "disconnect"}`. Adding any delegation method (e.g. `start`/`stop`/`capture`) would break this exact-set assertion. The spec's FR-003 ("reduced to a thin backward-compatibility wrapper that delegates to `CaptureSession` for any capture/streaming concern") is satisfied by leaving it as-is, because `ConnectionService` has **no** capture/streaming concern — it only does receive-once. There is nothing to delegate. The architectural overlap the spec objected to (an earlier draft's separate capture component wrapped by `ConnectionService`) does not exist in this plan: `CaptureSession` is the single lifecycle owner and `ConnectionService` is an unrelated thin receive-once helper. No change needed.

**Alternatives considered**:
- *Rewrite `ConnectionService` to delegate receive-once to a `CaptureSession`*: rejected — it would change internal behavior for no benefit and risk the exact-method-set test; also pointless since `receive_once` is already a one-liner over `driver.receive()`.
- *Remove `ConnectionService`*: rejected — it is a Feature 020 public export and a test locks its presence and method set.

---

## R5 — `GsUsbDriver.iter_frames` empty-bus behavior refinement

**Decision**: Refine `GsUsbDriver.iter_frames` so that a `CanReceiveTimeout` from `receive()` (empty bus) is swallowed and the loop **continues** until the stop event is set or the driver disconnects. The method signature and the rest of its behavior are unchanged. `MockDriver.iter_frames` is unchanged (it already returns on `CanReceiveTimeout`, which is correct for a finite mock stream).

**Rationale**: A sniffer must keep listening across quiet bus intervals. The current `GsUsbDriver.iter_frames` propagates `CanReceiveTimeout`, which would terminate a live capture on the first empty-bus timeout — wrong for a sniffer. `MockDriver.iter_frames` already swallows `CanReceiveTimeout` (returns on exhaustion), so making `GsUsbDriver` swallow it too (and continue, since a hardware bus is infinite) makes the two drivers' iterators uniform in resilience while preserving each one's end semantics: mock ends on exhaustion, GS_USB ends on stop/disconnect. This is a behavior refinement, not a signature change, so the `CanDriver` Protocol contract is unchanged. `test_gs_usb_driver.py::test_iter_frames_stops_on_stop_event` sends one frame, reads it, sets the stop event, and expects `StopIteration` — it never exercises the timeout path, so it remains green. `test_gs_usb_driver_timeout_status_and_capabilities` tests `driver.receive(0)` directly (still raises `CanReceiveTimeout`), not `iter_frames`, so it is also unaffected.

**Alternatives considered**:
- *Have `CaptureSession` catch `CanReceiveTimeout` from `iter_frames` and restart*: rejected — re-couples `CaptureSession` to timeout handling and muddies the "iterator ends → capture ends" contract; the driver should own its end/continue semantics.
- *Add a parameter to `iter_frames` to control timeout handling*: rejected — changes the Feature 020 `CanDriver` signature.

---

## R6 — Cancellation mechanism: threads, async, or synchronous?

**Decision**: Synchronous, in-process MVP. `start()` runs the capture loop in the calling thread. `stop()` sets a `threading.Event` that the loop checks between frames; because each `receive()` is bounded by `receive_timeout_seconds`, the loop observes the stop within one receive timeout and `stop()` completes within `stop_timeout_seconds` (a configurable bound with a sane default). Cleanup runs in a `finally` block so it always executes. Cancellation tests set the stop event from a helper thread to prove bounded shutdown while blocked.

**Rationale**: The spec explicitly forbids mandating a threading model or async (FR-008, Implementation Freedom note). A synchronous loop is the simplest mechanism that satisfies "cancellable, bounded, deterministic, cleanup always executes." No threads are needed for the core path; the stop event + bounded receive is sufficient. This keeps the implementation small, testable, and free of concurrency bugs. A future feature may add a threaded/async runner **on top of** `CaptureSession` (compose-on-top, FR-015) without changing it.

**Alternatives considered**:
- *Background thread inside `CaptureSession`*: rejected for the MVP — adds thread lifecycle/join complexity and races; not required by any functional requirement. Could be a future compose-on-top runner.
- *`asyncio`*: rejected — would force an async runtime on consumers and complicate the synchronous public API; the spec mandates implementation freedom, and sync is the least-invasive choice.
- *Signal-based interrupt*: rejected as the primary mechanism — platform-dependent; `finally` + context-manager exit already cover the abandoned-session/interrupted-process case (FR-007).

---

## R7 — Logger-failure policy: where is it implemented and how are partial statistics computed?

**Decision**: The policy (FR-011) is implemented inside `CaptureSession`'s dispatch path. Counters are updated **before** logger dispatch, so on a logger failure the partial `CaptureStatistics` reflects all frames received up to and including the failing frame. On `CanLoggingError` (from `open` or `write_frame`), `CaptureSession` transitions to STOPPING, flushes/closes the **remaining** (non-failed) loggers in `finally`, disconnects the driver, finalizes statistics, and re-raises the `CanLoggingError`. An `open` failure aborts `start()` (STARTING→STOPPED) before the loop begins.

**Rationale**: Updating counters before dispatch guarantees partial statistics are accurate. Closing only the remaining loggers (and best-effort the failed one) avoids corrupting already-written records — each logger writes its own file independently. Re-raising `CanLoggingError` satisfies "surface a logging domain error." Leaving the session STOPPED (not RUNNING) satisfies "must not be left in a running state." This is a single, defined policy — not implementation-defined.

**Alternatives considered**:
- *Continue capturing after a logger failure, skipping the failed logger*: rejected — the spec mandates stopping gracefully (FR-011) so the operator knows data integrity is at risk.
- *Abort without finalizing statistics*: rejected — the spec requires returning partial statistics.

---

## R8 — `CaptureStatistics` field boundaries (no bus statistics)

**Decision**: `CaptureStatistics` is a frozen dataclass with exactly: `start_time`, `end_time`, `duration`, `total_frames`, `rx_frames`, `tx_frames`, `dropped_frames`, `average_frame_rate`. No other public fields. `average_frame_rate = total_frames / duration` with a 0.0 fallback when `duration <= 0`. `dropped_frames` is best-effort: 0 where the underlying stack does not report drops (honest zero, never fabricated).

**Rationale**: FR-012/FR-014 freeze the field set and explicitly exclude bus utilization, arbitration histograms, bitrate estimation, protocol analysis, and message-frequency analysis (future Bus Statistics feature). A frozen dataclass prevents accidental growth; a guard test asserts no extra public fields.

**Alternatives considered**:
- *Add a `messages_per_second_per_id` field*: rejected — that is message-frequency analysis, explicitly out of scope.
- *Make `dropped_frames` an estimated value*: rejected — fabricating drops would be dishonest; report 0 when undetectable.

---

## R9 — Static-guard lexical constraint (the `stream` token)

**Decision**: In all `src/prioracan/**/*.py` files (including comments and docstrings), avoid the bare token `stream`. Use "streaming" (tokenizes as `streaming`), "capture loop", or "frame flow" instead. Also avoid `isotp`/`uds`/`dbc` tokens. Avoid `FunctionDef` names `transmit`/`send`/`write`/`send_periodic`. Avoid module-level `[]`/`{}`/`set()` literals (use tuples or class-scoped state).

**Rationale**: `test_static_guards.py::test_no_out_of_scope_protocol_identifiers` lowercases each `.py` file, replaces `-` with `_`, splits on whitespace, and asserts no intersection with `{"isotp", "uds", "dbc", "stream"}`. The bare word `stream` (e.g. in `# the stream of frames` or a variable `stream`) would fail this guard. `"streaming"` is a single token `streaming` and is safe. `test_no_transmit_style_public_methods` walks AST `FunctionDef` names; `CaptureSession` must not define a method named `write` (it calls `logger.write_frame`). `test_no_module_level_mutable_globals` forbids module-level mutable literals. These guards run every phase.

**Alternatives considered**:
- *Relax the guard to allow `stream`*: rejected — it is a Feature 020 test and must pass unmodified; and the constraint is easy to honor with "streaming"/"capture loop" wording.

---

## R10 — File layout and size limits

**Decision**: One new module `statistics.py` (CaptureStatistics + safe rate builder); `session.py` restructured into the active runtime with the `CaptureState` enum and inline transition checks **inlined in the same file** (no separate `lifecycle.py` module, no `InvalidCaptureTransitionError` subclass, no public `dispose()`). No new package. Each new file stays well under 300 lines; each function under 30 lines.

**Rationale**: Constitution Principle V mandates < 300 lines/file and < 30 lines/function. `CaptureState` is small (six constants) and tightly coupled to `CaptureSession`'s transitions, so inlining it in `session.py` avoids a thin helper module that would exist only to hold an enum and a validator — that would be over-engineering the lifecycle (Principle XV, Simplicity). `CaptureStatistics`, by contrast, is a distinct data record with its own validation, so it earns its own small `statistics.py` (keeps `session.py` under the limit and gives statistics a single responsibility). Invalid transitions reuse the existing `CanAdapterError`; DISPOSED is reached via `__exit__`, so no public `dispose()` is needed. Reusing all Feature 020 modules unchanged avoids unnecessary refactoring (planning goal).

**Alternatives considered**:
- *One large `session.py` containing everything (including `CaptureStatistics`)*: rejected — would exceed the 300-line limit and mix responsibilities.
- *A separate `lifecycle.py` validator module with `InvalidCaptureTransitionError(CanAdapterError)` and a public `dispose()`*: rejected as over-built — the spec requires the six-state machine and the DISPOSED state, but not a dedicated validator module, a new public error subclass, or a public dispose method. Inlining the enum + checks and reusing `CanAdapterError` is the minimum machinery that satisfies FR-005/FR-006/FR-007.

---

## R11 — Backward-compatibility contract inventory (what must not change)

**Decision**: The following are hard locks, asserted by existing Feature 020 tests that must pass unmodified:
- `prioracan.__all__` == exactly the 21 names (`test_public_api.py`).
- `CaptureSession(session_id, start_time, driver, config)` constructor; `active=True`/`end_time=None`/`stats=None` defaults; `mark_end()`; no `stream`/`run`/`iter_frames`/`receive` methods (`test_session.py`).
- `ConnectionService` public method set == exactly `connect`/`receive_once`/`get_status`/`disconnect` (`test_connection_service.py`).
- `python-can` imported only at `drivers/adapters/python_can_adapter.py` (`test_static_guards.py`).
- No `transmit`/`send`/`write`/`send_periodic` FunctionDef names in `src/prioracan` (`test_static_guards.py`).
- No `stream`/`isotp`/`uds`/`dbc` tokens in `src/prioracan` (`test_static_guards.py`).
- No module-level mutable globals in `src/prioracan` (`test_static_guards.py`).
- No `examples.fixtures` / `sample_yaris.jsonl` references in tests (`test_static_guards.py`).
- `GsUsbDriver.iter_frames` stops on stop event (`test_gs_usb_driver.py`); `receive(0)` raises `CanReceiveTimeout` (`test_gs_usb_driver.py`).
- `CanDriver` Protocol surface and `assert_conforms` (`test_driver_contract.py`).
- Documented `from prioracan import …` names ⊆ `__all__`; all `__all__` symbols have docstrings (`test_docs_smoke.py`).
- Multi-instance independence (`test_multi_instance.py`).

**Rationale**: Enumerating these up front lets every phase verify them before progressing and prevents accidental contract drift. This inventory is the backbone of the regression strategy.

**Alternatives considered**: none — these are non-negotiable.

---

## Summary of Decisions

| # | Topic | Decision |
|---|-------|----------|
| R1 | Driver consumption | Use `iter_frames(stop_event)`; no polling coupling |
| R2 | `CaptureStatistics` export | New `statistics.py` module; **not** in `__all__`; accessed via `session.statistics`; `CaptureState` inlined in `session.py` |
| R3 | `CaptureSession` restructure | Preserve constructor/`mark_end`/no-streaming-methods; drop `slots`; add `start/stop/is_running/statistics/ctx`; inline `CaptureState` + checks; reuse `CanAdapterError`; no `dispose()` |
| R4 | `ConnectionService` | Left unchanged (already thin; method set locked) |
| R5 | `GsUsbDriver.iter_frames` | Swallow empty-bus `CanReceiveTimeout`, continue; signature unchanged |
| R6 | Cancellation | Synchronous in-process loop + `threading.Event` + bounded receive + `stop_timeout_seconds` |
| R7 | Logger-failure policy | In `CaptureSession`; counters before dispatch; flush remaining; re-raise `CanLoggingError`; partial stats |
| R8 | `CaptureStatistics` fields | Frozen to 8 fields; safe 0.0 rate; honest-zero drops |
| R9 | Lexical guard | Avoid bare `stream`; use "streaming"/"capture loop"; no `write` method; no module-level mutables |
| R10 | File layout | One new `statistics.py`; `CaptureState` inlined in `session.py`; no `lifecycle.py`/`InvalidCaptureTransitionError`/`dispose()`; < 300 lines/file |
| R11 | Backward-compat locks | Inventory of hard contracts asserted by unmodified Feature 020 tests |

All unknowns resolved. No `NEEDS CLARIFICATION` remains. The design is additive, backward-compatible, hardware-free testable, and consistent with the Feature 020 architecture and static guards.