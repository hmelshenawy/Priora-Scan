# Implementation Plan: ISO-TP Transport Layer (MVP)

**Branch**: `022-iso-tp-transport` | **Date**: 2026-07-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/022-iso-tp-transport/spec.md`

**Note**: This plan covers architecture and execution strategy only. No production code is written in this phase. The specification is the single source of truth and is **not** modified by this plan — it is architecture-approved. This plan does **not** generate tasks (`tasks.md` is a separate `/speckit-tasks` step). It produces only a detailed engineering implementation plan: phases, milestones, dependency graph, risks, validation strategy, and estimated order.

## Summary

Feature 022 is the **first ISO-TP transport MVP**, an isolated engineering-capability library track (like Features 020/021), sitting outside the documented PrioraScan product roadmap. It does two things in order: (1) it closes the **transmit gap** left by the receive-only Feature 021 by adding an **additive, backward-compatible CAN TX path** (`send_frame`) through the existing stack, and (2) it builds the **first usable ISO-15765-2 transport subset** on top of that path — Single Frame, multi-frame receive/reassembly, basic CTS Flow Control, multi-frame transmit after CTS, and two basic bounded timeouts (wait-for-FC, wait-for-CF). Classic CAN normal addressing only; 12-bit First Frame length only; one transfer at a time; WAIT/OVERFLOW are safe aborts, not negotiated behavior; the 32-bit escape length, full six-timer enforcement, advanced STmin, concurrent transfers, extended/mixed addressing, CAN FD, and all diagnostic semantics (UDS/VIN/DTC/ECU/session/security) are explicitly deferred.

`IsoTpTransport` is an **active runtime object** and the **single owner of transport-layer state** (active transfer, RX/TX buffers, the two timeouts, sequence validation). It **depends only on `CaptureSession`, `CanFrame`, and its own domain models/errors**. It **sends frames only via `CaptureSession.send_frame()`** and **receives frames via an additive subscriber/listener seam on `CaptureSession`** — it never reaches down to `CanDriver`, concrete drivers, `PythonCanAdapter`, USB, or `python-can`. `CaptureSession` remains the sole owner of capture lifecycle, drivers, logging, and statistics; its existing receive-only behavior, lifecycle state machine, statistics, logging, and public constructor are unchanged except for **strictly additive** `send_frame` and frame-listener registration.

The MVP surface lives in a **new `prioracan.iso_tp` subpackage** (the `iso_tp` underscore token is guard-safe; the bare token `isotp` is forbidden by the inherited lexical guard). ISO-TP domain errors live in **`prioracan/iso_tp/errors.py`** (a separate module — `prioracan.errors` is locked to the 8 Feature 020 classes by a static guard) and subclass the existing `CanAdapterError`. The transport is **not** added to `prioracan.__all__` (locked to the 21 Feature 020 names); it is imported via `from prioracan.iso_tp import IsoTpTransport`. Every Feature 020 and Feature 021 test continues to pass **unmodified**.

## Technical Context

**Language/Version**: Python 3.11+ (inherited from Feature 020; `pyproject.toml` already pins this). No version change.

**Primary Dependencies**: `python-can` (unchanged — still imported **only** inside `drivers/adapters/python_can_adapter.py`). `pytest` + `pytest-cov` (dev/test only, inherited). No new runtime dependencies.

**Storage**: N/A as a database. Optional file-based capture logging via the existing `JsonlLogger` / `AscLogger` (unchanged). No new persistence.

**Testing**: `pytest`, fully hardware-independent (inherited). `GsUsbDriver` tested via the python-can `"virtual"` bus. ISO-TP behavior tested via the deterministic `MockDriver` under `CaptureSession` with a **scriptable mock ISO-TP peer** (a test-side helper that injects scripted First Frame / Consecutive Frame / CTS / error / timeout sequences and reacts to frames recorded by `MockDriver.send_frame`). No real-hardware tests in CI.

**Target Platform**: Cross-platform Python (Windows, Linux, macOS) — unchanged.

**Project Type**: Library (`prioracan`), `src/` layout — unchanged. Feature 022 adds a new `prioracan.iso_tp` subpackage and additively extends `CaptureSession` + concrete drivers; it does not create a new package.

**Performance Goals**: The transport must not be a bottleneck under realistic Classic CAN load. Soft targets: a multi-frame transfer of the 12-bit max (4095 bytes) completes without memory growth; repeated back-to-back transfers (one at a time) run indefinitely without buffer/timer/state leaks; the capture-loop → listener handoff does not grow per-frame allocations without bound under high unrelated bus traffic. Validated via mock throughput/long-session tests, not real hardware.

**Constraints**: Classic CAN only (0–8 byte payloads). Normal addressing only (11-bit or 29-bit CAN IDs, payload at byte 0). 12-bit First Frame length only (≤ 4095). One transfer at a time. RX/TX asymmetric CAN IDs supported. `CanFrame` core shape and RX-only validation unchanged. `prioracan.__all__` unchanged (21 names). `prioracan.errors` unchanged (8 classes). `CanDriver` Protocol unchanged (7 methods). `DriverCapabilities` and the named capability constants unchanged (`transmit=False` for both drivers — see Risks). `ConnectionService` method set unchanged (4 methods). `python-can` imported only at the adapter seam. Additive only — zero modifications outside `can_usb_adapter/` and `specs/022-iso-tp-transport/`. Every Feature 020 and Feature 021 test passes unmodified. No singletons / no global mutable state. Every file < 300 lines; every function < 30 lines (Constitution Principle V).

**Scale/Scope**: One new subpackage (`prioracan/iso_tp/` — models, errors, frames, flow control, transport, config), additive `send_frame` on `CaptureSession` + `MockDriver` + `GsUsbDriver` + `PythonCanAdapter`, one additive frame-listener seam on `CaptureSession`, two example scripts, and ~10–12 new test files. Top-level public surface growth is **zero** (`__all__` unchanged); growth is the `prioracan.iso_tp` submodule surface plus the additive `CaptureSession.send_frame` / listener API.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

This feature is an **isolated engineering capability library**, not a product feature — identical in nature to Features 020 and 021. It introduces no product entity, no HTTP/API endpoint, no tenant-scoped data, no UI, and no business rule. Product integration is explicitly deferred to a future feature that will require PRD/SAD updates first (spec Assumptions).

- [x] **Does not contradict `docs/PRD.md`, `docs/SAD.md`, `docs/FRONTEND_ARCHITECTURE.md`** — sits outside the documented product roadmap (spec Assumptions). Adds no product behavior and changes no product contract. Consistent with Principle VIII (Scan Source Agnostic) and Principle XIII (Progressive Hardware Integration) as pre-product raw-CAN/transport foundation work. No contradiction.
- [x] **Multi-tenant boundaries defined for all new entities** — N/A. `IsoTpTransport`, the ISO-TP frame value objects, `FlowControlParameters`, `TransferState`, `IsoTpConfig`, and the transport domain errors are transport-level foundation constructs, not tenant-scoped business entities. Tenant scoping is introduced at product integration (future feature).
- [x] **API contracts specified before backend implementation** — N/A for HTTP/backend (none). The library's **public Python API** contract is specified in `contracts/library-api-contract.md` before any code (Phase 1 of the spec-kit workflow). Satisfies the contracts-first intent.
- [x] **AI features include explainability and human-confirmation** — N/A. No AI.
- [x] **No PrioraFlow dependency for core workflows** — PASS. No PrioraFlow dependency and no dependency on any PrioraScan product module.
- [x] **Error handling and audit logging included in the design** — Error handling: PASS — a new transport-specific domain error sub-taxonomy (`IsoTpTimeoutError`, `IsoTpSequenceError`, `IsoTpFlowControlError`, `IsoTpFrameFormatError`, `IsoTpBufferOverflowError`, base `IsoTpError`) is defined in `prioracan/iso_tp/errors.py`, subclassing `CanAdapterError`, in the existing taxonomy style; every failure path surfaces a named domain error and triggers cleanup (FR-025, FR-026). Audit logging: N/A as business audit; CAN frame logging remains an engineering capture log owned by `CaptureSession`, not a business audit log. Business audit at product integration.

**Additional principle alignment**:
- Principle II (Design Before Implementation): this plan **is** the design; no code before plan + tasks approval.
- Principle III (Layered Architecture): the layering is `IsoTpTransport → CaptureSession → CanDriver → GsUsbDriver / MockDriver → PythonCanAdapter → python-can`. `IsoTpTransport` calls only `CaptureSession` (send) and consumes only `CanFrame` (receive via the listener seam); no bypass of `CaptureSession`; `python-can` only at the adapter seam.
- Principle IV (Modular Development): one isolated transport track inside `prioracan.iso_tp`; `IsoTpTransport` is the only public transport abstraction; frame/flow-control/config/models are internal value objects; helpers are internal.
- Principle V (Code Quality): < 300 lines/file, < 30 lines/function, explicit error paths, no dead code, no hardcoded config, no module-level mutable globals — enforced as phase acceptance criteria and by the inherited static guards.
- Principle XIV (Git & Change Safety): work on branch `022-iso-tp-transport`; no change to any existing public contract (`__all__`, `CanFrame`, `CanDriver` Protocol method set, `ConnectionService` method set, `CaptureSession` constructor/`mark_end`, `DriverCapabilities` + named constants, `prioracan.errors` class set); changes are additive.
- Principle XV (Simplicity Over Complexity): the transport does one thing — move complete byte payloads over segmented CAN for the MVP subset — and defers everything else. `IsoTpTransport`'s responsibility set is frozen (FR-033, Permanent Architectural Boundary). The MVP implements only the minimum ISO-15765-2 surface needed (Single Frame, First/Consecutive Frame, CTS, two timeouts) — no escape length, no six-timer, no WAIT/OVERFLOW negotiation, no concurrent transfers, no extended/mixed addressing.
- Domain-Driven Implementation: traceable to the Feature 022 specification (itself traced to the Feature 020/021 foundation); no invented entities, APIs, roles, or business rules.

**Re-check after Phase 1 design**: confirmed — the data model and contracts introduce no product entity, no tenant boundary, and no change to existing public contracts. `prioracan.__all__` is unchanged. No new error subclass is added to `prioracan.errors`. The `CanDriver` Protocol method set is unchanged. `DriverCapabilities` and named constants are unchanged. All gates remain satisfied. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/022-iso-tp-transport/
├── spec.md                 # Approved specification (/speckit-specify, revised)
├── plan.md                 # This file (/speckit-implement — plan only, no tasks)
├── research.md             # Phase 0 output (/speckit-plan) — optional, deferred-decision log
├── data-model.md           # Phase 1 output (/speckit-plan) — optional
├── quickstart.md           # Phase 1 output (/speckit-plan) — optional
├── contracts/
│   └── library-api-contract.md   # Phase 1 output (/speckit-plan) — optional
├── checklists/
│   └── requirements.md     # Spec quality checklist (/speckit-specify) — PASS 16/16
└── tasks.md                # Phase 2 output (/speckit-tasks - NOT created by this plan)
```

