# Feature Specification: CAN Sniffer MVP

**Feature Branch**: `021-can-sniffer-mvp`

**Created**: 2026-06-30

**Status**: Draft (revised 2026-06-30 — final architectural refinement: implementation-independent driver consumption, active runtime object, compose-on-top extensibility)

**Input**: User description: "CAN Sniffer MVP — transform the Feature 020 CAN USB Adapter Foundation into a functional CAN sniffer capable of receiving raw CAN frames and recording them. Build the first real capture capability on top of the existing `prioracan` library (GS_USB driver, PythonCanAdapter, MockDriver, ConnectionService, JsonlLogger, AscLogger, CanFrame model) without changing its architecture. Deliver a capture lifecycle (start/stop/cleanup/safe shutdown), continuous frame reception, optional multi-logger recording, capture statistics, MockDriver and GS_USB support, example scripts, tests, and documentation. Still part of the `prioracan` library — no Desktop Agent, backend, or frontend integration. No transmission, ISO-TP, UDS, DBC decoding, replay, filtering, or AI analysis."

## User Scenarios & Testing *(mandatory)*

The "users" of this feature are the PrioraScan engineers and downstream feature modules that consume the `prioracan` library. The vehicle driver is **not** a direct user of this feature; they benefit only later, once capture is integrated into product features. This feature is an **isolated engineering capability** tracked in the SpecKit workflow but understood to sit **outside the documented PrioraScan product roadmap** — it is a parallel capability track, not a product feature, exactly like Feature 020.

### User Story 1 - Start, run, and stop a live CAN capture session (Priority: P1)

An engineer opens a `CaptureSession` on a connected USB-CAN adapter (GS_USB / candleLight being the first supported family), and the session continuously receives raw CAN frames on the engineer's behalf until they stop it. `CaptureSession` is the **single lifecycle owner**: it holds the driver reference, the logger collection, the capture lifecycle, the session state, the statistics, the cleanup, and the cancellation. It exposes a clean runtime API — `start()`, `stop()`, an `is_running` flag, and `statistics` — and may also be used as a context-managed lifecycle so that resources are released on exit. The session starts cleanly, runs a long-running receive loop, stops gracefully on request, and releases all resources on shutdown — including automatic cleanup if the engineer forgets to stop it or the process is interrupted. Every received frame is represented by the existing `CanFrame` model and carries timestamp, arbitration id, data, DLC, direction (RX/TX), extended flag, and remote-frame flag (where available). The engineer never touches the underlying CAN stack, USB, or adapter-library objects directly, and low-level failures are surfaced as clear domain errors. No transmission occurs — the sniffer only listens. There is no separate orchestration component wrapping the session; downstream modules interact directly with `CaptureSession`.

**Why this priority**: This is the single capability the feature exists to deliver. Logging, statistics, mocking, and examples all exist to make this capture useful, testable, and demonstrable. Without a working start/run/stop capture lifecycle owned by one object, the sniffer has no value.

**Independent Test**: Can be fully tested without real hardware by substituting the mock driver, which deterministically produces a known frame stream; the test asserts that the session starts, yields the expected frames in order, stops on request, transitions through the documented lifecycle states, and releases the driver without leaking resources.

**Acceptance Scenarios**:

1. **Given** a supported USB-CAN adapter is connected and configured, **When** the engineer starts a `CaptureSession`, **Then** the session enters the RUNNING state and begins receiving raw CAN frames continuously until stopped.
2. **Given** a `CaptureSession` is running, **When** the engineer calls `stop()`, **Then** the session stops receiving within a bounded time, transitions through STOPPING to STOPPED, and releases the driver and any open loggers cleanly.
3. **Given** a `CaptureSession` is running and the engineer does not explicitly stop it, **When** the process is interrupted or the session is used as a context manager that exits, **Then** automatic cleanup runs and the driver is disconnected and loggers closed without leaking resources or raising raw low-level exceptions.
4. **Given** the adapter is missing, denied, or mis-configured, **When** the engineer tries to start a capture, **Then** a specific domain error identifies the failure class rather than a raw python-can, libusb, or USB exception, and the session is left in a non-running state with no leaked resources.
5. **Given** any running capture, **When** the engineer inspects the session, **Then** `is_running` and the underlying driver status (disconnected / connected / listening / error) are reported without exposing internal objects.

---

### User Story 2 - Develop, test, and demo the sniffer without real hardware (Priority: P2)

An engineer builds, tests, and demonstrates the entire capture workflow on a laptop with no USB-CAN adapter attached. They use the existing mock driver, which generates a deterministic stream of CAN frames so that every capture run is repeatable, fast, and hardware-free. The mock produces a known, ordered set of frames (optionally including realistic frames sourced from a sanitized sample fixture), exercises the empty-bus/no-frame case, and reaches a natural end so the capture loop terminates cleanly. No unit test depends on real hardware or on a specific external local file path.

**Why this priority**: Hardware-free testability is what makes the sniffer safe to build on, run in continuous integration, and demonstrate to stakeholders. It is the foundation for every other story's tests.

