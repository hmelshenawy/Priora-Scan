# Feature Specification: CAN USB Adapter Foundation

**Feature Branch**: `020-can-usb-adapter`

**Created**: 2026-06-29

**Status**: Draft (revised 2026-06-29)

**Input**: User description: "CAN USB Adapter Foundation — an isolated, read-only Python library foundation for receiving raw CAN frames from USB-CAN adapters. GS_USB / candleLight is the first supported concrete driver; the architecture must remain generic so future drivers (SocketCAN, PCAN, Vector, Kvaser, Serial CAN, MCP2515) can be added without changing the public frame model or driver contract. This feature delivers the clean foundation, configuration, frame model, driver abstraction, errors, mock driver, logging, and tests. No transmit, no ISO-TP/UDS/DBC, no product integration."

## User Scenarios & Testing *(mandatory)*

The "users" of this feature are the PrioraScan engineers and downstream feature modules that will consume the foundation library. The end driver of the vehicle is **not** a direct user of this feature; they benefit only later, once raw-frame capabilities are integrated into product features.

### User Story 1 - Read raw CAN frames from a USB-CAN adapter (Priority: P1)

An engineer connects a USB-CAN adapter to a vehicle, opens the foundation library, and receives raw CAN frames through a single, stable driver interface that is independent of any specific adapter vendor or stack. The first supported concrete driver targets candleLight / GS_USB compatible adapters; the architecture is generic so that future drivers (SocketCAN, PCAN, Vector, Kvaser, Serial CAN, MCP2515, and others) can be added later without changing the public frame model or the driver contract. The library hides the underlying CAN stack and adapter-specific errors behind clear domain errors, so the engineer never handles low-level adapter-library or USB objects directly. No transmission is possible — the library can only listen, and every received frame is marked as received (RX).

**Why this priority**: This is the core capability the foundation exists to provide. Everything else (status, logging, mocking, connection management) exists to make this safe, testable, and reusable. Without receive, the foundation has no value.

**Independent Test**: Can be fully tested without real hardware by substituting the mock driver, which deterministically returns predefined frames (optionally realistic frames sourced from a sanitized sample fixture), and by asserting that the frame model validates and formats received frames correctly.

**Acceptance Scenarios**:

1. **Given** a supported USB-CAN adapter is connected and the library is configured (GS_USB / candleLight being the first supported family), **When** the engineer opens the connection and asks for one frame, **Then** a single validated CAN frame is returned within the configured receive timeout and is marked as received (RX).
2. **Given** no frame arrives within the receive timeout, **When** the engineer asks for a frame, **Then** a clear receive-timeout domain error is raised (no hang, no raw library exception).
3. **Given** the adapter is missing, permission is denied, or configuration is invalid, **When** the engineer tries to connect, **Then** a specific domain error identifies the failure class (driver not found / device not found / permission / configuration) rather than a low-level error.
4. **Given** any connected adapter, **When** the engineer inspects the driver capabilities and status, **Then** no transmit or write capability is exposed and the driver reports a first-class status (disconnected / connected / listening / error) with extensible metadata.

---

### User Story 2 - Develop and test without real hardware (Priority: P2)

An engineer builds and tests downstream features on a laptop with no USB-CAN adapter attached. They use a mock driver that returns a predefined list of CAN frames deterministically, including an "empty bus" timeout behavior, so tests are repeatable, fast, and hardware-free. A sanitized sample of realistic frames (derived from an optional real CAN trace) may be provided as fixture/demo data to make mock data representative, without any test depending on a specific external local file path or on real hardware.

**Why this priority**: Hardware-free testability is what makes the foundation safe to build on. It enables continuous integration and lets every downstream feature be unit-tested without a vehicle.

**Independent Test**: Run the test suite on a machine with no USB-CAN adapter and no external trace file required; the mock driver tests, frame model tests, configuration tests, logging tests, status tests, and connection-service tests all pass deterministically.

**Acceptance Scenarios**:

1. **Given** a predefined list of CAN frames supplied to the mock driver, **When** the engineer receives frames sequentially, **Then** the frames are returned in the supplied order with identical content.
2. **Given** the mock driver has no remaining frames, **When** the engineer requests a frame, **Then** the empty-bus timeout behavior is exercised and a receive-timeout domain error is raised.
3. **Given** a sanitized Yaris-derived sample is available under `examples/` or `tests/fixtures/`, **When** the engineer uses it for an example, demo, replay development, or manual validation, **Then** it provides realistic mock data without any unit test depending on the complete trace; unit tests use handcrafted deterministic frames instead, and no vehicle identity, VIN, or private data is inferred from the sample.
4. **Given** the full test suite, **When** it runs on a machine with no USB-CAN adapter, **Then** every test passes without requiring any external local file path.

