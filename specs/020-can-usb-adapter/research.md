# Phase 0 — Research: CAN USB Adapter Foundation

**Feature**: 020-can-usb-adapter | **Date**: 2026-06-29 | **Spec**: [spec.md](spec.md)

This document resolves every technical decision required to plan the implementation. The Technical Context in `plan.md` has **no NEEDS CLARIFICATION** markers; this file records the decisions, rationale, and alternatives considered so the design and tasks phases have a single reference.

## 1. Language and minimum version

**Decision**: Python 3.11+.

**Rationale**: 3.11 is a modern, widely available baseline with performance improvements and modern typing (`Self`, exception groups available in 3.11, fine-grained error locations). `python-can` supports 3.9+, so 3.11 leaves headroom. The PrioraScan desktop agent is also Python; aligning on a modern version avoids fragmentation.

**Alternatives considered**: 3.10 (acceptable but loses some typing ergonomics); 3.12/3.13 (slightly less ubiquitous in CI runners). 3.11 is the safe middle.

## 2. Primary runtime dependency

**Decision**: `python-can` is the sole runtime third-party dependency, used **only** inside `drivers/adapters/python_can_adapter.py`.

**Rationale**: The spec mandates that the GS_USB driver use `python-can` internally while keeping it fully hidden. `python-can` already supports the `gs_usb` interface (candleLight-compatible), the `"virtual"` interface (for hardware-free tests), and provides `Message` objects, bus lifecycle, and `recv(timeout)`. Wrapping it behind one internal seam satisfies dependency inversion and gives a single place to translate exceptions.

**Alternatives considered**: Direct `libusb`/`gs_usb` ctypes binding (rejected — large effort, reimplements what python-can already does, harder to test); `cantools` (rejected — that is DBC decoding, explicitly out of scope); no dependency / pure OS sockets (rejected — SocketCAN is a *future* driver, not the first one).

## 3. Architecture / layering

**Decision**: `CanDriver` (abstraction) → `GsUsbDriver` (concrete) → `PythonCanAdapter` (internal wrapper) → `python-can`. The rest of the library depends only on the abstraction and domain types.

**Rationale**: This is the user-mandated chain. `PythonCanAdapter` lives in a dedicated `drivers/adapters/` subpackage and is the **single seam** that imports `python-can`, converts `python_can.Message` → `CanFrame`, and maps `python-can`/`libusb` exceptions to domain errors. `GsUsbDriver` communicates **only** with `PythonCanAdapter` and contains only CAN-adapter orchestration logic; it never touches `python-can` types. The dedicated `adapters/` layer keeps the architecture clean and lets future adapters (a direct SocketCAN adapter, a PCAN adapter, etc.) be added under `drivers/adapters/` without restructuring the driver layer. Future drivers (SocketCAN, PCAN, etc.) implement `CanDriver` directly or via their own adapter, without changing `CanDriver`, `CanFrame`, `DriverStatus`, or `DriverCapabilities`.

**Alternatives considered**: Let `GsUsbDriver` call `python-can` directly (rejected — leaks the dependency across the driver module and scatters error translation); an underscore-prefixed `drivers/_pythoncan_adapter.py` flat file (rejected — a dedicated `adapters/` subpackage is cleaner and scales to future adapters without restructuring); a generic "PythonCanDriver" that all python-can backends share (deferred — premature; GS_USB first, generalize when a second python-can backend is added).

## 4. Driver abstraction style — Protocol vs ABC

**Decision**: Use `typing.Protocol` for the `CanDriver` contract, with a small shared helper module (not a base class) for common lifecycle/status bookkeeping that concrete drivers compose.

**Rationale**: A `Protocol` gives structural duck-typing — future drivers don't need to inherit from a PrioraCAN class, lowering the coupling to add a SocketCAN/PCAN driver in an external package. Composition over inheritance (Constitution/SOLID): shared behavior (e.g. status transitions, capability storage) lives in small composed helpers, not a god-base-class.

**Alternatives considered**: `abc.ABC` (rejected as the primary contract — forces inheritance and makes external drivers harder; an ABC may still be offered as an *optional* mixin later, but the contract is the Protocol); no formal interface (rejected — the spec requires a defined abstraction).

## 5. Immutability and derived fields for CanFrame

**Decision**: `@dataclass(frozen=True, slots=True)` with `__post_init__` validation and `@property` (or `functools.cached_property` on a non-slotted variant) for derived `arbitration_id_hex` and `data_hex`.