**Independent Test**: Run the full sniffer test suite on a machine with no USB-CAN adapter and no external trace file; the mock-driven capture tests, statistics tests, logging tests, lifecycle-state tests, and cleanup tests all pass deterministically.

**Acceptance Scenarios**:

1. **Given** the mock driver is configured with a deterministic frame stream, **When** the engineer runs a `CaptureSession` to completion, **Then** the captured frames match the supplied stream in order and content, and the run is identical across repeated executions.
2. **Given** the mock driver supplies no frames (empty bus), **When** the engineer runs a capture, **Then** the session handles the no-frame condition gracefully (timeout/end) without hanging or raising a raw low-level error.
3. **Given** the full sniffer test suite, **When** it runs on a machine with no USB-CAN adapter, **Then** every test passes deterministically without requiring any external local file path.

---

### User Story 3 - Record captured frames to one or more loggers (Priority: P3)

An engineer wants every frame received during a capture session to be recorded to disk for offline analysis, sharing, or later replay development. The `CaptureSession` forwards each received frame to one or more configured loggers — the existing JSONL logger (fully supported, simple, stable, test-friendly) and the existing ASC logger (same interface). Logging is optional: if no logger is configured, capture still works and frames are still counted. A capture may use multiple loggers at once (for example, JSONL plus ASC). Logging must not complicate the driver architecture or the frame model. If any configured logger fails mid-capture, the session follows a single defined policy: it stops the capture gracefully, surfaces a logging domain error, flushes and closes the remaining loggers, releases the driver, and returns partial statistics accumulated up to the failure.

**Why this priority**: Logging is what turns a live listener into a useful, persistable engineering asset. It is foundational but secondary to the capture lifecycle itself, so it sits at P3.

**Independent Test**: Receive a known set of frames via the mock driver through a `CaptureSession` with one or more loggers enabled, and assert that each logger receives exactly one record per frame with the expected content; then run the same capture with no loggers and assert capture still succeeds and statistics still count frames; then inject a failing logger and assert the defined failure policy executes.

**Acceptance Scenarios**:

1. **Given** one or more loggers are configured and a capture is running, **When** each frame is received, **Then** every configured logger receives exactly one record per frame.
2. **Given** the JSONL logger is enabled, **When** a capture is written, **Then** each frame corresponds to exactly one valid, independently parseable JSONL record containing timestamp, channel/bus, direction, arbitration id (numeric and hex), DLC, payload serialized as hex text, and frame flags.
3. **Given** no logger is configured, **When** a capture is run, **Then** capture still works, frames are still received and counted, and the session completes normally.
4. **Given** a logger fails partway through a capture, **When** the failure occurs, **Then** the session stops gracefully, raises a logging domain error, flushes and closes the remaining loggers, releases the driver, and returns partial statistics — without corrupting already-written records and without leaving the session in a running state.

---

### User Story 4 - Get capture statistics at the end of a session (Priority: P4)

At the end of a capture session, the engineer wants a clear summary of what was captured: capture start time, capture end time, duration, total frames, RX frames, TX frames, dropped frames (where detectable), and average frame rate. These statistics are computed by the session as it runs and returned to the engineer when capture stops. Statistics are accurate for both mock and hardware captures and do not require the engineer to instrument the frame stream themselves. The statistics model is intentionally limited to these per-capture counters; bus-level analytics (utilization, arbitration histograms, bitrate estimation, protocol/message-frequency analysis) are explicitly excluded and belong to future Bus Statistics features.

**Why this priority**: Statistics make a capture session interpretable and verifiable — the engineer can confirm the sniffer actually recorded what was on the bus. Useful but secondary to receiving and logging frames, so it sits at P4.

**Independent Test**: Run a mock capture with a known frame set containing a known RX/TX mix, stop it, and assert the returned statistics match the expected counts, duration, and average frame rate within tolerance.

**Acceptance Scenarios**:

1. **Given** a `CaptureSession` has run and captured a known set of frames, **When** the engineer requests the statistics after stopping, **Then** the returned summary includes start time, end time, duration, total frames, RX frames, TX frames, dropped frames (where detectable), and average frame rate, all consistent with the captured stream.
2. **Given** a `CaptureSession` that captured no frames, **When** the engineer requests the statistics, **Then** the summary reports zero total frames and a safe (non-divergent) average frame rate rather than an error.
3. **Given** repeated `CaptureSession` instances on the same driver, **When** each session is stopped and its statistics returned, **Then** the statistics of one session do not bleed into the next.

---

### User Story 5 - Run ready-made capture examples (Priority: P5)

An engineer wants runnable example scripts that demonstrate the sniffer end-to-end without writing code. A mock capture example opens a `CaptureSession`, records several frames, stops, and prints statistics — requiring no hardware. A GS_USB capture example opens a real adapter, captures for a configurable duration, saves a JSONL log, and prints a summary. Neither example requires the Desktop Agent, backend, or frontend.

**Why this priority**: Examples make the capability immediately usable and demonstrable. They are the least critical to the core capability but valuable for adoption and onboarding, so they sit at P5.

**Independent Test**: Run the mock capture example on a machine with no hardware and assert it completes, prints statistics, and exits cleanly; the GS_USB example is structurally validated (imports, argument handling, lifecycle) and runnable when hardware is present.

