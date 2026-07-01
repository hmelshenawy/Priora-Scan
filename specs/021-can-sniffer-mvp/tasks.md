# Tasks: CAN Sniffer MVP

**Input**: Design documents from `/specs/021-can-sniffer-mvp/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/library-api-contract.md, quickstart.md

**Tests**: Included. The specification explicitly mandates a comprehensive hardware-free test suite (FR-022) and ≥90% coverage on the new capture code (FR-023). Tests are written FIRST (TDD) and must FAIL before the implementation they drive.

**Organization**: Tasks are grouped by user story (US1–US5, priority order P1→P5) so each story can be implemented and tested independently. The plan's dependency order is honored: the lifecycle state machine is a blocking foundational prerequisite; the capture loop (US1) is the MVP; logging (US3) and statistics (US4) follow; the GS_USB virtual-bus validation is a cross-cutting integration task in Polish because its assertions require logging + statistics to exist (per plan Phase 5).

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: Which user story this task belongs to (US1–US5); Setup/Foundational/Polish tasks carry no story label
- Exact file paths are included in every description

## Path Conventions

- All production code lives under `can_usb_adapter/src/prioracan/`
- All tests live under `can_usb_adapter/tests/`
- Examples live under `can_usb_adapter/examples/`
- No file outside `can_usb_adapter/` and `specs/021-can-sniffer-mvp/` may be created or modified (FR-025 / SC-012)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm scope boundaries and stand up shared test fixtures before any capture code.

- [X] T001 Verify feature branch `021-can-sniffer-mvp` is active and all work is confined to `can_usb_adapter/` and `specs/021-can-sniffer-mvp/`; confirm `can_usb_adapter/pyproject.toml` requires NO new runtime dependencies (python-can already imported only at the adapter seam)
- [X] T002 [P] Add shared capture test fixtures to `can_usb_adapter/tests/conftest.py` reusing `can_usb_adapter/tests/fixtures/frames.py` (deterministic RX/TX frame lists, a stub `FrameLogger`, an injectable failing `FrameLogger`, and python-can virtual-bus helpers)

**Checkpoint**: Scope confirmed; fixtures available for every downstream story.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Restructure `CaptureSession` into the active runtime skeleton with the inlined lifecycle state machine. This MUST be complete before ANY user story.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete. Per the approved plan: inline `CaptureState` + transition checks in `session.py`; NO `lifecycle.py` module; NO `InvalidCaptureTransitionError` subclass; NO public `dispose()` (DISPOSED reached only via `__exit__`); invalid transitions raise the existing `CanAdapterError`.

- [X] T003 [P] Write lifecycle tests in `can_usb_adapter/tests/test_capture_session_runtime.py` (constructor/defaults/`mark_end` backward compat mirroring `test_session.py`; valid + invalid `CaptureState` transitions; `is_running`; context-manager `__enter__`/`__exit__` + DISPOSED-raises; stop-before-start safe no-op; repeated stop idempotent; double-start raises `CanAdapterError`) — write FIRST, must FAIL before T004/T005
- [X] T004 Inline `CaptureState` enum (CREATED, STARTING, RUNNING, STOPPING, STOPPED, DISPOSED) and restructure `CaptureSession` into an active runtime in `can_usb_adapter/src/prioracan/session.py`: preserve constructor `CaptureSession(session_id, start_time, driver, config, *, loggers=(), stop_timeout_seconds=…)` and Feature 020 defaults (`active=True`, `end_time=None`, `stats=None`) + `mark_end()`; drop `slots=True`; add private `_state`/`_stop_event`/`_capture_stats`; add stub `start()`/`stop()`/`is_running`/`statistics`/`__enter__`/`__exit__` (statistics returns `None` until a capture runs; `start` stubs CREATED→STARTING→RUNNING→STOPPED, loop wired in US1); add NO method named `stream`/`run`/`iter_frames`/`receive`; add NO public `dispose()`
- [X] T005 Implement inline FR-006 lifecycle transition guards in `can_usb_adapter/src/prioracan/session.py` (`start()` accepts only CREATED; `stop()` idempotent and safe from CREATED/STOPPED; `__exit__` calls `stop()` then transitions to DISPOSED); invalid transitions raise the existing `CanAdapterError` imported from `prioracan.errors`; create NO `lifecycle.py` module and NO new error subclass in `can_usb_adapter/src/prioracan/errors.py`

**Checkpoint**: Foundation ready — `CaptureSession` runtime skeleton with state machine passes `test_capture_session_runtime.py`; all Feature 020 tests still green. User story implementation can now begin.

---

## Phase 3: User Story 1 — Start, run, and stop a live CAN capture session (Priority: P1) 🎯 MVP

**Goal**: A `CaptureSession` continuously receives raw CAN frames from the active driver via the `CanDriver` abstraction, stops gracefully on request within a bounded time, releases all resources, and implements the documented lifecycle behaviors.

**Independent Test**: Using `MockDriver` with a deterministic frame stream, assert the session starts, yields the expected frames in order, stops on request, transitions through the documented lifecycle states, and releases the driver without leaking resources — all with no real hardware.

### Tests for User Story 1

- [X] T006 [P] [US1] Write capture loop + cancellation tests in `can_usb_adapter/tests/test_capture_loop.py` (mock capture to exhaustion in order; stop mid-capture; empty capture; cleanup always runs; bounded cancellation while blocked in `receive()` completes within `stop_timeout_seconds`; stop event observed between frames) — write FIRST, must FAIL before T007/T008

### Implementation for User Story 1

- [X] T007 [US1] Implement the capture loop in `can_usb_adapter/src/prioracan/session.py`: consume frames via `driver.iter_frames(self._stop_event)` with NO driver-type branching (FR-009a); dispatch each frame to a `_dispatch` stub (logging wired in US3); increment a minimal `_total` counter (full statistics in US4); transition RUNNING→STOPPING→STOPPED on stop / driver disconnect / error; `finally` block always disconnects the driver
- [X] T008 [US1] Implement bounded deterministic cancellation in `can_usb_adapter/src/prioracan/session.py`: `stop()` sets `_stop_event` and waits for the loop to drain within `stop_timeout_seconds`; each receive is bounded by `receive_timeout_seconds` so the loop observes the stop between iterations; cleanup runs in `finally` regardless of termination cause (FR-008)
- [X] T009 [US1] Refine `GsUsbDriver.iter_frames` in `can_usb_adapter/src/prioracan/drivers/gs_usb.py` to swallow `CanReceiveTimeout` (empty bus) and continue until stop/disconnect, making its behavior uniform with `MockDriver` (signature unchanged; `test_iter_frames_stops_on_stop_event` must still pass)
- [X] T010 [US1] Verify Feature 020 regression: run `can_usb_adapter/tests/test_session.py`, `test_gs_usb_driver.py`, `test_static_guards.py`, `test_public_api.py`, and `test_connection_service.py` UNMODIFIED and green

**Checkpoint**: User Story 1 fully functional — mock capture starts, runs, stops gracefully, and cleans up. This is the MVP.

---

## Phase 4: User Story 2 — Develop, test, and demo the sniffer without real hardware (Priority: P2)

**Goal**: The entire capture workflow runs hardware-free on `MockDriver`, deterministically and repeatable, including the empty-bus/no-frame and mock-stream-exhaustion cases, with no test depending on a real adapter or an external local file path.

**Independent Test**: Run the mock-driven capture, empty-bus, exhaustion, and multi-instance tests on a machine with no USB-CAN adapter and no external trace file; all pass deterministically.

### Tests for User Story 2

- [X] T011 [P] [US2] Write mock hardware-free edge tests in `can_usb_adapter/tests/test_capture_loop.py` (extend) or `can_usb_adapter/tests/test_capture_mock.py`: empty-bus/no-frame graceful handling (no hang, no raw low-level error); mock stream exhaustion terminates cleanly; identical output across repeated runs; no external local file path dependency
- [X] T012 [P] [US2] Write multi-instance independence test in `can_usb_adapter/tests/test_capture_multi_instance.py`: two `CaptureSession` instances on two `MockDriver`s run simultaneously without counter/state/resource bleed (FR-013)

### Implementation for User Story 2

- (No new production code — US2 validates the US1 loop on the mock path. The `GsUsbDriver.iter_frames` refinement in T009 is what makes the GS_USB path hardware-free-testable via the virtual bus in Polish.)

**Checkpoint**: The sniffer is fully demonstrable and CI-safe with no hardware.

---

## Phase 5: User Story 3 — Record captured frames to one or more loggers (Priority: P3)

**Goal**: Every received frame is forwarded to each configured logger (JSONL and/or ASC) as one record; logging is optional; a single defined logger-failure policy (FR-011) executes on any logger failure. This phase proves the full pipeline `driver → CaptureSession → logger → saved output`.

**Independent Test**: Receive a known frame set via `MockDriver` through a `CaptureSession` with one or more loggers; assert each logger receives exactly one record per frame; run with no loggers and assert capture still counts frames; inject a failing logger and assert the FR-011 policy executes.

### Tests for User Story 3

- [X] T013 [P] [US3] Write logger integration tests in `can_usb_adapter/tests/test_capture_logging.py` (JSONL: one valid parseable record per frame with timestamp/channel/direction/arbitration id numeric+hex/DLC/payload hex/flags; ASC: same interface; multi-logger JSONL+ASC both receive every frame; no-logger capture still works and counts frames) — write FIRST, must FAIL before T015
- [X] T014 [P] [US3] Write logger-failure policy tests in `can_usb_adapter/tests/test_logger_failure_policy.py` (`write_frame` failure → stop gracefully, raise `CanLoggingError`, flush+close remaining loggers, release driver, partial counts, session STOPPED not RUNNING, already-written records uncorrupted; `open` failure aborts `start()` STARTING→STOPPED) — write FIRST, must FAIL before T016

### Implementation for User Story 3

- [X] T015 [US3] Wire logger open/dispatch/close into `CaptureSession` in `can_usb_adapter/src/prioracan/session.py`: `start()` opens all configured loggers during STARTING (open failure → STOPPED + `CanLoggingError` before the loop runs); replace the `_dispatch` stub with `logger.write_frame(frame)` per configured logger; `stop()`/`finally` flush and close loggers
- [X] T016 [US3] Implement the FR-011 logger-failure policy in `can_usb_adapter/src/prioracan/session.py`: on `CanLoggingError` during dispatch, transition to STOPPING, flush+close the remaining (non-failed) loggers, disconnect the driver, finalize partial counts (full `CaptureStatistics` wired in US4), re-raise `CanLoggingError`, and leave the session STOPPED
- [X] T017 [US3] Demonstrate the end-to-end pipeline `driver → CaptureSession → JsonlLogger → saved capture output` via `test_capture_logging.py`: verify the saved JSONL file is parseable and contains one record per frame

**Checkpoint**: The capture pipeline persists frames to disk; the logger-failure policy is single and defined.

---

## Phase 6: User Story 4 — Get capture statistics at the end of a session (Priority: P4)

**Goal**: `CaptureSession` maintains and returns a bounded `CaptureStatistics` summary (start time, end time, duration, total frames, RX frames, TX frames, dropped frames where detectable, average frame rate) on stop; empty capture returns zero totals and a safe average rate; statistics are session-scoped with no bleed.

**Independent Test**: Run a mock capture with a known RX/TX mix, stop it, and assert the returned statistics match expected counts, duration, and average rate within tolerance; assert empty capture returns zero totals and a safe 0.0 rate; assert repeated sessions do not bleed.

### Tests for User Story 4

- [X] T018 [P] [US4] Write `CaptureStatistics` tests in `can_usb_adapter/tests/test_capture_statistics.py` (counters match a known RX/TX mix; duration > 0; average rate ≈ total/duration within tolerance; empty capture → zero totals + 0.0 rate with no exception; repeated sessions on the same driver → no bleed; exactly the 8 FR-012 fields and NO bus-statistics fields; honest-zero `dropped_frames`; partial statistics on logger failure) — write FIRST, must FAIL before T019/T020

### Implementation for User Story 4

- [X] T019 [P] [US4] Create `CaptureStatistics` frozen dataclass + safe rate builder in `can_usb_adapter/src/prioracan/statistics.py` (exactly: `start_time`, `end_time`, `duration`, `total_frames`, `rx_frames`, `tx_frames`, `dropped_frames`, `average_frame_rate`; `average_frame_rate = total_frames / duration` with a 0.0 fallback when `duration <= 0`; NOT added to `prioracan.__all__`)
- [X] T020 [US4] Integrate `CaptureStatistics` into the capture loop in `can_usb_adapter/src/prioracan/session.py`: accumulate `total`/`rx`/`tx`/`dropped` (by `frame.direction`; dropped where detectable) BEFORE dispatch; build and return `CaptureStatistics` on stop via `stop()` and the `statistics` property; keep `session.stats` `None` at construction (Feature 020 compat); replace the minimal counters from US1/US3
- [X] T021 [US4] Add a guard assertion to `can_usb_adapter/tests/test_capture_statistics.py` that `CaptureStatistics` exposes exactly the 8 FR-012 fields and NO bus-utilization/histogram/bitrate/protocol/frequency fields (FR-014)

**Checkpoint**: Every capture returns accurate, bounded, session-scoped statistics.

---

## Phase 7: User Story 5 — Run ready-made capture examples (Priority: P5)

**Goal**: Runnable example scripts demonstrate the sniffer end-to-end without writing code: a hardware-free mock capture and a GS_USB capture with configurable duration.

**Independent Test**: Run the mock capture example on a machine with no hardware and assert it completes, prints statistics, and exits cleanly; the GS_USB example is structurally validated (imports, args, lifecycle) and runnable when hardware is present; neither depends on the Desktop Agent, backend, or frontend.

### Tests for User Story 5

- [X] T022 [P] [US5] Write example tests in `can_usb_adapter/tests/test_capture_examples.py` (mock example runs, prints statistics, exits 0; GS_USB example imports resolve and CLI args parse without hardware) — write FIRST, must FAIL before T023/T024

### Implementation for User Story 5

- [X] T023 [P] [US5] Create mock capture example in `can_usb_adapter/examples/capture_mock.py` (open a `CaptureSession` on `MockDriver`, start, stop, print statistics, exit cleanly; no hardware; uses only the public `prioracan` API; no Desktop Agent/backend/frontend)
- [X] T024 [P] [US5] Create GS_USB capture example in `can_usb_adapter/examples/capture_gs_usb.py` (open `GsUsbDriver` with `CanUsbConfig`, configurable `--duration` CLI arg, helper-thread stop so `stop()` is bounded, save a JSONL log, print a summary, release the device; uses only the public `prioracan` API; no Desktop Agent/backend/frontend)
- [X] T025 [US5] Extend `can_usb_adapter/examples/README.md` with usage and expected output for both examples

**Checkpoint**: The sniffer is immediately usable and demonstrable via shipped examples.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: GS_USB virtual-bus integration validation, documentation, strengthened guards, and the full regression/coverage/quickstart gates.

- [X] T026 [P] Perform GS_USB virtual-bus validation by writing `can_usb_adapter/tests/test_capture_gs_usb.py` (python-can `"virtual"` bus: capture counts + valid JSONL output; bounded shutdown on an idle bus within `stop_timeout_seconds`; disconnect mid-capture surfaces `CanConnectionError` + cleanup with no raw python-can/libusb leak; no real hardware in CI). Cross-cutting integration serving US1/US2 — depends on US3 (logging) + US4 (statistics).
- [X] T027 Update `can_usb_adapter/README.md` with the CAN Sniffer overview, the `CaptureSession` API (`start`/`stop`/`is_running`/`statistics`, context-manager usage), the CREATED→STARTING→RUNNING→STOPPING→STOPPED→DISPOSED lifecycle diagram, mock + GS_USB examples, logger usage, expected output, and a troubleshooting table (FR-024)
- [X] T028 [P] Add docstrings to all new public surface in `can_usb_adapter/src/prioracan/session.py` and `can_usb_adapter/src/prioracan/statistics.py` (`CaptureSession.start`/`stop`/`is_running`/`statistics`/`__enter__`/`__exit__`, `CaptureStatistics` and its fields)
- [X] T029 Strengthen static guards in `can_usb_adapter/tests/test_static_guards.py`: assert `CaptureStatistics` is NOT in `prioracan.__all__`; `CaptureSession` has no `stream`/`run`/`iter_frames`/`receive` method; NO new error subclass was added to `can_usb_adapter/src/prioracan/errors.py`; `ConnectionService` public method set is unchanged; no bus-statistics fields on `CaptureStatistics`; no modifications outside `can_usb_adapter/` and `specs/021-can-sniffer-mvp/`
- [X] T030 Run full regression: the entire Feature 020 suite UNMODIFIED plus all Feature 021 tests pass on a machine with no USB-CAN adapter and no external file path; coverage ≥ 90% on `can_usb_adapter/src/prioracan/session.py`, `can_usb_adapter/src/prioracan/statistics.py`, and the new capture test targets (FR-022/FR-023)
- [X] T031 Run `specs/021-can-sniffer-mvp/quickstart.md` validation: every code snippet executes as documented on the mock path, and documented `from prioracan import …` names are within `prioracan.__all__` (docs-smoke)

**Checkpoint**: Production-quality, documented, guarded, and fully regressed — ready for release.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **US1 (Phase 3, P1)**: Depends on Foundational — the MVP
- **US2 (Phase 4, P2)**: Depends on US1 (validates the US1 loop on the mock path)
- **US3 (Phase 5, P3)**: Depends on US1 (loop); wires the `_dispatch` stub
- **US4 (Phase 6, P4)**: Depends on US1 (loop); T020 also integrates with US3 dispatch (partial statistics on logger failure)
- **US5 (Phase 7, P5)**: Depends on US1–US4 (examples use logging + statistics)
- **Polish (Phase 8)**: T026 depends on US3 + US4; T027 depends on US5; T029 depends on US4; T030/T031 depend on all stories

### User Story Dependencies

- **US1 (P1)**: Starts after Foundational — no dependencies on other stories
- **US2 (P2)**: Starts after US1 — independently testable on the mock path (no dependency on US3/US4)
- **US3 (P3)**: Starts after US1 — independently testable (logging on the mock loop)
- **US4 (P4)**: Starts after US1 — independently testable; its partial-statistics-on-failure behavior re-uses US3's policy path
- **US5 (P5)**: Starts after US1–US4 — examples exercise the full pipeline

### Within Each User Story

- Tests are written FIRST and must FAIL before implementation (TDD)
- Models/data classes before the services that use them
- Capture-loop core before integration concerns
- Story complete (checkpoint green) before moving to the next priority

### Parallel Opportunities

- T001 ∥ T002 (Setup)
- T003 may be written in parallel with T001/T002 (separate file)
- T006 (US1 test) ∥ T011 (US2 test) ∥ T013/T014 (US3 tests) ∥ T018 (US4 test) ∥ T022 (US5 test) — all separate test files, writable concurrently once Foundational is done
- T019 (`statistics.py`) ∥ T018 (its test)
- T023 (mock example) ∥ T024 (GS_USB example) — separate files
- T026 (GS_USB validation) ∥ T028 (docstrings) ∥ T029 (guards) — separate files in Polish

---

## Parallel Example: User Story 1

```bash
# Once Foundational is complete, write the US1 test while US2/US3 test authors work in parallel:
Task: "Write capture loop + cancellation tests in can_usb_adapter/tests/test_capture_loop.py"
# Then implement sequentially on session.py (same file — no parallelism):
Task: "Implement capture loop in can_usb_adapter/src/prioracan/session.py"
Task: "Implement bounded cancellation in can_usb_adapter/src/prioracan/session.py"
# Refine the GS_USB driver in parallel (different file):
Task: "Refine GsUsbDriver.iter_frames in can_usb_adapter/src/prioracan/drivers/gs_usb.py"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 (mock capture start/run/stop + cancellation)
4. **STOP and VALIDATE**: `test_capture_session_runtime.py` + `test_capture_loop.py` green; Feature 020 regression green — the sniffer captures on the mock path

