# Tasks: CAN USB Adapter Foundation

**Input**: Design documents from `/specs/020-can-usb-adapter/` (spec.md, plan.md, research.md, data-model.md, contracts/library-api-contract.md, quickstart.md)

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: The user mandated tests for **every** implementation task. Tests are NOT optional for this feature. No task is complete until its tests pass.

**Organization**: Tasks are grouped by the implementation phases defined in `plan.md` (Phases 1–9). Tasks that directly serve a user story carry a `[US]` label; foundational/cross-cutting phases carry none.

## Format: `[ID] [P?] [Story?] Description with file path`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task in the same batch)
- **[Story]**: Which user story this task serves (US1 = receive raw frames, US2 = hardware-free testing, US3 = logging)
- Exact file paths under `can_usb_adapter/` are included in every task

## Architecture constraints (apply to every task)

- Preserve the existing ELM327 adapter unchanged. Work only inside `can_usb_adapter/`.
- No desktop-agent / backend / frontend integration. No transmit, no CAN FD, no ISO-TP, no UDS, no DBC, no replay, no live streaming.
- No singletons. No global mutable state. Multiple `CanDriver` instances must always remain supported and independent.
- Always preserve the driver chain: `CanDriver → GsUsbDriver → PythonCanAdapter → python-can`. `python-can` is imported in exactly one module: `src/prioracan/drivers/adapters/python_can_adapter.py`. No task may bypass this.
- Every file < 300 lines; every function < 30 lines. No TODOs, no dead code, no commented-out implementations.
- Every implementation task ends with working, passing tests before the next task begins. Prefer small incremental commits (human executes git per CLAUDE.md).

---

## Phase 1: Setup (Project Foundation) — plan Phase 1

**Purpose**: Isolated, importable `prioracan` package skeleton. No domain logic yet.

- [X] T001 Create `can_usb_adapter` package structure and `pyproject.toml` in `can_usb_adapter/pyproject.toml` + `can_usb_adapter/src/prioracan/__init__.py`

**Goal**: Standalone `src/`-layout library importable as `prioracan`, with runtime dep `python-can` and dev deps `pytest`, `pytest-cov`.
**Files to modify**: `can_usb_adapter/pyproject.toml`; `can_usb_adapter/src/prioracan/__init__.py`; empty `__init__.py` for `drivers/`, `drivers/adapters/`, `logging/`, `services/`, `utils/`; `can_usb_adapter/tests/__init__.py` (if needed by layout).
**Dependencies**: None.
**Implementation steps**: Create the `can_usb_adapter/` root folder and the full `src/prioracan/...` subtree with empty `__init__.py` files. Write `pyproject.toml` (setuptools backend, `package = prioracan`, `src/` layout via `tool.setuptools.packages.find` under `src`, `python_requires = ">=3.11"`, `dependencies = ["python-can"]`, optional `[project.optional-dependencies] dev = ["pytest","pytest-cov"]`). Keep `__init__.py` empty (re-exports land in T012). No domain code.
**Tests to add**: `can_usb_adapter/tests/test_smoke_import.py` — assert `import prioracan` succeeds and resolves to the local package (assert `prioracan.__file__` is under `can_usb_adapter/src`).
**Acceptance criteria**: (1) `pip install -e ".[dev]"` succeeds in a clean venv; (2) `python -c "import prioracan"` works and points at the local src; (3) `pytest -q` exits 0 (smoke test passes); (4) no file outside `can_usb_adapter/` is created or modified.

- [X] T002 [P] Write `README.md` in `can_usb_adapter/README.md`

**Goal**: Minimal README with purpose, install, read-only safety note, and platform/libusb setup.
**Files to modify**: `can_usb_adapter/README.md`.
**Dependencies**: T001.
**Implementation steps**: Document library purpose (read-only raw CAN frame reception for candleLight/GS_USB), install (`pip install -e ".[dev]"`), the read-only/no-transmit safety constraint, and per-OS libusb setup (Linux `udev` rules, macOS Homebrew libusb, Windows Zadig→WinUSB). Add a short mock-driver usage snippet.
**Tests to add**: Extend `tests/test_smoke_import.py` (or add `tests/test_readme.py`) to assert the README contains the required section headings ("Install", "Read-only", "libusb"/"platform") and that the snippet's imported symbols exist.
**Acceptance criteria**: README contains purpose, install, read-only safety note, and platform setup; documented symbols are importable.

- [X] T003 [P] Configure pytest and dev tooling in `can_usb_adapter/pyproject.toml`

**Goal**: Pytest configuration + coverage baseline so the suite runs hardware-free with coverage.
**Files to modify**: `can_usb_adapter/pyproject.toml` (`[tool.pytest.ini_options]`, `[tool.coverage]`).
**Dependencies**: T001.
**Implementation steps**: Add `testpaths = ["tests"]`, `addopts = "-q"`, coverage source `src/prioracan` with a ≥90% baseline target documented (not enforced as a hard fail yet). No ruff/black required, but if added keep config minimal.
**Tests to add**: A `tests/test_pytest_config.py` that runs `pytest` config sanity (collects ≥1 test, exits 0).
**Acceptance criteria**: `pytest -q` runs from `can_usb_adapter/` and exits 0; coverage configured against `src/prioracan`.

**Checkpoint**: Package is importable and the test harness runs (no domain logic yet).

---

## Phase 2: Foundational — Core Domain (plan Phase 2)