**Acceptance Scenarios**:

1. **Given** a machine with no USB-CAN adapter, **When** the engineer runs the mock capture example, **Then** it opens a `CaptureSession`, records several frames, stops, and prints a statistics summary, then exits cleanly.
2. **Given** a supported USB-CAN adapter is connected, **When** the engineer runs the GS_USB capture example with a configurable duration, **Then** it opens the adapter, captures for the requested duration, saves a JSONL log, prints a summary, and releases the device.
3. **Given** either example, **When** it runs, **Then** it does not import or depend on the Desktop Agent, backend, or frontend.

---

### Edge Cases

- **Empty capture**: A session that receives zero frames must stop cleanly and return valid statistics (zero totals, non-divergent average rate) rather than error or hang.
- **Immediate stop**: A session stopped immediately after starting (before any frame arrives) must release resources cleanly and return valid empty statistics.
- **stop() before start()**: Calling `stop()` on a session that was never started must be a safe no-op that returns zero statistics and does not raise.
- **Repeated stop()**: Calling `stop()` on an already-stopped session must be idempotent and must not raise or re-run cleanup.
- **Double start()**: Calling `start()` on a session that is already running or has already run must be rejected (a session instance is single-use; repeated captures use new `CaptureSession` instances).
- **No loggers configured**: Capture must work and count frames when no loggers are present.
- **Multiple loggers, one fails**: If one logger among several fails, the defined logger-failure policy runs (stop gracefully, surface logging domain error, flush and close remaining loggers, release driver, return partial statistics) — the other loggers' already-written records are not corrupted.
- **Driver disconnect mid-capture**: If the adapter is removed or the driver disconnects while the capture loop is running, the session must surface a connection domain error, stop the loop, and release resources — not crash with a raw USB/library exception.
- **Interrupted process / abandoned session**: If the process is interrupted or the engineer forgets to stop the session, automatic cleanup (via context-manager exit or equivalent finally semantics) must disconnect the driver and close loggers without leaking resources.
- **Blocking receive during shutdown**: A blocking receive operation must not prevent shutdown forever; stop must complete within a bounded time even while a receive is in progress.
- **RX/TX counting**: Frames marked RX and TX (where TX can appear from the underlying stack, e.g. loopback/echo) must be counted separately; the sniffer itself does not transmit, so any TX frames observed are passively heard, not sent by this feature.
- **Remote and error frames**: Remote frames (no payload) and error frames must be capturable and counted without breaking the loop or statistics.
- **Standard vs. extended IDs and DLC/payload mismatch**: Frames with 11-bit standard or 29-bit extended IDs must both be captured and flagged correctly; invalid frames from the underlying stack must be handled per the existing `CanFrame` validation rules without crashing the loop.
- **High frame rate / backpressure**: Under high frame rates, the capture loop must continue to receive and count frames; if frames are dropped because the consumer cannot keep up, dropped frames must be counted where detectable and surfaced in statistics rather than silently lost.
- **Long-running capture**: A capture that runs for an extended period must remain stable (no unbounded memory growth from retained frames beyond what statistics require, no state drift) until stopped.
- **Mock stream exhaustion**: When the mock driver's frame stream is exhausted, the capture loop must terminate or enter a defined empty-bus behavior rather than spin indefinitely.
- **Disposed session reuse**: Any operation on a DISPOSED session must raise a domain error rather than silently doing nothing or touching released resources.

## Requirements *(mandatory)*

### Functional Requirements

#### Capture ownership and architecture

- **FR-001**: The library MUST provide a capture capability that starts a capture, continuously receives raw CAN frames from the active driver, forwards frames to configured loggers, and stops gracefully — transforming the Feature 020 foundation into a functional CAN sniffer. `CaptureSession` MUST be the single lifecycle owner; no other component may own the capture loop or the lifecycle.
- **FR-002**: `CaptureSession` MUST be the central runtime abstraction and an **active runtime object**, not merely a data model. It MUST own runtime behavior, the capture lifecycle, resource management, streaming, and statistics — specifically: the driver reference, the logger collection, the capture lifecycle, the session state, the statistics, the cleanup, and the cancellation. It MUST expose a clean public API — at minimum `start()`, `stop()`, an `is_running` flag, and `statistics` — and MAY support a context-managed lifecycle (`with CaptureSession(...) as session:`) so that resources are released on exit. Downstream modules MUST interact directly with `CaptureSession`; the library MUST NOT introduce a separate orchestration component whose only purpose is to own the capture loop. The implementation MAY internally use helper classes to structure the capture loop, statistics, or cleanup, but `CaptureSession` MUST remain the **only public lifecycle abstraction**; no such helper may be exposed as a peer public lifecycle owner.
- **FR-003**: The existing `ConnectionService` MUST NOT own streaming logic and MUST NOT be the capture orchestrator. To preserve backward compatibility (FR-019) while removing the architectural overlap, `ConnectionService` MUST be reduced to a thin backward-compatibility wrapper that delegates to `CaptureSession` for any capture/streaming concern. It MUST NOT contain a long-running receive loop. The architecture MUST have exactly one lifecycle owner (`CaptureSession`) and MUST NOT contain duplicated orchestration layers.
- **FR-004**: The layered architecture MUST be:

  `CaptureSession` → `CanDriver` → `GsUsbDriver` / `MockDriver` → `PythonCanAdapter` → `python-can` → USB driver → CAN hardware.

  `CaptureSession` sits directly above the `CanDriver` abstraction. There is no intermediate orchestration layer between `CaptureSession` and `CanDriver`.

