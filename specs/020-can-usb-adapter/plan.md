# Implementation Plan: CAN USB Adapter Foundation

**Branch**: `020-can-usb-adapter` | **Date**: 2026-06-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/020-can-usb-adapter/spec.md`

**Note**: This plan covers architecture and execution strategy only. No production code is written in this phase.

## Summary

Build `can_usb_adapter` — a completely isolated, standalone, read-only Python library (`prioracan`) that receives raw Classic CAN frames from USB-CAN adapters. The architecture is driver-agnostic: a generic `CanDriver` abstraction is backed by `GsUsbDriver` (the first concrete driver), which talks only to an internal `PythonCanAdapter` wrapper around `python-can`. The chain is `CanDriver → GsUsbDriver → PythonCanAdapter → python-can`; the rest of the library never imports or handles `python-can`/`libusb` objects, and all low-level exceptions are translated into PrioraCAN domain errors. The foundation delivers stable long-term contracts — `CanFrame`, `DriverStatus`, `DriverCapabilities`, `CaptureSession`, `CanUsbConfig`, a domain error taxonomy — a mock driver for hardware-free testing, minimal logging (required JSONL + minimal/placeholder ASC), a thin `ConnectionService`, a hardware-independent pytest suite, and documentation. No transmit, no CAN FD, no ISO-TP/UDS/DBC, no replay, no live streaming, and no desktop-agent/backend/frontend integration. The existing ELM327 adapter is untouched. Per the spec, PRD/SAD must be updated before any product integration (deferred to a future feature).

## Technical Context

**Language/Version**: Python 3.11+ (matches a modern, stable baseline; python-can supports 3.9+, so 3.11 is a safe minimum). Final minimum pinned in `pyproject.toml` during Phase 1 implementation.

**Primary Dependencies**: `python-can` (used **only** inside the internal `PythonCanAdapter` wrapper for the GS_USB/candleLight backend; never imported by the public API or any other module). `pytest` + `pytest-cov` (dev/test only). No runtime dependency on `libusb` directly — it is transitive through python-can's `gs_usb` interface.

**Storage**: N/A as a database. File-based capture logging only — JSONL (required) and ASC (minimal/placeholder) writers under a configurable log directory. No persistence of sessions beyond optional log files.

**Testing**: `pytest`, fully hardware-independent. python-can's `"virtual"` bus is used for `PythonCanAdapter`/`GsUsbDriver` tests so no USB device is required. Handcrafted deterministic frames for unit tests; optional sanitized Yaris sample for examples/demos/manual validation only.

**Target Platform**: Cross-platform Python (Windows, Linux, macOS). candleLight/GS_USB adapters typically need `libusb` and OS-specific driver setup (e.g. Zadig on Windows, `udev` rules on Linux); the library code itself is platform-agnostic, but the plan documents platform setup in the README.

**Project Type**: Library (`prioracan`), `src/` layout, importable as a standalone package independent of the rest of PrioraScan.

**Performance Goals**: The receive path must not be a bottleneck under realistic Classic CAN load. Soft target: the in-process receive path (mock and virtual-bus) sustains ≥ 8 000 frames/s with no backpressure loss in the foundation layer. Not a hot product path; validated via mock/virtual-bus throughput tests, not real hardware.

**Constraints**: Read-only (no transmit, RX-only direction). Classic CAN only (0–8 byte payloads; CAN FD rejected). Immutable frames. Hardware-independent CI. Isolated package — zero modifications outside `can_usb_adapter/` and `specs/020-can-usb-adapter/`. No ELM327 changes. No product integration. **No singletons, no global mutable state; multiple `CanDriver` instances supported simultaneously and fully independent** (see Architecture Constraints). Every file < 300 lines; every function < 30 lines (Constitution Principle V).

**Scale/Scope**: Foundation library — ~25–30 small modules, each with a single responsibility. Public surface deliberately narrow. No UI, no HTTP API, no database, no tenant model.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The Constitution gates are evaluated against the nature of this feature: an **isolated engineering foundation library**, not a product feature. It introduces no product entity, no HTTP/API endpoint, no tenant-scoped data, no UI, and no business rule. Product integration is explicitly deferred to a future feature (provisionally 030) that will require PRD/SAD updates first.

- [x] **Does not contradict `docs/PRD.md`, `docs/SAD.md`, `docs/FRONTEND_ARCHITECTURE.md`** — This feature is tracked in SpecKit but sits outside the documented product roadmap (spec Assumptions). It adds no product behavior and changes no product contract. It is consistent with Principle VIII (Scan Source Agnostic) and Principle XIII (Progressive Hardware Integration) as pre-product foundation work for a future raw-CAN source; it does not alter the fixed hardware-integration order because it is not yet a product source. No contradiction.
- [x] **Multi-tenant boundaries defined for all new entities** — N/A for this feature. `CanFrame`, `DriverStatus`, `DriverCapabilities`, `CaptureSession`, `CanUsbConfig` are transport-level foundation constructs, not tenant-scoped business entities. Tenant scoping will be introduced at product integration (future feature) when frames/sessions become business data. Documented in data-model.md.
- [x] **API contracts specified before backend implementation** — N/A for HTTP/backend (none in this feature). The library's **public Python API** contract is specified in `contracts/library-api-contract.md` before any code. Satisfies the intent (contracts first).
- [x] **AI features include explainability and human-confirmation** — N/A. No AI in this feature.
- [x] **No PrioraFlow dependency for core workflows** — PASS. The library has no PrioraFlow dependency and no dependency on any PrioraScan product module.
- [x] **Error handling and audit logging included in the design** — Error handling: PASS — a full domain error taxonomy is core (Phase 2). Audit logging: N/A as business audit; CAN frame logging (JSONL/ASC) is an engineering capture log, not a business audit log. Business audit will be added at product integration.

**Additional principle alignment**:
- Principle II (Design Before Implementation): this plan **is** the design; no code is written before plan + tasks approval.
- Principle IV (Modular Development): one isolated module only; narrow public interface; internals hidden.
- Principle V (Code Quality): < 300 lines/file, < 30 lines/function, explicit error paths, no dead code, no hardcoded config — enforced as phase acceptance criteria.
- Principle XIV (Git & Change Safety): work on branch `020-can-usb-adapter`; no changes to any existing public contract (ELM327 adapter untouched).
- Principle XV (Simplicity Over Complexity): the library does one thing — receive raw CAN frames read-only — and defers everything else.

**Re-check after Phase 1 design**: confirmed — the data model and contracts introduce no product entity, no tenant boundary, and no public contract change to existing modules. All gates remain satisfied. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/020-can-usb-adapter/
├── spec.md                 # Approved specification (/speckit-specify)
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
can_usb_adapter/                       # isolated root-level library
├── pyproject.toml                     # package = prioracan, src/ layout, deps, dev tooling
├── README.md                          # purpose, install, read-only safety note, platform setup
├── src/
│   └── prioracan/
│       ├── __init__.py                # narrow public re-exports
│       ├── config.py                  # CanUsbConfig
│       ├── frame.py                   # CanFrame (immutable, validating)
│       ├── errors.py                  # domain error taxonomy
│       ├── status.py                  # DriverStatus (states + extensible metadata)
│       ├── capabilities.py            # DriverCapabilities
│       ├── session.py                 # CaptureSession (lightweight)
│       ├── drivers/
│       │   ├── __init__.py
│       │   ├── base.py                # CanDriver abstraction (Protocol/ABC)
│       │   ├── gs_usb.py              # GsUsbDriver (talks only to PythonCanAdapter)
│       │   ├── mock.py                # MockDriver (deterministic, hardware-free)
│       │   └── adapters/
│       │       ├── __init__.py
│       │       └── python_can_adapter.py  # INTERNAL wrapper around python-can (single seam)
│       ├── logging/
│       │   ├── __init__.py
│       │   ├── base.py                # FrameLogger interface
│       │   ├── jsonl.py               # JsonlLogger (required, fully supported)
│       │   └── asc.py                 # AscLogger (minimal/placeholder)
│       ├── services/
│       │   ├── __init__.py
│       │   └── connection.py          # ConnectionService (thin)
│       └── utils/
│           ├── __init__.py
│           └── hex.py                 # hex formatting helpers (arb id, data_hex)
├── examples/
│   ├── fixtures/                      # optional sanitized Yaris sample (demo only)
│   └── README.md                      # usage examples / driver / extension guide
└── tests/
    ├── conftest.py                    # handcrafted deterministic frame fixtures
    ├── fixtures/
    │   └── frames.py                  # deterministic handcrafted frames (unit tests)
    ├── test_frame.py
    ├── test_config.py
    ├── test_errors.py
    ├── test_status.py
    ├── test_capabilities.py
    ├── test_session.py
    ├── test_mock_driver.py
    ├── test_jsonl_logger.py
    ├── test_asc_logger.py
    ├── test_connection_service.py
    └── test_pythoncan_adapter.py      # uses python-can "virtual" bus (no hardware)
```