> The spec-kit `research.md`, `data-model.md`, `quickstart.md`, and `contracts/` artifacts are optional precursors produced by `/speckit-plan`. This `/speckit-implement` invocation produces `plan.md` only. If those artifacts do not yet exist, the implementation phases below carry the equivalent design content (decisions, data model, contracts) inline so implementation can proceed after task breakdown.

### Source Code (repository root)

```text
can_usb_adapter/                            # existing isolated library (Feature 020/021) — extended additively
├── pyproject.toml                          # unchanged (no new deps, no version bump required)
├── README.md                               # extended: ISO-TP MVP section (Phase 9)
├── src/
│   └── prioracan/
│       ├── __init__.py                     # UNCHANGED — __all__ stays exactly the 21 Feature 020 names
│       ├── config.py                       # unchanged (CanUsbConfig) — reused
│       ├── frame.py                        # UNCHANGED (CanFrame, RX-only) — reused; TX path sends standard CanFrame instances
│       ├── errors.py                       # UNCHANGED (8 domain errors) — reused; NO new class added here
│       ├── status.py                       # unchanged (DriverStatus/DriverState) — reused
│       ├── capabilities.py                 # UNCHANGED (DriverCapabilities + named constants, transmit=False) — reused
│       ├── session.py                      # ADDITIVE: CaptureSession gains send_frame() + frame-listener registration; existing lifecycle/stats/logging/constructor unchanged
│       ├── statistics.py                   # unchanged (CaptureStatistics) — reused
│       ├── drivers/
│       │   ├── __init__.py                 # unchanged
│       │   ├── base.py                     # UNCHANGED (CanDriver Protocol, 7 methods) — send_frame NOT added here (test lock)
│       │   ├── gs_usb.py                   # ADDITIVE: GsUsbDriver.send_frame() → adapter.send_frame()
│       │   ├── mock.py                     # ADDITIVE: MockDriver.send_frame() (deterministic record)
│       │   └── adapters/
│       │       └── python_can_adapter.py   # ADDITIVE: PythonCanAdapter.send_frame(message) → bus.send (method named send_frame, never bare send)
│       ├── logging/                        # unchanged (FrameLogger / JsonlLogger / AscLogger) — reused
│       ├── services/
│       │   └── connection.py              # UNCHANGED — ConnectionService preserved (4-method set locked)
│       └── iso_tp/                         # NEW subpackage (guard-safe token: iso_tp, not isotp)
│           ├── __init__.py                 # public submodule exports (IsoTpTransport, IsoTpConfig, errors) — NOT re-exported from prioracan.__all__
│           ├── errors.py                   # NEW: IsoTpError base + 5 transport errors, subclassing CanAdapterError (separate module — prioracan.errors stays locked at 8)
│           ├── config.py                   # NEW: IsoTpConfig (RX/TX arbitration IDs, ID type, Block Size, STmin, two timeouts, max payload)
│           ├── frames.py                   # NEW: PCI parsing, FrameType enum, IsoTpFrame value objects (Single/First/Consecutive/FlowControl) — encode/decode only
│           ├── flow_control.py             # NEW: FlowControlParameters value object, FlowStatus enum (CTS/WAIT/OVERFLOW), BS/STmin encoding/decoding (raw ms 0–127)
│           ├── transport.py                # NEW: IsoTpTransport — active runtime, single transfer owner, send/receive, timeouts, cleanup, lifecycle
│           └── models.py                   # NEW (if needed): TransferState internal value object; otherwise fold into transport.py
├── examples/
│   ├── capture_mock.py                     # unchanged (Feature 021)
│   ├── capture_gs_usb.py                   # unchanged (Feature 021)
│   ├── iso_tp_mock.py                      # NEW: mock ISO-TP exchange (SF + multi-frame), no hardware (Phase 8)
│   ├── iso_tp_gs_usb.py                    # NEW: GS_USB ISO-TP exchange with a real ECU, runnable with hardware (Phase 8)
│   └── README.md                           # extended (Phase 9)
└── tests/
    ├── conftest.py                         # extended: ISO-TP fixtures (scriptable mock peer helper)
    ├── fixtures/                           # extended: ISO-TP frame fixtures + optional sanitized captured-traffic fixtures (bundled, no external path)
    ├── (all Feature 020 + Feature 021 test files unchanged and re-run as regression)
    ├── test_send_frame_mock.py             # NEW (Phase 1): MockDriver/CaptureSession send_frame
    ├── test_send_frame_gs_usb.py           # NEW (Phase 1): virtual-bus GsUsbDriver send_frame
    ├── test_send_frame_errors.py           # NEW (Phase 1): TX failure → domain error, stopped-session guard
    ├── test_iso_tp_models.py               # NEW (Phase 2): PCI parse, frame types, value objects, config, errors
    ├── test_iso_tp_single_frame.py         # NEW (Phase 3): SF encode/decode/payload/malformed
    ├── test_iso_tp_receive.py              # NEW (Phase 4): FF/CF reassembly, sequence validation, completion, cleanup
    ├── test_iso_tp_flow_control.py         # NEW (Phase 5): CTS encode/decode, BS, STmin, WAIT/OVERFLOW safe abort
    ├── test_iso_tp_transmit.py             # NEW (Phase 6): segmentation, FF, wait CTS, CF block handling, seq wrap
    ├── test_iso_tp_timeouts.py             # NEW (Phase 7): wait-for-FC, wait-for-CF, cleanup, reuse-after-abort
    ├── test_iso_tp_examples.py             # NEW (Phase 8): mock example runs; GS_USB example structurally valid
    └── test_iso_tp_static_guards.py        # NEW (Phase 9/quality): guard the new invariants (iso_tp subpackage exists, errors separate, __all__ unchanged, no bare isotp token)
```

**Structure Decision**: No new package; Feature 022 extends the existing `prioracan` package additively with a new `prioracan.iso_tp` subpackage. The subpackage name `iso_tp` (underscore) is guard-safe: the inherited `test_no_out_of_scope_protocol_identifiers` lowercases source, replaces `-` with `_`, and splits on whitespace, so `iso_tp` and `IsoTpTransport` (one attached token → `isotptransport`) do **not** produce the forbidden bare token `isotp`; only a standalone word `IsoTp`/`isotp` would, so comments/docstrings must write "ISO-TP" or "the transport", never the bare word "IsoTp". ISO-TP errors live in `iso_tp/errors.py` (separate from the locked `prioracan.errors`). The transport is exported from `prioracan.iso_tp`, **not** from `prioracan.__all__` (locked by `test_public_api.py`). `send_frame` is added to `CaptureSession`, `MockDriver`, `GsUsbDriver`, and `PythonCanAdapter` only — **not** to the `CanDriver` Protocol (locked to 7 methods by `test_protocol_declares_exact_methods`); `CaptureSession.send_frame` delegates to the concrete driver's `send_frame` via duck-typing. All send methods are named `send_frame` (never bare `send`/`transmit`/`write`, forbidden by `test_no_transmit_style_public_methods`). `CaptureSession` gains an additive frame-listener seam (registration method + invocation in the existing dispatch path) so `IsoTpTransport` can consume incoming frames without `CaptureSession` exposing `receive`/`iter_frames`/`run`/`stream` (forbidden by `test_capture_session_has_no_forbidden_capture_methods`). No file outside `can_usb_adapter/` and `specs/022-iso-tp-transport/` is created or modified.

## Complexity Tracking

No Constitution Check violations require justification. Several spec-vs-code reconciliations are required by locked Feature 020/021 static-guard tests; they are **additive, test-preserving resolutions**, recorded here and in the per-phase risks:

| Reconciliation | Why Needed | Simpler Alternative Rejected Because |
|----------------|-----------|--------------------------------------|
| `send_frame` on concrete drivers + `CaptureSession` only, **not** on the `CanDriver` Protocol | `test_protocol_declares_exact_methods` locks `CanDriver.__dict__` public methods to exactly 7. Adding `send_frame` to the Protocol would break that Feature 020 test, which the spec (FR-002) mandates pass unmodified. | Adding `send_frame` to the Protocol and editing `test_driver_contract.py` would modify a Feature 020 test file and break the "tests pass unmodified" rule. The spec only requires `IsoTpTransport` to send via `CaptureSession.send_frame()` (FR-003); it never calls `CanDriver` directly, so a Protocol-level method is not needed. `CaptureSession.send_frame` duck-types the concrete driver's `send_frame`. |
| ISO-TP errors in `prioracan/iso_tp/errors.py`, not `prioracan.errors` | `test_no_new_error_subclass_was_added` locks `prioracan.errors` to exactly the 8 Feature 020 classes. | Adding the 5 transport errors to `prioracan.errors` breaks the locked guard. A separate submodule that subclasses `CanAdapterError` preserves the taxonomy style while keeping the locked module frozen. |
| ISO-TP surface via `prioracan.iso_tp` submodule, not `prioracan.__all__` | `test_current_public_api_exports` locks `__all__` to exactly the 21 Feature 020 names. | Adding `IsoTpTransport` to `__all__` breaks the locked guard. A submodule export (`from prioracan.iso_tp import IsoTpTransport`) exposes the surface without touching `__all__`. |
| `DriverCapabilities.transmit` stays `False` for both drivers | `test_named_capabilities_values` locks `GS_USB_CAPABILITIES` and `MOCK_CAPABILITIES` with `transmit=False`. Flipping it breaks the Feature 020 test. | Flipping `transmit=True` and editing `test_capabilities.py` modifies a Feature 020 test, violating the "tests pass unmodified" rule. The additive `send_frame` methods provide transmit capability independent of the flag. Reconciling the capability flag is deferred to a future feature with an approved contract/test update. Documented as a known inconsistency. |
| Sent frames are standard `CanFrame` instances with `direction=RX`; the send path uses addressing+data fields and ignores `direction` | `test_frame.py` locks `CanFrame` RX-only (constructing with `direction=TX` raises `CanConfigurationError`). FR-005 requires the sent frame to be a standard `CanFrame` and forbids changing the model. | Relaxing `CanFrame` to allow `TX` breaks `test_frame.py`. Introducing a separate outbound frame type contradicts FR-005 ("the sent frame is a standard `CanFrame`"). The only spec-compliant, test-preserving path is: `send_frame` accepts a standard `CanFrame` (necessarily `direction=RX`); the driver maps `arbitration_id`/`data`/`is_extended_id`/`is_remote_frame`/`dlc` to a python-can `Message` and sends; `direction` is a capture-side attribute not consumed on send. `IsoTpTransport` constructs standard `CanFrame` instances to send. The `_tx` statistics counter is incremented directly by `send_frame` (not via `_count_frame`, which keys on `direction`). |
| Receive integration via an additive **subscriber/listener** seam on `CaptureSession`, not a gateway/pull API | `test_capture_session_has_no_forbidden_capture_methods` forbids `CaptureSession` from exposing `receive`/`iter_frames`/`run`/`stream`. A gateway model (`CaptureSession.receive_frame()`) is therefore guard-illegal. `CaptureSession.start()` is also a blocking single-shot capture loop, incompatible with interactive pull. | A gateway/pull model either breaks the forbidden-methods guard or requires re-architecting `CaptureSession`'s blocking lifecycle (architectural drift, forbidden). The subscriber model is strictly additive: a listener registration method + invocation alongside the existing logger dispatch in `_dispatch`; `start()` runs in a background thread (engineer-managed) so the interactive send/receive can proceed; `IsoTpTransport` receives frames via its registered callback (feeding a thread-safe internal queue) and sends via `CaptureSession.send_frame`. This preserves `CaptureSession`'s blocking single-shot semantics and ownership. |
| All send methods named `send_frame` (including `PythonCanAdapter`) | `test_no_transmit_style_public_methods` forbids any `FunctionDef` named `transmit`/`send`/`write`/`send_periodic` anywhere in `src/prioracan`. | Naming the adapter method `send` (the python-can idiom) trips the guard. `send_frame` is not in the forbidden set and is consistent across all layers. |

## Architecture Constraints

These are non-negotiable, enforced as acceptance criteria and by the inherited Feature 020/021 static guards plus new guards:

- **Single transport owner.** `IsoTpTransport` is the only component that owns transfer state, buffers, the two timeouts, and sequence validation. No other component owns transfer state.
- **Single capture owner.** `CaptureSession` remains the only owner of capture lifecycle, drivers, logging, and statistics. The two responsibility sets do not overlap. `IsoTpTransport` never owns driver threads, USB, `python-can`, or adapter lifecycle.
- **Layering.** `IsoTpTransport → CaptureSession → CanDriver → GsUsbDriver / MockDriver → PythonCanAdapter → python-can → USB → CAN hardware`. `IsoTpTransport` depends only on `CaptureSession`, `CanFrame`, and its own domain models/errors. It never imports `python-can` or references USB/libusb/`CanDriver`/concrete drivers/`PythonCanAdapter` directly.
- **No bypass of `CaptureSession`.** `IsoTpTransport` sends every frame (Single, First, Consecutive, Flow Control) only via `CaptureSession.send_frame()`. It receives frames only via the additive `CaptureSession` frame-listener seam. It never calls `CanDriver`, `GsUsbDriver`, `MockDriver`, `PythonCanAdapter`, or `python-can` directly.
- **One third-party seam.** `python-can` is imported in exactly one module — `drivers/adapters/python_can_adapter.py` (unchanged). Enforced by `test_python_can_import_only_at_adapter_seam`.
- **`CanDriver` Protocol unchanged.** `send_frame` is added to concrete drivers and `CaptureSession` only, never to the Protocol (locked to 7 methods). `CaptureSession.send_frame` duck-types the concrete driver.
- **`send_frame` naming.** Every send method across all layers is named `send_frame` — never bare `send`/`transmit`/`write`/`send_periodic` (forbidden by `test_no_transmit_style_public_methods`).
- **Lexical guard.** No bare token `isotp`/`uds`/`dbc`/`stream` in `src/prioracan/**/*.py` (including comments/docstrings). Use `iso_tp` (module), `IsoTpTransport`/`IsoTp*Error` (attached PascalCase), or "ISO-TP" (prose). Enforced by `test_no_out_of_scope_protocol_identifiers`. New `test_iso_tp_static_guards.py` re-asserts this for the new subpackage.
- **No singletons / no global mutable state.** All state is instance-scoped inside `IsoTpTransport` (and `CaptureSession`). No module-level `[]`/`{}`/`set()`. Enforced by `test_no_module_level_mutable_globals`.
- **Backward compatibility.** `prioracan.__all__` unchanged (21 names). `prioracan.errors` unchanged (8 classes). `CanDriver` Protocol method set unchanged (7). `ConnectionService` method set unchanged (4). `DriverCapabilities` + named constants unchanged (`transmit=False`). `CaptureSession` constructor signature and `mark_end()` unchanged (listener registration is a post-construction additive method; `send_frame` is an additive method). `CanFrame` core shape and RX-only validation unchanged. All Feature 020 and Feature 021 tests pass unmodified.
- **Frozen responsibility.** `IsoTpTransport` does only: segmentation, reassembly, basic CTS flow control, sequence management, two basic timeouts, upward payload delivery. No UDS/VIN/DTC/ECU/session/security/service-id/DBC/replay/filtering/logging/statistics/capture-lifecycle/driver-management/product-comms. Future layers compose on top, consuming complete payloads (Permanent Architectural Boundary, FR-033).
- **Classic CAN, normal addressing, 12-bit length, single transfer.** Enforced by validation and tests; out-of-scope inputs are rejected with named domain errors, not partially handled.
- **Minimum machinery.** The MVP implements only the spec's in-scope subset. No escape length, no six-timer, no WAIT/OVERFLOW negotiation, no concurrent transfers, no extended/mixed addressing, no CAN FD.

## Implementation Phases

Phases are ordered by dependency and follow the user-mandated 9-phase order. Each phase is independently testable before the next begins and follows **strict TDD**: (1) add failing tests, (2) implement the minimum production code, (3) refactor, (4) run regression, (5) proceed. Every phase lists **Dependencies**, **Deliverables**, **Technical risks**, **Validation**, **Testing**, and **Acceptance criteria**. Each phase ends with a green test gate (full Feature 020 + 021 + 022-to-date regression) and an incremental commit. No phase introduces UDS, CAN FD, extended/mixed addressing, escape length, six-timer enforcement, WAIT/OVERFLOW negotiation, concurrent transfers, DBC, replay, filtering, or product integration.

### Phase 1 — CAN TX Foundation

**Dependencies**: None (builds on the existing Feature 020/021 codebase).

**Deliverables**: Additive `send_frame(frame: CanFrame) -> None` (or equivalent) at four layers, all named `send_frame`:
- `MockDriver.send_frame(frame)` — deterministically records the sent frame in an internal list (enabling hardware-free TX assertions) and returns; no hardware.
- `PythonCanAdapter.send_frame(message)` — maps a python-can `Message` to `self._bus.send(message)`; maps `python-can`/OSError failures to `CanConnectionError`/`CanAdapterError` (never leaks raw `python-can` exceptions). Additive; `open`/`recv`/`close`/`is_open` unchanged.
- `GsUsbDriver.send_frame(frame)` — builds a python-can `Message` from the `CanFrame`'s `arbitration_id`/`data`/`is_extended_id`/`is_remote_frame`/`dlc` (ignoring `direction`, which is capture-side), delegates to `self._adapter.send_frame(message)`, and maps adapter failures onto the PrioraCAN domain error taxonomy. Additive; existing receive methods unchanged.
- `CaptureSession.send_frame(frame)` — the **only** send entry point upper layers use. Validates the session is in a state that permits transmit (RUNNING; calling on CREATED/STOPPED/DISPOSED/stopped raises a domain `CanAdapterError`), delegates to `self.driver.send_frame(frame)` (duck-typed — the `CanDriver` Protocol is intentionally not extended), increments the `_tx` statistics counter directly, and maps driver failures onto the domain taxonomy. Additive; existing `start`/`stop`/`_capture_loop`/`_dispatch`/`_count_frame`/constructor/`mark_end` unchanged. The sent frame is a standard `CanFrame` (constructed with `direction=RX` per the RX-only invariant); the send path does not consult `frame.direction`.

No ISO-TP code yet. The `prioracan.iso_tp` subpackage is not created in this phase.

**Technical risks**:
- *Breaking `test_protocol_declares_exact_methods`* by adding `send_frame` to the `CanDriver` Protocol. Mitigation: add `send_frame` only to concrete drivers + `CaptureSession`; never to `base.py`. Documented in Complexity Tracking.
- *Breaking `test_no_transmit_style_public_methods`* by naming a method `send`/`transmit`/`write`. Mitigation: every send method is named `send_frame`.
- *Breaking `test_forbidden_operations_fail` / `assert_conforms`* — `assert_conforms` forbids attrs named `transmit`/`send`/`write` on conforming drivers. `send_frame` is not in that set, so conforming drivers with `send_frame` still pass `assert_conforms`. Verified.
- *Breaking `test_capture_session_has_no_forbidden_capture_methods`* — `send_frame` is not in `{stream, run, iter_frames, receive}`. Verified.
- *Breaking `test_frame.py`* by allowing `CanFrame` TX. Mitigation: do not touch `frame.py`; send standard RX-direction `CanFrame` instances; ignore `direction` on send.
- *Breaking `test_capabilities.py`* by flipping `transmit`. Mitigation: do not touch `capabilities.py`; `transmit` stays `False` (documented inconsistency).
- *TX counter accuracy* — `_count_frame` keys on `direction`, so `send_frame` increments `_tx` directly. Mitigation: unit test the `_tx` count after `send_frame`.
- *Thread-safety of `send_frame` vs the capture loop* — in the subscriber model `start()` runs on a background thread while `send_frame` is called from the caller thread. Mitigation: `MockDriver.send_frame` appends to a list (GIL-safe for CPython); `CaptureSession.send_frame` does not mutate capture-loop state beyond the `_tx` counter; document the threading contract. Full thread-safety hardening is exercised in Phase 4/7.