---

### User Story 3 - Persist received frames for later analysis and replay (Priority: P3)

An engineer wants to record received raw CAN frames to disk during a capture session so the data can be analyzed offline, shared, or replayed later. The library writes one record per frame through a minimal logger interface, serializing binary frame data as text so records are portable and inspectable. The structured JSONL logger is fully supported because it is simple, stable, and useful for tests. A second common capture format (ASC) is provided behind the same interface as a safe minimal implementation or documented placeholder; full ASC fidelity is deferred to a later logging feature. Logging must not complicate the driver architecture.

**Why this priority**: Logging is what turns a live listener into a useful engineering asset. It is foundational but secondary to receiving frames, so it sits at P3.

**Independent Test**: Receive a known set of frames via the mock driver, write them through the enabled loggers, and assert the JSONL output contains one valid, parseable record per frame with the expected fields and text-serialized payload.

**Acceptance Scenarios**:

1. **Given** JSONL logging is enabled and frames are being received, **When** each frame is written, **Then** exactly one valid, parseable record per frame is persisted, containing timestamp, channel/bus, direction, arbitration id (numeric and hex), DLC, the payload serialized as hex text, and the frame flags.
2. **Given** the ASC logger is enabled, **When** it is used, **Then** it produces output through the same logger interface as a safe minimal implementation or documented placeholder, and any foundation-level limitations are documented.
3. **Given** the driver architecture, **When** logging is added or configured, **Then** the driver abstraction and frame model remain unchanged and unburdened by logging concerns.

---

### Edge Cases