**Structure Decision**: Isolated `src/`-layout library (`prioracan`) under a new root folder `can_usb_adapter/`. The `drivers/_pythoncan_adapter.py` module is the **single** seam where `python-can` is imported (underscore-prefixed = internal). All other modules depend only on `frame`, `errors`, `status`, `capabilities`, `config`, `session`, and the `drivers/base` abstraction. `logging/` is kept as the spec name; Python 3 absolute imports prevent any collision with the stdlib `logging` module (documented in research.md). `examples/` and `tests/fixtures/` keep demo/fixture data out of the package and out of the import path. No file outside `can_usb_adapter/` and `specs/020-can-usb-adapter/` is created or modified.

## Complexity Tracking

No Constitution Check violations require justification. The one architectural choice worth noting — a dedicated `PythonCanAdapter` indirection layer instead of letting `GsUsbDriver` call `python-can` directly — is **not** a violation; it is the explicit user requirement to hide the third-party dependency behind an internal abstraction (SOLID dependency inversion, single seam for error translation). It adds one small internal module and removes a class of cross-cutting risk. No simpler alternative is rejected unjustly.

## Architecture Constraints

These are non-negotiable architectural rules for the foundation, enforced as acceptance criteria and CI guards:

- **No singleton objects.** No class or module may expose a single shared instance. Drivers, loggers, and the connection service are constructed per use.
- **No global mutable state.** No module-level mutable containers, no module-level cached bus handles, no ambient configuration. All state lives inside instances constructed by the caller.
- **Multiple `CanDriver` instances must be supported simultaneously.** A consumer can construct and run two or more drivers (e.g. two USB-CAN adapters on different channels, or a real driver alongside a mock) in the same process without interference.
- **Drivers are completely independent from each other.** One driver's connect/receive/disconnect/status must not affect another's. There is no shared lock, shared bus, or shared queue at the abstraction level. (The ELM327-style shared `adapter_lock` pattern is explicitly **not** applied here — that exists because the ELM327 is a single command/response device; CAN receive is a different model.)
- **One third-party seam.** `python-can` is imported in exactly one module — `drivers/adapters/python_can_adapter.py` — behind the `PythonCanAdapter` wrapper. `GsUsbDriver` communicates only with `PythonCanAdapter`. This structure lets future adapters (e.g. a direct SocketCAN adapter, a PCAN adapter) be added under `drivers/adapters/` without restructuring the driver layer or changing public APIs.