**Validation**: A `CaptureSession` over `MockDriver`: `send_frame(frame)` records the exact frame on the mock, returns success, and increments `_tx`; existing capture behavior and `CaptureStatistics` are unchanged. A virtual-bus `GsUsbDriver`: `send_frame` transmits a real frame on the virtual bus (verifiable by a receiver on the same virtual bus). Inject a transmit failure (driver disconnected / adapter error) → a named PrioraCAN domain error is raised, never a raw `python-can`/libusb exception. `send_frame` on a non-RUNNING/stopped/disposed session raises `CanAdapterError`. Every Feature 020 and Feature 021 test passes unmodified.

**Testing**: `test_send_frame_mock.py` (mock record + `_tx` increment + stopped/disposed guard + failure mapping), `test_send_frame_gs_usb.py` (virtual-bus round-trip + failure mapping), `test_send_frame_errors.py` (domain-error taxonomy on TX failure; no raw `python-can` leak). Full Feature 020 + 021 regression re-run unmodified.

**Acceptance criteria**:
1. `send_frame` exists on `MockDriver`, `GsUsbDriver`, `PythonCanAdapter`, and `CaptureSession` — all named `send_frame`; none named `send`/`transmit`/`write`.
2. `CanDriver` Protocol (`base.py`) is unchanged (still exactly 7 public methods); `test_protocol_declares_exact_methods` passes unmodified.
3. `CaptureSession.send_frame` is the only send entry point; it delegates to the concrete driver and increments `_tx` directly; it raises `CanAdapterError` on a non-transmit-permitting state.
4. `MockDriver.send_frame` deterministically records sent frames; `GsUsbDriver.send_frame` transmits on the virtual bus; TX failures surface as PrioraCAN domain errors, never raw `python-can`/libusb exceptions.
5. `CanFrame`, `prioracan.__all__`, `prioracan.errors`, `DriverCapabilities`, `ConnectionService`, and the `CaptureSession` constructor/`mark_end` are unchanged; all Feature 020 + 021 tests pass unmodified.
6. No `prioracan.iso_tp` code yet; no bare `isotp`/`uds`/`dbc`/`stream` token; no module-level mutable globals; size limits met.

### Phase 2 — ISO-TP Models

**Dependencies**: Phase 1 (TX path available for later phases; models themselves are pure).