- **Standard vs. extended arbitration IDs**: A frame with an 11-bit standard ID and a frame with a 29-bit extended ID must both be accepted and correctly flagged; IDs outside the valid range for their flag must be rejected.
- **Remote and error frames**: Remote frames (no payload) and error frames must be representable and flagged correctly; a remote frame with a payload length mismatch must be handled per the validation rules.
- **DLC / payload length mismatch**: A frame whose DLC does not match the actual payload length must be rejected, not silently accepted.
- **Payload length limits**: Payloads longer than 8 bytes (Classic CAN limit) must be rejected; CAN FD frames are out of scope and must not be accepted as valid Classic CAN frames.
- **Direction is receive-only**: In this feature the only allowed frame direction is RX (received). Any attempt to construct a frame with a non-RX direction in this foundation must be rejected; transmit (TX) directions are reserved for future, out-of-scope work.
- **Channel as name or number**: A channel/bus may be identified by a numeric index or by a name string; both forms must be accepted and preserved.
- **Empty bus**: When no frames arrive within the receive timeout, the library raises a receive-timeout domain error instead of blocking forever or returning a partial/invalid frame.
- **Driver status transitions**: The driver status must move cleanly between DISCONNECTED, CONNECTED, LISTENING, and ERROR; an error during listening must surface via the ERROR state and a last-error metadata field without crashing the consumer.
- **Double connect / double disconnect**: Connecting an already-connected driver and disconnecting an already-disconnected driver must behave safely without raising low-level errors.
- **Logger failure**: If a logger cannot be opened or written to, a logging-specific domain error is raised without corrupting already-written records.
- **Immutable frames**: Once constructed, a frame must not be modifiable, so cached/logged frames cannot be accidentally mutated by later code.
- **Hardware absent or removed at runtime**: Pluggable adapter removal mid-session must surface as a connection domain error and an ERROR driver status, not a raw USB/library exception.
- **Iterator termination**: The frame iterator must stop cleanly when a stop signal is provided or when a receive timeout occurs repeatedly, without becoming an unbounded long-running streaming loop.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The foundation MUST exist as an isolated, root-level library separate from the existing ELM327 adapter code, with no dependency on or modification to the ELM327 adapter.
- **FR-002**: The library MUST be read-only: it MUST expose receive/listen capabilities and MUST NOT expose any transmit or write capability. The only allowed frame direction in this feature is RX.
- **FR-003**: The library MUST provide a frame data model that captures, for each received CAN frame: timestamp, channel/bus (numeric index or name string), direction (RX in this feature), arbitration id, a derived uppercase hexadecimal representation of the arbitration id, extended-id flag, remote-frame flag, error-frame flag, DLC, payload bytes, a derived uppercase space-separated hexadecimal representation of the payload, and an optional bitrate. The model MUST be extensible enough to support future replay and filtering without changes to its core shape.
- **FR-004**: The frame model MUST validate that the arbitration id is valid for the stated standard (11-bit) or extended (29-bit) range, that the DLC matches the payload length, that the payload length is between 0 and 8 bytes inclusive (Classic CAN), and that the direction is RX in this feature. CAN FD frames MUST be out of scope.
- **FR-005**: Frame instances MUST be immutable once constructed, where feasible.
- **FR-006**: The library MUST provide a configuration model with defaults: interface (gs_usb as the first supported interface), channel (0), bitrate (500000), receive timeout (1.0 second), an optional log directory, and independent enable/disable flags for each supported log format.
- **FR-007**: The library MUST define a generic driver abstraction — independent of any specific adapter vendor or stack — with operations to connect, disconnect, report connected status, receive one frame within a timeout, iterate frames (as a thin iterator over receive, stoppable via an optional stop signal), and report first-class DriverStatus and DriverCapabilities models. The abstraction MUST NOT include a transmit method.
- **FR-008**: Driver implementations: GS_USB is the first supported implementation. The GS_USB driver MUST implement the generic driver abstraction, MUST use python-can internally, and MUST keep python-can fully hidden behind the library's own CanDriver abstraction so that consumers never import or handle python-can objects directly. Low-level python-can and libusb errors MUST be mapped into PrioraCAN domain errors. The GS_USB driver MUST expose DriverCapabilities with: receive = true, transmit = false, can_fd = false, hardware_filters = false, software_filters = false, replay = false, and timestamps = true (when supported by the underlying stack). No transmit method.
- **FR-009**: The architecture MUST allow future drivers — such as SocketCAN, PCAN, Vector, Kvaser, Serial CAN, and MCP2515 — to be added as additional implementations of the same driver abstraction, without changing the public CanFrame model or the CanDriver core contract.
- **FR-010**: The library MUST provide a mock driver that accepts a predefined frame list, supports connect/disconnect/connected-status, returns frames deterministically, reproduces the empty-bus receive-timeout behavior, and reports DriverStatus. It MAY optionally load sanitized realistic frames from a sample fixture for demos and tests.
- **FR-011**: The library MUST define a clear domain error taxonomy covering at least: a base adapter error, driver-not-found, device-not-found, permission, configuration, connection, receive-timeout, and logging errors. Low-level errors from the underlying CAN stack (e.g. python-can, libusb) MUST be mapped onto this taxonomy and MUST NOT leak to consumers.
- **FR-012**: The library MUST define a DriverStatus model as a first-class concept with at minimum the states DISCONNECTED, CONNECTED, LISTENING, and ERROR. The status model MUST allow future metadata such as adapter name, serial number, firmware version, bitrate, channel, last error, and received frame count, without changing its core contract.
- **FR-013**: The library MUST define a minimal logger interface with open, write-one-frame, and close operations, shared by all log formats. Logging MUST NOT complicate the driver abstraction or the frame model.
- **FR-014**: The library MUST provide a structured JSONL logger that writes one self-describing record per frame, serializing the payload as hexadecimal text, including timestamp, channel/bus, direction, arbitration id (numeric and hex), DLC, payload hex, and flags. Records MUST be independently parseable. JSONL is required because it is simple, stable, and useful for tests.
- **FR-015**: The library MUST provide an ASC logger behind the same logger interface as a safe minimal implementation or documented placeholder; full ASC fidelity is deferred to a later logging feature and any foundation limitations MUST be documented.
- **FR-016**: The library MUST provide a thin connection service that accepts a driver and optional loggers, connects the driver, receives one frame, writes received frames to enabled loggers, exposes DriverStatus, and disconnects. It MUST remain a thin orchestrator — NOT a workflow engine — and MUST NOT contain a long-running streaming loop. The frame iterator exposed by the driver MUST be only a thin iterator over driver.receive(); full live streaming is deferred to a later feature.
- **FR-017**: The library MUST ship a test suite that runs entirely without real hardware, deterministically, covering frame formatting and validation, configuration defaults, DriverStatus, the JSONL log output, the mock driver, and the connection service via the mock driver. Tests MUST NOT depend on a specific external local file path; any fixture data MUST be bundled within the library tree.
- **FR-018**: A sanitized sample of realistic CAN frames (optionally derived from a real Toyota Yaris CAN trace) MAY be provided as optional demo/example data under the library's `examples/` or `tests/fixtures/` area. Unit tests MUST use handcrafted deterministic frames and MUST NOT depend on the complete trace. The Yaris trace, if included, MUST be sanitized so that no vehicle identity, VIN, or private data can be inferred, and it MUST be used only for examples, demos, replay development, and manual validation — never as a required unit-test dependency.
- **FR-019**: The library MUST NOT introduce ISO-TP, UDS, or DBC decoding in this feature; those are explicitly deferred to later features.
- **FR-020**: This feature MUST NOT add any backend API, frontend UI, or desktop-agent OBD integration, and MUST NOT modify the existing ELM327 adapter. It is an isolated foundation only.
- **FR-021**: The library MUST be packageable and importable as a standalone library with a minimal README stating its purpose, install notes, and the read-only safety constraint.
- **FR-022**: The library MUST define a DriverCapabilities model as a first-class entity describing what each driver supports, so downstream code never has to infer capabilities. The model MUST cover at minimum: receive, transmit (future; false in this feature), can_fd, hardware_filters, software_filters, replay, and timestamps. Each driver MUST expose its own DriverCapabilities, and future drivers MAY expose different capability values without changing public APIs.
- **FR-023**: The library MUST define a lightweight CaptureSession entity representing one connection/capture lifecycle, with: a session identifier, start time, end time, active state, optional statistics, an associated driver, and an associated configuration. The session MUST remain intentionally minimal in this foundation and MUST NOT become a workflow engine. Its purpose is to provide a stable abstraction for future live streaming, replay, statistics, exporting, and diagnostics.

