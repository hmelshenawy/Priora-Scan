---

description: "Task list for Feature 022 — ISO-TP Transport Layer (MVP)"
---

# Tasks: ISO-TP Transport Layer (MVP)

**Input**: Design documents from `/specs/022-iso-tp-transport/`

**Prerequisites**: plan.md (required), spec.md (required for user stories). Optional precursors (research.md, data-model.md, contracts/, quickstart.md) were not generated; their equivalent design content is carried inline in plan.md.

**Tests**: Tests ARE included. The approved plan.md mandates strict TDD per phase (failing tests → minimal code → refactor → regression → next). The spec (FR-030, FR-035, FR-036) requires a comprehensive hardware-free test suite at ≥90% coverage. Write each story's failing tests FIRST, confirm they fail, then implement.

**Organization**: Tasks are grouped by user story (US1–US5 from spec.md, in priority order P1→P5) to enable independent implementation and testing of each story. Each user story maps to one or more plan.md implementation phases.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5)
- Include exact file paths in descriptions
- All paths are relative to `can_usb_adapter/` (the isolated library) unless noted

## Path Conventions

This feature extends the existing `prioracan` library inside `can_usb_adapter/` (single-project `src/` layout). Source lives in `can_usb_adapter/src/prioracan/...`; tests in `can_usb_adapter/tests/...`; examples in `can_usb_adapter/examples/...`. No files outside `can_usb_adapter/` and `specs/022-iso-tp-transport/` are created or modified.

## Architecture Constraints (apply to EVERY task)