### Incremental Delivery

1. Setup + Foundational → `CaptureSession` runtime skeleton with state machine
2. + US1 → mock capture works (MVP)
3. + US2 → hardware-free validation + multi-instance
4. + US3 → logging + failure policy (pipeline persists to disk)
5. + US4 → bounded statistics
6. + US5 → runnable examples
7. + Polish → GS_USB virtual-bus validation, docs, guards, full regression/coverage

### Parallel Team Strategy

With multiple developers after Foundational:
- Developer A: US1 (capture loop + cancellation)
- Developer B: US3 (logging) — can start once US1 loop lands
- Developer C: US4 (statistics) + US2 (mock edge/multi-instance tests)
- Then US5 examples and Polish converge

---

## Notes

- [P] tasks = different files, no dependency on an incomplete task
- [Story] label maps a task to its user story for traceability
- Every user story is independently completable and testable on the mock path
- Write tests first; verify they FAIL before implementing
- Commit after each task or logical group (git commands suggested by the agent; human executes them)
- Stop at any checkpoint to validate a story independently
- Avoid: vague tasks, same-file parallel conflicts, cross-story dependencies that break independence
- Hard locks (must hold throughout): `prioracan.__all__` unchanged (21 names); `ConnectionService` method set unchanged; `CaptureSession` constructor + `mark_end` unchanged; no new error subclass in `errors.py`; no `lifecycle.py` module; no public `dispose()`; no transmit/ISO-TP/UDS/DBC/replay/filtering/bus-statistics; no changes outside `can_usb_adapter/` and `specs/021-can-sniffer-mvp/`