### Key Entities *(include if feature involves data)*

- **CanFrame**: The immutable record describing one received CAN frame. Key attributes: timestamp, channel/bus (numeric or name), direction (RX in this feature), arbitration id (with derived hex), extended-id / remote-frame / error-frame flags, DLC, payload bytes (with derived spaced hex), optional bitrate. Responsible for self-validating standard vs. extended ID ranges, DLC-to-payload-length consistency, the 0–8 byte Classic CAN payload limit, and the RX-only direction constraint. Designed so future replay and filtering can be added without changing its core shape. Relationships: produced by drivers, consumed by loggers and the connection service.
- **CanUsbConfig**: The configuration for a capture session. Key attributes: interface, channel, bitrate, receive timeout, optional log directory, and per-format enable flags. Responsible for carrying sensible defaults so a consumer can connect with minimal setup.
- **CanDriver (abstraction)**: The generic, vendor-independent contract all drivers implement. Responsibilities: connect, disconnect, report connected status, receive one frame within a timeout, iterate frames as a thin stoppable iterator over receive, and report first-class DriverStatus and DriverCapabilities. Explicitly excludes transmission. Relationships: implemented by the GS_USB driver and the mock driver; used by the connection service and capture session; designed so future drivers (SocketCAN, PCAN, Vector, Kvaser, Serial CAN, MCP2515) can be added without changing this contract.
- **DriverStatus**: The first-class status model reported by every driver. Minimum states: DISCONNECTED, CONNECTED, LISTENING, ERROR. Designed to carry extensible metadata (adapter name, serial number, firmware, bitrate, channel, last error, received frame count) without changing its core contract. Relationships: produced by drivers, surfaced by the connection service.
- **DriverCapabilities**: The first-class capability model reported by every driver, describing what that driver supports so downstream code never infers capabilities. Minimum fields: receive, transmit (future; false in this feature), can_fd, hardware_filters, software_filters, replay, timestamps. Each driver exposes its own values; future drivers may differ without changing public APIs. Relationships: produced by drivers, queryable by consumers and the connection service.
- **GS_USB Driver**: The first concrete driver, targeting candleLight / GS_USB compatible USB-CAN adapters. Responsibilities: use python-can internally while keeping it fully hidden, translate its frame objects into CanFrame, report DriverStatus, report DriverCapabilities (receive=true, transmit=false, can_fd=false, hardware_filters=false, software_filters=false, replay=false, timestamps=true when supported), and map low-level python-can/libusb failures onto the domain error taxonomy. Relationships: implements CanDriver; consumers never touch python-can directly.
- **Mock Driver**: The hardware-free driver for tests and local development. Responsibilities: replay a supplied frame list deterministically, reproduce empty-bus timeout behavior, report DriverStatus, and optionally load sanitized realistic frames from a sample fixture. Relationships: implements CanDriver; used by tests and the connection-service tests.
- **Frame Logger (interface) + JSONL and ASC implementations**: The minimal recording layer. Responsibilities: open a destination, write one record per frame, and close. JSONL is the required, fully-supported structured format; ASC is a safe minimal implementation or documented placeholder behind the same interface. Logging is independent of the driver abstraction and frame model. Relationships: receives CanFrame instances from the connection service.
- **Connection Service**: A thin orchestrator — not a workflow engine. Responsibilities: connect a driver, receive one frame, forward it to enabled loggers, expose DriverStatus, and disconnect. It exposes no long-running streaming loop; the driver's frame iterator is only a thin iterator over receive. Relationships: composes one CanDriver and zero or more loggers.
- **CaptureSession**: A lightweight entity representing one connection/capture lifecycle. Attributes: session identifier, start time, end time, active state, optional statistics, associated driver, associated configuration. Intentionally minimal in this foundation — not a workflow engine. Provides a stable abstraction for future live streaming, replay, statistics, exporting, and diagnostics. Relationships: associated with one CanDriver, one CanUsbConfig, and (optionally) the connection service.
- **Domain Error Taxonomy**: The set of errors (base adapter error; driver-not-found; device-not-found; permission; configuration; connection; receive-timeout; logging) that replace raw underlying python-can/libusb/USB exceptions throughout the library.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A consumer can open a connection and receive a validated raw CAN frame from a supported USB-CAN adapter (GS_USB / candleLight first) using only the library's public driver interface, with no direct contact with the underlying CAN stack and no python-can objects handled by the consumer.
- **SC-002**: 100% of the library's test suite passes on a machine with no USB-CAN adapter attached and no external local file path required.
- **SC-003**: Every public failure path (driver not found, missing device, denied permission, bad configuration, receive timeout, logger failure) surfaces as a named domain error rather than a raw python-can, libusb, or USB exception.
- **SC-004**: No transmit, write, ISO-TP, UDS, or DBC capability is present anywhere in the library's public surface; the only allowed frame direction is RX.
- **SC-005**: The existing ELM327 adapter, desktop-agent OBD logic, backend, and frontend remain unchanged by this feature (zero modified files outside the new library and its spec).
- **SC-006**: A captured session can be written to JSONL and read back such that each received frame corresponds to exactly one valid, parseable record with the payload serialized as hexadecimal text.
- **SC-007**: The library is importable and usable as a standalone package independent of the rest of PrioraScan, establishing the foundation for later raw live sniffing, ISO-TP, UDS, DBC decoding, replay, and PrioraScan integration.
- **SC-008**: The driver abstraction, CanFrame model, and DriverStatus model are generic and stable enough that a future driver (e.g. SocketCAN, PCAN, Vector, Kvaser, Serial CAN, or MCP2515) and future ID/mask/whitelist/blacklist filters and replay can be added without changing their core public contracts.