These constraints prepare the library for future multi-channel and multiple-USB-adapter support (future features) without any rework of the foundation contracts.

## Implementation Phases

Phases are ordered by dependency. Each phase is independently testable before the next begins. Every phase lists **Dependencies**, **Deliverables**, **Technical risks**, **Validation**, **Testing**, and **Acceptance criteria**. No phase introduces transmit, CAN FD, ISO-TP, UDS, DBC, replay, live streaming, or any product integration.

### Phase 1 — Project Foundation

**Dependencies**: None.

**Deliverables**: `can_usb_adapter/` root folder; `pyproject.toml` (package `prioracan`, `src/` layout, Python ≥3.11, runtime dep `python-can`, dev deps `pytest`/`pytest-cov`); package skeleton (`src/prioracan/__init__.py` and all subpackage `__init__.py`); `README.md` (purpose, install, read-only safety note, platform/libusb setup); dev tooling config (pytest config, ruff/black optional). Empty stubs only — no domain logic.

**Technical risks**: Naming collision between `prioracan.logging` and stdlib `logging` (mitigated by Python 3 absolute imports; documented). `src/` layout requires correct `tool.setuptools.package-dir` / `packages` config or the package won't import (mitigated by verifying `pip install -e .` + `python -c "import prioracan"` in validation).