#### Capture lifecycle

- **FR-005**: The capture lifecycle MUST be explicitly defined as a state machine with the following states: **CREATED → STARTING → RUNNING → STOPPING → STOPPED → DISPOSED**.
  - **CREATED**: session constructed, not started. Resources not yet acquired.
  - **STARTING**: start requested; driver being connected and loggers being opened.
  - **RUNNING**: receive loop active; frames being received, dispatched, and counted.
  - **STOPPING**: stop requested or termination triggered; receive loop draining and resources being released.
  - **STOPPED**: cleanup complete; resources released; statistics finalized. Terminal for this instance (no restart).
  - **DISPOSED**: object fully released and unusable; any further operation raises a domain error.
- **FR-006**: The following state transitions MUST be valid:
  - CREATED → STARTING (start requested)
  - STARTING → RUNNING (start succeeded)
  - STARTING → STOPPED (start failed; cleanup ran; failure surfaced as a domain error)
  - RUNNING → STOPPING (stop requested, OR driver disconnect detected, OR a logger failed, OR the process/session was interrupted)
  - STOPPING → STOPPED (cleanup completed)
  - STOPPED → DISPOSED (explicit dispose / context-manager exit)
  - CREATED → DISPOSED (disposed without ever starting)
  All other transitions MUST be invalid and MUST be rejected with a domain error (not a low-level exception).

- **FR-007**: The following lifecycle behaviors MUST hold:
  - **stop() before start()** (from CREATED) is a safe no-op that returns zero statistics and does not raise.
  - **Repeated stop()** (from STOPPED) is idempotent; it does not raise and does not re-run cleanup.
  - **Double start()** (from STARTING/RUNNING/STOPPED) is rejected with a domain error; a `CaptureSession` instance is single-use, and repeated captures MUST create new `CaptureSession` instances.
  - **Automatic cleanup**: when a running session is abandoned or the process is interrupted, cleanup MUST execute (driver disconnected, loggers flushed and closed) via context-manager exit or equivalent finally semantics, without leaking resources.
  - **Any operation on a DISPOSED session** MUST raise a domain error.

#### Cancellation

- **FR-008**: The capture MUST be cancellable via `stop()`. Cancellation MUST be deterministic: once `stop()` is requested, the receive loop MUST terminate and cleanup MUST complete within a bounded amount of time (a configurable stop timeout with a sane default). A blocking receive operation MUST NOT prevent shutdown forever — the underlying driver receive timeout MUST be bounded so the loop observes the stop request. Cleanup MUST always execute regardless of how the session terminates (normal stop, error, disconnect, logger failure, or interrupt). The specification does NOT require any specific threading model and does NOT require async; the implementation MAY choose any mechanism that satisfies the bounded, deterministic cancellation behavior above.

#### Frame reception

- **FR-009**: Each received frame MUST be represented by the existing `CanFrame` model and MUST carry timestamp, arbitration id, data, DLC, direction (RX/TX), extended flag, and remote-frame flag (where available). The capture capability MUST NOT alter the `CanFrame` model's core shape or validation rules.

- **FR-009a (Implementation-independent driver consumption)**: `CaptureSession` MUST consume frames from the `CanDriver` abstraction **without assuming how the driver internally produces them**. The `CanDriver` abstraction MUST be future-proof enough to allow a concrete driver to expose frames via any one of: a bounded receive operation, a frame iterator, or another implementation-independent streaming mechanism — whichever suits that driver. `CaptureSession` MUST NOT be tightly coupled to a polling-style `receive_frame()` loop as the only supported model. The abstraction MUST remain usable, without changes to `CaptureSession` or `CanFrame`, for present and future drivers including GS_USB, SocketCAN, PCAN, Vector, Kvaser, Serial CAN, MCP2515, and a future `ReplayDriver`. The specification does NOT prescribe generators, async, callbacks, or any specific polling/streaming strategy; only the observable contract (frames arrive as validated `CanFrame` instances within a bounded time, stoppable per FR-008) is normative.

#### Logging

- **FR-010**: `CaptureSession` MUST forward every received frame to one or more configured loggers. It MUST support the existing JSONL and ASC loggers behind their existing interface, and MUST allow multiple loggers to be active at once. Logging MUST be optional: if no logger is configured, capture MUST still work, frames MUST still be received and counted, and the session MUST complete normally.

- **FR-011 (Logger Failure Policy)**: If any configured logger fails during a capture, the session MUST apply this single required behavior, leaving nothing implementation-defined:
  1. stop the capture session gracefully (transition to STOPPING → STOPPED),
  2. surface a logging domain error,
  3. flush and close the remaining (non-failed) loggers,
  4. release the driver,
  5. return partial statistics accumulated up to the point of failure.
  Already-written records of the failed logger MUST NOT be corrupted where possible, and the session MUST NOT be left in a running state.