**Deliverables**: The `prioracan.iso_tp` subpackage scaffold + pure value objects (no runtime, no `CaptureSession` interaction):
- `iso_tp/errors.py` — `IsoTpError(CanAdapterError)` base + `IsoTpTimeoutError`, `IsoTpSequenceError`, `IsoTpFlowControlError`, `IsoTpFrameFormatError`, `IsoTpBufferOverflowError`. No implementation details leaked in messages.
- `iso_tp/config.py` — `IsoTpConfig` frozen dataclass: `rx_arbitration_id`, `tx_arbitration_id`, `is_extended_id` (bool), `block_size` (default 0 = unlimited), `st_min_ms` (default 0, raw ms 0–127), `wait_for_flow_control_seconds` (default sane, e.g., 1.0), `wait_for_consecutive_frame_seconds` (default sane, e.g., 1.0), `max_payload_bytes` (default 4095). Validates ranges; invalid → `CanConfigurationError`/`IsoTpFrameFormatError` as appropriate.
- `iso_tp/frames.py` — `FrameType` enum (`SINGLE_FRAME`, `FIRST_FRAME`, `CONSECUTIVE_FRAME`, `FLOW_CONTROL`); PCI parsing from the first nibble; value objects / encode-decode helpers for each frame type's PCI structure (Single Frame length nibble; First Frame 12-bit length; Consecutive Frame 4-bit sequence; Flow Control FS/BS/STmin). Pure functions: `parse_pci`, `encode_single_frame`, `decode_single_frame`, `encode_first_frame`, `decode_first_frame`, `encode_consecutive_frame`, `decode_consecutive_frame`. No `CanFrame` construction yet beyond pure byte manipulation; no I/O.
- `iso_tp/flow_control.py` — `FlowStatus` enum (`CTS`, `WAIT`, `OVERFLOW`); `FlowControlParameters` value object; `encode_flow_control` / `decode_flow_control` (raw ms STmin 0–127 only; structured 128–249 and reserved 250–255 rejected with `IsoTpFrameFormatError` per the spec's defined safe behavior — clamp-to-0 is rejected in favor of explicit rejection for the MVP, per FR-023).
- `iso_tp/__init__.py` — exports `IsoTpConfig`, `IsoTpError` + 5 errors, and (later phases) `IsoTpTransport`; **not** re-exported from `prioracan.__all__`.

**Technical risks**: *Tripping the lexical guard* with a bare `isotp`/`IsoTp` word in a comment. Mitigation: use `iso_tp` (module), `IsoTp*` attached names, "ISO-TP" in prose; `test_iso_tp_static_guards.py` re-asserts. *Scope creep* into runtime logic. Mitigation: this phase is parse/encode/decode only — no `CaptureSession`, no threads, no timers. *STmin edge encoding* — accidentally supporting 128–249. Mitigation: explicit reject with `IsoTpFrameFormatError`; unit test the boundaries. *12-bit length overflow* — First Frame length 0 (escape indicator). Mitigation: reject with `IsoTpFrameFormatError` (FR-012).

**Validation**: Pure unit tests on bytes in / bytes out. PCI nibble parsing correct for all four frame types. Single Frame encode/decode round-trips for lengths 0–7. First Frame encode/decode for lengths 8–4095; length 0 (escape) rejected. Consecutive Frame sequence 0x0–0xF round-trips; mod-16 wrap encoded correctly. Flow Control encode/decode for CTS/WAIT/OVERFLOW with BS 0–255 and STmin 0–127; STmin 128–255 rejected. `IsoTpConfig` validates ranges. `prioracan.__all__` unchanged; `prioracan.errors` unchanged (the 5 new errors live only in `iso_tp.errors`).

**Testing**: `test_iso_tp_models.py` — PCI parsing, frame-type value objects, encode/decode round-trips, length boundaries (7/8, 4095/4096), escape-indicator rejection, STmin boundaries, config validation, error class hierarchy (`isinstance(IsoTpTimeoutError(), CanAdapterError)`). Feature 020 + 021 regression unmodified. `test_iso_tp_static_guards.py` begins (asserts `prioracan.iso_tp` importable, errors in `iso_tp.errors` not `prioracan.errors`, `__all__` unchanged, no bare `isotp` token in the new subpackage).

**Acceptance criteria**:
1. `prioracan.iso_tp` subpackage exists with `errors.py`, `config.py`, `frames.py`, `flow_control.py`, `__init__.py`; no runtime/I/O in this phase.
2. PCI parsing and all encode/decode round-trips are correct for the MVP subset; boundaries (7/8, 4095/4096, STmin 0–127 vs 128–255) are enforced with named errors.
3. The 5 transport errors subclass `CanAdapterError` and live in `iso_tp.errors`; `prioracan.errors` is unchanged (guard green).
4. `IsoTpConfig` is immutable and validates all fields.
5. `prioracan.__all__` is unchanged; no bare `isotp`/`uds`/`dbc`/`stream` token; no module-level mutable globals; size limits met; all regression green.

### Phase 3 — Single Frame

**Dependencies**: Phase 2 (models).

**Deliverables**: `IsoTpTransport` scaffold (`iso_tp/transport.py`) with the **Single Frame** path only — the first transport slice that uses the Phase 1 TX path:
- `IsoTpTransport.__init__(self, capture_session, *, config: IsoTpConfig)` — composes a `CaptureSession` reference + `IsoTpConfig`; no driver/adapter/python-can references. Lifecycle: `start()`/`stop()`/`dispose()` + context manager (`__enter__`/`__exit__`); register the frame listener on `CaptureSession` (additive seam — wired in Phase 4; here the receive path is stubbed).
- `send(payload: bytes)` — for payloads ≤ 7 bytes: encode a Single Frame (`0x0n` + payload) into a standard `CanFrame` (with the configured `tx_arbitration_id`/`is_extended_id`, `direction=RX` per the invariant, `dlc=len`, `data=pci+payload`) and emit it via `CaptureSession.send_frame()`. For payloads > 7 bytes: raise `IsoTpBufferOverflowError`/not-supported-in-this-phase marker (multi-frame transmit is Phase 6) — in this phase `send` handles only the Single Frame case and rejects > 7 bytes with a clear domain error (`IsoTpFrameFormatError` or a "not implemented in this phase" guard that Phase 6 replaces). Single transfer at a time: a `send` while busy raises a domain error.
- `receive` path (Phase 4 wires the listener; here stubbed): decode an incoming Single Frame → extract declared length + payload → deliver upward via a callback/queue/future (mechanism chosen in Phase 4). Malformed Single Frame (length inconsistent with DLC, or declared length exceeds available data) → `IsoTpFrameFormatError`, no payload delivered.

**Technical risks**: *Constructing a `CanFrame` for send* — must use `direction=RX`. Mitigation: a private helper builds the outbound `CanFrame` with `direction=RX`; documented. *Single-transfer-at-a-time* — concurrency guard. Mitigation: a `_busy` flag; `send` while busy raises `CanAdapterError`/`IsoTpError`. *Leaking partial state on error*. Mitigation: Single Frame leaves no lingering state (FR-011 acceptance: no buffer/transfer state remains).

**Validation**: Mock `CaptureSession` + `MockDriver`: `send(b"\x01\x02\x03")` emits exactly one Single Frame via `CaptureSession.send_frame` with PCI `0x03` and the payload; the recorded mock frame matches. `send` of 7 bytes → Single Frame; 8 bytes → rejected in this phase. Decoding a valid incoming Single Frame delivers the exact payload; a malformed Single Frame raises `IsoTpFrameFormatError` and delivers nothing. No lingering state after a Single Frame exchange.

**Testing**: `test_iso_tp_single_frame.py` — SF encode (1–7 bytes), SF decode, payload extraction, malformed-SF rejection (length/DLC mismatch, declared length > available), empty payload (length 0), 7-byte boundary, no-lingering-state, send-while-busy rejection. Feature 020 + 021 + Phase 1/2 regression unmodified.

**Acceptance criteria**:
1. `IsoTpTransport` composes a `CaptureSession` + `IsoTpConfig`; depends on no driver/adapter/python-can types.
2. `send` of ≤ 7 bytes emits exactly one Single Frame via `CaptureSession.send_frame()` with the correct PCI and payload; no segmentation.
3. A valid incoming Single Frame is decoded and its complete payload delivered upward; a malformed Single Frame raises `IsoTpFrameFormatError` and delivers nothing.
4. Single Frame transfers leave no receive buffer, transfer state, or sequence context.
5. `send` while busy raises a domain error; operations on a disposed transport raise a domain error.
6. All static guards green; `prioracan.__all__` unchanged; regression green; size limits met.

### Phase 4 — Receive Runtime

**Dependencies**: Phases 1–3 (TX path + Single Frame + models). This is the receive half of the MVP.

**Deliverables**:
- **`CaptureSession` frame-listener seam** (additive): a post-construction registration method (e.g., `add_frame_listener(listener)`) that appends a callback to an internal listener list; the existing `_dispatch(frame)` invokes registered listeners **alongside** logger dispatch (loggers still receive `write_frame` unchanged). Listener callbacks are isolated: a callback exception is mapped to a transport domain error surfaced to the transport (via the queue), never raised into the capture loop, and never breaks logger dispatch or the logger-failure policy. The constructor signature is unchanged (listeners registered after construction).
- `IsoTpTransport` receive runtime: register a listener that filters frames to the configured `rx_arbitration_id` (ignoring unrelated IDs and non-ISO-TP frames) and feeds matching frames into a thread-safe internal queue. The transport processes frames in order:
  - **First Frame (12-bit length)**: validate length (8 ≤ L ≤ 4095; escape-indicator length 0 → `IsoTpFrameFormatError`; L > `max_payload_bytes` → `IsoTpBufferOverflowError`); allocate a receive buffer of L bytes; store the first fragment; emit a **CTS Flow Control** via `CaptureSession.send_frame()` with the configured Block Size and STmin; set the wait-for-CF timer (Phase 7 wires the actual timeout; here the timer is stubbed).
  - **Consecutive Frame**: validate the 4-bit sequence against the expected successor (reject duplicate → `IsoTpSequenceError`; reject out-of-order → `IsoTpSequenceError`); append the fragment in order; detect overrun past L → `IsoTpFrameFormatError`; on completion (buffer reaches L) deliver one complete contiguous payload upward and release the buffer + transfer state.
  - **Consecutive Frame arriving when idle** → `IsoTpFrameFormatError` (no buffer allocated). **First Frame arriving mid-transfer** → `IsoTpFrameFormatError` (abort the in-progress transfer per the spec edge case).
  - Cleanup: on every abort and on every completion, release the receive buffer, sequence state, and timer; return to idle.
- No transmit segmentation yet (multi-frame transmit is Phase 6). `send` still handles only Single Frame (Phase 3); receiving a First Frame + Consecutive Frames is independent.

**Technical risks**: *Listener exception isolating* — must not break the capture loop or logger dispatch. Mitigation: try/except around each listener callback in `_dispatch`; map exceptions to a transport error pushed onto the queue; logger dispatch and the logger-failure policy are untouched and re-tested. *Thread-safety* — listener runs on the capture thread; transport processes on the caller thread. Mitigation: a `queue.Queue` (thread-safe) bridges them; the transport's process loop is single-threaded per transfer. *Breaking `test_capture_logging.py` / `test_logger_failure_policy.py`* by altering `_dispatch`. Mitigation: logger dispatch behavior is unchanged; listeners are additive; re-run those tests unmodified. *CaptureSession.start() blocking* — for interactive receive, `start()` runs in a background thread (engineer-managed in tests via a helper). Mitigation: documented; mock tests use a scriptable peer that injects frames via the mock's receive stream. *Sequence wrap* (mod-16) — Mitigation: unit test a > 16-frame reassembly.

**Validation**: Mock `CaptureSession` + a scriptable mock ISO-TP peer: drive a multi-frame response of known length (e.g., 64 bytes spanning several CFs) → reassembled payload equals the expected bytes exactly; a CTS Flow Control was emitted with the configured BS/STmin. Inject a duplicate CF → `IsoTpSequenceError` + buffer released. Inject an out-of-order CF → `IsoTpSequenceError` + buffer released. Inject a CF when idle → `IsoTpFrameFormatError`. Inject a FF with L > max → `IsoTpBufferOverflowError`. Inject a FF with length 0 (escape) → `IsoTpFrameFormatError`. Inject an overrun CF → `IsoTpFrameFormatError`. Reassemble a > 16-frame payload (mod-16 wrap). Frames on unrelated CAN IDs are ignored and do not corrupt the transfer. After completion and after each abort, no buffer/state leaks; the transport accepts a new transfer.

**Testing**: `test_iso_tp_receive.py` — FF decode + buffer allocation + CTS emit, CF sequence validation (correct, duplicate, out-of-order, wrap), completion + delivery, cleanup after success and each abort, unrelated-ID filtering, escape/oversized rejection, overrun rejection, listener-isolation (a raising listener does not break logger dispatch), no-lingering-state. `test_capture_logging.py` + `test_logger_failure_policy.py` re-run unmodified (listener seam is additive). Feature 020 + 021 + Phase 1–3 regression green.

**Acceptance criteria**:
1. `CaptureSession` exposes an additive frame-listener seam; logger dispatch and the logger-failure policy are unchanged (Feature 021 logging tests pass unmodified).
2. A First Frame allocates a buffer, stores the first fragment, and emits a CTS Flow Control via `CaptureSession.send_frame()` with the configured BS/STmin.
3. Consecutive Frames are validated (sequence, duplicate, out-of-order, overrun), appended in order, and completion delivers exactly L bytes upward with buffer/state released.
4. All receive abort cases (duplicate, out-of-order, unexpected, overrun, oversized, escape) raise the correct named error and release the buffer; no partial payload is delivered.
5. Frames on unrelated IDs / non-ISO-TP frames are ignored; a > 16-frame transfer reassembles correctly (mod-16 wrap).
6. A raising listener does not break the capture loop or logger dispatch; the transport surfaces a domain error.
7. All static guards green; `prioracan.__all__`/`prioracan.errors`/Protocol/`ConnectionService`/`DriverCapabilities` unchanged; regression green; size limits met.

### Phase 5 — Flow Control

**Dependencies**: Phases 1–4 (CTS emission already used in receive; this phase formalizes FC encode/decode + the transmit-side FC handling needed before Phase 6).

**Deliverables**: Formalize Flow Control as a first-class capability (encode/decode already exist from Phase 2; this phase wires them into the transport and adds reception-side validation):
- **CTS generation** (receiver side): the receive path emits CTS carrying the configured Block Size (default 0) and STmin (default 0) — already used in Phase 4; here make BS/STmin configurable and verified. With BS ≠ 0, the receiver re-emits CTS between blocks (CTS re-emit behavior per the configured Block Size).
- **CTS parsing** (transmitter side): decode an incoming Flow Control frame; validate FlowStatus; validate BS/STmin encoding (raw ms 0–127; structured 128–249 / reserved 250–255 → `IsoTpFrameFormatError` per FR-023's defined safe behavior — explicit reject for the MVP). Recognize WAIT and OVERFLOW but do **not** negotiate: receiving either aborts the transfer with `IsoTpFlowControlError` (safe abort). The transport emits CTS only; it never emits WAIT or OVERFLOW in this MVP.
- **Malformed Flow Control**: invalid FS value → `IsoTpFrameFormatError`.
- Configurable Block Size and STmin on `IsoTpConfig` (already added in Phase 2; here exercised end-to-end).

No transmit segmentation yet (Phase 6). This phase validates FC encode/decode and the safe-abort policy in isolation using the mock peer.

**Technical risks**: *STmin handling ambiguity* (clamp vs reject). Mitigation: the MVP rejects non-conformant STmin with `IsoTpFrameFormatError` (explicit, defined, safe) per FR-023; documented. *Accidentally negotiating WAIT* — Mitigation: WAIT/OVERFLOW always abort with `IsoTpFlowControlError`; unit test both. *BS re-emit timing* — Mitigation: with BS ≠ 0, re-emit CTS after each block; unit test the block boundary.

**Validation**: Mock peer: the transport as receiver emits CTS with the configured BS/STmin (defaults 0/0 and non-defaults); with BS ≠ 0, CTS is re-emitted between blocks. The transport as transmitter (stubbed segmentation in Phase 6) parses an incoming CTS and extracts BS/STmin; a CTS with STmin 128 → `IsoTpFrameFormatError`; a WAIT FC → `IsoTpFlowControlError` + abort; an OVERFLOW FC → `IsoTpFlowControlError` + abort; an invalid FS → `IsoTpFrameFormatError`. The transport never emits WAIT/OVERFLOW.

**Testing**: `test_iso_tp_flow_control.py` — CTS encode (BS/STmin defaults + non-defaults), CTS decode, STmin boundaries (0–127 ok; 128–255 reject), WAIT safe abort, OVERFLOW safe abort, invalid FS reject, BS re-emit between blocks, transport-emits-CTS-only (never WAIT/OVERFLOW). Feature 020 + 021 + Phase 1–4 regression green.

**Acceptance criteria**:
1. CTS Flow Control is encoded/decoded with configurable BS (default 0) and STmin (default 0); BS ≠ 0 triggers CTS re-emit between blocks.
2. STmin is accepted for raw ms 0–127 and rejected for 128–255 with `IsoTpFrameFormatError`.
3. WAIT and OVERFLOW are recognized but abort the transfer with `IsoTpFlowControlError`; the transport never emits WAIT/OVERFLOW.
4. An invalid FlowStatus is rejected with `IsoTpFrameFormatError`.
5. All static guards green; regression green; size limits met.

### Phase 6 — Multi-frame Transmission

**Dependencies**: Phases 1–5 (TX path, models, FC parsing).

**Deliverables**: The transmit half of the MVP — `IsoTpTransport.send(payload)` for payloads > 7 bytes (≤ 4095):
- **Automatic selection**: payload ≤ 7 bytes → Single Frame (Phase 3); 8 ≤ payload ≤ 4095 → First Frame + Consecutive Frames; > 4095 → `IsoTpBufferOverflowError` (no 32-bit escape in the MVP).
- **First Frame transmit**: emit a First Frame carrying the 12-bit total length + first fragment via `CaptureSession.send_frame()`; transition to waiting-for-CTS.
- **Wait for CTS**: wait for a Flow Control frame (Phase 5 parsing). On CTS → send Consecutive Frames. On WAIT/OVERFLOW → `IsoTpFlowControlError` + abort (Phase 5). On malformed FC → `IsoTpFrameFormatError` + abort.
- **Consecutive Frame transmit**: send CFs in blocks of at most the peer's Block Size (0 = unlimited → all remaining in one burst), pacing each frame by the peer's STmin (raw ms 0–127; sleep/monotonic-based pacing), incrementing the sequence number mod 16 per frame. After a finite block (BS ≠ 0), pause and wait for the next CTS before continuing.
- **Completion**: when the final CF is sent, mark the transfer complete and release transmit buffer + sequence state.
- Single transfer at a time: `send` while busy raises a domain error.
- The receive path (Phase 4) and transmit path coexist on one transport (one transfer at a time, direction tracked in `TransferState`).

**Technical risks**: *STmin pacing accuracy* — Mitigation: monotonic-clock-based pacing; mock tests use STmin 0 to keep deterministic; a pacing test with a small STmin asserts approximate spacing with tolerance. *Block boundary / BS=0 burst* — Mitigation: unit test BS=0 (all in one burst) and BS=N (pause after N). *Sequence mod-16 wrap on transmit* — Mitigation: unit test a > 16-frame transmit. *Blocking the caller while waiting for CTS* — Mitigation: `send` blocks the caller until the transfer completes or aborts (consistent with the MVP's synchronous, single-transfer model); the wait-for-FC timeout (Phase 7) bounds it. Document the synchronous contract. *Coexisting RX and TX state* — Mitigation: `TransferState` tracks direction; one active transfer at a time.

**Validation**: Mock peer returning a CTS with known BS/STmin: send a 64-byte payload → capture frames emitted via `CaptureSession.send_frame` and assert the FF length + first fragment, the exact CF sequence numbers (including mod-16 wrap for a > 16-frame payload), the block boundary respecting BS, and the inter-frame spacing respecting STmin (tolerance). BS=0 → all remaining CFs in one burst. BS=N → pause after N, wait for next CTS. Peer returns OVERFLOW → `IsoTpFlowControlError` + abort + transmit state released. Peer returns WAIT → same. Payload > 4095 → `IsoTpBufferOverflowError`. Completion releases all transmit state.

**Testing**: `test_iso_tp_transmit.py` — SF selection (≤ 7), FF+CF selection (> 7), FF length/fragment, CF sequence + mod-16 wrap, BS=0 burst, BS=N block + pause + next CTS, STmin pacing (tolerance), WAIT/OVERFLOW abort, > 4095 rejection, completion cleanup, send-while-busy rejection, RX/TX coexistence (one at a time). Feature 020 + 021 + Phase 1–5 regression green.

**Acceptance criteria**:
1. `send` auto-selects Single Frame (≤ 7) or First Frame + Consecutive Frames (8–4095); > 4095 → `IsoTpBufferOverflowError`.
2. A First Frame with the correct 12-bit length + first fragment is emitted via `CaptureSession.send_frame()`; the transport then waits for CTS.
3. On CTS, CFs are sent in blocks of at most the peer's BS (0 = unlimited), paced by the peer's STmin (raw ms 0–127), sequence incremented mod 16; BS ≠ 0 pauses for the next CTS.
4. WAIT/OVERFLOW → `IsoTpFlowControlError` + abort; malformed FC → `IsoTpFrameFormatError` + abort; transmit state released in every case.
5. On final CF, the transfer completes and transmit buffer/sequence state is released.
6. One transfer at a time (RX or TX); `send` while busy raises a domain error.
7. All static guards green; regression green; size limits met.

### Phase 7 — Timeouts

**Dependencies**: Phases 1–6 (both transfer directions exist).

**Deliverables**: The two basic bounded timeouts (FR-024), wired into the transport:
- **Wait-for-Flow-Control** (N_Bs concept): the transmitter waits for a Flow Control after sending a First Frame; on expiration → `IsoTpTimeoutError`, abort the transmit transfer, release transmit buffer/sequence/timer.
- **Wait-for-next-Consecutive-Frame** (N_Cr concept): the receiver waits for the next CF after emitting CTS; on expiration → `IsoTpTimeoutError`, abort the receive transfer, release receive buffer/sequence/timer.
- Both configurable on `IsoTpConfig` with sane defaults; expiration raises `IsoTpTimeoutError` and triggers full cleanup; the transport returns to a clean idle state ready for a new transfer without restart.
- Cleanup verification on every timeout-induced abort: no buffer/timer/state leaks.
- **CaptureSession stop/disconnect mid-transfer**: if `CaptureSession` stops or the driver disconnects while a transfer is in flight, the transport surfaces a transport/connection domain error and releases transfer state (does not hang or crash).
- Full strict six-timer enforcement is **not** implemented (deferred); only these two bounded waits.

**Technical risks**: *Timer determinism in tests* — Mitigation: use very short configured timeouts (e.g., 0.05s) and a mock peer that goes silent; assert the timeout fires within a bounded tolerance and raises `IsoTpTimeoutError`. *Blocking the caller indefinitely on a silent peer* — Mitigation: the wait-for-FC timeout bounds `send`; the wait-for-CF timeout bounds the receive processing loop. *Timer leak after abort* — Mitigation: every abort path cancels/clears the timer; long-running-session test asserts no growth. *CaptureSession-stop detection* — Mitigation: the listener seam / `send_frame` surface a domain error when the session is stopped/disposed; the transport maps it and cleans up.

**Validation**: Mock peer silent after the First Frame (transmit case) → wait-for-FC timeout expires within the configured bound → `IsoTpTimeoutError` + transmit cleanup. Mock peer silent after a CF (receive case) → wait-for-CF timeout expires → `IsoTpTimeoutError` + receive cleanup. Both timeouts exercised. After each timeout abort, the transport returns to idle and accepts a new transfer. `CaptureSession.stop()` mid-transfer → domain error + cleanup, no hang/crash. Long-running-session test: many back-to-back transfers (alternating success/timeout/abort) with no buffer/timer/state growth.

**Testing**: `test_iso_tp_timeouts.py` — wait-for-FC timeout (transmit), wait-for-CF timeout (receive), both within tolerance, cleanup after each, reuse-after-abort (new transfer succeeds without restart), CaptureSession-stop mid-transfer, long-running-session no-leak. Feature 020 + 021 + Phase 1–6 regression green.

**Acceptance criteria**:
1. The two bounded timeouts (wait-for-FC, wait-for-CF) are enforced with configurable sane defaults; expiration raises `IsoTpTimeoutError` and aborts + cleans up the affected transfer.
2. A silent peer never causes an indefinite hang; both timeouts are exercised by tests.
3. After any timeout abort, the transport returns to idle and accepts a new transfer without restart.
4. `CaptureSession` stop/disconnect mid-transfer surfaces a domain error and releases transfer state (no hang/crash).
5. A long-running-session test verifies no buffer/timer/state leaks across many back-to-back transfers.
6. No six-timer implementation is introduced; all static guards green; regression green; size limits met.

### Phase 8 — Examples

**Dependencies**: Phases 1–7.

**Deliverables**: Two example scripts (no Desktop Agent / backend / frontend):
- `examples/iso_tp_mock.py` — opens a `CaptureSession` over a `MockDriver` with a scriptable mock ISO-TP peer, runs `start()` on a background thread, performs a Single Frame exchange and a multi-frame exchange through `IsoTpTransport`, prints the complete payloads, stops cleanly, exits 0. Runnable with no hardware (the CI-runnable example).
- `examples/iso_tp_gs_usb.py` — opens a `GsUsbDriver` with `CanUsbConfig`, runs an ISO-TP exchange with a real ECU on a real vehicle (Single Frame + multi-frame), configurable via CLI args (RX/TX IDs, payload, timeout), prints the complete payloads, releases the device. Runnable only with hardware; used for the manual real-vehicle validation. Structurally validated in CI (imports + arg parsing).
- Neither example imports the Desktop Agent, backend, or frontend; both use only the public `prioracan.iso_tp` + `prioracan` API.

**Technical risks**: *Mock example thread lifecycle* — Mitigation: `start()` on a background thread; clean shutdown on exit; the example test asserts exit 0 and printed payloads. *GS_USB example not runnable in CI* — Mitigation: structurally validated (imports resolve, args parse) and run only with hardware. *Example drift from the real API* — Mitigation: a docs-smoke/example test imports the symbols used.

**Validation**: `python examples/iso_tp_mock.py` runs with no hardware, prints complete Single Frame + multi-frame payloads, exits 0. `iso_tp_gs_usb.py --help` parses; imports resolve without hardware.

**Testing**: `test_iso_tp_examples.py` — runs the mock example (subprocess or importable `main`), asserts exit 0 and printed complete payloads; asserts the GS_USB example imports and parses args without hardware. `test_docs_smoke.py` (Feature 020) re-run unmodified where applicable.

**Acceptance criteria**:
1. The mock example runs with no hardware, prints complete Single Frame + multi-frame payloads, and exits 0.
2. The GS_USB example is structurally valid and runnable with hardware; it uses CLI-configurable RX/TX IDs/payload/timeout.
3. Neither example depends on the Desktop Agent, backend, or frontend; both use only the public API.
4. All static guards green; regression green; size limits met.

### Phase 9 — Documentation

**Dependencies**: Phases 1–8.

**Deliverables**: Documentation clearly stating Feature 022 is the **first ISO-TP MVP**, not a complete ISO-15765-2 implementation (FR-037, SC-016):
- `README.md` extended with an ISO-TP MVP overview: supported-now list (CAN TX path; Single Frame encode/decode; FF+CF receive/reassembly; basic CTS flow control with BS default 0 / STmin default 0; multi-frame transmit after CTS; two basic bounded timeouts) and intentionally-deferred list (32-bit escape length; full six-timer strict enforcement; advanced STmin microsecond encodings; WAIT Flow Control behavior; OVERFLOW beyond safe abort; concurrent transfers; extended addressing; mixed addressing; CAN FD ISO-TP; UDS; VIN/DTC/Security Access/ECU discovery; Desktop Agent / backend / frontend integration).
- Byte-level frame examples for Single Frame, First Frame (12-bit), Consecutive Frame, and CTS Flow Control.
- The transport lifecycle, sequence numbering with mod-16 wrap, the send-path architecture diagram (`IsoTpTransport → CaptureSession.send_frame → CanDriver.send_frame → concrete driver`), the receive-integration data flow (`Driver → CaptureSession → CanFrame → IsoTpTransport → Payload`), and the TX/RX transport state machines (from the spec).
- The explicit boundary that diagnostic semantics belong to UDS (Permanent Architectural Boundary).
- Docstrings on all new public surface (`IsoTpTransport`, `IsoTpConfig`, the 5 transport errors, `prioracan.iso_tp` exports, `CaptureSession.send_frame`, the listener seam).
- `examples/README.md` extended with the two ISO-TP examples.
- ASCII architecture + state-machine diagrams.
- A manual real-vehicle validation note (Toyota, Mercedes) — recorded as a manual step, not a CI gate (FR-030, FR-035, SC-008).

**Technical risks**: *Documenting symbols not in `__all__`* — Mitigation: `IsoTpTransport`/`IsoTpConfig`/errors are documented as imported from `prioracan.iso_tp` (not `prioracan`); the docs-smoke test checks that any `from prioracan import ...` in docs uses only `__all__` names. *Tripping the lexical guard in docs/comments* — Mitigation: use "ISO-TP" in prose, `IsoTp*` attached names, `iso_tp` for the module; never the bare word "IsoTp"/"isotp". *Drift* — Mitigation: tie the mock example to the documented API so it runs in CI.

**Validation**: `test_iso_tp_static_guards.py` final form green (subpackage, separate errors, `__all__` unchanged, no bare `isotp` token, no `python-can` import outside the seam). `test_all_public_symbols_have_docstrings` (extended) passes for the new surface. The documented mock example runs.

**Acceptance criteria**:
1. README documents the MVP overview, supported-now + deferred lists, byte-level frame examples, lifecycle, sequence numbering with mod-16 wrap, send-path diagram, receive-integration flow, TX/RX state machines, and the UDS boundary.
2. All new public symbols have docstrings; docs import only `__all__` symbols from `prioracan` (ISO-TP symbols from `prioracan.iso_tp`).
3. The documented mock example runs with no hardware.
4. No bare `isotp`/`uds`/`dbc`/`stream` token in any `src/prioracan` docstring/comment; `python-can` imported only at the seam.
5. The manual real-vehicle validation step is documented as a manual step, not a CI gate.

## Quality, Guards & Regression (cross-cutting, finalized after Phase 9)

- Final regression run of the **entire** Feature 020 + Feature 021 suite **unmodified**; coverage report; `prioracan.__all__` exactly 21 names; `prioracan.errors` exactly 8 classes; `CanDriver` Protocol exactly 7 methods; `ConnectionService` exactly 4 methods; `DriverCapabilities` + named constants unchanged (`transmit=False`); `CaptureSession` constructor/`mark_end` unchanged; `python-can` only at the seam; no `transmit`/`send`/`write`/`send_periodic` FunctionDef names; no bare `isotp`/`uds`/`dbc`/`stream` tokens; no module-level mutable globals; coverage ≥ 90% on the new TX path + `prioracan.iso_tp` code; multi-instance test (two `IsoTpTransport` instances on two `CaptureSession`s run without interference); no UDS/VIN/DTC/ECU/DBC/replay/filtering/product-integration code anywhere (grep guard).

## Technical Milestones

| Milestone | After Phase | What is proven |
|-----------|-------------|----------------|
| M1 — CAN TX path live | Phase 1 | Frames can be sent through the architecture via `CaptureSession.send_frame` without bypassing `CaptureSession` or breaking Feature 020/021; the transmit gap is closed. |
| M2 — ISO-TP models | Phase 2 | PCI/frames/flow-control/config/errors are correct in pure unit tests; the guard-safe `iso_tp` subpackage + separate errors module exist; `__all__`/`prioracan.errors` unchanged. |
| M3 — First transport slice (Single Frame) | Phase 3 | A complete short-payload exchange works end-to-end through `IsoTpTransport` → `CaptureSession.send_frame` (TX) and decode → deliver (RX); the transport composes on `CaptureSession` only. |
| M4 — Multi-frame receive | Phase 4 | Long payloads reassemble correctly with CTS, sequence validation, completion, cleanup; the additive listener seam works and does not disturb Feature 021 logging. |
| M5 — Flow control formalized | Phase 5 | CTS encode/decode + safe-abort (WAIT/OVERFLOW) + STmin boundaries are validated; the transport emits CTS only. |
| M6 — Multi-frame transmit (bidirectional MVP) | Phase 6 | The MVP is bidirectional: long payloads segment, wait for CTS, send CFs with block/STmin/sequence handling; the MVP is usable. |
| M7 — Bounded timeouts (safe MVP) | Phase 7 | The transport fails fast on a silent peer (both wait points) with full cleanup and reuse-after-abort; no indefinite hangs; safe for real vehicles. |
| M8 — Examples | Phase 8 | The MVP is usable hardware-free (mock example) and on real vehicles (GS_USB example); no Desktop Agent/backend/frontend dependency. |
| M9 — Documented + production-quality | Phase 9 | Supported/deferred lists, byte examples, diagrams, state machines, and the UDS boundary are documented; static guards and coverage final; the MVP is releasable. |

## Dependency Graph

```text
Phase 1 (CAN TX foundation) ── M1
  └─ Phase 2 (ISO-TP models) ── M2
       └─ Phase 3 (Single Frame) ── M3
            └─ Phase 4 (Receive Runtime) ── M4   [needs Phase 1 TX path for CTS emit + Phase 3 transport scaffold]
                 └─ Phase 5 (Flow Control) ── M5 [formalizes FC used in Phase 4; prepares Phase 6]
                      └─ Phase 6 (Multi-frame Transmission) ── M6  [needs Phase 1 TX, Phase 2 models, Phase 5 FC parsing]
                           └─ Phase 7 (Timeouts) ── M7  [needs both transfer directions, Phases 4 + 6]
                                └─ Phase 8 (Examples) ── M8  [needs Phases 1–7]
                                     └─ Phase 9 (Documentation) ── M9  [needs Phases 1–8]
```

The graph is essentially linear because each phase introduces one isolated capability that the next phase builds on, and the spec's single-transfer/single-owner model serializes RX and TX. The only intra-phase coupling is that Phase 4 (receive) already uses CTS emission (formalized in Phase 5) and the Phase 3 transport scaffold; Phase 5 is kept as a distinct phase because FC encode/decode + safe-abort + STmin validation are independently testable and reviewable before multi-frame transmit (Phase 6) consumes them.

## Validation Strategy

- **Per-phase**: each phase has explicit acceptance criteria and a test gate; no phase starts until the previous phase's tests are green; strict TDD (failing tests → minimal code → refactor → regression → next).
- **Integration slices**: `IsoTpTransport` + `CaptureSession` + `MockDriver` + scriptable mock peer is the smallest end-to-end slice (Phase 3 onward); `IsoTpTransport` + virtual-bus `GsUsbDriver` + `CaptureSession` is the hardware-free integration slice (Phase 1 for TX, optionally extended in Phase 8).
- **Hardware-free guarantee**: every CI test runs without a USB-CAN adapter and without an external local file path; `GsUsbDriver` is tested via the python-can virtual bus; any captured-traffic fixtures are bundled inside the library tree.
- **Regression**: the full Feature 020 + Feature 021 suite is re-run **unmodified** at every phase; no Feature 020 or Feature 021 `test_*.py` file is edited; new tests live in new files.
- **Static guards**: (a) `python-can` only at the adapter seam; (b) no `transmit`/`send`/`write`/`send_periodic` FunctionDef names; (c) no bare `isotp`/`uds`/`dbc`/`stream` tokens; (d) no module-level mutable globals; (e) `__all__` unchanged (21); (f) `prioracan.errors` unchanged (8); (g) `CanDriver` Protocol unchanged (7 methods); (h) `ConnectionService` method set unchanged (4); (i) `DriverCapabilities` + named constants unchanged (`transmit=False`); (j) `CaptureSession` no forbidden capture methods; (k) no modifications outside `can_usb_adapter/` + `specs/022-iso-tp-transport/`; (l) new `test_iso_tp_static_guards.py` asserts the `iso_tp` subpackage, separate errors module, and guard-safe naming.
- **Real-vehicle validation**: manual, not a CI gate; recorded as a manual validation note (Toyota, Mercedes) using the GS_USB example; no CI test depends on real hardware.
- **Constitution compliance**: file < 300 lines, function < 30 lines, explicit error paths, no hardcoded config — checked per phase.

## Testing Strategy

- **TX-path tests**: `test_send_frame_mock.py`, `test_send_frame_gs_usb.py`, `test_send_frame_errors.py` (Phase 1).
- **Model/unit tests**: `test_iso_tp_models.py` (Phase 2) — PCI, frames, flow control, config, errors, boundaries.
- **Single Frame tests**: `test_iso_tp_single_frame.py` (Phase 3).
- **Receive tests**: `test_iso_tp_receive.py` (Phase 4) — reassembly, sequence, completion, cleanup, listener isolation, unrelated-ID filtering.
- **Flow-control tests**: `test_iso_tp_flow_control.py` (Phase 5) — CTS, BS, STmin, WAIT/OVERFLOW safe abort.
- **Transmit tests**: `test_iso_tp_transmit.py` (Phase 6) — segmentation, block/STmin/sequence, wrap, abort.
- **Timeout tests**: `test_iso_tp_timeouts.py` (Phase 7) — both waits, cleanup, reuse, stop-mid-transfer, long-session no-leak.
- **Example/docs tests**: `test_iso_tp_examples.py` (Phase 8); `test_docs_smoke.py` (Feature 020, unmodified where applicable).
- **Static-guard tests**: `test_iso_tp_static_guards.py` (Phase 2 onward, finalized Phase 9).
- **Fixtures**: ISO-TP frame fixtures + optional sanitized captured-traffic fixtures bundled in `tests/fixtures/` (no external path; no example-fixture imports in tests — inherited guard).
- **Mock peer**: a scriptable test helper that injects FF/CF/CTS/error/silent sequences via the mock receive stream and reacts to frames recorded by `MockDriver.send_frame`; deterministic; no hardware.
- **CI**: fully hardware-independent; `pytest -q` exits 0 on a clean machine; coverage report generated; static guards run; coverage ≥ 90% on the new TX path + `prioracan.iso_tp`.
- **No real-hardware tests** required or permitted in CI; real-hardware validation is opt-in manual.

## Regression Strategy

- Every phase re-runs the **entire** Feature 020 + Feature 021 test suite unmodified: `test_frame.py`, `test_config.py`, `test_errors.py`, `test_status.py`, `test_capabilities.py`, `test_session.py`, `test_mock_driver.py`, `test_jsonl_logger.py`, `test_asc_logger.py`, `test_connection_service.py`, `test_gs_usb_driver.py`, `test_driver_contract.py`, `test_pythoncan_adapter.py`, `test_public_api.py`, `test_docs_smoke.py`, `test_multi_instance.py`, `test_sample_fixture_optional.py`, `test_static_guards.py`, plus the Feature 021 capture tests (`test_capture_session_runtime.py`, `test_capture_loop.py`, `test_capture_logging.py`, `test_logger_failure_policy.py`, `test_capture_statistics.py`, `test_capture_gs_usb.py`, `test_capture_examples.py`).
- No Feature 020 or Feature 021 `test_*.py` file is edited. New tests live in new files.
- Locked contracts are asserted by existing tests (re-used as regression): `test_public_api.py` (`__all__`), `test_driver_contract.py` (Protocol 7 methods + forbidden ops), `test_static_guards.py` (seam/lexicon/mutable-globals/errors-8/`ConnectionService`-4/capture-methods), `test_capabilities.py` (`transmit=False`), `test_frame.py` (RX-only), `test_session.py` (constructor/`mark_end`), `test_connection_service.py` (4-method set), `test_capture_logging.py` + `test_logger_failure_policy.py` (listener seam is additive).
- Existing PrioraScan tests outside `can_usb_adapter/` are unaffected (zero modifications outside the library and its spec).

## Risk Analysis

| Risk | Likelihood | Impact | Mitigation | Owner phase |
|------|-----------|--------|------------|-------------|
| Break a Feature 020/021 test (Protocol `__all__`, errors-8, capabilities, RX-only, capture methods) | High (many locked guards) | High | Additive-only resolutions in Complexity Tracking; per-phase unmodified regression; `send_frame` not on Protocol; errors in `iso_tp.errors`; `__all__` untouched; `transmit` stays False; `CanFrame` untouched | All phases |
| Trip the `isotp`/`stream` lexical guard | Medium | Low | Use `iso_tp`/`IsoTp*`/`ISO-TP`; never bare `isotp`/`IsoTp`; `test_iso_tp_static_guards.py` per phase | All phases |
| `send_frame` naming trips the transmit-style guard | Medium | High | All send methods named `send_frame` (never `send`/`transmit`/`write`); `PythonCanAdapter` method is `send_frame` | Phase 1 |
| `CanFrame` RX-only vs "sent frame is a standard CanFrame" | High | Medium | Send standard RX-direction `CanFrame`; send path uses addressing+data, ignores `direction`; `_tx` incremented directly; documented | Phase 1 |
| `DriverCapabilities.transmit=False` inconsistency | Medium | Low | Leave unchanged (test lock); `send_frame` provides TX independently; reconcile in a future feature with approved test update; documented | Phase 1 |
| Receive-integration mechanism (subscriber vs gateway) | High | High | Subscriber/listener model (gateway is guard-illegal); additive seam in `_dispatch`; listener exceptions isolated; `start()` on background thread; documented | Phase 4 |
| Listener exception breaks capture loop / logger dispatch | Medium | High | try/except per listener callback in `_dispatch`; map to transport error via queue; logger dispatch + failure policy unchanged; re-test Feature 021 logging | Phase 4 |
| Thread-safety (capture thread vs caller thread) | Medium | Medium | `queue.Queue` bridge; single-threaded per-transfer processing; GIL-safe mock record; documented contract | Phase 4/6/7 |
| STmin handling ambiguity (clamp vs reject) | Medium | Medium | Reject non-conformant STmin (128–255) with `IsoTpFrameFormatError` (explicit, defined, safe) per FR-023; documented | Phase 5 |
| Accidental WAIT/OVERFLOW negotiation | Low | High | WAIT/OVERFLOW always abort with `IsoTpFlowControlError`; transport emits CTS only; unit test both | Phase 5 |
| Sequence mod-16 wrap (RX and TX) | Medium | Medium | Unit test > 16-frame reassembly and transmit | Phase 4/6 |
| Unbounded wait on silent peer | High | High | Two bounded timeouts (Phase 7); long-session no-leak test | Phase 7 |
| `CaptureSession` stop/disconnect mid-transfer | Medium | Medium | Listener/`send_frame` surface domain error on stopped/disposed session; transport maps + cleans up; no hang/crash | Phase 7 |
| Memory leak across back-to-back transfers | Medium | High | Release buffer/timer/state on every completion + abort; long-running-session test | Phase 4/6/7 |
| Coverage < 90% on new code | Low | Low | Targeted tests; exclude python-can seam hardware branches (inherited) | Phase 9 |
| Real-hardware required in CI | Low | Medium | Virtual bus + mock only; real-vehicle validation is manual/opt-in | Phase 1/8 |
| Over-building the transport (scope creep into UDS/six-timer/escape) | Medium | Medium | Frozen responsibility (FR-033); MVP subset only; out-of-scope inputs rejected with named errors; grep guard | All phases |
| Documenting symbols not in `__all__` | Low | Low | ISO-TP symbols documented as imported from `prioracan.iso_tp`; docs-smoke test | Phase 9 |

## Out of Scope (reaffirmed)

This plan and every phase within it must **not** introduce: UDS; VIN reading; DTC reading; Security Access; ECU discovery; replay; frame filtering; DBC decoding; Desktop Agent integration; backend integration; frontend integration; CAN FD transport; ISO-15765-2 extended or mixed addressing; the 32-bit First Frame escape length; full strict six-timer enforcement (only the two basic waits are in scope); advanced STmin microsecond/factor encodings (only raw ms 0–127); WAIT Flow Control retry behavior (only safe abort); OVERFLOW Flow Control negotiation beyond safe abort; concurrent/multi transfers (only one at a time); any modification to `prioracan.__all__`, `prioracan.errors`, the `CanDriver` Protocol method set, the `ConnectionService` method set, `DriverCapabilities` + named constants, the `CanFrame` core shape/RX-only validation, or the `CaptureSession` constructor/`mark_end`; any edit to a Feature 020 or Feature 021 test file; any change outside `can_usb_adapter/` and `specs/022-iso-tp-transport/`. Product integration requires PRD/SAD updates first (deferred to a future feature).

## Estimated Implementation Order

```text
1. Phase 1 — CAN TX Foundation            (additive send_frame on CaptureSession + MockDriver + GsUsbDriver + PythonCanAdapter; TX failures → domain errors)
2. Phase 2 — ISO-TP Models                (prioracan.iso_tp subpackage; errors/config/frames/flow_control; pure encode/decode)
3. Phase 3 — Single Frame                 (IsoTpTransport scaffold + SF send/decode via CaptureSession)
4. Phase 4 — Receive Runtime              (CaptureSession listener seam + FF/CF reassembly + CTS emit + cleanup)
5. Phase 5 — Flow Control                 (CTS encode/decode formalized; STmin boundaries; WAIT/OVERFLOW safe abort)
6. Phase 6 — Multi-frame Transmission     (segmentation; FF; wait CTS; CF blocks; STmin pacing; seq mod-16)
7. Phase 7 — Timeouts                     (wait-for-FC + wait-for-CF; cleanup; reuse; stop-mid-transfer; long-session)
8. Phase 8 — Examples                     (iso_tp_mock.py runnable; iso_tp_gs_usb.py structural)
9. Phase 9 — Documentation                (README MVP + supported/deferred; byte examples; diagrams; state machines; UDS boundary; docstrings)
```

Each phase is independently completable and testable before the next begins, with an incremental commit at each phase boundary. The project remains releasable after every milestone: after Phase 1 the CAN TX path is closed; after Phase 3 short-payload ISO-TP exchanges work; after Phase 4 long-payload receive works; after Phase 6 the MVP is bidirectional; after Phase 7 it is safe for real vehicles; after Phases 8–9 it is usable, documented, and production-quality. The plan optimizes for correctness, maintainability, reviewability, and long-term architectural stability — not implementation speed.