**Validation**: `pip install -e .[dev]` succeeds; `python -c "import prioracan"` resolves to the local package (not stdlib); `pytest` runs with zero collected tests and exits 0; `python-can` is importable in the env.

**Testing**: No unit tests yet; the validation commands above are the gate.

**Acceptance criteria**:
1. `can_usb_adapter/` exists as a standalone package importable as `prioracan`.
2. `pip install -e .[dev]` succeeds on a clean venv.
3. `import prioracan` works and does not import stdlib `logging` inadvertently.
4. README states purpose, install, read-only constraint, and libusb/platform notes.
5. No file outside `can_usb_adapter/` is modified.

### Phase 2 — Core Domain

**Dependencies**: Phase 1.

**Deliverables**: `frame.py` (`CanFrame` — immutable, self-validating, derived `arbitration_id_hex` and `data_hex`, direction=RX-only, named/numeric channel), `config.py` (`CanUsbConfig` with documented defaults), `errors.py` (full taxonomy), `status.py` (`DriverStatus` states + extensible metadata), `capabilities.py` (`DriverCapabilities`), `session.py` (`CaptureSession` lightweight), `utils/hex.py`.

**Technical risks**: Immutability vs. derived fields (mitigated by `@dataclass(frozen=True)` with `__post_init__` validation and `property`-based derived fields, or `cached_property` — decision in research.md). Over-engineering the metadata containers (mitigated by keeping `DriverStatus`/`DriverCapabilities`/`CaptureSession` as simple frozen dataclasses with optional fields, no frameworks). Validation rigor vs. simplicity (mitigated by validating only what the spec mandates: ID range, DLC=length, 0–8 bytes, RX-only).

**Validation**: Each model can be constructed, validated, and rejected on invalid input in isolation. `CanFrame` is hashable/immutable (mutation raises `FrozenInstanceError`). Derived hex fields are uppercase and correct.

**Testing**: `test_frame.py`, `test_config.py`, `test_errors.py`, `test_status.py`, `test_capabilities.py`, `test_session.py` — construction, defaults, validation rejections, immutability, hex formatting, state values, capability flags. Hardware-free.

**Acceptance criteria**:
1. `CanFrame` validates standard/extended ID ranges, DLC=length, 0–8 bytes, RX-only; rejects all violations with domain errors.
2. `CanFrame` is immutable; derived hex fields are uppercase and correct.
3. `CanUsbConfig` defaults match the spec (interface `gs_usb`, channel 0, bitrate 500000, timeout 1.0, log flags).
4. `DriverStatus` has DISCONNECTED/CONNECTED/LISTENING/ERROR and accepts extensible metadata.
5. `DriverCapabilities` covers all seven fields; GS_USB default capability set is available (the driver sets it in Phase 4).
6. `CaptureSession` carries id, start/end, active, optional stats, driver + config refs and is minimal (no workflow logic).
7. All domain error types exist and form a coherent hierarchy rooted at `CanAdapterError`.
8. All tests green; every file < 300 lines; every function < 30 lines.

### Phase 3 — Driver Architecture

**Dependencies**: Phase 2.