## Assumptions

- This feature is an **isolated engineering foundation** tracked in the existing SpecKit workflow but understood to sit **outside the documented PrioraScan product roadmap** (Vehicle Management → Diagnostic Sessions → Fault Code Library → AI Analysis → Reports → PrioraFlow). It is a parallel capability track, not a product feature.
- **The PRD and SAD MUST be updated before any product integration** of this library (e.g., exposing raw CAN sniffing in the desktop agent, backend, or frontend). This feature explicitly does not update the PRD/SAD; it only builds the isolated foundation. Integration requires documentation approval per the project's specification-driven development rules.
- The architecture is **generic and driver-agnostic**. GS_USB / candleLight is the **first supported concrete driver only**; the public CanFrame model, CanDriver contract, and DriverStatus model must remain stable so future drivers (SocketCAN, PCAN, Vector, Kvaser, Serial CAN, MCP2515, and others) can be added without changing them.
- The GS_USB driver **shall use python-can internally**, but python-can must stay fully hidden behind the library's own CanDriver abstraction; consumers must never import or handle python-can objects directly, and low-level python-can / libusb errors must be mapped into PrioraCAN domain errors. This is an explicit, user-mandated implementation constraint for the GS_USB driver; other future drivers may choose their own underlying stacks.
- The library is **read-only by design**; transmission (TX) is permanently out of scope for this feature and intentionally excluded. The only allowed frame direction is RX.
- Only **Classic CAN** (0–8 byte payloads) is in scope; **CAN FD** is out of scope.
- **ConnectionService is intentionally thin**: it may connect, receive one frame, forward to optional loggers, expose DriverStatus, and disconnect. It must not become a workflow engine and must not contain a long-running streaming loop; the driver's frame iterator is only a thin iterator over driver.receive(). Full live streaming is deferred to a later feature.
- **Logging is minimal in this foundation**: the JSONL logger is required (simple, stable, test-friendly); the ASC logger is a safe minimal implementation or documented placeholder, with full ASC fidelity deferred to a later logging feature. Logging must not complicate the driver architecture.
- **DriverStatus is a first-class concept** with states DISCONNECTED, CONNECTED, LISTENING, ERROR and extensible metadata (adapter name, serial, firmware, bitrate, channel, last error, received frame count); it replaces vague status wording.
- **DriverCapabilities is a first-class concept** describing what each driver supports (receive, transmit, can_fd, hardware_filters, software_filters, replay, timestamps). GS_USB exposes receive=true, transmit=false, can_fd=false, hardware_filters=false, software_filters=false, replay=false, timestamps=true (when supported). Future drivers may expose different values without changing public APIs; downstream code queries capabilities rather than inferring them.
- **CaptureSession is a lightweight, minimal concept** representing one connection/capture lifecycle (session id, start/end time, active state, optional statistics, associated driver and configuration). It is intentionally minimal in this foundation — not a workflow engine — and exists to provide a stable abstraction for future live streaming, replay, statistics, exporting, and diagnostics.
- **CanFrame is extensible for replay and filtering**: it is immutable, carries direction (RX only this feature) and a named or numeric bus/channel, and its core shape must support future replay and filtering without changes.
- **Future filters and replay are protected by the architecture but not implemented here**: future ID filters, masks, whitelist/blacklist filters, and replay must be possible without changing the CanFrame or CanDriver core contracts. No filters and no replay are implemented in this feature.
- **Driver discovery is deferred but considered**: no full DriverFactory/discovery is implemented in this feature unless it is very small; future driver discovery/detection must be possible without breaking public APIs.
- A **real Toyota Yaris CAN trace** is treated only as optional demo/example data. If included, sanitized sample data is placed under the library's `examples/` or `tests/fixtures/` area. Unit tests use handcrafted deterministic frames and never depend on the complete trace; the Yaris trace is used only for examples, demos, replay development, and manual validation. Tests stay deterministic and hardware-free, no test depends on a specific external local file path, and no vehicle identity, VIN, or private data is inferred from the trace.
- Packaging, import name, and file layout are implementation decisions for the planning phase; this specification requires only that the result is an isolated, importable, standalone library with a minimal README.
- Existing PrioraScan tests must continue to pass; this feature adds a new isolated library and must not modify any existing module.