#### Statistics

- **FR-012**: `CaptureSession` MUST maintain and return a `CaptureStatistics` summary covering exactly: capture start time, capture end time, duration, total frames, RX frames, TX frames, dropped frames (where detectable), and average frame rate. Statistics MUST be returned when capture stops and MUST be accurate for both mock and hardware captures. Statistics for an empty capture MUST report zero totals and a safe, non-divergent average frame rate rather than raising an error.
- **FR-013**: `CaptureStatistics` MUST be scoped to a single capture session; repeated `CaptureSession` instances on the same driver MUST NOT bleed state, counts, or resources from one session into the next.
- **FR-014**: `CaptureStatistics` MUST be intentionally limited to the per-capture counters in FR-012. It MUST NOT include bus utilization, arbitration-ID histograms, bitrate estimation, protocol analysis, or message-frequency analysis. Those belong to future Bus Statistics features and are explicitly out of scope.

#### CaptureSession responsibility protection

- **FR-015**: `CaptureSession` is the final layer responsible for raw CAN frame streaming. Its responsibilities MUST be limited to: receiving frames, maintaining the lifecycle, updating statistics, dispatching frames to loggers, and performing cleanup. `CaptureSession` MUST NEVER become responsible for: replay, filtering, ISO-TP, UDS, DBC decoding, protocol parsing, business logic, or Desktop Agent / backend / frontend communication. Future layers MUST consume frames produced by `CaptureSession` instead of extending its responsibilities.

> **Architectural Note — Compose-on-top extensibility (Single Responsibility Protection)**: Over the lifetime of the project, future capabilities MUST extend the system by **composing on top of `CaptureSession`**, never by embedding additional behavior inside it. Replay, frame filters, bus statistics, ISO-TP, UDS, DBC decoding, and Desktop Agent / PrioraScan integration are all **consumers** of the frame stream that `CaptureSession` produces; they sit above or beside it as separate layers/components and read frames from it (or from its recorded output). `CaptureSession`'s responsibility set is frozen by FR-015 and MUST NOT grow as these features are added. This protects the Single Responsibility Principle and keeps `CaptureSession` a stable streaming foundation that future features can rely on without modifying.

> **Architectural Note — Implementation Freedom**: This specification prescribes only **observable behavior** (lifecycle states and transitions, bounded deterministic cancellation, statistics content, logger-failure policy, layer constraints). It does NOT prescribe threads, asyncio, generators, callbacks, or any specific polling/streaming strategy. The implementation is free to choose the most appropriate internal mechanism — synchronous polling, iterator-based, event-driven, threaded, or async — provided every functional and lifecycle requirement in this specification is satisfied.

#### Mock and GS_USB support

- **FR-016**: The entire capture workflow MUST operate using the existing mock driver. The mock driver MUST generate a deterministic frame stream that enables repeatable, hardware-free testing and demos, and MUST reach a defined end or empty-bus behavior so the capture loop terminates cleanly without real hardware.
- **FR-017**: The capture workflow MUST support live capture from GS_USB adapters: open the device, receive frames, stop safely, and release resources. No transmission functionality is required in this feature; the sniffer is receive-only.

#### Examples

- **FR-018**: The library MUST ship example scripts demonstrating: (a) a mock capture that opens a `CaptureSession`, records several frames, stops, and prints statistics; and (b) a GS_USB capture that opens an adapter, captures for a configurable duration, saves a JSONL log, and prints a summary. Examples MUST NOT require the Desktop Agent, backend, or frontend.

#### Architecture constraints

- **FR-019 (Backward Compatibility)**: This feature MUST remain fully compatible with Feature 020. All changes MUST be additive. The library MUST NOT break: `CanFrame`, `CanDriver`, `DriverStatus`, `DriverCapabilities`, `CanUsbConfig`, the existing loggers (JSONL, ASC), `MockDriver`, `GsUsbDriver`, the existing domain error taxonomy, or the existing public exports. `ConnectionService` MUST remain importable and usable as a thin compatibility wrapper (FR-003); its existing public method signatures MUST NOT be removed.

- **FR-020 (Architecture Guard retained)**: The Feature 020 guard ensuring only `PythonCanAdapter` imports `python-can` MUST be retained and MUST still pass. No new module may import `python-can` except `PythonCanAdapter`.

- **FR-021 (Layer Constraints)**: The following architectural constraints MUST hold:
  - Only `PythonCanAdapter` MAY import `python-can`.
  - Drivers communicate with upper layers ONLY through the `CanDriver` abstraction.
  - `CaptureSession` depends ONLY on `CanDriver` (and on `CanFrame`, `CanUsbConfig`, and the logger interface); it MUST NOT depend on concrete driver implementations or hardware details.
  - Loggers depend ONLY on `CanFrame` (and the logger interface); they MUST NOT depend on drivers or hardware.
  - No layer MAY bypass the `CanDriver` abstraction to reach the underlying CAN stack, USB, or adapter-library objects.
  - No circular dependencies MAY be introduced.
  - No module outside the adapter layer (`PythonCanAdapter` and its drivers) MAY reference USB, libusb, or `python-can` objects, types, or exceptions directly; such low-level concerns MUST be mapped onto the PrioraCAN domain error taxonomy before crossing the abstraction boundary.