**Deliverables**: `drivers/base.py` — the `CanDriver` abstraction (Protocol or ABC with `connect`, `disconnect`, `is_connected`, `receive(timeout_seconds)`, `iter_frames(stop_event=None)`, `get_status()`, `get_capabilities()`). No `transmit`. Defines lifecycle and contract; no concrete driver yet (a trivial in-memory reference driver may be used to test the contract, but the real concrete drivers land in Phases 4–5).

**Technical risks**: ABC vs Protocol (decision in research.md — Protocol preferred for duck-typing/extensibility, ABC if shared helpers needed). Thread-safety of `iter_frames` vs. `disconnect` from another thread (mitigated by documenting the threading contract: `iter_frames` checks the stop event and the connection state each loop; `disconnect` is idempotent and safe to call from another thread; per-driver locking is the driver's responsibility). Over-broad interface (mitigated by keeping exactly the spec's seven operations).

**Validation**: The abstraction compiles/imports; a minimal conforming stub implements all operations; `isinstance`/Protocol checks pass; `transmit` is provably absent from the interface.

**Testing**: Contract test via the mock driver (Phase 5) and a trivial stub here; assert the interface has exactly the specified methods and no `transmit`/`send`/`write`.

**Acceptance criteria**:
1. `CanDriver` exposes exactly `connect`, `disconnect`, `is_connected`, `receive`, `iter_frames`, `get_status`, `get_capabilities` — and no transmit method.
2. The contract is vendor-independent and references only domain types (`CanFrame`, `DriverStatus`, `DriverCapabilities`, domain errors).
3. `iter_frames` is documented as a thin iterator over `receive` with an optional stop event — not a streaming engine.
4. A conforming implementation passes a contract check; a non-conforming one (e.g. exposing `transmit`) fails.
5. The abstraction imposes **no singleton, no global mutable state, no shared lock**; two driver instances can coexist and operate independently in the same process (verified by a multi-instance test in Phase 8).
6. All tests green; file/function size limits met.

### Phase 4 — Python CAN Integration (GS_USB)

**Dependencies**: Phase 3.

**Deliverables**: `drivers/adapters/python_can_adapter.py` (the **single** module that imports `python-can`; wraps bus open/close, `recv(timeout)`, and maps `python-can`/`libusb` exceptions to domain errors) and `drivers/gs_usb.py` (`GsUsbDriver` implementing `CanDriver` by composing a `PythonCanAdapter`; converts `python_can.Message` → `CanFrame`; reports `DriverStatus` and the GS_USB `DriverCapabilities`). `GsUsbDriver` communicates **only** with `PythonCanAdapter`. Desired chain realized: `CanDriver → GsUsbDriver → PythonCanAdapter → python-can`.