## Future Features *(non-normative, informational only)*

This section is provided for architectural context only. It is **non-normative** and introduces **no additional requirements** for this feature. The numbering is provisional and may change as the PrioraScan roadmap evolves. Any item here requires its own specification and PRD/SAD alignment before implementation.

- **021 — Capture Session**: expand the lightweight CaptureSession into a full connection/capture lifecycle with statistics and persistence.
- **022 — Live Frame Streaming**: introduce the long-running streaming loop deferred from this foundation, built on the thin frame iterator.
- **023 — Logging Enhancements**: deliver full ASC fidelity and additional capture/export formats deferred from this foundation.
- **024 — Replay Engine**: replay recorded captures through the mock driver / a replay driver, using the extensible CanFrame shape.
- **025 — Frame Filters**: add ID/mask, whitelist/blacklist filters without changing the CanFrame or CanDriver core contracts.
- **026 — Bus Statistics**: aggregate frame/bus statistics on top of CaptureSession.
- **027 — ISO-TP Transport**: implement ISO-TP (CAN-TP) on top of the raw frame foundation.
- **028 — UDS Transport**: implement UDS (Unified Diagnostic Services) on top of ISO-TP.
- **029 — DBC Decoder**: decode raw frames into physical signals using DBC definitions.
- **030 — PrioraScan Integration**: integrate the CAN USB adapter foundation into the desktop agent / backend / frontend, following PRD/SAD updates and product approval.