#### Tests and documentation

- **FR-022**: The library MUST ship a comprehensive test suite that runs entirely without real hardware and deterministically covers: capture start, capture stop, empty capture, capture with mock frames, logger integration, multiple-logger support, the logger-failure policy (FR-011), statistics calculation, repeated capture sessions, resource cleanup, driver disconnect mid-capture, graceful shutdown, lifecycle state transitions (FR-005/FR-006), stop-before-start, repeated stop, and double-start rejection. Tests MUST NOT depend on a specific external local file path; any fixture data MUST be bundled within the library tree.

- **FR-023**: The library MUST maintain at least 90% test coverage for the new capture code, consistent with the Feature 020 quality bar.

- **FR-024**: The library README MUST be updated with a CAN Sniffer overview, the `CaptureSession` API, a mock capture example, a GS_USB capture example, logger usage, expected output, the capture lifecycle state machine, and troubleshooting. All new public APIs MUST be documented with clear docstrings.

#### Scope and non-goals

- **FR-025**: This feature MUST NOT add Desktop Agent integration, PrioraScan backend integration, or frontend integration. It MUST NOT implement ISO-TP, UDS, DBC decoding, CAN transmission, a replay engine, frame filtering, or AI analysis — those are explicitly deferred to later features. It MUST NOT modify the existing ELM327 adapter or any module outside the `prioracan` library and its spec. The feature's sole responsibility is to establish the first real raw CAN streaming capability and a stable streaming foundation that prepares the architecture for those future capabilities without implementing them.

- **FR-026**: The sniffer MUST remain receive-only. The capture capability MUST NOT expose any transmit or write method. TX frames may be passively observed and counted (e.g. bus echo/loopback) but are never sent by this feature.

### Key Entities *(include if feature involves data)*