**Technical risks**: `python-can` exception types vary by backend/version (mitigated by catching broad categories at the seam and mapping to specific domain errors; unknown exceptions → `CanAdapterError` base). `libusb` permission/not-found errors surface as opaque exceptions (mitigated by heuristics on exception type/message → `CanDeviceNotFoundError`/`CanPermissionError`; documented mapping table in research.md). Real hardware unavailable in CI (mitigated by testing `PythonCanAdapter` + `GsUsbDriver` against python-can's `"virtual"` bus — no USB needed). Timestamp availability (mitigated by `DriverCapabilities.timestamps` reflecting whether the stack provides reliable timestamps; if not, the driver supplies a monotonic fallback and flags it).

**Validation**: `GsUsbDriver` opens a python-can `"virtual"` bus, receives a sent frame, and returns a validated `CanFrame` marked RX — all without USB hardware. Disconnect is idempotent. Injecting a simulated `python-can`/`libusb` error at the seam surfaces as the correct domain error, never as a raw library exception.

**Testing**: `test_pythoncan_adapter.py` — virtual-bus open/recv/close; error mapping for simulated library exceptions. `GsUsbDriver` covered via the virtual bus in the same module. No real-hardware test is required or allowed in CI.

**Acceptance criteria**:
1. `python-can` is imported in exactly one module (`drivers/adapters/python_can_adapter.py`); grep across `src/prioracan` confirms no other module imports it.
2. `GsUsbDriver` implements the full `CanDriver` contract and exposes GS_USB capabilities (receive=true, transmit=false, can_fd=false, hardware_filters=false, software_filters=false, replay=false, timestamps=true when supported).
3. `python_can.Message` → `CanFrame` conversion is correct (ID, flags, DLC, data, timestamp, channel).
4. Simulated `python-can`/`libusb` exceptions map to the correct domain errors and never leak.
5. No `transmit`/`send`/`send_periodic` is exposed or called.
6. Virtual-bus test passes with no USB device; all tests green; size limits met.

### Phase 5 — Mock Driver

**Dependencies**: Phases 2, 3.

**Deliverables**: `drivers/mock.py` — `MockDriver` accepting a predefined `CanFrame` list; deterministic sequential replay; empty-bus → `CanReceiveTimeout`; `connect`/`disconnect`/`is_connected`; `get_status()` reflecting DISCONNECTED/CONNECTED/LISTENING/ERROR; `get_capabilities()` (receive=true, transmit=false, replay=true-as-source-only, timestamps=true). Optional loading of sanitized sample frames from `examples/fixtures/` for demos.

**Technical risks**: Timeout behavior vs. test determinism (mitigated by making the empty-bus path raise `CanReceiveTimeout` immediately or after a configurable tiny timeout, defaulting to immediate for fast tests). Status fidelity (mitigated by reusing the same `DriverStatus` model as real drivers).

**Validation**: `MockDriver` returns frames in order; raises `CanReceiveTimeout` when exhausted; reports correct status transitions; reports capabilities.

**Testing**: `test_mock_driver.py` — ordered replay, exhaustion timeout, connect/disconnect idempotency, status transitions, capability values, optional sample-fixture load (skipped if absent, never required).

**Acceptance criteria**:
1. `MockDriver` replays the supplied list deterministically and in order.
2. Exhausted bus raises `CanReceiveTimeout` (configurable, immediate by default for fast CI).
3. Status transitions DISCONNECTED→CONNECTED→LISTENING→(ERROR on failure) work.
4. Capabilities are reported and accurate for a mock.
5. Tests are hardware-free and deterministic; size limits met.

### Phase 6 — Logging

**Dependencies**: Phase 2 (CanFrame). Independent of Phases 3–5.

**Deliverables**: `logging/base.py` (`FrameLogger` interface: `open`, `write_frame(frame)`, `close`), `logging/jsonl.py` (`JsonlLogger` — one JSON object per frame; payload as `data_hex`; includes timestamp, channel/bus, direction, arbitration_id + hex, dlc, data_hex, flags), `logging/asc.py` (`AscLogger` — minimal safe implementation or documented placeholder; full fidelity deferred).

**Technical risks**: `logging/` package name vs. stdlib (mitigated by absolute imports; documented; rename to `loggers/` if any issue surfaces). ASC fidelity expectations (mitigated by explicitly documenting this as minimal/placeholder and deferring full ASC to a future logging feature — no hidden limitations). Logger failure handling (mitigated by `write_frame` raising `CanLoggingError` and `close` being safe to call after an error). File handles (mitigated by context-manager-friendly `close` and not holding handles across process forks).

**Validation**: JSONL output is one valid JSON object per line, parseable by `json.loads`, with all required fields and hex-serialized payload. ASC output is produced through the same interface; limitations are documented in code and README.

**Testing**: `test_jsonl_logger.py` — write N frames, read back lines, assert count and fields/serialization. `test_asc_logger.py` — interface conformance + documented-limitation assertion. Logger-failure → `CanLoggingError`. Hardware-free.

**Acceptance criteria**:
1. `JsonlLogger` writes exactly one valid, parseable record per frame with all required fields and `data_hex` payload.
2. `AscLogger` conforms to the `FrameLogger` interface and documents its foundation limitations.
3. Logger errors raise `CanLoggingError` without corrupting prior records.
4. Logging does not import or depend on the driver layer; the driver layer does not depend on logging.
5. All tests green; size limits met.

### Phase 7 — Connection Layer

**Dependencies**: Phases 3, 5, 6.

**Deliverables**: `services/connection.py` — thin `ConnectionService`: `connect()`, `receive_once()` (receive one frame, forward to enabled loggers, return the frame), `get_status()`, `disconnect()`. Optional loggers injected at construction. No streaming loop, no state machine, no business logic, no workflow.

**Technical risks**: Scope creep into streaming/orchestration (mitigated by an explicit "thin" contract — only `receive_once`, no `run`/`stream` method; `iter_frames` stays on the driver, not the service). Logger failure propagation (mitigated by isolating logger errors so a logger failure raises `CanLoggingError` but does not crash an active receive).

**Validation**: With a `MockDriver` + a `JsonlLogger`, `receive_once()` returns the next frame and a JSONL record is written; `get_status()` reflects the driver; `disconnect()` is idempotent.

**Testing**: `test_connection_service.py` — connect/receive-once/log/disconnect using `MockDriver` + `JsonlLogger`; status propagation; idempotent disconnect; logger-error isolation.

**Acceptance criteria**:
1. `ConnectionService` exposes only connect, receive-once, status, disconnect — no streaming/workflow/state-machine methods.
2. A received frame is forwarded to all enabled loggers.
3. Status reflects the underlying driver.
4. Disconnect is idempotent and safe.
5. All tests green; size limits met.

### Phase 8 — Testing Strategy & Fixtures

**Dependencies**: Phases 2–7.

**Deliverables**: `tests/conftest.py` and `tests/fixtures/frames.py` (handcrafted deterministic frames); finalization of all `test_*.py`; optional `examples/fixtures/` sanitized Yaris sample (demo only, not a test dependency); CI runs fully hardware-free; coverage configuration.

**Technical risks**: Accidentally coupling a unit test to the optional Yaris trace (mitigated by a rule: unit tests use only `tests/fixtures/frames.py`; trace is examples-only). Platform-dependent python-can backends in CI (mitigated by using the `"virtual"` bus everywhere in tests). Flaky timeouts (mitigated by immediate-timeout mock default and short, explicit timeouts).

**Validation**: Full suite green on a machine with no USB-CAN adapter and no external trace file. `pytest -q` exits 0. Coverage report generated.

**Testing**: This phase **is** the testing strategy; it consolidates and guards the hardware-free/deterministic guarantees.

**Acceptance criteria**:
1. The entire suite passes with no USB-CAN adapter and no external file path.
2. No unit test imports or requires the Yaris trace; trace is examples-only.
3. Existing PrioraScan tests (outside `can_usb_adapter/`) are unaffected — verified by running the repo's existing test command.
4. Coverage meets a documented baseline (e.g. ≥ 90% on `src/prioracan` excluding the python-can seam's hardware-only branches).
5. No transmit/ISO-TP/UDS/DBC/replay/streaming code exists anywhere (grep guard).
6. **Multi-instance**: two `MockDriver` instances (and a `MockDriver` alongside a virtual-bus `GsUsbDriver`) run simultaneously in the same process without interference.
7. **No global mutable state**: a grep guard confirms no module-level mutable singletons/bus handles/cache in `src/prioracan`.

### Phase 9 — Documentation

**Dependencies**: Phases 1–8.

**Deliverables**: `README.md` finalized (purpose, install, read-only safety, platform/libusb setup, minimal usage); `examples/README.md` with usage examples, a driver-implementation guide (how to add a new driver behind `CanDriver`), and an extension guide for future drivers (SocketCAN/PCAN/Vector/Kvaser/Serial CAN/MCP2515) without changing public APIs; in-code docstrings for the public surface.

**Technical risks**: Documentation drift (mitigated by keeping examples tied to the mock driver so they run without hardware, and by a doc check in CI that imports the documented symbols).

**Validation**: Every public symbol mentioned in the README/examples is importable from `prioracan`; examples run against the mock driver with no hardware.

**Testing**: A documentation smoke test that imports the symbols used in examples and runs the mock-driver example.

**Acceptance criteria**:
1. README states purpose, install, read-only constraint, and platform setup.
2. Usage examples run with the mock driver and no hardware.
3. Driver-implementation and extension guides explain adding a driver without changing `CanFrame`/`CanDriver`/`DriverStatus`/`DriverCapabilities` contracts.
4. All documented public symbols are importable; smoke test green.

## Cross-Cutting Technical Risks

- **Dependency leakage**: the single biggest architectural risk is `python-can` leaking beyond `drivers/adapters/python_can_adapter.py`. Mitigation: a grep guard in CI (`grep -R "import can\|from can " src/prioracan` must match only `drivers/adapters/python_can_adapter.py`) and a review checklist item.
- **Contract drift**: future drivers/filters/replay must not change core contracts. Mitigation: `CanFrame`, `DriverStatus`, `DriverCapabilities`, `CanDriver` are designed as stable contracts; extensibility via composition and optional fields, not by editing core shapes.
- **Platform/libusb variability**: GS_USB needs OS-specific setup. Mitigation: code is platform-agnostic; setup is documented; CI uses the virtual bus.
- **Over-engineering**: foundation features (sessions, capabilities) risk becoming workflow engines. Mitigation: each is explicitly minimal; phase acceptance criteria forbid streaming/state-machine logic.

## Validation Strategy

- **Per-phase**: each phase has explicit acceptance criteria and a test gate; no phase starts until the previous phase's tests are green.
- **Integration**: `ConnectionService` + `MockDriver` + `JsonlLogger` is the smallest end-to-end slice and is tested in Phase 7.
- **Hardware-free guarantee**: every test runs without a USB-CAN adapter; `GsUsbDriver` is tested via the python-can virtual bus.
- **Static guards**: grep guards for (a) no `python-can` import outside `drivers/adapters/python_can_adapter.py`, (b) no `transmit`/`send`/`write` symbol, (c) no ISO-TP/UDS/DBC/replay symbols, (d) no modifications outside `can_usb_adapter/` + `specs/020-can-usb-adapter/`, (e) no module-level mutable global state / singletons in `src/prioracan`.
- **Constitution compliance**: file < 300 lines, function < 30 lines, explicit error paths, no hardcoded config — checked per phase.

## Testing Strategy

- **Unit tests**: one `test_*.py` per module (frame, config, errors, status, capabilities, session, jsonl, asc).
- **Driver tests**: `test_mock_driver.py` (deterministic) and `test_pythoncan_adapter.py` (virtual bus, no hardware).
- **Service tests**: `test_connection_service.py` using `MockDriver` + `JsonlLogger`.
- **Fixtures**: handcrafted deterministic frames in `tests/fixtures/frames.py`; optional sanitized Yaris sample in `examples/fixtures/` for demos/manual validation only.
- **CI**: fully hardware-independent; `pytest -q` exits 0 on a clean machine; coverage report generated; static guards run.
- **No real-hardware tests** are required or permitted in CI.

## Out of Scope (reaffirmed)

This plan and every phase within it must **not** introduce: transmit/write support; CAN FD; ISO-TP; UDS; DBC decoding; a replay engine; live streaming; desktop-agent integration; backend integration; frontend integration; any modification to the existing ELM327 adapter; any change outside `can_usb_adapter/` and `specs/020-can-usb-adapter/`. Product integration requires PRD/SAD updates first (deferred to a future feature).

## Phase Dependency Order

```text
Phase 1 (foundation)
  └─ Phase 2 (core domain)
       ├─ Phase 3 (driver abstraction)
       │    └─ Phase 4 (python-can / GS_USB)
       ├─ Phase 5 (mock driver)        [needs 2 + 3]
       └─ Phase 6 (logging)            [needs 2 only]
            └─ Phase 7 (connection)    [needs 3 + 5 + 6]
                 └─ Phase 8 (testing)  [needs 2–7]
                      └─ Phase 9 (docs)[needs 1–8]
```

Each phase is independently completable and testable before the next begins, per the user's requirement.