**Rationale**: `frozen=True` makes instances immutable (spec FR-005) and hashable. `__post_init__` is the standard place to validate and to normalize derived fields. `arbitration_id_hex` and `data_hex` are pure functions of immutable fields, so a `property` is simplest; if perf matters later, `cached_property` can be used (but `slots=True` and `cached_property` conflict, so the foundation uses plain `property` to keep `slots=True` and avoid premature optimization).

**Alternatives considered**: `namedtuple` (rejected — clunky validation, no clean `__post_init__`); `attrs` (rejected — extra dependency for little gain over dataclasses); `pydantic` (rejected — heavy, brings a validation framework we don't need); mutable dataclass with `__setattr__` blocked (rejected — `frozen=True` is idiomatic).

## 6. Validation rules (exact scope)

**Decision**: Validate exactly what the spec mandates — nothing more, to avoid premature complexity.
- Arbitration ID: standard 11-bit → `0 ≤ id ≤ 0x7FF`; extended 29-bit → `0 ≤ id ≤ 0x1FFFFFFF`. A standard flag with an ID > 0x7FF is rejected (`CanConfigurationError`/value error mapped to domain).
- DLC must equal `len(data)`.
- `0 ≤ len(data) ≤ 8` (Classic CAN). > 8 rejected.
- Direction must be `RX` in this feature. Non-RX rejected.
- `data` must be `bytes` (not `bytearray`/`list`) to preserve immutability.

**Rationale**: Constitution Principle XV (simplicity); spec FR-004. CAN FD is out of scope, so no DLC > 8 / BRS / ESI handling.

**Alternatives considered**: Lenient mode that clamps/repairs invalid frames (rejected — silent repair hides bugs; the spec says reject).

## 7. Domain error mapping from python-can / libusb

**Decision**: At the `PythonCanAdapter` seam, catch broad `python-can`/`libusb` exception categories and map them:
- Device missing / bus open failure with "not found" / "no device" → `CanDeviceNotFoundError`.
- Permission / access denied / "could not claim interface" → `CanPermissionError`.
- Bad config (unknown interface, channel, bitrate) → `CanConfigurationError`.
- Backend/driver not installed (`gs_usb` interface unavailable) → `CanDriverNotFoundError`.
- Connection lost mid-session → `CanConnectionError`.
- `recv` returns `None` on timeout → `CanReceiveTimeout` (raised by the driver, not the wrapper, so the abstraction owns the timeout contract).
- Logger failures → `CanLoggingError`.
- Any unmapped exception → `CanAdapterError` (base), with the original chained via `raise ... from original` for diagnostics without leaking the type to consumers.

**Rationale**: Keeps the public surface clean (consumers catch PrioraCAN errors only) while preserving debuggability via exception chaining. The mapping is heuristic on exception type/message because libusb errors are often opaque; the mapping table is documented in code and in this file.

**Alternatives considered**: Re-raise python-can exceptions directly (rejected — violates spec FR-011); swallow and return `None` (rejected — violates error-handling constitution principle).

## 8. Thread-safety contract

**Decision**: Document an explicit, minimal threading contract rather than building heavy synchronization:
- `iter_frames(stop_event)` checks the `stop_event` and the connection state on each iteration and exits when either signals stop.
- `disconnect()` is idempotent and safe to call from a different thread than `iter_frames`; it sets the connected state so the iterator exits on its next check.
- Per-driver internal locking (e.g. around the python-can bus handle) is the **driver's** responsibility; the abstraction does not impose a global lock.
- `ConnectionService` is thin and stateless beyond holding references; it does not own threads.

**Rationale**: The foundation is read-only and minimal. A full concurrent streaming engine is out of scope (deferred to feature 022). The contract is enough to make `iter_frames` safely stoppable today without premature abstraction.

**Alternatives considered**: A global adapter lock like the ELM327 `adapter_lock` (rejected — that pattern exists because the ELM327 is a single shared command/response device; CAN receive is a different model and adding it now is premature); full thread-safe queue-based streaming (rejected — out of scope).

## 9. Logging package naming

**Decision**: Keep the package as `prioracan.logging` (matches spec) and rely on Python 3 **absolute imports** so `import logging` inside the package still resolves to the stdlib, while `from prioracan.logging import JsonlLogger` resolves to ours.

**Rationale**: Python 3 defaults to absolute imports, so there is no actual shadowing of stdlib `logging` for code that does `import logging`. The only risk is human confusion, which docstrings mitigate. Renaming to `loggers/` would deviate from the spec naming.

**Alternatives considered**: Rename to `prioracan.loggers` or `prioracan.recording` (held as a fallback — adopt only if a real collision or confusion surfaces; not now, to honor spec naming).

## 10. JSONL record schema

**Decision**: One JSON object per line. Fields:
```json
{
  "timestamp": 1719700000.123,
  "channel": 0,
  "direction": "RX",
  "arbitration_id": 1234,
  "arbitration_id_hex": "0x4D2",
  "is_extended_id": false,
  "is_remote_frame": false,
  "is_error_frame": false,
  "dlc": 8,
  "data_hex": "01 02 03 04 05 06 07 08",
  "bitrate": 500000
}
```
- `data_hex` is uppercase, space-separated (matches `CanFrame.data_hex`).
- `arbitration_id_hex` is uppercase with `0x` prefix.
- `channel` may be an int or a name string (both serialize as-is).
- `bitrate` omitted when `None` (optional field).

**Rationale**: Spec FR-014. JSONL is simple, parseable, and test-friendly — one `json.loads` per line verifies a record. UTF-8, newline-delimited, no trailing array wrapper (streaming-friendly for future live logging).

**Alternatives considered**: CSV (rejected — payload/flags awkward); MessagePack (rejected — not human-readable, premature); a single top-level JSON array (rejected — not streaming-friendly).

## 11. Minimal ASC implementation

**Decision**: Ship `AscLogger` as a **safe minimal** implementation behind the `FrameLogger` interface: a valid ASC header and one line per frame in a conservative subset of the Vector ASC format (timestamp, channel, Rx, ID, dlc, data). Document explicitly in code + README that this is a foundation subset and full ASC fidelity (bus events, error frames formatting, FD support, comments) is deferred to a future logging feature.

**Rationale**: Spec FR-015 allows a minimal implementation or documented placeholder. A minimal-but-valid writer is more useful than a pure placeholder and still keeps the interface stable. It does **not** use python-can's `ASCWriter` internally (that would pull python-can into the logging layer, violating isolation); it is hand-written to keep logging independent of the driver stack.

**Alternatives considered**: Use `python_can.ASCWriter` (rejected — would import python-can in the logging layer, breaking the single-seam rule and the "logging must not complicate the driver architecture" requirement); pure placeholder raising `NotImplementedError` (rejected — less useful than a minimal valid writer); full ASC fidelity now (rejected — out of scope, deferred).

## 12. CaptureSession scope

**Decision**: `CaptureSession` is a lightweight frozen/mostly-immutable record: `session_id` (str), `start_time` (float), `end_time` (optional float), `active` (bool), `stats` (optional, opaque/`None` for now), `driver` (ref), `config` (ref). No methods beyond accessors and a `close()`/`mark_end()` that sets `end_time`/`active=False`. No streaming, no statistics computation, no export.

**Rationale**: Spec FR-023 — provide a stable abstraction for *future* live streaming/replay/statistics/export/diagnostics without building any of them now. Keeping it minimal avoids the "workflow engine" anti-pattern.

**Alternatives considered**: A richer session with counters/timers (rejected — that is feature 026 Bus Statistics); a context manager that drives the driver (rejected — that is connection-service / streaming territory, out of scope).

## 13. DriverCapabilities design

**Decision**: Frozen dataclass with seven boolean fields: `receive`, `transmit`, `can_fd`, `hardware_filters`, `software_filters`, `replay`, `timestamps`. Provide named constants for common sets (e.g. `GS_USB_CAPABILITIES`). Future drivers construct their own. `transmit` is `false` for every driver in this feature (read-only foundation).

**Rationale**: Spec FR-022. Downstream code queries capabilities rather than inferring them (SOLID — no LSP violations from "does this driver support X?" branching on concrete types).

**Alternatives considered**: A bit-flag int (rejected — less readable, premature optimization); capabilities as methods on the driver (rejected — a value object is easier to test and pass around).

## 14. Mock driver timeout behavior

**Decision**: `MockDriver.receive(timeout_seconds)` returns the next frame immediately if available; when exhausted, raises `CanReceiveTimeout`. A `timeout_seconds` of `0`/`None` means "do not block" (immediate timeout when empty). This makes tests fast and deterministic.

**Rationale**: Real adapters block up to the timeout; the mock simulates the *outcome* (frame or timeout) without sleeping, so CI is fast and deterministic. An optional `simulate_wait` flag can be added later for replay-development; not now.

**Alternatives considered**: Actually sleep for the timeout when empty (rejected — slow, flaky tests).

## 15. Packaging — src layout

**Decision**: `src/prioracan/` layout with `pyproject.toml` (setuptools build backend). Package name `prioracan`, distributed name `prioracan`. `python-can` is a runtime dependency; `pytest`, `pytest-cov` are optional `[dev]` extras. Console scripts: none (library only).

**Rationale**: `src/` layout prevents accidental imports from the working directory during tests and is the modern best practice. `pyproject.toml` is the modern packaging standard. No CLI is in scope.

**Alternatives considered**: Flat layout (rejected — import-test ambiguity); Poetry/hatch build backends (acceptable but setuptools is the lowest-friction default; the choice is reversible and not contract-bearing).

## 16. Fixture strategy (Yaris trace)

**Decision**: Unit tests use **handcrafted deterministic frames** in `tests/fixtures/frames.py`. The real Toyota Yaris CAN trace, if included, is sanitized and placed under `examples/fixtures/` and used **only** for examples, demos, replay development, and manual validation. No unit test imports or requires it. Sanitization removes/abstracts any vehicle-identifying content; no VIN or private data is inferred or stored.

**Rationale**: Spec FR-018 / US2. Keeps tests deterministic, hardware-free, and free of external file-path dependencies. The trace adds realism to demos without becoming a test liability or a privacy concern.

**Alternatives considered**: Tests load the full trace (rejected — non-deterministic, external-path dependency, privacy risk); no trace at all (acceptable, but the optional example adds value for future replay work).

## 17. Platform / libusb setup

**Decision**: The library code is platform-agnostic. The README documents per-OS setup for candleLight/GS_USB: Linux (`udev` rules for the candleLight USB VID/PID, user in `plugdev`/`uucp` group), macOS (libusb via Homebrew), Windows (Zadig to bind the adapter to `WinUSB`/libusb). CI never requires this — tests use the python-can `"virtual"` bus.

**Rationale**: Foundation code shouldn't carry platform specifics; users need setup docs to use real hardware later. Documenting it now prevents repeated support questions without adding code complexity.

**Alternatives considered**: Bundle a platform-detection module (rejected — premature; deferred to integration).

## 18. CI / hardware independence

**Decision**: CI runs `pytest -q` on a stock runner with no USB device and no external trace file. `GsUsbDriver`/`PythonCanAdapter` tests use `python-can`'s `"virtual"` bus. Static grep guards enforce: no `python-can` import outside `drivers/adapters/python_can_adapter.py`; no transmit/send/write symbols; no ISO-TP/UDS/DBC/replay symbols; no module-level mutable global state / singletons in `src/prioracan`; no edits outside `can_usb_adapter/` + `specs/020-can-usb-adapter/`. A multi-instance test asserts two drivers coexist without interference.

**Rationale**: Spec FR-017 / SC-002. Hardware-free CI is a first-class acceptance criterion.

**Alternatives considered**: Hardware-in-the-loop tests (rejected — not available in CI and not needed for a foundation).

## 19. No singletons, no global mutable state, multi-instance drivers

**Decision**: The library forbids singletons and module-level mutable state. Every `CanDriver`, `PythonCanAdapter`, logger, and `ConnectionService` is an instance constructed by the caller. Multiple `CanDriver` instances must coexist and operate independently in the same process (e.g. two USB-CAN adapters on different channels, or a real driver alongside a mock). Drivers share no lock, no bus handle, and no queue at the abstraction level.

**Rationale**: Prepares the library for future multi-channel and multiple-USB-adapter support (future features) with zero foundation rework. It also matches the read-only, stateless nature of the receive path — unlike the ELM327 adapter (a single shared command/response device that needs the existing `adapter_lock`), CAN receive has no shared-device contention to serialize, so a global lock would be both unnecessary and harmful. The `PythonCanAdapter` holds its own `python-can` bus handle as instance state, never as module state.

**Alternatives considered**: A module-level shared bus/cache (rejected — prevents multi-adapter use and creates hidden coupling); a global `adapter_lock` like the ELM327 (rejected — wrong model for CAN receive); per-process single driver (rejected — artificially limits future multi-channel support).

## Open items carried into Phase 1

None. All Technical Context fields are resolved; no NEEDS CLARIFICATION remains. Phase 1 (data model + contracts + quickstart) can proceed directly from these decisions.