- **Additive only.** No existing public contract may be removed/renamed/signature-changed: `prioracan.__all__` (21 names), `prioracan.errors` (8 classes), `CanDriver` Protocol (7 methods), `ConnectionService` (4 methods), `DriverCapabilities` + named constants (`transmit=False`), `CanFrame` core shape + RX-only validation, `CaptureSession` constructor + `mark_end`.
- **`send_frame` naming.** Every send method is named `send_frame` — never bare `send`/`transmit`/`write` (forbidden by `test_no_transmit_style_public_methods`).
- **`send_frame` NOT on the CanDriver Protocol.** Add it only to `MockDriver`, `GsUsbDriver`, `PythonCanAdapter`, and `CaptureSession`. `CaptureSession.send_frame` duck-types the concrete driver.
- **ISO-TP errors in `prioracan/iso_tp/errors.py`** (separate module), subclassing `CanAdapterError`. Never add them to `prioracan/errors.py`.
- **ISO-TP surface via `prioracan.iso_tp` submodule** — never add to `prioracan.__all__`.
- **Lexical guard.** No bare token `isotp`/`uds`/`dbc`/`stream` in `src/prioracan/**/*.py` (including comments). Use `iso_tp` (module), `IsoTp*` attached names (e.g. `IsoTpTransport`), or "ISO-TP" in prose. Never the bare word "IsoTp"/"isotp".
- **`CanFrame` is RX-only.** Sent frames are standard `CanFrame` instances constructed with `direction=RX`; the send path uses `arbitration_id`/`data`/`is_extended_id`/`is_remote_frame`/`dlc` and ignores `direction`.
- **Receive integration = subscriber/listener model.** `CaptureSession` gains an additive frame-listener seam; it must NOT expose `receive`/`iter_frames`/`run`/`stream` (forbidden by `test_capture_session_has_no_forbidden_capture_methods`).
- **`python-can` only at the adapter seam** (`drivers/adapters/python_can_adapter.py`).
- **Size limits.** Every file < 300 lines; every function < 30 lines. No module-level mutable globals.
- **Regression.** After every task group, re-run the FULL Feature 020 + Feature 021 suite UNMODIFIED (no edits to any existing `test_*.py`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the `prioracan.iso_tp` subpackage scaffold and the shared test infrastructure (fixtures + scriptable mock ISO-TP peer) that all user stories depend on.

- [X] T001 Create `prioracan.iso_tp` subpackage scaffold in can_usb_adapter/src/prioracan/iso_tp/__init__.py (empty/skeleton exports; guard-safe `iso_tp` token, no bare `isotp`)
- [X] T002 [P] Extend can_usb_adapter/tests/conftest.py with ISO-TP fixtures + a scriptable mock ISO-TP peer helper (injects FF/CF/CTS/error/silent sequences via the mock receive stream; reacts to frames recorded by MockDriver.send_frame; deterministic; no hardware)
- [X] T003 [P] Create ISO-TP frame byte fixtures in can_usb_adapter/tests/fixtures/iso_tp_frames.py (deterministic Single/First/Consecutive/FlowControl byte sequences + a sanitized multi-frame payload; bundled in-tree, no external file path)
- [X] T003a [P] Add reusable CanFrame factory helpers to can_usb_adapter/tests/conftest.py or can_usb_adapter/tests/fixtures/iso_tp_frames.py for standard 11-bit frames, extended 29-bit frames, Single Frame bytes, First Frame bytes, Consecutive Frame bytes, and Flow Control bytes (avoid duplicated CanFrame construction across ISO-TP tests; keep tests consistent; preserve the existing CanFrame RX-only invariant — all factory-built frames use direction=RX)

**Checkpoint**: Subpackage skeleton + test fixtures + factory helpers exist; full Feature 020 + 021 suite still green (no production behavior changed yet).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pure ISO-TP value objects — errors, config, PCI/frame encode-decode, flow-control encode-decode. These block ALL ISO-TP user stories (US2–US5). No runtime, no `CaptureSession` interaction, no I/O in this phase.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete. These modules are pure and independently testable.

- [X] T004 [P] Write failing model tests in can_usb_adapter/tests/test_iso_tp_models.py (PCI nibble parsing for all 4 frame types; SF/FF/CF/FC encode-decode round-trips; 7/8-byte boundary; 4095/4096 boundary; FF escape-indicator length 0 rejected; CF sequence 0x0–0xF + mod-16 wrap; STmin 0–127 accepted / 128–255 rejected; IsoTpConfig range validation; error class hierarchy `isinstance(IsoTpTimeoutError(), CanAdapterError)`)
- [X] T005 [P] Write failing static-guard tests in can_usb_adapter/tests/test_iso_tp_static_guards.py (`prioracan.iso_tp` importable; the 5 transport errors live in `iso_tp.errors` NOT `prioracan.errors`; `prioracan.__all__` unchanged (21); no bare `isotp`/`uds`/`dbc`/`stream` token in the new subpackage; `python-can` still imported only at the adapter seam)
- [X] T006 [P] Implement ISO-TP domain errors in can_usb_adapter/src/prioracan/iso_tp/errors.py (`IsoTpError(CanAdapterError)` base + `IsoTpTimeoutError`, `IsoTpSequenceError`, `IsoTpFlowControlError`, `IsoTpFrameFormatError`, `IsoTpBufferOverflowError`; no implementation details leaked in messages)
- [X] T007 [P] Implement IsoTpConfig in can_usb_adapter/src/prioracan/iso_tp/config.py (frozen dataclass: rx_arbitration_id, tx_arbitration_id, is_extended_id, block_size default 0, st_min_ms default 0, wait_for_flow_control_seconds, wait_for_consecutive_frame_seconds, max_payload_bytes default 4095; range validation → CanConfigurationError/IsoTpFrameFormatError)
- [X] T008 [P] Implement PCI parsing + frame value objects + encode/decode in can_usb_adapter/src/prioracan/iso_tp/frames.py (`FrameType` enum; `parse_pci`; encode/decode helpers for Single Frame, First Frame 12-bit, Consecutive Frame 4-bit sequence; pure byte manipulation; no CanFrame construction, no I/O)
- [X] T009 [P] Implement FlowControlParameters + FlowStatus + encode/decode in can_usb_adapter/src/prioracan/iso_tp/flow_control.py (`FlowStatus` enum CTS/WAIT/OVERFLOW; `FlowControlParameters`; encode_flow_control/decode_flow_control; raw ms STmin 0–127 only; structured 128–249 + reserved 250–255 rejected with IsoTpFrameFormatError)
- [X] T010 Wire `prioracan.iso_tp` public submodule exports in can_usb_adapter/src/prioracan/iso_tp/__init__.py (IsoTpConfig, IsoTpError + 5 errors; IsoTpTransport exported from Phase 3 onward; NOT re-exported from prioracan.__all__)
- [X] T011 Run regression: full Feature 020 + 021 suite unmodified + test_iso_tp_models + test_iso_tp_static_guards green; confirm prioracan.__all__ and prioracan.errors unchanged

**Checkpoint**: Foundation ready — pure ISO-TP models validated; user story implementation can now begin.

---

## Phase 3: User Story 1 - Send a raw CAN frame through the architecture (CAN TX path) (Priority: P1) 🎯 MVP

**Goal**: Add the additive, backward-compatible CAN transmit path (`send_frame`) at `CaptureSession`, `MockDriver`, `GsUsbDriver`, and `PythonCanAdapter` so upper layers can send raw CAN frames without bypassing `CaptureSession` and without breaking Feature 020/021. No ISO-TP yet.

**Independent Test**: Construct a `CaptureSession` over `MockDriver`, call `CaptureSession.send_frame(frame)`, assert the mock recorded exactly that frame and `_tx` incremented, capture behavior/statistics unchanged, existing Feature 020/021 tests pass unmodified; inject a mock transmit failure and assert a PrioraCAN domain error (not a raw `python-can` exception) is raised.

### Tests for User Story 1 (write FIRST, confirm they FAIL)

- [X] T012 [P] [US1] Write failing TX tests in can_usb_adapter/tests/test_send_frame_mock.py (mock records exact frame; _tx counter increments; send_frame on CREATED/STOPPED/DISPOSED/stopped session raises CanAdapterError; capture behavior + CaptureStatistics unchanged)
- [X] T013 [P] [US1] Write failing TX tests in can_usb_adapter/tests/test_send_frame_gs_usb.py (virtual-bus GsUsbDriver.send_frame transmits a real frame verifiable by a receiver on the same virtual bus; no USB hardware)
- [X] T014 [P] [US1] Write failing TX tests in can_usb_adapter/tests/test_send_frame_errors.py (TX failure: driver disconnected / adapter error → named PrioraCAN domain error, never a raw python-can/libusb/USB exception)

### Implementation for User Story 1

- [X] T015 [P] [US1] Implement MockDriver.send_frame in can_usb_adapter/src/prioracan/drivers/mock.py (deterministically records the sent frame in an internal list; returns; no hardware)
- [X] T016 [P] [US1] Implement PythonCanAdapter.send_frame in can_usb_adapter/src/prioracan/drivers/adapters/python_can_adapter.py (method named send_frame, never bare send; maps a python-can Message to self._bus.send; maps python-can/OSError failures to CanConnectionError/CanAdapterError; open/recv/close/is_open unchanged)
- [X] T017 [P] [US1] Implement GsUsbDriver.send_frame in can_usb_adapter/src/prioracan/drivers/gs_usb.py (builds a python-can Message from the CanFrame arbitration_id/data/is_extended_id/is_remote_frame/dlc, ignoring direction; delegates to adapter.send_frame; maps failures onto the domain taxonomy; receive methods unchanged)
- [X] T018 [US1] Implement CaptureSession.send_frame in can_usb_adapter/src/prioracan/session.py (the ONLY send entry point; validates session state permits transmit (RUNNING) else CanAdapterError; delegates to self.driver.send_frame via duck-typing; increments _tx directly; maps driver failures onto the domain taxonomy; existing start/stop/_capture_loop/_dispatch/_count_frame/constructor/mark_end unchanged)
- [X] T018a [US1] Regression: verify CaptureSession.send_frame works correctly with MockDriver and with GsUsbDriver (virtual bus); assert the CanDriver Protocol in can_usb_adapter/src/prioracan/drivers/base.py remains unchanged (still exactly 7 public methods); assert send_frame is intentionally duck-typed and is NOT declared on the CanDriver Protocol (test_protocol_declares_exact_methods passes unmodified). This protects the architectural decision from future refactoring.
- [X] T019 [US1] Run regression: full Feature 020 + 021 suite unmodified + TX tests green; verify CanDriver Protocol (base.py) unchanged (still 7 methods); verify no transmit/send/write FunctionDef names introduced (all send_frame)

**Checkpoint**: CAN TX path is live. Frames can be sent through the architecture via `CaptureSession.send_frame` without bypassing `CaptureSession` and without breaking Feature 020/021. This is the MVP slice — the transmit gap left by Feature 021 is closed.

---

## Phase 4: User Story 2 - Exchange a short payload via Single Frame (Priority: P2)

**Goal**: The first transport slice. `IsoTpTransport` encodes a ≤7-byte payload into a Single Frame and sends it via `CaptureSession.send_frame()`; it decodes an incoming Single Frame and delivers the complete payload upward. Malformed Single Frames raise `IsoTpFrameFormatError`.

**Independent Test**: Using `MockDriver` under `CaptureSession`, send a ≤7-byte payload via `IsoTpTransport`, have the mock responder reply with a valid Single Frame, assert the exact response bytes are delivered upward; inject a malformed Single Frame (length/DLC inconsistent or declared length > available data) and assert `IsoTpFrameFormatError` is raised and no payload is delivered.

### Tests for User Story 2 (write FIRST, confirm they FAIL)

- [X] T020 [P] [US2] Write failing Single Frame tests in can_usb_adapter/tests/test_iso_tp_single_frame.py (SF encode 1–7 bytes emits one CanFrame via CaptureSession.send_frame with correct PCI; SF decode delivers exact payload; malformed SF → IsoTpFrameFormatError, no payload; empty payload length 0; 7-byte boundary uses SF; send-while-busy raises domain error; disposed-transport raises; no lingering state after SF exchange)

### Implementation for User Story 2

- [X] T021 [P] [US2] Implement IsoTpTransport scaffold + lifecycle in can_usb_adapter/src/prioracan/iso_tp/transport.py (composes a CaptureSession reference + IsoTpConfig; no driver/adapter/python-can references; start/stop/dispose + __enter__/__exit__; listener registration stubbed for this phase)
- [X] T022 [P] [US2] Implement TransferState as a private dataclass inside can_usb_adapter/src/prioracan/iso_tp/transport.py or in a small internal can_usb_adapter/src/prioracan/iso_tp/transport_state.py module if separation is needed (direction, peer CAN IDs, buffer, expected/next sequence, remaining block count, st_min, active timeout; one active at a time; do not expose it as a public API)
- [X] T023 [US2] Implement Single Frame send + decode in can_usb_adapter/src/prioracan/iso_tp/transport.py (send(payload) for ≤7 bytes: encode SF (0x0n+payload) into a standard CanFrame with direction=RX + configured tx_arbitration_id/is_extended_id, emit via CaptureSession.send_frame; >7 bytes rejected in this phase with a clear domain error; decode incoming SF → extract length + payload → deliver upward; malformed → IsoTpFrameFormatError; single-transfer-at-a-time guard)
- [X] T024 [US2] Run regression: full Feature 020 + 021 + US1 suite unmodified + SF tests green

**Checkpoint**: Short-payload ISO-TP exchanges work end-to-end through `IsoTpTransport` → `CaptureSession.send_frame` (TX) and decode → deliver (RX). The transport composes on `CaptureSession` only.

---

## Phase 5: User Story 3 - Receive a long payload via multi-frame reassembly with CTS (Priority: P3)

**Goal**: Receive a long diagnostic response. On a First Frame, allocate a buffer, validate the 12-bit length, store the first fragment, and emit a CTS Flow Control via `CaptureSession.send_frame()`. Validate each Consecutive Frame's sequence (reject duplicate/out-of-order with `IsoTpSequenceError`), append in order, and on completion deliver one complete contiguous payload upward and release the buffer.

**Independent Test**: Using `MockDriver` + the scriptable mock peer, drive a 64-byte multi-frame response, assert the reassembled payload equals the expected bytes exactly and a CTS Flow Control was emitted with the configured BS/STmin; inject a duplicate and an out-of-order CF and assert `IsoTpSequenceError` + buffer cleanup in each case.

### Tests for User Story 3 (write FIRST, confirm they FAIL)

- [X] T025 [P] [US3] Write failing receive tests in can_usb_adapter/tests/test_iso_tp_receive.py (FF decode + buffer allocation + CTS emit with configured BS/STmin; CF sequence validation correct/duplicate/out-of-order; completion delivers exactly L bytes + buffer released; CF-when-idle → IsoTpFrameFormatError; FF length > max → IsoTpBufferOverflowError; FF escape length 0 → IsoTpFrameFormatError; overrun → IsoTpFrameFormatError; >16-frame reassembly mod-16 wrap; unrelated-ID frames ignored; listener-isolation: a raising listener does not break logger dispatch; First Frame arriving while a receive transfer is already in progress must raise IsoTpFrameFormatError, abort the current transfer, release its buffer/state, and deliver no partial payload; no lingering state after success and each abort)

### Implementation for User Story 3

- [X] T026 [US3] Implement CaptureSession frame-listener seam in can_usb_adapter/src/prioracan/session.py (additive post-construction add_frame_listener method; invoke registered listeners alongside logger dispatch in _dispatch; listeners are invoked synchronously and in registration order; CaptureSession performs no buffering, queuing, scheduling, or worker-thread management — listener implementations are responsible for any additional buffering or asynchronous processing; listener callbacks isolated with try/except — a callback exception is mapped to a transport error surfaced to the listener, never raised into the capture loop, never breaks logger dispatch or the logger-failure policy; constructor signature unchanged; loggers still receive write_frame unchanged)
- [X] T027 [US3] Implement First Frame + Consecutive Frame reassembly + CTS emit + sequence validation + cleanup in can_usb_adapter/src/prioracan/iso_tp/transport.py (register a listener filtering to rx_arbitration_id; feed matching frames into a thread-safe queue; FF: validate 12-bit length, allocate buffer, store first fragment, emit CTS via CaptureSession.send_frame with configured BS/STmin; CF: validate 4-bit sequence vs expected successor, reject duplicate/out-of-order → IsoTpSequenceError, append in order, detect overrun → IsoTpFrameFormatError, on completion deliver L bytes + release buffer/state; CF-when-idle and FF-mid-transfer → IsoTpFrameFormatError; cleanup on every completion + abort)
- [X] T028 [US3] Run regression: Feature 021 logging tests (test_capture_logging.py, test_logger_failure_policy.py) unmodified (listener seam is additive) + receive tests green

**Checkpoint**: Long-payload receive works. The additive `CaptureSession` listener seam does not disturb Feature 021 logging. Reassembly, sequence validation, CTS emission, and cleanup are validated.

---

## Phase 6: User Story 4 - Transmit a long payload via multi-frame segmentation after CTS (Priority: P4)

**Goal**: Send a long request. `IsoTpTransport` auto-selects Single Frame (≤7) or First Frame + Consecutive Frames (8–4095); emits a First Frame via `CaptureSession.send_frame()`, waits for a CTS Flow Control, then sends Consecutive Frames in blocks up to the peer's Block Size (0 = unlimited), paced by the peer's STmin, sequence incremented mod 16. WAIT/OVERFLOW abort with `IsoTpFlowControlError`.

**Independent Test**: Using `MockDriver` + a scriptable responder returning CTS with known BS/STmin, send a 64-byte payload, capture emitted frames, assert FF length/fragment, exact CF sequence numbers (incl. mod-16 wrap for >16 frames), block boundary respecting BS, inter-frame spacing respecting STmin; have the responder return OVERFLOW and assert abort with `IsoTpFlowControlError`.

### Tests for User Story 4 (write FIRST, confirm they FAIL)

- [X] T029 [P] [US4] Write failing flow-control tests in can_usb_adapter/tests/test_iso_tp_flow_control.py (CTS decode extracts BS/STmin; STmin 0–127 accepted / 128–255 → IsoTpFrameFormatError; WAIT → IsoTpFlowControlError + abort; OVERFLOW → IsoTpFlowControlError + abort; invalid FS → IsoTpFrameFormatError; transport emits CTS only, never WAIT/OVERFLOW; BS≠0 triggers CTS re-emit between blocks on the receive side)
- [X] T030 [P] [US4] Write failing transmit tests in can_usb_adapter/tests/test_iso_tp_transmit.py (SF selection ≤7; FF+CF selection >7; FF length + first fragment; CF sequence + mod-16 wrap; BS=0 burst; BS=N block + pause + wait next CTS; STmin pacing tolerance; WAIT/OVERFLOW abort + transmit state released; payload exactly 4095 bytes must transmit successfully using First Frame + Consecutive Frames and payload 4096 bytes must raise IsoTpBufferOverflowError; completion releases transmit state; send-while-busy rejection; RX/TX coexistence one at a time)

### Implementation for User Story 4

- [X] T031 [US4] Implement Flow Control parsing + WAIT/OVERFLOW safe abort in can_usb_adapter/src/prioracan/iso_tp/transport.py (decode incoming FC; validate FlowStatus; validate BS/STmin encoding via foundational flow_control.decode; WAIT/OVERFLOW → IsoTpFlowControlError + abort; invalid FS → IsoTpFrameFormatError; transport never emits WAIT/OVERFLOW)
- [X] T032 [US4] Implement multi-frame segmentation + First Frame + Consecutive Frame transmit + block/STmin/sequence handling in can_usb_adapter/src/prioracan/iso_tp/transport.py (auto-select SF/FF; emit FF with 12-bit length + first fragment via CaptureSession.send_frame; wait for CTS; send CFs in blocks ≤ peer BS (0 = unlimited all remaining), paced by peer STmin (monotonic-clock, raw ms 0–127), sequence mod 16; BS≠0 pause for next CTS; final CF → complete + release transmit state; single transfer at a time)
- [X] T033 [US4] Run regression: full Feature 020 + 021 + US1–US3 suite unmodified + FC + transmit tests green

**Checkpoint**: The MVP is bidirectional and usable. Long-payload transmit with block/STmin/sequence handling and WAIT/OVERFLOW safe abort is validated.

---

## Phase 7: User Story 5 - Enforce basic bounded timeouts (Priority: P5)

**Goal**: Fail fast rather than hang. Enforce two bounded timeouts — wait-for-Flow-Control (N_Bs concept) and wait-for-next-Consecutive-Frame (N_Cr concept) — each configurable with sane defaults. On expiration raise `IsoTpTimeoutError`, abort the affected transfer, and release buffers/state. Return to idle ready for a new transfer.

**Independent Test**: Using `MockDriver` + a responder that goes silent after the First Frame (transmit) and after a Consecutive Frame (receive), assert each timeout expires within the configured bound, `IsoTpTimeoutError` is raised, and the partial transfer's buffer/state are released; verify both wait-for-FC and wait-for-CF timeouts are exercised.

### Tests for User Story 5 (write FIRST, confirm they FAIL)

- [X] T034 [P] [US5] Write failing timeout tests in can_usb_adapter/tests/test_iso_tp_timeouts.py (wait-for-FC timeout fires within tolerance on a silent peer after FF → IsoTpTimeoutError + transmit cleanup; wait-for-CF timeout fires within tolerance after CTS → IsoTpTimeoutError + receive cleanup; both timeouts exercised; reuse-after-abort: new transfer succeeds without restart; CaptureSession.stop mid-transfer → domain error + cleanup, no hang/crash; long-running-session: many back-to-back transfers alternating success/timeout/abort with no buffer/timer/state growth)

### Implementation for User Story 5

- [X] T035 [US5] Implement wait-for-Flow-Control + wait-for-Consecutive-Frame bounded timeouts + cleanup + reuse-after-abort in can_usb_adapter/src/prioracan/iso_tp/transport.py (configurable via IsoTpConfig defaults; expiration → IsoTpTimeoutError + abort + release buffer/sequence/timer; return to idle; cancel/clear timer on every abort; no six-timer implementation)
- [X] T036 [US5] Implement CaptureSession stop/disconnect mid-transfer surfacing in can_usb_adapter/src/prioracan/iso_tp/transport.py (when the listener seam / send_frame surface a stopped/disposed session, map to a transport/connection domain error and release transfer state; no hang/crash)
- [X] T037 [US5] Run regression: full Feature 020 + 021 + US1–US4 suite unmodified + timeout tests green

**Checkpoint**: The MVP is safe for real vehicles — a silent peer never causes an indefinite hang; both bounded timeouts enforced with full cleanup and reuse-after-abort.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Examples, documentation, final static guards, regression/coverage gate, and manual real-vehicle validation note — affecting multiple user stories.

- [X] T038 [P] Write/run example tests in can_usb_adapter/tests/test_iso_tp_examples.py (mock example exits 0 and prints complete SF + multi-frame payloads; GS_USB example imports resolve + args parse without hardware)
- [X] T039 [P] Create mock ISO-TP example in can_usb_adapter/examples/iso_tp_mock.py (CaptureSession over MockDriver + scriptable peer; start() on a background thread; SF + multi-frame exchange via IsoTpTransport; prints complete payloads; exits 0; no hardware; no Desktop Agent/backend/frontend)
- [X] T040 [P] Create GS_USB ISO-TP example in can_usb_adapter/examples/iso_tp_gs_usb.py (GsUsbDriver + CanUsbConfig; real-ECU SF + multi-frame exchange; CLI args for RX/TX IDs/payload/timeout; prints complete payloads; releases device; runnable only with hardware; no Desktop Agent/backend/frontend)
- [X] T041 Documentation: extend can_usb_adapter/README.md with ISO-TP MVP section (clear "first MVP, not complete ISO-15765-2"; supported-now list; intentionally-deferred list; byte-level frame examples for SF/FF/CF/CTS; transport lifecycle; sequence numbering with mod-16 wrap; send-path architecture diagram; receive-integration data flow; TX/RX state machines; UDS boundary / Permanent Architectural Boundary)
- [X] T042 [P] Documentation: extend can_usb_adapter/examples/README.md with the two ISO-TP examples + add docstrings to all new public surface (IsoTpTransport, IsoTpConfig, the 5 transport errors, prioracan.iso_tp exports, CaptureSession.send_frame, the listener seam)
- [X] T043 Finalize static guards + regression + coverage gate in can_usb_adapter/tests/test_iso_tp_static_guards.py (assert iso_tp subpackage, separate errors module, __all__ unchanged (21), prioracan.errors unchanged (8), CanDriver Protocol unchanged (7), ConnectionService unchanged (4), DriverCapabilities transmit=False, no bare isotp/uds/dbc/stream token, no transmit/send/write FunctionDef names, no python-can outside the seam, no module-level mutable globals; full Feature 020 + 021 + 022 suite green unmodified; coverage ≥90% on the new TX path + prioracan.iso_tp; multi-instance test: two IsoTpTransport instances on two CaptureSessions without interference; grep guard: no UDS/VIN/DTC/ECU/DBC/replay/filtering/product-integration code)
- [X] T044 Record manual real-vehicle validation note in specs/022-iso-tp-transport/ (Toyota + Mercedes, run via iso_tp_gs_usb.py; record vehicle/ECU/payload/outcome; documented as a manual step, NOT a CI gate; no CI test depends on real hardware)

**Checkpoint**: The MVP is usable (mock example runs hardware-free), documented (supported/deferred lists + diagrams + state machines + UDS boundary), production-quality (static guards + coverage ≥90% + multi-instance + full regression green), and real-vehicle validation is recorded as a manual step.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup (T001). BLOCKS all user stories (US2–US5). Models are pure and parallelizable.
- **US1 / CAN TX path (Phase 3, P1)**: Depends on Setup (T001). Independent of the Foundational models (TX path uses no ISO-TP models). Blocks US2–US5 (every ISO-TP frame send needs `CaptureSession.send_frame`).
- **US2 / Single Frame (Phase 4, P2)**: Depends on Foundational (T006–T010) + US1 (T018, `CaptureSession.send_frame`).
- **US3 / Multi-frame Receive (Phase 5, P3)**: Depends on US2 (IsoTpTransport scaffold + lifecycle, T021) + Foundational flow_control/frames (T008/T009) + US1 (`CaptureSession.send_frame` for CTS emit).
- **US4 / Multi-frame Transmit (Phase 6, P4)**: Depends on US3 (listener seam + TransferState, T026/T022) + Foundational flow_control/frames (T008/T009) + US1 (`CaptureSession.send_frame`). FC parsing (T031) depends on foundational flow_control.decode.
- **US5 / Timeouts (Phase 7, P5)**: Depends on US3 (receive path) + US4 (transmit path) — both transfer directions must exist before the two wait-point timeouts can be wired.
- **Polish (Phase 8)**: Depends on US1–US5.

### User Story Dependencies

- **US1 (P1)** — CAN TX path: can start after Setup. No dependency on Foundational models. **Blocks US2–US5.** This is the MVP.
- **US2 (P2)** — Single Frame: depends on Foundational + US1.
- **US3 (P3)** — Multi-frame Receive: depends on US2 (transport scaffold) + US1 + Foundational.
- **US4 (P4)** — Multi-frame Transmit: depends on US3 (listener seam) + US1 + Foundational.
- **US5 (P5)** — Timeouts: depends on US3 + US4 (both transfer directions).

### Within Each User Story

- Tests MUST be written FIRST and confirmed to FAIL before implementation (strict TDD per plan.md).
- Models/value objects before transport logic.
- Listener seam (US3) before receive logic that uses it.
- FC parsing (US4) before transmit segmentation that waits on CTS.
- Both transfer directions (US3 + US4) before timeouts (US5).
- Run the full Feature 020 + 021 regression UNMODIFIED after each task group.
- Commit after each task or logical group.

### Parallel Opportunities

- **Phase 1**: T002 and T003 can run in parallel (different files).
- **Phase 2**: T004–T009 can all run in parallel (different files; pure modules + their tests). T010 wires them after T006–T009 exist.
- **Phase 3 (US1)**: T012–T014 (test files) in parallel; T015–T017 (driver/adapter files) in parallel; T018 (CaptureSession) after T015–T017.
- **Phase 4 (US2)**: T020 (test) and T021/T022 (scaffold/models) in parallel; T023 (transport) after T021/T022.
- **Phase 5 (US3)**: T025 (test) before T026/T027; T026 (listener seam) and T027 (receive logic) are sequential (T027 depends on the seam).
- **Phase 6 (US4)**: T029/T030 (tests) in parallel; T031 (FC parsing) before T032 (segmentation, which waits on CTS).
- **Phase 7 (US5)**: T034 (test) before T035/T036.
- **Phase 8**: T038–T040 and T042 can run in parallel (different files); T041 (README) and T043 (guards/regression) are more sequential; T044 is independent.
- **Cross-phase**: US1 (TX path) and Phase 2 (Foundational models) are independent of each other and can be worked on in parallel by different developers, since TX uses no ISO-TP models and models use no TX path.

---

## Parallel Example: User Story 1 (CAN TX path)

```bash
# Launch all US1 tests together (write first, confirm they fail):
Task: "Write failing TX tests in can_usb_adapter/tests/test_send_frame_mock.py"
Task: "Write failing TX tests in can_usb_adapter/tests/test_send_frame_gs_usb.py"
Task: "Write failing TX tests in can_usb_adapter/tests/test_send_frame_errors.py"

# Launch all US1 driver/adapter implementations together (different files):
Task: "Implement MockDriver.send_frame in can_usb_adapter/src/prioracan/drivers/mock.py"
Task: "Implement PythonCanAdapter.send_frame in can_usb_adapter/src/prioracan/drivers/adapters/python_can_adapter.py"
Task: "Implement GsUsbDriver.send_frame in can_usb_adapter/src/prioracan/drivers/gs_usb.py"

# Then the CaptureSession seam (depends on the three above):
Task: "Implement CaptureSession.send_frame in can_usb_adapter/src/prioracan/session.py"
```

## Parallel Example: Foundational Phase (models)

```bash
# All pure modules + their model tests in parallel (different files, no dependencies):
Task: "Write failing model tests in can_usb_adapter/tests/test_iso_tp_models.py"
Task: "Write failing static-guard tests in can_usb_adapter/tests/test_iso_tp_static_guards.py"
Task: "Implement ISO-TP domain errors in can_usb_adapter/src/prioracan/iso_tp/errors.py"
Task: "Implement IsoTpConfig in can_usb_adapter/src/prioracan/iso_tp/config.py"
Task: "Implement PCI parsing + frame value objects in can_usb_adapter/src/prioracan/iso_tp/frames.py"
Task: "Implement FlowControlParameters + encode/decode in can_usb_adapter/src/prioracan/iso_tp/flow_control.py"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (subpackage scaffold + fixtures).
2. Complete Phase 2: Foundational (pure ISO-TP models) — blocks US2–US5.
3. Complete Phase 3: User Story 1 (CAN TX path).
4. **STOP and VALIDATE**: Test US1 independently — `CaptureSession.send_frame` works on mock + virtual-bus GS_USB, Feature 020/021 tests pass unmodified, TX failures map to domain errors.
5. The CAN TX path is independently shippable (it closes Feature 021's transmit gap) and is the prerequisite for all ISO-TP work.

### Incremental Delivery

1. Setup + Foundational → pure models validated, regression green.
2. Add US1 (CAN TX path) → test independently → MVP shipped (transmit gap closed).
3. Add US2 (Single Frame) → test independently → short-payload ISO-TP exchanges work.
4. Add US3 (Multi-frame Receive) → test independently → long-payload receive works.
5. Add US4 (Multi-frame Transmit) → test independently → MVP bidirectional and usable.
6. Add US5 (Timeouts) → test independently → MVP safe for real vehicles (no indefinite hangs).
7. Polish → examples, docs, guards, coverage, manual validation note → production-quality.
8. Each story adds value without breaking previous stories (every story ends with the full Feature 020 + 021 + prior-stories regression green unmodified).

### Parallel Team Strategy

With multiple developers:
1. Team completes Setup together.
2. In parallel: Developer A → Foundational models (Phase 2); Developer B → US1 CAN TX path (Phase 3). These two tracks are independent.
3. Once Foundational + US1 are done: US2 → US3 → US4 → US5 are sequential (each builds on the prior transport scaffold / listener seam / transfer directions).
4. Polish (Phase 8) parallelizes across examples, docs, and guards after US5.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks.
- [Story] label maps each task to its user story (US1–US5) for traceability.
- Each user story is independently completable and testable; each ends with the full Feature 020 + 021 regression green UNMODIFIED (no edits to any existing `test_*.py`).
- Strict TDD: write each story's failing tests FIRST, confirm they fail, then implement the minimum production code, refactor, and run regression.
- The architecture constraints at the top of this file apply to EVERY task (additive only; `send_frame` not on the CanDriver Protocol; ISO-TP errors in `iso_tp/errors.py`; ISO-TP surface via the `prioracan.iso_tp` submodule; `CanFrame` RX-only; subscriber/listener receive model; no bare `isotp` token; `python-can` only at the seam; <300 lines/file, <30 lines/function).
- Commit after each task or logical group; stop at any checkpoint to validate the story independently.
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break independence, any modification outside `can_usb_adapter/` and `specs/022-iso-tp-transport/`.
- Out of scope (do NOT schedule): UDS, VIN, DTC, Security Access, ECU discovery, replay, filters, DBC, Desktop Agent, backend, frontend, CAN FD, extended/mixed addressing, 32-bit escape length, full six-timer enforcement, advanced STmin encodings, WAIT/OVERFLOW negotiation, concurrent transfers.