- **CaptureSession (central abstraction, active runtime object)**: The primary public runtime object and the single lifecycle owner — an **active runtime object** that owns runtime behavior, lifecycle, resource management, streaming, and statistics (not merely a data model). Owns the driver reference, the logger collection, the capture lifecycle, the session state, the statistics, the cleanup, and the cancellation. Exposes `start()`, `stop()`, `is_running`, and `statistics`, and supports a context-managed lifecycle. Implements the CREATED → STARTING → RUNNING → STOPPING → STOPPED → DISPOSED state machine. The implementation MAY use internal helper classes to structure the loop, statistics, or cleanup, but `CaptureSession` is the **only public lifecycle abstraction**. Responsibilities are strictly limited to receiving frames, maintaining the lifecycle, updating statistics, dispatching frames to loggers, and performing cleanup (FR-015); future capabilities compose on top of it rather than extend it. Depends only on `CanDriver`, `CanFrame`, `CanUsbConfig`, and the logger interface, and consumes frames from `CanDriver` without assuming how the driver produces them (FR-009a). Relationships: composes one `CanDriver`, zero or more loggers, and one `CaptureStatistics`; sits directly above `CanDriver` with no intermediate orchestration layer.
- **CaptureStatistics (new, bounded)**: The summary record returned at the end of a capture. Attributes: start time, end time, duration, total frames, RX frames, TX frames, dropped frames (where detectable), average frame rate. Intentionally limited to these per-capture counters; explicitly excludes bus utilization, arbitration histograms, bitrate estimation, protocol analysis, and message-frequency analysis. Computed by `CaptureSession` as it runs and scoped to a single session. Relationships: produced by `CaptureSession`, returned to the consumer on stop.
- **CanFrame (existing, unchanged core)**: The immutable record describing one received CAN frame. Carries timestamp, channel/bus, direction (RX/TX), arbitration id (with derived hex), extended/remote/error flags, DLC, payload (with derived spaced hex), optional bitrate. Its core shape and validation are unchanged by this feature. Relationships: produced by drivers, consumed by `CaptureSession` and loggers.
- **CanDriver (abstraction, existing, future-proof)**: The generic, vendor-independent contract all drivers implement. Exposes connect, disconnect, status, and a frame-producing mechanism that may be a bounded receive operation, a frame iterator, or another implementation-independent streaming mechanism — the choice belongs to the concrete driver, not to `CaptureSession`. The only normative contract is that frames arrive as validated `CanFrame` instances within a bounded time and that streaming is stoppable. Designed so present and future drivers (GS_USB, SocketCAN, PCAN, Vector, Kvaser, Serial CAN, MCP2515, and a future `ReplayDriver`) can be added without changing `CaptureSession`, `CanFrame`, or this contract. Relationships: implemented by GS_USB and mock drivers; consumed by `CaptureSession` (and by the `ConnectionService` compatibility wrapper) without coupling to how a driver produces frames.
- **MockDriver (existing, extended for streaming)**: The hardware-free driver. Generates a deterministic frame stream that enables repeatable capture testing and demos, and reaches a defined end / empty-bus behavior. Relationships: implements `CanDriver`; used by capture tests and the mock example.
- **GS_USB Driver (existing)**: The first concrete hardware driver. Supports live receive for capture: open device, receive frames, stop safely, release resources. No transmit. Relationships: implements `CanDriver`; used by the GS_USB capture example and live capture.
- **Frame Loggers (existing)**: JSONL (fully supported) and ASC (same interface) loggers. Receive one record per frame from `CaptureSession`. Optional; zero or more may be configured. Depend only on `CanFrame`. Relationships: receive `CanFrame` instances from `CaptureSession`.
- **ConnectionService (existing, reduced to compatibility wrapper)**: Preserved for backward compatibility as a thin wrapper that delegates capture/streaming concerns to `CaptureSession`. It does NOT own the streaming loop and is NOT the capture orchestrator. Its existing public method signatures are preserved. Relationships: delegates to `CaptureSession`; no longer a peer orchestrator.
- **CanUsbConfig (existing, unchanged)**: The configuration for a capture session (interface, channel, bitrate, receive timeout, optional log directory, per-format enable flags). Reused unchanged by `CaptureSession`.
- **DriverStatus / DriverCapabilities (existing, unchanged)**: First-class status and capability models reported by every driver. Reused unchanged; surfaced by `CaptureSession` via the driver.
- **Domain Error Taxonomy (existing)**: The named errors (base adapter error; driver-not-found; device-not-found; permission; configuration; connection; receive-timeout; logging) that replace raw underlying python-can/libusb/USB exceptions throughout the library, including `CaptureSession` and the lifecycle/cancellation/logger-failure paths.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An engineer can open a `CaptureSession` on a supported USB-CAN adapter (GS_USB / candleLight first) or the mock driver, receive raw CAN frames continuously, and stop the session gracefully — using only the library's public `CaptureSession` API, with no direct contact with the underlying CAN stack and no python-can objects handled by the engineer.
- **SC-002**: 100% of the library's test suite (Feature 020 plus Feature 021 tests) passes on a machine with no USB-CAN adapter attached and no external local file path required, deterministically.
- **SC-003**: At the end of any capture session, the engineer receives a `CaptureStatistics` summary (start time, end time, duration, total frames, RX frames, TX frames, dropped frames where detectable, average frame rate) consistent with the frames actually captured; an empty capture returns zero totals and a safe average rate.
- **SC-004**: Every received frame during a capture is forwarded to each configured logger as one valid record; when no logger is configured, capture still succeeds and frames are still counted.
- **SC-005**: Every public failure path during capture (missing device, denied permission, bad configuration, receive timeout, logger failure, driver disconnect mid-capture, abandoned/interrupted session) surfaces as a named domain error and triggers automatic cleanup — never as a raw python-can, libusb, or USB exception and never with leaked resources.
- **SC-006**: No transmit, write, ISO-TP, UDS, DBC decoding, replay, filtering, or AI analysis capability is present anywhere in the library's public capture surface; the sniffer is receive-only.
- **SC-007**: The existing `prioracan` public API remains backward-compatible; the Feature 020 test suite continues to pass unmodified; `ConnectionService` remains importable as a thin compatibility wrapper; and the architecture guard (only `PythonCanAdapter` imports `python-can`) still passes.
- **SC-008**: The capture lifecycle is a single, explicit state machine (CREATED → STARTING → RUNNING → STOPPING → STOPPED → DISPOSED) owned by exactly one object (`CaptureSession`); there is no duplicated orchestration layer and no second component owning the capture loop.
- **SC-009**: Cancellation is deterministic: `stop()` completes within a bounded time, blocking receive never blocks shutdown forever, and cleanup always executes regardless of how the session terminates.
- **SC-010**: The logger-failure policy is single and defined (stop gracefully, surface a logging domain error, flush and close remaining loggers, release the driver, return partial statistics); it is not left implementation-defined.
- **SC-011**: The mock capture example runs to completion with no hardware and prints a statistics summary; the GS_USB capture example opens an adapter, captures for a configurable duration, saves a JSONL log, and prints a summary — neither example depends on the Desktop Agent, backend, or frontend.
- **SC-012**: The existing ELM327 adapter, desktop-agent OBD logic, backend, and frontend remain unchanged by this feature (zero modified files outside the `prioracan` library and its spec).
- **SC-013**: The capture capability is added without changing the `CanFrame` core shape, the `CanDriver` core contract, or the logger interface — preserving the foundation for future replay, filtering, decoding, and PrioraScan integration, which will consume frames from `CaptureSession` rather than extend it.
- **SC-014**: `CaptureSession` consumes frames from the `CanDriver` abstraction without assuming how the driver produces them, so that future drivers (SocketCAN, PCAN, Vector, Kvaser, Serial CAN, MCP2515, `ReplayDriver`) can be added without modifying `CaptureSession` or `CanFrame`; and future capabilities (replay, filters, bus statistics, ISO-TP, UDS, DBC, Desktop Agent integration) compose on top of `CaptureSession` rather than expanding its responsibilities.

## Assumptions