**Purpose**: Stable long-term domain contracts. BLOCKS all user-story work.

- [X] T004 Implement domain error taxonomy in `can_usb_adapter/src/prioracan/errors.py`

**Goal**: Full PrioraCAN error hierarchy rooted at `CanAdapterError`.
**Files to modify**: `can_usb_adapter/src/prioracan/errors.py`.
**Dependencies**: T001.
**Implementation steps**: Define `CanAdapterError(Exception)` and subclasses `CanDriverNotFoundError`, `CanDeviceNotFoundError`, `CanPermissionError`, `CanConfigurationError`, `CanConnectionError`, `CanReceiveTimeout`, `CanLoggingError` (all subclass `CanAdapterError`). Each with a clear docstring stating when it is raised. No other logic.
**Tests to add**: `can_usb_adapter/tests/test_errors.py` — assert each subclass is a subclass of `CanAdapterError`; assert each is raisable/catchable as `CanAdapterError`; assert the exact public names per the contract.
**Acceptance criteria**: All seven named errors plus the base exist; every subclass `issubclass(X, CanAdapterError)` is True; file < 300 lines.

- [X] T005 [P] Implement hex formatting helpers in `can_usb_adapter/src/prioracan/utils/hex.py`

**Goal**: Pure helpers for `arbitration_id_hex` and `data_hex` used by `CanFrame` and loggers.
**Files to modify**: `can_usb_adapter/src/prioracan/utils/hex.py`; `can_usb_adapter/src/prioracan/utils/__init__.py`.
**Dependencies**: T001.
**Implementation steps**: `arbitration_id_hex(arbitration_id: int) -> str` → uppercase `"0x4D2"`; `data_hex(data: bytes) -> str` → uppercase space-separated `"01 02 03"`, `""` for empty bytes. No validation here (validation is `CanFrame`'s job).
**Tests to add**: `can_usb_adapter/tests/test_hex.py` — uppercase, `0x` prefix, space separation, empty-bytes case, multi-byte case.
**Acceptance criteria**: Outputs match the data-model spec exactly (uppercase, `0x` prefix, space-separated payload); pure functions with no side effects.

- [X] T006 Implement `CanFrame` in `can_usb_adapter/src/prioracan/frame.py`

**Goal**: Immutable, self-validating Classic CAN frame value object with RX-only direction and named/numeric channel.
**Files to modify**: `can_usb_adapter/src/prioracan/frame.py`.
**Dependencies**: T004, T005.
**Implementation steps**: `@dataclass(frozen=True, slots=True)` with fields per data-model §1 (`timestamp`, `channel: int|str`, `direction`, `arbitration_id`, `is_extended_id`, `is_remote_frame`, `is_error_frame`, `dlc`, `data: bytes`, `bitrate: int|None = None`). Define `Direction` enum (`RX` only this feature; `TX` reserved but rejected on construction). `__post_init__` validates: `direction == RX` else `CanConfigurationError`; standard 11-bit (`0..0x7FF`) / extended 29-bit (`0..0x1FFFFFFF`) range else `CanConfigurationError`; `0 <= len(data) <= 8` else `CanConfigurationError`; `dlc == len(data)` else `CanConfigurationError`; `data` is `bytes` else `CanConfigurationError`. Read-only `@property` `arbitration_id_hex` and `data_hex` using `utils.hex`. No transmit methods.
**Tests to add**: `can_usb_adapter/tests/test_frame.py` — valid standard + extended construction; derived hex fields uppercase/correct; immutability (mutation raises `FrozenInstanceError`); hashability; rejection of: non-RX direction, ID out of range, `len(data) > 8`, `dlc != len(data)`, non-`bytes` data; remote frame (empty data, dlc 0); named-string channel preserved.
**Acceptance criteria**: All spec FR-003/FR-004/FR-005 validation rules enforced; rejections raise `CanConfigurationError`; frame is frozen and hashable; derived hex correct.

- [X] T007 [P] Implement `CanUsbConfig` in `can_usb_adapter/src/prioracan/config.py`

**Goal**: Frozen config with spec defaults and light validation.
**Files to modify**: `can_usb_adapter/src/prioracan/config.py`.
**Dependencies**: T004.
**Implementation steps**: `@dataclass(frozen=True)` with defaults: `interface="gs_usb"`, `channel=0`, `bitrate=500000`, `receive_timeout_seconds=1.0`, `log_directory=None`, `jsonl_enabled=False`, `asc_enabled=False`. `__post_init__` validates `bitrate > 0`, `receive_timeout_seconds >= 0`, non-empty `interface` → `CanConfigurationError`.
**Tests to add**: `can_usb_adapter/tests/test_config.py` — defaults equal spec values; validation rejects bad bitrate/timeout/empty interface; immutability.
**Acceptance criteria**: Defaults match spec FR-006 exactly; invalid config raises `CanConfigurationError`; frozen.

- [X] T008 [P] Implement `DriverStatus` + `DriverState` in `can_usb_adapter/src/prioracan/status.py`

**Goal**: First-class immutable status snapshot with four states and extensible optional metadata.
**Files to modify**: `can_usb_adapter/src/prioracan/status.py`.
**Dependencies**: T004.
**Implementation steps**: `class DriverState(Enum)`: `DISCONNECTED`, `CONNECTED`, `LISTENING`, `ERROR` (string values). `@dataclass(frozen=True)` `DriverStatus` with `state: DriverState` and optional metadata `adapter_name`, `serial_number`, `firmware`, `bitrate`, `channel`, `last_error: CanAdapterError|None`, `received_frame_count: int = 0`. No state-machine logic (it is a snapshot).
**Tests to add**: `can_usb_adapter/tests/test_status.py` — four states exist; default snapshot constructs; optional metadata accepted/omitted; `last_error` accepts a `CanAdapterError`; frozen.
**Acceptance criteria**: Exactly four states; metadata optional; frozen value object; no workflow logic.

- [X] T009 [P] Implement `DriverCapabilities` in `can_usb_adapter/src/prioracan/capabilities.py`

**Goal**: Frozen capability value object with seven boolean fields and named constants.
**Files to modify**: `can_usb_adapter/src/prioracan/capabilities.py`.
**Dependencies**: T001.
**Implementation steps**: `@dataclass(frozen=True)` with `receive`, `transmit`, `can_fd`, `hardware_filters`, `software_filters`, `replay`, `timestamps` (all `bool`). Module-level constants `GS_USB_CAPABILITIES` (`receive=True, transmit=False, can_fd=False, hardware_filters=False, software_filters=False, replay=False, timestamps=True`) and `MOCK_CAPABILITIES` (`receive=True, transmit=False, can_fd=False, hardware_filters=False, software_filters=False, replay=True, timestamps=True`).
**Tests to add**: `can_usb_adapter/tests/test_capabilities.py` — seven fields exist; `GS_USB_CAPABILITIES` and `MOCK_CAPABILITIES` have the exact values above; frozen.
**Acceptance criteria**: Seven boolean fields; both constants match spec FR-022 / data-model §4; frozen.

- [X] T010 [P] Implement `CaptureSession` in `can_usb_adapter/src/prioracan/session.py`

**Goal**: Lightweight, minimal capture-lifecycle record (not a workflow engine).
**Files to modify**: `can_usb_adapter/src/prioracan/session.py`.
**Dependencies**: T001.
**Implementation steps**: `@dataclass` (not frozen — `mark_end` mutates `end_time`/`active`) with `session_id: str`, `start_time: float`, `driver` (ref, typed as `CanDriver` via `from __future__ import annotations` to avoid import cycle), `config` (ref), `active: bool = True`, `end_time: float|None = None`, `stats: dict|None = None`. Method `mark_end(self, end_time: float) -> None` sets `end_time` and `active=False`. No streaming, no stats computation, no export.
**Tests to add**: `can_usb_adapter/tests/test_session.py` — construction with defaults; `mark_end` sets `end_time` and `active=False`; holds driver + config refs; no streaming methods exist on the class.
**Acceptance criteria**: Minimal per spec FR-023; `mark_end` works; no workflow/state-machine methods present.

**Checkpoint**: Core domain contracts complete and independently tested. User-story work can begin.

---

## Phase 3: Foundational — Driver Architecture (plan Phase 3)

**Purpose**: Vendor-independent `CanDriver` contract and narrow public surface.

- [X] T011 Implement `CanDriver` abstraction in `can_usb_adapter/src/prioracan/drivers/base.py`

**Goal**: `typing.Protocol` with exactly seven operations, no transmit, and a documented threading/iterator contract.
**Files to modify**: `can_usb_adapter/src/prioracan/drivers/base.py`; `can_usb_adapter/src/prioracan/drivers/__init__.py`.
**Dependencies**: T006, T008, T009.
**Implementation steps**: Define `class CanDriver(Protocol)` with `connect(self) -> None`, `disconnect(self) -> None`, `is_connected(self) -> bool`, `receive(self, timeout_seconds: float|None = None) -> CanFrame`, `iter_frames(self, stop_event: threading.Event|None = None) -> Iterator[CanFrame]`, `get_status(self) -> DriverStatus`, `get_capabilities(self) -> DriverCapabilities`. Docstring the contract: `receive` returns a frame or raises `CanReceiveTimeout` (never `None`); `iter_frames` is a thin stoppable iterator over `receive` (not a streaming engine, owns no threads); `disconnect` is idempotent and thread-safe to call against an active `iter_frames`; no `transmit`/`send`/`write`. Add a `runtime_checkable` decorator and a small `assert_conforms(driver)` helper used by tests.
**Tests to add**: `can_usb_adapter/tests/test_driver_contract.py` — a minimal conforming stub passes `assert_conforms`; a stub that exposes `transmit`/`send`/`write` fails; introspection confirms the Protocol declares exactly the seven methods and no transmit method.
**Acceptance criteria**: Exactly seven operations; no transmit; contract is vendor-independent and references only domain types; conforming/non-conforming detection works.

- [X] T012 Wire narrow public re-exports in `can_usb_adapter/src/prioracan/__init__.py`

**Goal**: Public surface exactly per `contracts/library-api-contract.md`; `python-can` never re-exported.
**Files to modify**: `can_usb_adapter/src/prioracan/__init__.py`.
**Dependencies**: T004–T011.
**Implementation steps**: Re-export `CanFrame`, `CanUsbConfig`, `DriverStatus`, `DriverState`, `DriverCapabilities`, `CaptureSession`, `CanDriver`, `FrameLogger` (after T017, re-export then), `JsonlLogger`/`AscLogger` (after T018/T019), `GsUsbDriver` (after T014), `MockDriver` (after T015), `ConnectionService` (after T020), and all error classes. Define `__all__`. NOTE: this task lands the re-export structure now and is amended by later tasks as new public symbols are added — keep `__all__` in sync in each later task.
**Tests to add**: `can_usb_adapter/tests/test_public_api.py` — assert every contract-listed symbol is importable from `prioracan`; assert `can` (python-can) is NOT an attribute of `prioracan`; assert `__all__` matches the contract and contains no `transmit`/`send`/`write`.
**Acceptance criteria**: Public surface matches the contract; `python-can` not re-exported; no transmit symbols in `__all__`.

**Checkpoint**: Driver contract and public surface are stable. Concrete drivers and story work can proceed.

---

## Phase 4: User Story 1 — Receive raw CAN frames via GS_USB (Priority: P1) 🎯 MVP

**Goal**: Receive validated RX Classic CAN frames from a GS_USB/candleLight adapter through `CanDriver`, with `python-can` fully hidden and all low-level errors mapped.
**Independent Test**: Using python-can's `"virtual"` bus (no USB hardware), `GsUsbDriver.connect()` → `receive()` returns a validated `CanFrame` marked RX; simulated `python-can`/`libusb` errors surface as the correct domain errors.

- [X] T013 [US1] Implement `PythonCanAdapter` in `can_usb_adapter/src/prioracan/drivers/adapters/python_can_adapter.py`

**Goal**: The single `python-can` import seam; wraps bus lifecycle and `recv`, maps exceptions to domain errors.
**Files to modify**: `can_usb_adapter/src/prioracan/drivers/adapters/__init__.py`; `can_usb_adapter/src/prioracan/drivers/adapters/python_can_adapter.py`.
**Dependencies**: T004, T006.
**Implementation steps**: This is the **only** module that does `import can` / `from can import ...`. Implement `PythonCanAdapter` with `open(config)` (constructs `can.Bus(interface=..., channel=..., bitrate=..., receive_own_messages=False)`), `recv(timeout_seconds)` returning a `python_can.Message` or `None`, `close()`, and `is_open()`. Map exceptions: device-not-found → `CanDeviceNotFoundError`; permission/access-denied → `CanPermissionError`; unknown interface/channel/bitrate → `CanConfigurationError`; `gs_usb` backend unavailable → `CanDriverNotFoundError`; connection lost → `CanConnectionError`; any unmapped → `CanAdapterError`, chained via `raise ... from original`. No `send`/`send_periodive`/transmit methods. Instance holds its own bus handle (no module-level state).
**Tests to add**: `can_usb_adapter/tests/test_pythoncan_adapter.py` — open/recv/close against `can.Bus(interface="virtual", ...)`; `recv` returns a frame sent on the virtual bus; `recv(timeout=0)` returns `None` when empty; simulated exception mapping (monkeypatch the bus to raise representative exceptions and assert the mapped domain error types); `close` is idempotent.
**Acceptance criteria**: `python-can` imported only in this file (verified by grep in T022); virtual-bus open/recv/close works with no USB; exception mapping produces the correct domain errors; no transmit methods; no module-level mutable state.

- [X] T014 [US1] Implement `GsUsbDriver` in `can_usb_adapter/src/prioracan/drivers/gs_usb.py`

**Goal**: Concrete `CanDriver` for GS_USB that talks **only** to `PythonCanAdapter`.
**Files to modify**: `can_usb_adapter/src/prioracan/drivers/gs_usb.py`; `can_usb_adapter/src/prioracan/drivers/__init__.py`.
**Dependencies**: T011, T013, T006, T008, T009.
**Implementation steps**: `GsUsbDriver(config: CanUsbConfig)` composes a `PythonCanAdapter`. Implement all seven `CanDriver` operations. `receive(timeout_seconds)` calls the adapter's `recv`; if `None`, raises `CanReceiveTimeout`; otherwise converts `python_can.Message` → `CanFrame` (map `arbitration_id`, `is_extended_id`, `is_remote_frame`, `is_error_frame`, `dlc`, `data` (bytes), `timestamp`, `channel`), forcing `direction=RX`. `iter_frames` loops `receive` and checks `stop_event`/connection each iteration. `get_status()` builds a `DriverStatus` snapshot (DISCONNECTED/CONNECTED/LISTENING/ERROR + metadata + `received_frame_count`). `get_capabilities()` returns `GS_USB_CAPABILITIES`. `disconnect` is idempotent. **No transmit path.**
**Tests to add**: extend `can_usb_adapter/tests/test_pythoncan_adapter.py` or add `can_usb_adapter/tests/test_gs_usb_driver.py` — via the `"virtual"` bus: connect → receive returns a validated `CanFrame` with `direction == RX` and correct fields; empty bus → `CanReceiveTimeout`; status transitions; capabilities equal `GS_USB_CAPABILITIES`; idempotent disconnect; `iter_frames` stops on `stop_event`.
**Acceptance criteria**: Implements `CanDriver` (passes `assert_conforms`); `GsUsbDriver` imports `PythonCanAdapter` and never imports `can`; `Message→CanFrame` conversion correct; receive returns RX frames; timeout/errors map; no transmit; virtual-bus test passes with no USB.

**Checkpoint (MVP)**: User Story 1 is functional and independently testable using the virtual bus.

---

## Phase 5: User Story 2 — Hardware-free development & testing (Priority: P2)

**Goal**: Deterministic, hardware-free `MockDriver` plus handcrafted fixtures so all downstream work is testable without a USB-CAN adapter.
**Independent Test**: `MockDriver` replays a supplied frame list in order; when exhausted, raises `CanReceiveTimeout`; reports status and capabilities — all with no hardware and no external file.

- [X] T015 [US2] Implement `MockDriver` in `can_usb_adapter/src/prioracan/drivers/mock.py`

**Goal**: Deterministic hardware-free driver implementing `CanDriver`.
**Files to modify**: `can_usb_adapter/src/prioracan/drivers/mock.py`; `can_usb_adapter/src/prioracan/drivers/__init__.py`.
**Dependencies**: T011, T006, T008, T009.
**Implementation steps**: `MockDriver(frames: Sequence[CanFrame], *, config: CanUsbConfig|None = None)` holds an iterator and a frame counter. `connect`→CONNECTED, first `receive`→LISTENING. `receive(timeout_seconds)` returns the next frame immediately if available; when exhausted raises `CanReceiveTimeout` (immediate by default; `timeout_seconds` is accepted but does not sleep). `iter_frames` loops `receive` with `stop_event`. `get_status()` returns a `DriverStatus` snapshot with `received_frame_count`. `get_capabilities()` returns `MOCK_CAPABILITIES`. `disconnect` idempotent. No module-level state; multiple instances independent.
**Tests to add**: `can_usb_adapter/tests/test_mock_driver.py` — ordered deterministic replay; exhaustion → `CanReceiveTimeout`; connect/disconnect idempotency; status transitions DISCONNECTED→CONNECTED→LISTENING; capabilities equal `MOCK_CAPABILITIES`; `iter_frames` stops on `stop_event`; **two `MockDriver` instances run simultaneously without interference**.
**Acceptance criteria**: Deterministic in-order replay; immediate timeout when empty; correct status/capabilities; passes `assert_conforms`; no transmit; multi-instance independent.

- [X] T016 [US2] Add handcrafted deterministic frame fixtures in `can_usb_adapter/tests/fixtures/frames.py`

**Goal**: Shared deterministic test frames so no unit test depends on an external file or the Yaris trace.
**Files to modify**: `can_usb_adapter/tests/fixtures/frames.py`; `can_usb_adapter/tests/fixtures/__init__.py`; `can_usb_adapter/tests/conftest.py`.
**Dependencies**: T006, T015.
**Implementation steps**: Provide `DETERMINISTIC_FRAMES` (a list of handcrafted valid `CanFrame`s: standard + extended, remote, empty, max 8-byte payload) and helper builders (`make_standard_frame(id, data, ...)`, `make_extended_frame(...)`). `conftest.py` exposes pytest fixtures wrapping these. No file IO; no imports of any external trace.
**Tests to add**: `can_usb_adapter/tests/test_fixtures.py` — assert `DETERMINISTIC_FRAMES` are all valid `CanFrame`s, deterministic across runs, and include the required variety; assert `MockDriver(DETERMINISTIC_FRAMES)` replays them in order.
**Acceptance criteria**: Fixtures are pure in-memory, deterministic, and cover standard/extended/remote/empty/max cases; no external path dependency.

**Checkpoint**: User Stories 1 and 2 are independently functional and hardware-free.

---

## Phase 6: User Story 3 — Persist received frames (Priority: P3)

**Goal**: Minimal logging — required JSONL + minimal ASC — behind a shared `FrameLogger` interface, independent of the driver layer.
**Independent Test**: Receive frames via `MockDriver`, write through `JsonlLogger`, read back one valid JSON object per frame with hex-serialized payload and all required fields; `AscLogger` conforms to the interface with documented limitations.

- [X] T017 [US3] Implement `FrameLogger` interface in `can_usb_adapter/src/prioracan/logging/base.py`

**Goal**: Logger abstraction shared by all formats.
**Files to modify**: `can_usb_adapter/src/prioracan/logging/base.py`; `can_usb_adapter/src/prioracan/logging/__init__.py`.
**Dependencies**: T006.
**Implementation steps**: `class FrameLogger(Protocol)` with `open(self) -> None`, `write_frame(self, frame: CanFrame) -> None`, `close(self) -> None`. Docstring: `close` must be safe after an error; loggers must not depend on the driver layer. No other methods.
**Tests to add**: `can_usb_adapter/tests/test_frame_logger.py` — a minimal conforming logger passes a structural conformance check; a logger missing any of the three methods fails; the interface declares no transmit/driver-coupled methods.
**Acceptance criteria**: Exactly `open`/`write_frame`/`close`; Protocol; no driver-layer dependency.

- [X] T018 [US3] Implement `JsonlLogger` in `can_usb_adapter/src/prioracan/logging/jsonl.py`

**Goal**: One valid JSON object per frame with all required fields and `data_hex` payload.
**Files to modify**: `can_usb_adapter/src/prioracan/logging/jsonl.py`; `can_usb_adapter/src/prioracan/logging/__init__.py`; `can_usb_adapter/src/prioracan/__init__.py` (re-export `JsonlLogger`).
**Dependencies**: T017, T006, T005.
**Implementation steps**: `JsonlLogger(path)` opens a UTF-8 file on `open()`; `write_frame` appends one `json.dumps` object per line with fields: `timestamp`, `channel`, `direction` ("RX"), `arbitration_id`, `arbitration_id_hex`, `is_extended_id`, `is_remote_frame`, `is_error_frame`, `dlc`, `data_hex` (uppercase space-separated), `bitrate` (omitted when `None`). `close` flushes and closes; safe after error. IO failures → `CanLoggingError`. No python-can import.
**Tests to add**: `can_usb_adapter/tests/test_jsonl_logger.py` — write N frames (tmp_path), read lines, assert count == N; each line `json.loads`-parseable; fields and `data_hex` serialization correct; `bitrate` omitted when None; simulated IO failure → `CanLoggingError`; `close` safe after error.
**Acceptance criteria**: Exactly one valid parseable record per frame; required fields present; payload as `data_hex`; `CanLoggingError` on failure; no python-can import.

- [X] T019 [US3] Implement minimal `AscLogger` in `can_usb_adapter/src/prioracan/logging/asc.py`

**Goal**: Safe minimal ASC writer behind `FrameLogger`, with documented limitations; NOT using python-can's `ASCWriter`.
**Files to modify**: `can_usb_adapter/src/prioracan/logging/asc.py`; `can_usb_adapter/src/prioracan/logging/__init__.py`; `can_usb_adapter/src/prioracan/__init__.py` (re-export `AscLogger`).
**Dependencies**: T017, T006.
**Implementation steps**: Hand-write a minimal Vector-ASC subset: a header line and one line per frame (timestamp, channel, Rx, ID, dlc, data bytes). Document in a module docstring and in the README that this is a foundation subset; full ASC fidelity (bus events, error-frame formatting, FD, comments) is deferred to a future logging feature. IO failures → `CanLoggingError`. **Do not** import `python_can.ASCWriter`.
**Tests to add**: `can_usb_adapter/tests/test_asc_logger.py` — interface conformance (`assert` it has `open`/`write_frame`/`close`); writes one line per frame; header present; `CanLoggingError` on failure; a documented-limitation assertion (e.g. the module docstring mentions "minimal" / "deferred"); no `python-can` import in this file.
**Acceptance criteria**: Conforms to `FrameLogger`; minimal valid output; limitations documented; `CanLoggingError` on failure; no python-can import.

**Checkpoint**: All three user stories are independently functional.

---

## Phase 7: User Story 1 + 3 — Connection layer (thin)

**Goal**: Thin `ConnectionService` that connects a driver, receives one frame, forwards to loggers, exposes status, and disconnects — no streaming, no state machine.
**Independent Test**: With `MockDriver` + `JsonlLogger`, `receive_once()` returns the next frame and writes one JSONL record; `get_status()` reflects the driver; `disconnect()` is idempotent.

- [X] T020 [US1] [US3] Implement `ConnectionService` in `can_usb_adapter/src/prioracan/services/connection.py`

**Goal**: Thin orchestrator composing one driver and optional loggers.
**Files to modify**: `can_usb_adapter/src/prioracan/services/connection.py`; `can_usb_adapter/src/prioracan/services/__init__.py`; `can_usb_adapter/src/prioracan/__init__.py` (re-export `ConnectionService`).
**Dependencies**: T011, T015, T017, T018.
**Implementation steps**: `ConnectionService(driver: CanDriver, loggers: Sequence[FrameLogger]|None = None)`. Methods: `connect()` (opens loggers, connects driver), `receive_once() -> CanFrame` (calls `driver.receive()`, forwards the frame to each logger via `write_frame`, returns it), `get_status() -> DriverStatus` (delegates to driver), `disconnect()` (disconnects driver, closes loggers; idempotent). **No** `run`/`stream`/`loop`/state machine. Logger errors during `receive_once` raise `CanLoggingError` but do not corrupt the receive.
**Tests to add**: `can_usb_adapter/tests/test_connection_service.py` — using `MockDriver` + `JsonlLogger` (tmp_path): connect → `receive_once` returns a frame and writes exactly one JSONL record; `get_status` reflects the mock; `disconnect` idempotent and closes the logger; a failing logger raises `CanLoggingError`; assert the class exposes only `connect`/`receive_once`/`get_status`/`disconnect` (no streaming methods).
**Acceptance criteria**: Only the four thin methods; frame forwarded to all enabled loggers; status reflects driver; idempotent disconnect; no streaming/state-machine logic; tests green with no hardware.

**Checkpoint**: End-to-end slice (driver + logger + connection) works hardware-free.

---

## Phase 8: Testing Strategy & Cross-Cutting Guards (plan Phase 8)

**Purpose**: Enforce hardware independence, multi-instance support, static architecture guards, and no regression in the rest of PrioraScan.

- [ ] T021 Add multi-instance independence test in `can_usb_adapter/tests/test_multi_instance.py`

**Goal**: Prove multiple drivers coexist without interference (architecture constraint).
**Files to modify**: `can_usb_adapter/tests/test_multi_instance.py`.
**Dependencies**: T015, T014.
**Implementation steps**: Construct two `MockDriver` instances with disjoint frame lists; receive from both in interleaved order and assert each returns only its own frames. Then construct a `MockDriver` alongside a virtual-bus `GsUsbDriver` and assert their statuses/frames are independent. Disconnect one and assert the other keeps working.
**Tests to add**: This is the test.
**Acceptance criteria**: Two `MockDriver`s and a `MockDriver`+`GsUsbDriver` pair operate simultaneously with zero cross-interference; disconnecting one does not affect the other.

- [ ] T022 Add static architecture guard tests in `can_usb_adapter/tests/test_static_guards.py`

**Goal**: CI-enforced grep guards for the architecture constraints.
**Files to modify**: `can_usb_adapter/tests/test_static_guards.py`.
**Dependencies**: T014, T019, T020.
**Implementation steps**: Programmatically scan `can_usb_adapter/src/prioracan` and assert: (a) `import can` / `from can ` appears **only** in `drivers/adapters/python_can_adapter.py`; (b) no public symbol named `transmit`/`send`/`write`/`send_periodic` in `src/prioracan`; (c) no ISO-TP/UDS/DBC/replay/streaming identifiers (`isotp`, `uds`, `dbc`, `replay` as a driver method, `stream`) in `src/prioracan`; (d) no module-level mutable global state (no top-level mutable containers/bus handles — flag module-level assignments to `[]`, `{}`, `set()`, or `can.Bus(...)` outside classes/functions); (e) no edits outside `can_usb_adapter/` (assert the test's repo scan finds no PrioraScan changes — informational, enforced via review).
**Tests to add**: This is the test.
**Acceptance criteria**: All five guards pass on the implemented codebase.

- [ ] T023 Finalize hardware-free CI run + coverage in `can_usb_adapter/pyproject.toml`

**Goal**: Whole suite green with no hardware; coverage baseline met; no regression in existing PrioraScan tests.
**Files to modify**: `can_usb_adapter/pyproject.toml` (coverage config); `can_usb_adapter/tests/` (any missing conftest glue).
**Dependencies**: T021, T022, all prior implementation tasks.
**Implementation steps**: Run `pytest -q` from `can_usb_adapter/` with no USB device and no external trace; generate coverage for `src/prioracan`; document the baseline (≥90% excluding the python-can seam's hardware-only branches). Run the repo's existing desktop-agent test command and confirm it is unaffected.
**Tests to add**: No new test; the gate is the full green suite + coverage report.
**Acceptance criteria**: `pytest -q` exits 0 with no USB hardware and no external file; coverage ≥90% on `src/prioracan` (seam hardware branches excluded); existing PrioraScan tests still pass; no transmit/ISO-TP/UDS/DBC/replay/streaming code exists (T022 green).

- [ ] T024 Add optional sanitized Yaris sample fixture in `can_usb_adapter/examples/fixtures/`

**Goal**: Optional demo/example data only; never a test dependency; sanitized.
**Files to modify**: `can_usb_adapter/examples/fixtures/sample_yaris.jsonl` (sanitized); `can_usb_adapter/examples/load_sample.py`.
**Dependencies**: T018, T016.
**Implementation steps**: If a real Toyota Yaris trace is available, sanitize it (remove/abstract any vehicle-identifying content; no VIN, no private data) and store a small subset as JSONL under `examples/fixtures/`. Provide `examples/load_sample.py` that loads it into a `MockDriver` frame list for demos. Add a README note that it is examples-only and not a test dependency. If no trace is available, skip the file and leave only the loader stub + note (no TODO; a working loader that returns an empty list when the file is absent).
**Tests to add**: `can_usb_adapter/tests/test_sample_fixture_optional.py` — assert the loader works when the file is present and returns an empty list (no error) when absent; assert no unit test in `tests/` imports the sample as a required dependency (scan test files).
**Acceptance criteria**: Sample is examples-only; loader degrades gracefully when absent; no unit test requires it; sanitization note present; no VIN/private data in the file.

---

## Phase 9: Documentation (plan Phase 9) — Polish & Cross-Cutting

**Purpose**: README, usage examples, driver-implementation guide, and extension guide for future drivers.

- [ ] T025 [P] Write examples + guides in `can_usb_adapter/examples/README.md`

**Goal**: Usage examples, driver-implementation guide, and future-driver extension guide.
**Files to modify**: `can_usb_adapter/examples/README.md`.
**Dependencies**: T015, T020.
**Implementation steps**: Document a mock-driver usage example (runs with no hardware), a GS_USB usage example (real hardware, with libusb caveat), a driver-implementation guide (how to implement `CanDriver` for a new backend), and an extension guide explaining how to add SocketCAN/PCAN/Vector/Kvaser/Serial CAN/MCP2515 under `drivers/adapters/` **without** changing `CanFrame`/`CanDriver`/`DriverStatus`/`DriverCapabilities`.
**Tests to add**: `can_usb_adapter/tests/test_docs_smoke.py` (see T027) covers importability of documented symbols.
**Acceptance criteria**: Examples run with the mock driver and no hardware; extension guide explicitly states public contracts stay unchanged when adding a driver.

- [ ] T026 [P] Finalize README + public docstrings in `can_usb_adapter/README.md`

**Goal**: Complete README + docstrings on the public surface.
**Files to modify**: `can_usb_adapter/README.md`; public docstrings across `src/prioracan/`.
**Dependencies**: T020.
**Implementation steps**: Finalize README (purpose, install, read-only safety, platform setup, minimal usage, link to `examples/README.md`). Ensure every public symbol in `__all__` has a one-line docstring.
**Tests to add**: covered by T027 docs smoke test.
**Acceptance criteria**: README complete; every `__all__` symbol has a docstring; read-only constraint stated.

- [ ] T027 Add documentation smoke test in `can_usb_adapter/tests/test_docs_smoke.py`

**Goal**: Guard against doc drift — every symbol used in README/examples is importable and the mock example runs.
**Files to modify**: `can_usb_adapter/tests/test_docs_smoke.py`.
**Dependencies**: T025, T026.
**Implementation steps**: Parse/execute the documented mock-driver example from `examples/README.md` (or a mirrored snippet) and assert it imports only from `prioracan`, runs with `MockDriver`, and never imports `can`. Assert all public symbols referenced in docs are in `prioracan.__all__`.
**Tests to add**: This is the test.
**Acceptance criteria**: Documentation smoke test is green; documented symbols importable; mock example runs with no hardware and no `python-can` import.

---

## Dependencies & Execution Order

### Phase dependencies (matches plan.md)

- **Phase 1 (Setup)**: T001 → (T002, T003 parallel).
- **Phase 2 (Core Domain)**: T004, T005 unblock T006; T004 unblocks T007/T008; T009/T010 independent. All block Phase 3.
- **Phase 3 (Driver Architecture)**: T011 (needs T006/T008/T009) → T012 (needs T004–T011). Blocks Phases 4–7.
- **Phase 4 (US1 / GS_USB)**: T013 → T014. (MVP checkpoint.)
- **Phase 5 (US2 / Mock)**: T015 → T016. Can run in parallel with Phase 4 after Phase 3.
- **Phase 6 (US3 / Logging)**: T017 → (T018, T019 parallel). Can run in parallel with Phases 4–5 after T006.
- **Phase 7 (Connection)**: T020 (needs T011/T015/T017/T018). After Phases 4–6.
- **Phase 8 (Testing/Guards)**: T021, T022, T023, T024 — after the implementation they guard.
- **Phase 9 (Docs)**: T025, T026 parallel → T027. After Phase 8.

### User-story independence

- **US1 (P1, MVP)**: Phases 1–4 deliver receive-via-GS_USB (virtual-bus tested). Stop-and-validate here.
- **US2 (P2)**: Phase 5 adds hardware-free mock testing; independent of US1's real driver.
- **US3 (P3)**: Phase 6 adds logging; depends only on `CanFrame` (Phase 2), independent of drivers.
- **Connection (US1+US3)**: Phase 7 composes them; thin only.

### Parallel opportunities

- Phase 1: T002 ∥ T003 (after T001).
- Phase 2: T005 ∥ T007 ∥ T008 ∥ T009 ∥ T010 (after their tiny deps); T004 first.
- Phase 6: T018 ∥ T019 (after T017).
- Phase 9: T025 ∥ T026 (after T020).
- After Phase 3: Phase 4 (US1), Phase 5 (US2), Phase 6 (US3) can be worked in parallel by different developers.

---

## Implementation Strategy

### MVP First (User Story 1 only)
1. Phase 1 (Setup) → 2. Phase 2 (Core Domain) → 3. Phase 3 (Driver Architecture) → 4. Phase 4 (US1 GS_USB via virtual bus) → **STOP and validate**: receive a validated RX frame with no USB hardware.

### Incremental Delivery
1. Phases 1–4 → MVP (receive).
2. Phase 5 → hardware-free testing capability.
3. Phase 6 → logging.
4. Phase 7 → thin connection service (end-to-end slice).
5. Phase 8 → guards + CI + coverage.
6. Phase 9 → documentation.

---

## Traceability (requirements & acceptance → tasks)

**Spec FR coverage**: FR-001 (isolation) → T001/T022; FR-002 (read-only/RX) → T006/T014/T022; FR-003 (frame model) → T006; FR-004 (validation) → T006; FR-005 (immutable) → T006; FR-006 (config) → T007; FR-007 (driver abstraction) → T011; FR-008 (GS_USB + python-can hidden + capabilities) → T013/T014; FR-009 (future drivers) → T011/T025; FR-010 (mock) → T015; FR-011 (error taxonomy + mapping) → T004/T013; FR-012 (DriverStatus) → T008; FR-013 (logger interface) → T017; FR-014 (JSONL) → T018; FR-015 (ASC minimal) → T019; FR-016 (thin ConnectionService) → T020; FR-017 (hardware-free tests) → T016/T021/T023; FR-018 (Yaris fixture) → T024; FR-019 (no ISO-TP/UDS/DBC) → T022; FR-020 (no integration) → T022; FR-021 (packaging/README) → T001/T002/T026; FR-022 (DriverCapabilities) → T009; FR-023 (CaptureSession) → T010.

**Plan phase coverage**: Phase 1 → T001–T003; Phase 2 → T004–T010; Phase 3 → T011–T012; Phase 4 → T013–T014; Phase 5 → T015–T016; Phase 6 → T017–T019; Phase 7 → T020; Phase 8 → T021–T024; Phase 9 → T025–T027.

**Architecture-constraint coverage**: ELM327 untouched / can_usb_adapter-only / no integration → T022; no transmit/FD/ISO-TP/UDS/DBC/replay/streaming → T006/T014/T022; no singleton/global state / multi-instance → T011/T013/T015/T021/T022; driver chain preserved → T011/T013/T014/T022.

Every task has corresponding tests; no orphan requirements; no duplicate tasks; ordering respects dependencies with no cycles.

## Notes

- [P] = different files, no dependency on an incomplete task in the same batch.
- [US] = task serves that user story (US1 receive, US2 hardware-free testing, US3 logging).
- Commit after each task or logical group (human executes git per CLAUDE.md).
- Stop at any checkpoint to validate a story independently.
- Every implementation task must end with passing tests before continuing.