- This feature is an **isolated engineering capability** tracked in the SpecKit workflow but understood to sit **outside the documented PrioraScan product roadmap** (Vehicle Management → Diagnostic Sessions → Fault Code Library → AI Analysis → Reports → PrioraFlow). It is a parallel capability track, not a product feature, exactly like Feature 020.
- **The PRD and SAD MUST be updated before any product integration** of this sniffer (e.g., exposing CAN capture in the desktop agent, backend, or frontend). This feature explicitly does not update the PRD/SAD; it only builds the isolated capture capability. Integration requires documentation approval per the project's specification-driven development rules.
- The feature **builds on the Feature 020 foundation** and **must not change its architecture**; the layered architecture and the "only `PythonCanAdapter` imports `python-can`" rule are user-mandated constraints and remain in force.
- **Single lifecycle owner**: `CaptureSession` is the central abstraction and the only component that owns the capture loop and lifecycle. The long-running streaming loop deferred by Feature 020 is delivered inside `CaptureSession`, not in a separate orchestration component. This eliminates the overlapping-responsibility design that an earlier draft had (`ConnectionService` orchestrating a separate capture component).
- **`ConnectionService` is preserved as a thin backward-compatibility wrapper**, not removed. Removing it entirely would break the Feature 020 public API (goal 9 / FR-019), so the consistent choice is to keep it importable with its existing signatures while delegating capture/streaming concerns to `CaptureSession` and never letting it own the streaming loop. If a future feature deprecates this wrapper, that is a separate, approval-gated decision.
- The sniffer is **receive-only by design**; transmission (TX) is permanently out of scope for this feature. TX frames may be passively observed and counted (e.g. bus echo/loopback) but are never sent by this feature.
- Only **Classic CAN** (0–8 byte payloads) is in scope; **CAN FD** remains out of scope, consistent with Feature 020.
- **Logging is optional and multi-logger**: zero or more of the existing JSONL/ASC loggers may be configured for a capture; capture works without any logger. JSONL is the fully-supported structured format; ASC shares the same interface. Logging must not complicate the driver architecture or the frame model. The logger-failure policy (FR-011) is single and defined, not implementation-defined.
- **Statistics are session-scoped and bounded**: counts, timing, and rates belong to a single capture session and do not carry across sessions. `CaptureStatistics` is intentionally limited to per-capture counters; bus-level analytics (utilization, arbitration histograms, bitrate estimation, protocol/message-frequency analysis) are explicitly excluded and reserved for future Bus Statistics features. Dropped frames are counted where detectable from the underlying stack; where not detectable, the field reports zero/none honestly rather than fabricating a value.
- **The capture lifecycle is a single explicit state machine** (CREATED → STARTING → RUNNING → STOPPING → STOPPED → DISPOSED) with defined valid/invalid transitions. A `CaptureSession` instance is single-use; repeated captures create new instances. `stop()` is idempotent and safe before start.
- **Cancellation is deterministic and bounded but implementation-agnostic**: stop must complete within a bounded time, blocking receive must not block shutdown forever, and cleanup must always execute. No specific threading model or async is required; the implementation may choose any mechanism satisfying these behaviors.
- **`CaptureSession`'s responsibilities are protected**: it is the final raw-streaming layer and must not grow replay, filtering, decoding, protocol parsing, business logic, or product communication. Future layers consume frames from it rather than extending it.
- **No filters, no replay, no decoding**: future ID/mask/whitelist/blacklist filters, replay, ISO-TP, UDS, and DBC decoding remain protected by the architecture but are not implemented in this feature.
- Exact naming of new internals beyond `CaptureSession` and `CaptureStatistics`, file layout, and the chosen cancellation mechanism (threads, signals, events, async, etc.) are **implementation decisions for the planning phase**; this specification requires only that the result is additive, backward-compatible, hardware-free testable, single-owner, and consistent with the Feature 020 architecture.
- Existing PrioraScan tests must continue to pass; this feature adds capability inside the `prioracan` library and must not modify any existing module outside it.

## Future Features *(non-normative, informational only)*

This section is provided for architectural context only. It is **non-normative** and introduces **no additional requirements** for this feature. The numbering is provisional and may change as the PrioraScan roadmap evolves. Any item here requires its own specification and PRD/SAD alignment before implementation.

- **022 — Logging Enhancements**: deliver full ASC fidelity and additional capture/export formats deferred from Feature 020.
- **023 — Replay Engine**: replay recorded captures through the mock / a replay driver, consuming frames recorded by `CaptureSession`.
- **024 — Frame Filters**: add ID/mask, whitelist/blacklist filters as a layer consuming `CaptureSession` frames, without changing the `CanFrame` or `CanDriver` core contracts or extending `CaptureSession`.
- **025 — Bus Statistics**: richer aggregate frame/bus statistics (utilization, arbitration histograms, bitrate estimation, protocol/message-frequency analysis) on top of `CaptureSession` and `CaptureStatistics`.
- **026 — ISO-TP Transport**: implement ISO-TP (CAN-TP) on top of the raw frame foundation.
- **027 — UDS Transport**: implement UDS (Unified Diagnostic Services) on top of ISO-TP.
- **028 — DBC Decoder**: decode raw frames into physical signals using DBC definitions.
- **029 — PrioraScan Integration**: integrate the CAN sniffer into the desktop agent / backend / frontend, following PRD/SAD updates and product approval.