# Feature Specification: ISO-TP Transport Layer (MVP)

**Feature Branch**: `022-iso-tp-transport`

**Created**: 2026-07-01

**Status**: Draft (revised 2026-07-01 — narrowed to an ISO-TP MVP; explicitly adds the missing additive CAN TX path first, then builds the first usable ISO-TP transport on top of it. This is **not** a complete ISO-15765-2 implementation. Final pre-planning refinement: added Transport State Machine, Runtime Ownership, and Receive Integration sections; reclassified validation into a Verification Strategy section; regrouped functional requirements into navigable categories; and recorded a permanent architectural-boundary rule. No scope or architecture changed.)

**Input**: User description: "Feature 022 — ISO-TP Transport Layer. Implement a production-quality ISO-TP transport layer that provides reliable segmented communication over CAN while remaining completely independent from UDS. Builds directly on the completed CAN Runtime (Feature 020 CAN USB Adapter Foundation and Feature 021 CAN Sniffer MVP). Transport only — no UDS, no DBC, no replay, no Desktop Agent / backend / frontend integration." Revised per follow-up direction: narrow to an MVP (additive CAN TX path + Single Frame + multi-frame receive/reassembly + basic CTS flow control + multi-frame transmit after CTS + basic bounded timeouts, Classic CAN normal addressing only), and explicitly defer the full ISO-15765-2 surface to later features.

## User Scenarios & Testing *(mandatory)*

The "users" of this feature are the PrioraScan engineers and the future UDS client (and any higher-layer protocol module) that consumes the `prioracan` library. The vehicle driver is **not** a direct user of this feature. This feature is an **isolated engineering capability** tracked in the SpecKit workflow but understood to sit **outside the documented PrioraScan product roadmap** — a parallel capability track, not a product feature, exactly like Feature 020 and Feature 021.

This feature is an **MVP** and is **transport only**. It moves complete byte payloads over segmented CAN for the common cases (short Single Frame exchanges and long multi-frame exchanges with basic CTS flow control and bounded timeouts). It carries **no diagnostic semantics**: it never inspects, validates, or interprets payload content. Whether a payload is a VIN request, a DTC read, or anything else is irrelevant and invisible to this layer. The complete ISO-15765-2 surface (escape-sequence lengths, strict six-timer enforcement, WAIT/OVERFLOW negotiation, advanced STmin encodings, concurrent transfers, extended/mixed addressing, CAN FD) is **intentionally deferred** to later features (see Non-Goals and Future Features).

Feature 021 delivered a **receive-only** CAN capture runtime. ISO-TP requires **transmission** (Single, First, Consecutive, and Flow Control frames must be sent). Therefore Feature 022 **first adds an additive, backward-compatible CAN TX path** through the existing architecture, then builds the ISO-TP MVP on top of it. The TX path is a prerequisite, not an afterthought.

The user stories below describe **transport behavior only**. Validation and documentation are separated into the [Verification Strategy](#verification-strategy) section.

### User Story 1 - Send a raw CAN frame through the architecture (CAN TX path) (Priority: P1)

An engineer wants to send a raw CAN frame out onto the bus through the same architecture that already captures frames — without bypassing `CaptureSession`, without touching `python-can`, USB, or driver internals, and without breaking any existing receive/capture behavior or public API. The library adds an additive `send_frame(frame)` capability at each layer of the existing stack: `CaptureSession.send_frame(frame)` → `CanDriver.send_frame(frame)` → the concrete driver (`GsUsbDriver.send_frame` / `MockDriver.send_frame`) → (in hardware mode) the adapter → the bus. The send path is **additive only**: existing methods are not removed, renamed, or changed; the receive/capture lifecycle and statistics are untouched; `CaptureSession` remains the single point the upper layers use to reach the bus. A mock send deterministically records the frame (no hardware); a GS_USB send transmits a real frame. Low-level transmit failures surface as the existing PrioraCAN domain errors, never as raw `python-can`/libusb/USB exceptions.

**Why this priority**: The TX path is the prerequisite for every ISO-TP frame this feature must send (Single, First, Consecutive, Flow Control). Without it, no ISO-TP transmission is possible, and `IsoTpTransport` would be forced to bypass `CaptureSession` — which the architecture forbids. It is also independently valuable (it closes the transmit gap left by the receive-only Feature 021) and is the smallest slice that unblocks the rest of the feature.

**Independent Test**: Construct a `CaptureSession` over the mock driver, call `CaptureSession.send_frame(frame)` with a known `CanFrame`, and assert the mock driver received and recorded exactly that frame with no change to capture behavior or statistics; then assert the existing Feature 020/021 test suite still passes unmodified; then inject a transmit failure in the mock and assert a domain error (not a raw exception) is raised.

**Acceptance Scenarios**:

1. **Given** a running `CaptureSession` over the mock driver, **When** the engineer calls `CaptureSession.send_frame(frame)` with a valid `CanFrame`, **Then** the frame is delivered to the mock driver's `send_frame` and recorded, and the call returns success.
2. **Given** a running `CaptureSession` over a GS_USB adapter, **When** the engineer calls `CaptureSession.send_frame(frame)`, **Then** the frame is transmitted on the bus via the concrete driver without the engineer touching `python-can`, USB, or adapter internals.
3. **Given** any existing Feature 020 / Feature 021 public API, **When** the TX path is added, **Then** no existing method is removed, renamed, or signature-changed, the receive/capture behavior and statistics are unchanged, and the existing test suite passes unmodified.
4. **Given** a transmit failure (e.g., driver disconnected, bus error), **When** `send_frame` is called, **Then** a named PrioraCAN domain error is raised — never a raw `python-can`, libusb, or USB exception.
5. **Given** the send path from an upper layer, **When** `IsoTpTransport` (or any future layer) needs to send a frame, **Then** it does so **only** through `CaptureSession.send_frame()` and never calls `CanDriver`, `GsUsbDriver`, `PythonCanAdapter`, or `python-can` directly.

---

### User Story 2 - Exchange a short payload via Single Frame (Priority: P2)

An engineer (or a future higher-layer client) wants to send a short diagnostic payload (≤ 7 bytes for Classic CAN normal addressing) over CAN and receive a short response payload back, as a single CAN frame each way. The `IsoTpTransport` encodes the outgoing payload into a Single Frame and sends it via `CaptureSession.send_frame()`; it receives the peer's Single Frame response from `CaptureSession`'s frame stream, decodes it, and delivers the complete response payload upward. The engineer never assembles PCI bytes or touches raw CAN frame bytes for short messages. The transport validates Single Frame format on decode and rejects malformed frames with a transport domain error. This is the smallest complete ISO-TP exchange and the MVP's first transport slice.

**Why this priority**: Single Frame is the most common diagnostic exchange and the simplest complete payload transfer. It is the minimal viable ISO-TP capability once the TX path exists — without it, no higher layer can send even the smallest request.

**Independent Test**: Using the mock driver under `CaptureSession`, send a ≤ 7-byte payload via `IsoTpTransport`, have the mock responder reply with a valid Single Frame through the mock's receive path, and assert the transport delivers the exact response bytes upward; then inject a malformed Single Frame (length inconsistent with DLC, or declared length exceeds available data) and assert `IsoTpFrameFormatError` is raised and no payload is delivered.

**Acceptance Scenarios**:

1. **Given** a payload of ≤ 7 bytes and a running `CaptureSession` (mock or GS_USB), **When** the engineer sends it through `IsoTpTransport`, **Then** exactly one Single Frame is emitted via `CaptureSession.send_frame()` carrying the correct PCI byte and the full payload, and no segmentation occurs.
2. **Given** a valid incoming Single Frame arrives through `CaptureSession`, **When** the transport decodes it, **Then** the complete payload is extracted and delivered upward as one contiguous byte sequence.
3. **Given** an incoming frame whose PCI indicates Single Frame but whose length is inconsistent with DLC, or whose declared length exceeds the available data, **When** the transport decodes it, **Then** an `IsoTpFrameFormatError` is raised and no partial payload is delivered upward.
4. **Given** any Single Frame exchange, **When** it completes, **Then** no receive buffer, transfer state, or sequence context remains allocated (single-frame transfers leave no lingering state).

---

### User Story 3 - Receive a long payload via multi-frame reassembly with CTS (Priority: P3)

An engineer wants to receive a diagnostic response too large for one CAN frame. The peer sends a First Frame announcing the total length (12-bit, ≤ 4095) and the first fragment, followed by Consecutive Frames each carrying a 4-bit sequence number and the next fragment. The `IsoTpTransport` allocates a receive buffer on the First Frame, validates the announced length, appends each Consecutive Frame's payload in order, validates the sequence number on every Consecutive Frame (rejecting duplicates, out-of-order, and unexpected frames), and emits a **CTS Flow Control** frame to the peer carrying the configured Block Size and STmin (defaults: BS = 0/unlimited, STmin = 0). When the final fragment arrives, the transport delivers one complete, contiguous payload upward and releases the receive buffer. This MVP supports the 12-bit length only (the 32-bit escape sequence is deferred).

**Why this priority**: Long responses (VIN, ECU identification, multi-DTC reads, large data by identifier) are the primary reason ISO-TP exists. Reliable reassembly with basic CTS is the receive half of the MVP and is required before any higher layer can read more than 7 bytes from an ECU. It sits at P3 because it depends on the TX path (P1, to emit the CTS Flow Control) and Single Frame framing (P2) but is itself a complete, independently testable receive capability.

**Independent Test**: Using the mock driver under `CaptureSession` with a scriptable mock responder, drive a multi-frame response of a known length (e.g., 64 bytes spanning several Consecutive Frames), assert the reassembled payload equals the expected bytes exactly, assert a CTS Flow Control frame was emitted with the configured BS/STmin, then inject a duplicate and an out-of-order Consecutive Frame and assert `IsoTpSequenceError` and buffer cleanup in each case.

**Acceptance Scenarios**:

1. **Given** an incoming First Frame announcing length *L* (8 ≤ L ≤ 4095) with the first fragment, **When** the transport processes it, **Then** a receive buffer is allocated for *L* bytes, the first fragment is stored, and a CTS Flow Control frame is emitted to the peer carrying the configured Block Size and STmin.
2. **Given** a multi-frame transfer in progress, **When** each Consecutive Frame arrives, **Then** its sequence number is validated against the expected next sequence, its payload is appended in order, and the buffer grows toward *L* bytes.
3. **Given** the final Consecutive Frame for a transfer, **When** its payload is appended, **Then** the complete payload of exactly *L* bytes is delivered upward as one contiguous sequence and the receive buffer and transfer state are released.
4. **Given** a Consecutive Frame whose sequence number is a duplicate or not the expected successor, **When** it arrives, **Then** an `IsoTpSequenceError` is raised, the partial transfer is aborted, and its buffer is released; no partial payload is delivered upward.
5. **Given** a Consecutive Frame arriving when no First Frame is in progress, **When** it arrives, **Then** an `IsoTpFrameFormatError` (unexpected frame) is raised and no buffer is allocated.
6. **Given** a First Frame announcing a length that exceeds the configured maximum payload/buffer size, **When** the transport processes it, **Then** an `IsoTpBufferOverflowError` is raised and no buffer is allocated.

---

### User Story 4 - Transmit a long payload via multi-frame segmentation after CTS (Priority: P4)

An engineer wants to send a diagnostic request too large for one CAN frame. The `IsoTpTransport` splits the payload automatically: if it fits in a Single Frame it sends one (P2); otherwise it emits a First Frame carrying the 12-bit total length and the first fragment via `CaptureSession.send_frame()`, then waits for a **CTS Flow Control** from the peer. On CTS it emits Consecutive Frames in blocks up to the peer's Block Size (0 = unlimited → send all remaining frames in one burst), pacing each frame by the peer's STmin (default 0, raw ms 0–127 only in this MVP), incrementing the sequence number mod 16 per frame. When all fragments are sent, the transfer completes and transmit state is released. Segmentation, block accounting, and sequence numbering are automatic; the engineer passes only the full payload. This MVP treats non-CTS Flow Control statuses (WAIT, OVERFLOW) as a safe abort (P5 / error handling), not as negotiated behavior.

**Why this priority**: Transmission of long requests is the symmetric half of the MVP and is required for any higher layer that sends large requests. It depends on P1 (TX path), P2 (framing), and basic CTS handling; it is the capability that makes the MVP bidirectional and usable.

**Independent Test**: Using the mock driver with a scriptable responder that returns a CTS Flow Control with a known Block Size and STmin, send a known 64-byte payload through `IsoTpTransport`, capture the frames emitted via `CaptureSession.send_frame()`, and assert the First Frame length and first fragment, the exact Consecutive Frame sequence numbers (including mod-16 wrap if the test payload exceeds 16 frames), the block boundary respecting BS, and the inter-frame spacing respecting STmin; then have the responder return OVERFLOW and assert the transfer aborts with `IsoTpFlowControlError`.

**Acceptance Scenarios**:

1. **Given** a payload of > 7 bytes (≤ 4095) and a running `CaptureSession`, **When** the engineer sends it, **Then** the transport emits a First Frame with the correct 12-bit total length and first fragment via `CaptureSession.send_frame()`, then waits for a Flow Control frame.
2. **Given** a CTS Flow Control with Block Size *BS* and STmin *ST*, **When** the transport resumes, **Then** it emits Consecutive Frames in blocks of at most *BS* (0 = unlimited → all remaining frames), with sequence numbers incremented by one mod 16 per frame, pacing each frame by *ST*.
3. **Given** a CTS with BS ≠ 0, **When** the transport finishes a block, **Then** it pauses and waits for the next CTS before continuing.
4. **Given** the final Consecutive Frame is sent, **When** the payload is fully segmented and sent, **Then** the transfer completes and no transmit buffer or sequence state remains.
5. **Given** a Flow Control frame whose FlowStatus is not CTS (WAIT or OVERFLOW), **When** the transport receives it, **Then** it aborts the transfer with `IsoTpFlowControlError` and releases transmit state (the MVP does not negotiate WAIT/OVERFLOW).

---

### User Story 5 - Enforce basic bounded timeouts (Priority: P5)

An engineer wants the MVP transport to fail fast rather than hang when a peer is silent at the two critical wait points: waiting for a Flow Control after sending a First Frame, and waiting for the next Consecutive Frame after emitting CTS. The `IsoTpTransport` enforces two basic bounded timeouts — a **wait-for-Flow-Control** timeout (corresponding to the N_Bs concept) and a **wait-for-next-Consecutive-Frame** timeout (corresponding to the N_Cr concept) — each configurable with a sane default. On expiration the transport raises `IsoTpTimeoutError`, aborts the affected transfer, and releases its buffers and state. **Full strict six-timer (N_As/N_Bs/N_Cs/N_Ar/N_Br/N_Cr) ISO-15765-2 enforcement is deferred to a later feature**; the MVP implements only these two bounded waits.

**Why this priority**: Bounded timeouts are what make the MVP safe to use on real vehicles where ECUs may stop responding. It sits at P5 because the frame and CTS machinery (P1–P4) must exist first, but no transfer is usable without a guarantee it will not hang forever.

**Independent Test**: Using the mock driver with a responder that goes silent after the First Frame (transmit case) and after a Consecutive Frame (receive case), assert each relevant timeout expires within the configured bound, an `IsoTpTimeoutError` is raised, and the partial transfer's buffer and state are released; verify both the wait-for-FC and wait-for-CF timeouts are exercised by tests.

**Acceptance Scenarios**:

1. **Given** a transmit transfer that has sent a First Frame and is waiting for a Flow Control, **When** no Flow Control arrives within the configured wait-for-FC timeout, **Then** an `IsoTpTimeoutError` is raised and the transmit transfer is aborted and cleaned up.
2. **Given** a receive transfer that has emitted CTS and is waiting for the next Consecutive Frame, **When** no frame arrives within the configured wait-for-CF timeout, **Then** an `IsoTpTimeoutError` is raised and the receive transfer is aborted and its buffer released.
3. **Given** any timeout-induced abort, **When** cleanup runs, **Then** no buffer, timer, or transfer state leaks and the transport returns to an idle state ready for a new transfer.

---

### Edge Cases

- **Empty payload**: A zero-length payload must be handled (encoded as a Single Frame with length 0) or rejected with a defined domain error; the behavior must be defined, not implementation-defined.
- **Payload exactly 7 bytes**: Must use a Single Frame (not a First Frame); the 7/8-byte boundary must be correct.
- **Payload of 8 bytes**: Must use a First Frame (cannot fit Single Frame); the boundary must be correct in both directions.
- **Payload up to 4095 bytes (12-bit length)**: Must reassemble and transmit correctly up to the 12-bit limit.
- **Payload exceeding 4095 bytes**: The MVP does **not** support the 32-bit escape sequence; an oversized payload (or an incoming First Frame with an escape-sequence length) MUST be rejected with `IsoTpBufferOverflowError` / `IsoTpFrameFormatError` rather than partially handled. (Escape sequence is deferred.)
- **Sequence wrap-around**: Consecutive Frame sequence numbers wrap at 16 (0x0 → 0xF → 0x0); wrap-around must be handled correctly for transfers longer than 16 frames.
- **Duplicate Consecutive Frame**: A frame with the same sequence number as the previous one must be rejected with `IsoTpSequenceError` and abort the transfer.
- **Out-of-order Consecutive Frame**: A frame whose sequence number is not the expected successor must be rejected with `IsoTpSequenceError` and abort the transfer.
- **Unexpected frame type mid-transfer**: A First Frame arriving during an ongoing receive transfer, or a Consecutive Frame arriving when idle, must be rejected with `IsoTpFrameFormatError`.
- **Overrun beyond announced length**: A Consecutive Frame that would push the buffer past the First Frame's announced length must be rejected and the transfer aborted.
- **Non-CTS Flow Control (WAIT/OVERFLOW)**: The MVP does not negotiate WAIT or OVERFLOW; receiving either MUST abort the transfer with `IsoTpFlowControlError`. (Full WAIT/OVERFLOW behavior is deferred.)
- **Malformed Flow Control frame**: A Flow Control frame with an invalid FS value must be rejected with `IsoTpFrameFormatError`.
- **STmin encoding**: The MVP supports raw millisecond STmin values 0–127; structured STmin encodings (128–249) and reserved values (250–255) are deferred. A non-conformant STmin in a received CTS MUST be handled with a defined, safe behavior (e.g., clamp to 0 / treat as 0, or reject the Flow Control with `IsoTpFrameFormatError`).
- **Single transfer at a time**: The MVP supports one transfer at a time; a new transfer request while one is in progress MUST be rejected with a domain error. (Concurrent transfers are deferred.)
- **Transfer on a CAN ID with no peer**: The transmit must time out at the wait-for-FC timeout and abort, not hang.
- **Transport reuse after abort**: After any transfer aborts due to error or timeout, the transport must return to a clean idle state and accept a new transfer without restart.
- **Disjoint RX and TX CAN IDs (asymmetric addressing)**: The transport must support configurable separate RX/TX arbitration IDs, not assume symmetric IDs.
- **Extended (29-bit) vs standard (11-bit) IDs**: Both must be supported via the existing `CanFrame` extended flag, with no behavioral difference beyond ID width.
- **CaptureSession stops mid-transfer**: If `CaptureSession` stops or the driver disconnects while a transfer is in flight, the transport must surface a transport/connection domain error and release transfer state, not hang or crash.
- **High bus traffic / interleaved unrelated frames**: Frames on other CAN IDs or non-ISO-TP frames must be ignored by the transport and must not corrupt an in-progress transfer.
- **Long-running continuous sessions**: Repeated back-to-back transfers over an extended session must not leak memory (buffers, timers, transfer state released after each transfer).
- **Disposed transport reuse**: Any operation on a disposed/closed transport must raise a domain error rather than silently doing nothing or touching released resources.
- **TX path on stopped/idle CaptureSession**: Calling `CaptureSession.send_frame()` when the session is not in a state that permits transmit MUST raise a domain error (e.g., connection/dispose error) rather than silently dropping the frame or touching released resources; the exact permissible states are defined in the planning phase but must be additive and must not weaken existing receive behavior.

## Verification Strategy

This section replaces the former validation/documentation user story. It is **not** a functional user story; functional user stories above describe transport behavior only. The verification strategy defines how the MVP is validated and documented.

### Mock validation

The entire MVP is validated hardware-free using the existing mock driver under `CaptureSession` with a scriptable mock ISO-TP peer that deterministically plays First Frame / Consecutive Frame / CTS / error / timeout sequences, and that also exercises the new CAN TX path. Every TX-path, Single Frame, multi-frame reassembly, multi-frame transmit, CTS, timeout, and error scenario MUST be covered by deterministic mock tests that pass on a machine with no USB-CAN adapter and no external local file path. Mock validation is the CI gate.

### Real hardware validation

The transport is hardware-agnostic: it depends only on `CaptureSession` and `CanFrame`, with no vehicle- or driver-specific branches. Real hardware validation confirms the mock-validated code path behaves identically on a live bus. It is **not** a CI gate; it is performed manually and recorded as a manual validation note. No test in the automated suite depends on real hardware.

### Manual GS_USB validation

Manual validation uses the existing GS_USB driver under `CaptureSession` against the already-validated Toyota and Mercedes vehicles, running the same transport entry points used in the mock tests. A Single Frame and a multi-frame exchange MUST succeed on each vehicle with no code changes and no vehicle-specific branches. The result (vehicle, ECU, payload, outcome) is recorded as a manual validation note. Where useful, captured traffic from these sessions may be bundled as fixtures inside the library tree to support hardware-free regression tests, provided no test depends on a specific external local file path.

### Documentation validation

Documentation MUST clearly state that Feature 022 is the **first ISO-TP MVP**, not a complete ISO-15765-2 implementation, and MUST enumerate what is supported now and what is intentionally deferred (see the Documentation requirements and Success Criteria). Documentation validation confirms the supported/deferred lists, byte-level frame examples, the transport lifecycle, sequence numbering with mod-16 wrap, the send-path architecture diagram, the receive-integration data flow, the transport state machines, and the explicit boundary that diagnostic semantics belong to UDS are all present and accurate.

## Transport State Machine

> **This section is documentation only.** It describes the runtime states for transmission and reception to aid implementation and review. It introduces **no new functionality** and **no new requirements**; every behavior shown is already mandated by the functional requirements. The exact mechanism for driving these states (threads, events, async, etc.) is an implementation decision for the planning phase.

### TX State Machine

```text
Idle
    │
    ▼
Encode Payload
    │
    ▼
Single Frame ?
 ├── Yes → Send SF → Complete
 └── No
        │
        ▼
Send First Frame
        │
        ▼
Waiting For CTS
        │
        ▼
Send Consecutive Frames
        │
        ▼
Complete
```

**TX transitions to timeout / cleanup / abort / idle**:

- **Idle → Encode Payload**: a send request is accepted (single transfer at a time; a request while busy is rejected with a domain error).
- **Encode Payload → Send SF** (payload ≤ 7 bytes): Single Frame is sent via `CaptureSession.send_frame()`; on success → **Complete**.
- **Encode Payload → Send First Frame** (payload > 7 bytes, ≤ 4095): First Frame is sent via `CaptureSession.send_frame()`.
- **Send First Frame → Waiting For CTS**: the transport waits for a CTS Flow Control.
  - **Timeout (wait-for-FC)**: no Flow Control within the configured bound → `IsoTpTimeoutError` → **Abort**.
  - **Non-CTS Flow Control (WAIT/OVERFLOW)**: → `IsoTpFlowControlError` → **Abort**.
  - **Malformed Flow Control / invalid FS or STmin**: → `IsoTpFrameFormatError` → **Abort**.
- **Waiting For CTS → Send Consecutive Frames**: on CTS, Consecutive Frames are sent in blocks up to the peer's Block Size, paced by STmin, sequence incremented mod 16. With BS ≠ 0, the flow returns to **Waiting For CTS** between blocks.
- **Send Consecutive Frames → Complete**: when the final fragment is sent.
- **Abort**: on any error (timeout, flow-control error, frame-format error, sequence error, buffer overflow, or `CaptureSession` stop/disconnect mid-transfer) the transfer is aborted, the raised domain error is surfaced, and no partial payload is delivered upward.
- **Cleanup**: on both **Complete** and **Abort**, the transmit buffer, sequence state, and active timeout are released.
- **Idle**: after cleanup, the transport returns to a clean idle state ready for a new transfer. Any operation on a disposed transport raises a domain error.

### RX State Machine

```text
Idle
    │
    ▼
Receive Frame
    │
    ├── Single Frame
    │        │
    │        ▼
    │     Deliver Payload
    │
    └── First Frame
             │
             ▼
      Allocate Buffer
             │
             ▼
        Send CTS
             │
             ▼
 Receive Consecutive Frames
             │
             ▼
      Complete Payload
             │
             ▼
          Deliver
```

**RX transitions to timeout / cleanup / abort / idle**:

- **Idle → Receive Frame**: an incoming CAN frame arrives from `CaptureSession` on the configured RX arbitration ID. Frames on unrelated IDs or non-ISO-TP frames are ignored (no state change).
- **Receive Frame → Deliver Payload** (Single Frame): the payload is extracted and delivered upward; no lingering state.
- **Receive Frame → Allocate Buffer** (First Frame): the 12-bit total length is validated and a receive buffer is allocated (subject to the configured maximum).
  - **Escape-sequence / oversized length**: → `IsoTpBufferOverflowError` / `IsoTpFrameFormatError` → **Abort**.
- **Allocate Buffer → Send CTS**: a CTS Flow Control is emitted via `CaptureSession.send_frame()` carrying the configured Block Size and STmin.
- **Send CTS → Receive Consecutive Frames**: the transport waits for the next Consecutive Frame.
  - **Timeout (wait-for-CF)**: no Consecutive Frame within the configured bound → `IsoTpTimeoutError` → **Abort**.
  - **Duplicate / out-of-order sequence**: → `IsoTpSequenceError` → **Abort**.
  - **Unexpected frame type / overrun past announced length / malformed frame**: → `IsoTpFrameFormatError` → **Abort**.
- **Receive Consecutive Frames → Complete Payload**: each fragment is appended in order; when the buffer reaches the announced length the transfer is complete. With BS ≠ 0, the flow may return to **Send CTS** between blocks (CTS re-emit behavior follows the configured Block Size).
- **Complete Payload → Deliver**: the complete contiguous payload is delivered upward as one byte sequence.
- **Abort**: on any error (timeout, sequence error, frame-format error, buffer overflow, or `CaptureSession` stop/disconnect mid-transfer) the transfer is aborted, the raised domain error is surfaced, and no partial payload is delivered upward.
- **Cleanup**: on both **Deliver** and **Abort**, the receive buffer, sequence state, and active timeout are released.
- **Idle**: after cleanup, the transport returns to a clean idle state ready for a new transfer. Any operation on a disposed transport raises a domain error.

## Runtime Ownership

This section makes the runtime ownership boundary explicit to prevent future architectural drift. It is a restatement of constraints already present in the functional requirements; it introduces no new requirements.

- **`CaptureSession` owns the CAN runtime.** It is the single lifecycle owner for capture and the only component that talks to the driver stack.
- **`CaptureSession` owns driver communication.** All interaction with `CanDriver` and the concrete drivers flows through `CaptureSession`.
- **`CaptureSession` owns frame acquisition.** The receive loop, frame production, and frame delivery upward originate in `CaptureSession`.
- **`IsoTpTransport` never polls hardware directly.** It does not read from the bus, the driver, the adapter, USB, or `python-can`.
- **`IsoTpTransport` consumes frames coming from `CaptureSession`.** Incoming `CanFrame` instances reach the transport from `CaptureSession` (see [Receive Integration](#receive-integration)).
- **`IsoTpTransport` sends frames only through `CaptureSession.send_frame()`.** Every ISO-TP frame it emits (Single, First, Consecutive, Flow Control) goes out via the additive `CaptureSession.send_frame()` path.

`IsoTpTransport` **never owns**:

- driver threads
- USB
- `python-can`
- adapter lifecycle

These remain exclusively inside `CaptureSession` and the adapter layer (`PythonCanAdapter` + drivers). The transport is a consumer/producer of frames at the `CaptureSession` boundary — nothing more.

## Receive Integration

This section describes how incoming CAN frames reach the transport. It defines **only the ownership and direction of the data flow**. The specific mechanism — callbacks, queues, events, iterators, or another approach — is **not** defined here and is left as an implementation decision for the planning phase.

```text
Driver
  ↓
CaptureSession
  ↓
CanFrame
  ↓
IsoTpTransport
  ↓
Payload
```

- The **Driver** produces raw CAN frames from the bus (mock or GS_USB).
- **`CaptureSession`** acquires those frames and emits them upward as validated `CanFrame` instances; it owns this acquisition path.
- **`CanFrame`** is the unit that crosses the boundary into the transport — the existing, unchanged frame model.
- **`IsoTpTransport`** consumes `CanFrame` instances from `CaptureSession`, performs ISO-TP decode/reassembly, and emits complete payloads upward.
- **Payload** is the complete reassembled byte sequence delivered to higher layers (the future UDS client or any consumer).

The data flow is strictly **upward**: Driver → `CaptureSession` → `CanFrame` → `IsoTpTransport` → Payload. The transport never reaches downward past `CaptureSession`; `CaptureSession` never reaches upward past the frame boundary it exposes. The choice of how frames are pushed or pulled across the `CaptureSession` → `IsoTpTransport` boundary is deferred to planning, provided the ownership and direction above are preserved.

## Requirements *(mandatory)*

The functional requirements are organized into the categories below. Every requirement is preserved verbatim from the prior revision; this reorganization adds no new requirements and removes, merges, or weakens none.

### CAN TX Path

- **FR-001**: The library MUST add an additive, backward-compatible CAN transmit (TX) path through the existing architecture so that upper layers can send raw CAN frames without bypassing `CaptureSession`. The send path MUST be:

  `CaptureSession.send_frame(frame)` → `CanDriver.send_frame(frame)` → concrete driver (`GsUsbDriver.send_frame` / `MockDriver.send_frame`) → (hardware mode) adapter → bus.

- **FR-002**: `send_frame(frame)` MUST be added at each of: `CanDriver`, `GsUsbDriver`, `MockDriver`, and `CaptureSession`. The additions MUST be **strictly additive**: no existing method is removed, renamed, or signature-changed; no existing receive/capture behavior, lifecycle state machine, statistics, logging, or configuration is altered. The Feature 020 and Feature 021 public APIs and test suites MUST continue to pass unmodified.
- **FR-003**: `CaptureSession.send_frame(frame)` MUST be the **only** send entry point upper layers use to reach the bus. `IsoTpTransport` MUST send every ISO-TP frame (Single, First, Consecutive, Flow Control) **only** through `CaptureSession.send_frame()`. `IsoTpTransport` MUST NOT call `CanDriver`, `GsUsbDriver`, `MockDriver`, `PythonCanAdapter`, or `python-can` directly.
- **FR-004**: `MockDriver.send_frame` MUST deterministically record sent frames (enabling hardware-free TX tests) without requiring a vehicle. `GsUsbDriver.send_frame` MUST transmit a real frame on the bus. Transmit failures (driver disconnected, bus error, adapter failure) MUST surface as the existing PrioraCAN domain errors, never as raw `python-can`/libusb/USB exceptions.
- **FR-005**: The TX path MUST NOT change the `CanFrame` model's core shape or validation rules; the sent frame is a standard `CanFrame`.

### Architecture

- **FR-006**: The library MUST provide an ISO-TP **MVP** transport capability that segments outgoing payloads, reassembles incoming payloads, manages basic CTS flow control, manages sequence numbers, enforces two basic bounded timeouts, and exposes complete payloads to higher layers, for Classic CAN normal addressing. `IsoTpTransport` MUST be the single owner of transport-layer state; no other component may own transfer state, buffers, timers, or sequence validation.
- **FR-007**: `IsoTpTransport` MUST be the central transport abstraction and an **active runtime object**, not merely a frame codec. It MUST own active transfers, receive buffers, transmit buffers, the two basic timeouts, and sequence validation. It MUST expose a clean public API — at minimum a send operation that accepts a complete payload and emits raw CAN frames via `CaptureSession.send_frame()`, a receive path that delivers complete reassembled payloads upward, configuration of basic flow-control parameters (Block Size, STmin) and the two timeout values, and a lifecycle (start/stop/dispose). It MAY support a context-managed lifecycle so resources are released on exit.
- **FR-008**: The layered architecture MUST be:

  `IsoTpTransport` → `CaptureSession` → `CanDriver` → `GsUsbDriver` / `MockDriver` → `PythonCanAdapter` → `python-can` → USB driver → CAN hardware.

  `IsoTpTransport` sits directly above `CaptureSession`. It consumes raw CAN frames from `CaptureSession` and emits raw CAN frames back into `CaptureSession` for transmission. There MUST be no bypass of `CaptureSession`.
- **FR-009**: `IsoTpTransport` MUST NOT own capture lifecycle, drivers, logging, or statistics. Those remain inside `CaptureSession`. The transport's responsibility set is strictly limited to segmentation, reassembly, basic CTS flow control, sequence management, two basic timeouts, and upward payload delivery (see FR-033, Single Responsibility Protection).
- **FR-010**: The transport MUST be completely independent from UDS and from any diagnostic semantics. It MUST NOT know, inspect, validate, or interpret VIN, DTC, ECU, Diagnostic Session, Security Access, Service IDs, or any payload content. Payloads are opaque byte sequences at this layer.
- **FR-031 (Do-Not-Modify List, additive only)**: This feature MUST NOT remove, rename, or change the signature of any existing method in: `CaptureSession`, `CanDriver`, `MockDriver`, `GsUsbDriver`, `PythonCanAdapter`, the existing loggers (JSONL, ASC), the capture statistics, the capture configuration, the `CanFrame` model's core shape and validation rules, the Feature 020 public API, or the Feature 021 public API. The only permitted changes to those components are **strictly additive** (e.g., the new `send_frame` methods). The receive/capture behavior, lifecycle, statistics, and logging of Feature 021 MUST remain unchanged. ISO-TP MUST compose on top of `CaptureSession` and MUST NEVER bypass it.
- **FR-032 (Layer Constraints)**: The following architectural constraints MUST hold:
  - Only `PythonCanAdapter` MAY import `python-can` (the Feature 020 guard is retained and MUST still pass).
  - `IsoTpTransport` depends ONLY on `CaptureSession`, `CanFrame`, and the transport's own domain models/errors; it MUST NOT depend on concrete driver implementations, `PythonCanAdapter`, USB, libusb, or `python-can`.
  - No layer MAY bypass `CaptureSession` to reach `CanDriver`, the underlying CAN stack, USB, or adapter-library objects.
  - No circular dependencies MAY be introduced.
  - No module outside the adapter layer MAY reference USB, libusb, or `python-can` objects, types, or exceptions directly; such concerns MUST be mapped onto the PrioraCAN domain error taxonomy before crossing the abstraction boundary.
- **FR-033 (Single Responsibility Protection)**: `IsoTpTransport`'s responsibilities MUST be limited to segmentation, reassembly, basic CTS flow control, sequence management, two basic timeouts, and upward payload delivery. It MUST NEVER become responsible for UDS, VIN/DTC/ECU/session/security/service-id handling, DBC decoding, replay, filtering, logging, statistics, capture lifecycle, driver management, or Desktop Agent / backend / frontend communication. Future layers MUST consume complete payloads from `IsoTpTransport` instead of extending its responsibilities.

> **Architectural Note — Compose-on-top extensibility**: The future UDS client MUST sit above `IsoTpTransport` and consume complete payloads from it, exactly as `IsoTpTransport` sits above `CaptureSession`. `IsoTpTransport`'s responsibility set is frozen by FR-033 and MUST NOT grow as UDS and later features are added. Later ISO-TP enhancements (escape length, six-timer enforcement, WAIT/OVERFLOW negotiation, advanced STmin, concurrent transfers, extended/mixed addressing, CAN FD) extend or wrap this MVP rather than expand its responsibility set.

> **Permanent Architectural Boundary (applies to all future protocol features)**: Future protocol layers — including UDS, OBD-II services, ECU discovery, DBC decoding, and any application integrations — MUST consume complete payloads from `IsoTpTransport`. `IsoTpTransport` MUST NEVER expand its responsibility beyond transport. Future capabilities MUST compose on top of `IsoTpTransport` rather than extend it. This rule is a permanent architectural constraint for all future protocol features; it is not limited to Feature 022 and is not revisable per-feature without explicit architectural approval.

### Frame Encoding

- **FR-011 (Single Frame)**: The transport MUST encode a payload that fits in a Single Frame (≤ 7 bytes for Classic CAN normal addressing) into one CAN frame with the correct PCI byte (0x0n where n is the length) and the full payload, and MUST decode an incoming Single Frame by extracting the declared length and the payload bytes. A Single Frame whose declared length is inconsistent with DLC, or whose declared length exceeds the available data, MUST be rejected with `IsoTpFrameFormatError`.
- **FR-012 (First Frame, 12-bit length only)**: The transport MUST encode a First Frame for payloads exceeding the Single Frame limit and ≤ 4095 bytes, carrying the 12-bit total length and the first fragment. On decode, the transport MUST extract the 12-bit total length, validate it, allocate a receive buffer of the announced length (subject to the configured maximum), and store the first fragment. A First Frame whose DLC is insufficient MUST be rejected with `IsoTpFrameFormatError`. The 32-bit escape sequence (length field 0 + 32-bit length) is **deferred**: an incoming First Frame with length field 0 (escape indicator) MUST be rejected with `IsoTpFrameFormatError` (or `IsoTpBufferOverflowError`), not partially handled.
- **FR-013 (Consecutive Frame)**: The transport MUST encode Consecutive Frames carrying a 4-bit sequence number (incremented mod 16 per frame) and the next payload fragment, and MUST decode incoming Consecutive Frames by validating the sequence number against the expected successor, rejecting duplicates and out-of-order frames with `IsoTpSequenceError`, and appending the fragment to the receive buffer in order.
- **FR-014 (Flow Control, CTS only)**: The transport MUST encode a CTS Flow Control frame carrying FlowStatus = CTS, a Block Size, and an STmin, and MUST decode an incoming Flow Control frame, validating the FlowStatus and the BS/STmin encoding. A Flow Control frame with an invalid FS value or non-conformant STmin/BS encoding MUST be rejected with `IsoTpFrameFormatError`. WAIT and OVERFLOW statuses MUST be recognized but **not negotiated** in this MVP: receiving either MUST abort the transfer with `IsoTpFlowControlError` (safe abort). The transport emits CTS only; it MUST NOT emit WAIT or OVERFLOW in this MVP.

### Multi-frame Receive

- **FR-015**: On receiving a First Frame, the transport MUST allocate a receive buffer sized to the announced 12-bit total length (bounded by the configured maximum payload size), store the first fragment, and emit a CTS Flow Control frame to the peer carrying the configured Block Size and STmin.
- **FR-016**: On each subsequent Consecutive Frame, the transport MUST validate the sequence number, append the fragment in order, and detect transfer completion when the buffer reaches the announced length, at which point it MUST deliver one complete contiguous payload upward and release the buffer and transfer state.
- **FR-017**: The transport MUST reject and abort the receive transfer with the appropriate error on: duplicate sequence number (`IsoTpSequenceError`), out-of-order sequence number (`IsoTpSequenceError`), Consecutive Frame arriving when idle (`IsoTpFrameFormatError`), buffer overrun past the announced length (`IsoTpFrameFormatError`), and announced length exceeding the configured maximum (`IsoTpBufferOverflowError`). In every abort case the receive buffer and transfer state MUST be released.

### Multi-frame Transmission

- **FR-018**: The transport MUST automatically select Single Frame for payloads within the Single Frame limit and First Frame + Consecutive Frames otherwise (for payloads ≤ 4095 bytes). For multi-frame transmission it MUST emit a First Frame with the correct 12-bit total length and first fragment via `CaptureSession.send_frame()`, then wait for a Flow Control frame before sending Consecutive Frames.
- **FR-019**: On receiving a CTS Flow Control, the transport MUST emit Consecutive Frames in blocks of at most the peer's Block Size (0 = unlimited → send all remaining frames in one burst), pacing each frame by the peer's STmin, incrementing the sequence number mod 16 per frame. After a finite block (BS ≠ 0), it MUST pause and wait for the next CTS before continuing.
- **FR-020**: On receiving a non-CTS Flow Control (WAIT or OVERFLOW), the transport MUST abort the transfer, raise `IsoTpFlowControlError`, and release transmit state. The MVP does not implement WAIT retry or OVERFLOW negotiation.
- **FR-021**: When the final Consecutive Frame is sent, the transport MUST mark the transmit transfer complete and release transmit buffer and sequence state. If no Flow Control arrives within the configured wait-for-FC timeout, it MUST raise `IsoTpTimeoutError` and abort and clean up the transfer.

### Flow Control

- **FR-022**: The transport MUST expose configurable flow-control parameters for reception: Block Size (0 = unlimited, the default) and STmin (default 0). Both MUST be applied in the CTS Flow Control frames emitted by this transport as the receiver.
- **FR-023**: The transport MUST honor the peer's Block Size and STmin when transmitting Consecutive Frames (FR-019). STmin MUST be interpreted for raw millisecond values 0–127 only; structured STmin encodings (128–249) and reserved values (250–255) are **deferred**. A non-conformant STmin in a received CTS MUST be handled with a defined, safe behavior (clamp to 0 or reject the Flow Control with `IsoTpFrameFormatError`).

### Timeouts

- **FR-024**: The transport MUST enforce two basic bounded timeouts:
  - **Wait-for-Flow-Control** (corresponding to the N_Bs concept): the time the transmitter waits for a Flow Control after sending a First Frame.
  - **Wait-for-next-Consecutive-Frame** (corresponding to the N_Cr concept): the time the receiver waits for the next Consecutive Frame after emitting CTS.
  Both MUST be configurable with sane defaults. Expiration of either MUST raise `IsoTpTimeoutError` and MUST abort and clean up the affected transfer (release buffers, timers, and transfer state). **Full strict six-timer (N_As/N_Bs/N_Cs/N_Ar/N_Br/N_Cr) ISO-15765-2 enforcement is deferred to a later feature.**

### Error Handling

- **FR-025**: The library MUST define transport-specific domain errors covering at minimum: `IsoTpTimeoutError`, `IsoTpSequenceError`, `IsoTpFlowControlError`, `IsoTpFrameFormatError`, and `IsoTpBufferOverflowError`. These errors MUST follow the existing PrioraCAN domain error taxonomy style and MUST NOT leak implementation details, raw `python-can`/USB exceptions, or internal buffer/pointer/state specifics. Low-level failures from `CaptureSession` (driver disconnect, transmit failure) MUST be mapped onto the transport domain error taxonomy or propagated as the existing capture domain errors, never as raw low-level exceptions.
- **FR-026**: Every transport failure path (malformed frame, sequence mismatch, duplicate frame, unexpected frame, buffer overflow, non-CTS flow control, timeout, capture-session stop mid-transfer) MUST surface as a named domain error, MUST abort the affected transfer, and MUST release that transfer's buffers, timers, and state. No partial payload may be delivered upward on an aborted transfer.

### Session Model

- **FR-027**: `IsoTpTransport` MUST own, for the active transfer: the transfer direction (RX/TX), the peer CAN arbitration IDs (configurable separate RX and TX IDs), the receive or transmit buffer, the expected/next sequence number, the active timeout, and the flow-control state (remaining block count, STmin). The transport MUST NOT own capture lifecycle, drivers, logging, or statistics.
- **FR-028**: The transport MUST support configurable asymmetric RX/TX CAN arbitration IDs, and MUST support both standard (11-bit) and extended (29-bit) IDs via the existing `CanFrame` extended flag with no behavioral difference beyond ID width.
- **FR-029**: The MVP MUST support **one transfer at a time**. A new transfer request while one is in progress MUST be rejected with a domain error. Frames on unrelated CAN IDs (or non-ISO-TP frames) MUST be ignored and MUST NOT corrupt the in-progress transfer. (Concurrent multi-transfer support is deferred.) After any transfer completes or aborts, the transport MUST return to a clean idle state and accept a new transfer without restart. Any operation on a disposed/closed transport MUST raise a domain error.

### Testing

- **FR-030**: The entire MVP workflow MUST operate using the existing mock driver under `CaptureSession` with a scriptable mock ISO-TP peer that deterministically plays First Frame / Consecutive Frame / CTS / error / timeout sequences, and that also exercises the new CAN TX path, enabling repeatable hardware-free testing. The transport MUST also support live operation against GS_USB adapters and real vehicles (Toyota, Mercedes) with **no code changes and no vehicle- or driver-specific branches** — the transport depends only on `CaptureSession` and `CanFrame`. Real-vehicle validation MAY be documented and performed as a **manual** validation step and is **not required for CI**.
- **FR-035**: The library MUST ship a comprehensive test suite that runs entirely without real hardware and deterministically covers: the CAN TX path through `MockDriver` (and through `GsUsbDriver` using a virtual bus where possible, hardware-free), Single Frame encode/decode, malformed Single Frame, First Frame decode, Consecutive Frame sequence validation, multi-frame reassembly, CTS Flow Control encode/decode, multi-frame transmit after CTS, timeout waiting for CTS, timeout waiting for Consecutive Frame, and cleanup after both success and failure. Tests MUST NOT depend on a specific external local file path; any captured-traffic fixture MUST be bundled within the library tree. Real-vehicle validation is documented as a manual step and is not a CI test.
- **FR-036**: The library MUST maintain at least 90% test coverage for the new CAN TX path and ISO-TP MVP code, consistent with the Feature 020 / Feature 021 quality bar.

### Documentation

- **FR-037**: The library documentation MUST clearly state that Feature 022 is the **first ISO-TP MVP**, not a complete ISO-15765-2 implementation. It MUST list what is supported now (CAN TX path; Single Frame encode/decode; First Frame + Consecutive Frame receive/reassembly; basic CTS flow control with BS default 0 and STmin default 0; multi-frame transmit after CTS; two basic bounded timeouts) and what is intentionally deferred (32-bit escape length; full six-timer strict enforcement; advanced STmin microsecond encodings; WAIT Flow Control behavior; OVERFLOW Flow Control behavior beyond safe abort; concurrent transfers; extended addressing; mixed addressing; CAN FD ISO-TP; UDS; VIN/DTC/Security Access/ECU discovery; Desktop Agent / backend / frontend integration). Documentation MUST include byte-level frame examples for the supported frame types, the transport lifecycle, sequence numbering with mod-16 wrap, the send-path architecture diagram, the receive-integration data flow, the transport state machines, and the explicit boundary that diagnostic semantics belong to UDS. All new public APIs MUST be documented with clear docstrings.
- **FR-038**: The library MUST ship example scripts demonstrating (a) a mock ISO-TP exchange (Single Frame and multi-frame) requiring no hardware, and (b) a GS_USB ISO-TP exchange with a real ECU on a real vehicle (runnable when hardware is present; used for the manual real-vehicle validation). Examples MUST NOT require the Desktop Agent, backend, or frontend.

### Performance

- **FR-034**: The transport MUST support repeated back-to-back transfers (single transfer at a time) and payloads up to the 12-bit length limit without memory leaks: receive buffers, transmit buffers, the active timeout, and transfer state MUST be released after every transfer completion or abort. The transport MUST remain stable under high CAN traffic by ignoring non-matching frames without per-frame allocation growing without bound.

### Non-goals

- **FR-039 (In scope for the MVP)**: Feature 022 includes exactly: (1) the additive CAN TX path; (2) Single Frame encode/decode with malformed-frame validation; (3) First Frame + Consecutive Frame receive/reassembly with sequence validation, completion, and cleanup; (4) basic CTS Flow Control encode/decode (BS default 0/unlimited, STmin default 0); (5) multi-frame transmit after CTS with sequence increment mod 16 and cleanup; (6) two basic bounded timeouts (wait-for-FC, wait-for-CF) raising `IsoTpTimeoutError`. Classic CAN normal addressing only.
- **FR-040 (Explicitly deferred to later features)**: This feature MUST NOT implement: the 32-bit First Frame escape length; full six-timer strict ISO-15765-2 enforcement (only the two basic waits in FR-024 are in scope); advanced STmin microsecond/factor encodings (only raw ms 0–127); WAIT Flow Control behavior (only safe abort); OVERFLOW Flow Control behavior beyond basic safe abort; concurrent/multi transfers (only one transfer at a time); extended addressing; mixed addressing; CAN FD ISO-TP; UDS; VIN reading; DTC reading; Security Access; ECU discovery; replay; DBC decoding; Desktop Agent integration; backend integration; frontend integration. It MUST NOT modify any module outside the `prioracan` library and its spec.
- **FR-041**: This feature MUST NOT implement CAN FD transport. Only Classic CAN (0–8 byte payloads) is in scope, consistent with Feature 020 and Feature 021.
- **FR-042**: This feature MUST NOT implement ISO-15765-2 extended or mixed addressing modes. **Normal addressing** (11-bit or 29-bit CAN IDs, payload starts at byte 0) is the only addressing mode in scope.

### Key Entities *(include if feature involves data)*

- **IsoTpTransport (central abstraction, active runtime object)**: The primary public transport object and the single owner of transport-layer state for the MVP — an **active runtime object** that owns the active transfer, receive/transmit buffers, the two basic timeouts, and sequence validation. Exposes a send operation (complete payload in, raw CAN frames out via `CaptureSession.send_frame()`), a receive path (raw CAN frames in from `CaptureSession`, complete reassembled payload delivered upward), configurable basic flow-control parameters (Block Size, STmin), the two timeout values, configurable RX/TX arbitration IDs, and a lifecycle (start/stop/dispose, context-managed). Supports one transfer at a time. Responsibilities are strictly limited per FR-033. Depends only on `CaptureSession`, `CanFrame`, and its own domain models/errors. Relationships: composes one `CaptureSession` reference; produces and consumes `CanFrame` instances; delivers complete payloads to higher layers.
- **CAN TX path (additive)**: The new `send_frame(frame)` methods added at `CaptureSession`, `CanDriver`, `GsUsbDriver`, and `MockDriver`. Strictly additive; does not alter existing receive/capture behavior or public APIs. `CaptureSession.send_frame` is the only send entry point upper layers use. Relationships: `IsoTpTransport` → `CaptureSession.send_frame` → `CanDriver.send_frame` → concrete `send_frame`.
- **IsoTpFrame (value objects, MVP frame types)**: The ISO-15765-2 frame types supported in the MVP — Single Frame, First Frame (12-bit length only), Consecutive Frame, and CTS Flow Control — each with its PCI structure and encode/decode behavior. Relationships: encoded into / decoded from `CanFrame` payloads by `IsoTpTransport`.
- **FlowControlParameters (value object, MVP)**: Carries FlowStatus (CTS only for emission; CTS/WAIT/OVERFLOW recognized on reception), Block Size (default 0/unlimited), and STmin (default 0, raw ms 0–127). Relationships: produced and consumed by `IsoTpTransport`.
- **TransferState (internal, single RX or TX)**: The per-transfer state — direction, peer CAN IDs, buffer, expected/next sequence number, remaining block count, STmin, and the active timeout. Only one TransferState is active at a time in the MVP. Internal to `IsoTpTransport`; not a peer public abstraction. Relationships: created and released by `IsoTpTransport` per transfer.
- **IsoTpConfig (configuration)**: The transport configuration — RX/TX arbitration IDs, ID type (standard/extended), Block Size (default 0), STmin (default 0), the two timeout values, maximum payload/buffer size. Relationships: consumed by `IsoTpTransport` at construction.
- **Transport Domain Errors (new, in existing taxonomy style)**: `IsoTpTimeoutError`, `IsoTpSequenceError`, `IsoTpFlowControlError`, `IsoTpFrameFormatError`, `IsoTpBufferOverflowError` — and a base ISO-TP error. Replace raw `python-can`/USB/`CaptureSession` failures crossing into the transport layer. Do not leak implementation details. Relationships: raised by `IsoTpTransport`; part of the PrioraCAN domain error taxonomy.
- **CanFrame (existing, unchanged core)**: The immutable record describing one CAN frame. Its core shape and validation are unchanged by this feature; the TX path sends standard `CanFrame` instances. Relationships: produced by `CaptureSession`, consumed and emitted by `IsoTpTransport`.
- **CaptureSession (existing, extended additively with `send_frame`)**: The single capture-lifecycle owner from Feature 021. `IsoTpTransport` consumes raw CAN frames from it and emits raw CAN frames into it via the additive `CaptureSession.send_frame()`. Its existing responsibilities, lifecycle, statistics, and logging are unchanged. Relationships: sits directly below `IsoTpTransport`.
- **CanDriver (existing abstraction, extended additively with `send_frame`)**: The generic, vendor-independent contract all drivers implement. Additively gains `send_frame(frame)`. Existing contract otherwise unchanged. Relationships: implemented by GS_USB and mock drivers; `CaptureSession.send_frame` delegates to it.
- **MockDriver (existing, extended additively with `send_frame` + scriptable ISO-TP peer)**: The hardware-free driver. `send_frame` deterministically records sent frames. Used with a scriptable mock ISO-TP peer to play deterministic frame/CTS/timer/error sequences. Relationships: implements `CanDriver`; used under `CaptureSession` by ISO-TP tests and the mock example.
- **GsUsbDriver (existing, extended additively with `send_frame`)**: The first concrete hardware driver. `send_frame` transmits a real frame on the bus. Used for manual real-vehicle validation (Toyota, Mercedes) with no transport code changes. Relationships: implements `CanDriver`; used under `CaptureSession` by the GS_USB ISO-TP example and live validation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An engineer can send a raw CAN frame out onto the bus through `CaptureSession.send_frame()` over the mock driver or a GS_USB adapter, using only the library's public API, with no direct contact with `python-can`, USB, or driver internals, and with no change to any existing receive/capture behavior or public API.
- **SC-002**: An engineer (or future UDS client) can send a complete byte payload and receive a complete byte payload over CAN through `IsoTpTransport`, using only the transport's public API, with no direct contact with raw CAN frame bytes, segmentation, sequence numbers, flow control, or `python-can` objects.
- **SC-003**: Short payloads (≤ 7 bytes) are exchanged as Single Frames and long payloads (8–4095 bytes) are exchanged as First Frame + Consecutive Frames, with the 7/8-byte boundary correct in both directions, automatically and with no engineer involvement in framing.
- **SC-004**: Every complete received payload equals exactly the bytes the peer sent, in order, for payloads up to the 12-bit length limit, verified by deterministic mock tests and by manual real-vehicle round-trips on Toyota and Mercedes.
- **SC-005**: Basic CTS flow control works: as receiver the transport emits CTS with the configured Block Size (default 0) and STmin (default 0); as transmitter it honors the peer's Block Size and STmin (raw ms 0–127) and aborts on WAIT/OVERFLOW with `IsoTpFlowControlError`.
- **SC-006**: The two basic bounded timeouts (wait-for-FC, wait-for-CF) are enforced: a silent peer causes a bounded `IsoTpTimeoutError` and a clean abort with no leaked buffers, timers, or state — never an indefinite hang.
- **SC-007**: Every transport failure path (malformed frame, sequence mismatch, duplicate frame, unexpected frame, buffer overflow, non-CTS flow control, timeout, capture-session stop mid-transfer) surfaces as a named transport domain error and triggers full cleanup — never as a raw `python-can`, libusb, or USB exception, never with a partial payload delivered upward, and never with leaked resources.
- **SC-008**: 100% of the library's test suite (Feature 020 plus Feature 021 plus Feature 022 tests) passes on a machine with no USB-CAN adapter attached and no external local file path required, deterministically, using the mock driver and a scriptable mock ISO-TP peer. Real-vehicle validation is documented as a manual step, not a CI test.
- **SC-009**: The transport validates on real GS_USB hardware against the Toyota and Mercedes vehicles with the same code path used in mock tests — no vehicle-specific branches, no driver-specific branches, no `python-can` import, and no USB/libusb references in the transport source.
- **SC-010**: No UDS, VIN, DTC, ECU, Security Access, Service ID, DBC decoding, replay, filtering, Desktop Agent, backend, or frontend capability is present anywhere in the transport's public surface; payloads are opaque at this layer.
- **SC-011**: The existing `prioracan` public API remains backward-compatible; the Feature 020 and Feature 021 test suites continue to pass unmodified; `CaptureSession`, `CanDriver`, `MockDriver`, `GsUsbDriver`, `PythonCanAdapter`, the loggers, statistics, configuration, and the `CanFrame` core shape are unchanged except for strictly additive `send_frame` methods; and the architecture guard (only `PythonCanAdapter` imports `python-can`) still passes.
- **SC-012**: Repeated back-to-back transfers (one at a time) and payloads up to the 12-bit length limit run without memory leaks: buffers, timers, and transfer state are released after every completion or abort, verified by a long-running-session test.
- **SC-013**: The mock ISO-TP example runs to completion with no hardware and prints complete Single Frame and multi-frame payloads; the GS_USB ISO-TP example exchanges a real payload with a real ECU (used for manual validation) — neither example depends on the Desktop Agent, backend, or frontend.
- **SC-014**: The existing ELM327 adapter, desktop-agent OBD logic, backend, and frontend remain unchanged by this feature (zero modified files outside the `prioracan` library and its spec).
- **SC-015**: The transport composes on top of `CaptureSession` and never bypasses it, sending frames only via `CaptureSession.send_frame()`, so that future capabilities (UDS, DBC decoder, replay, filters, PrioraScan integration) compose on top of `IsoTpTransport` and consume complete payloads from it, rather than expanding the transport's responsibilities.
- **SC-016**: The documentation clearly states Feature 022 is the first ISO-TP MVP and enumerates the supported capabilities and the intentionally deferred capabilities, so downstream features know exactly what foundation they are building on.

## Assumptions

- This feature is an **isolated engineering capability** tracked in the SpecKit workflow but understood to sit **outside the documented PrioraScan product roadmap** (Vehicle Management → Diagnostic Sessions → Fault Code Library → AI Analysis → Reports → PrioraFlow). It is a parallel capability track, not a product feature, exactly like Feature 020 and Feature 021.
- **The PRD and SAD MUST be updated before any product integration** of ISO-TP (e.g., exposing diagnostic messaging in the desktop agent, backend, or frontend). This feature explicitly does not update the PRD/SAD; it only builds the isolated transport MVP. Integration requires documentation approval per the project's specification-driven development rules.
- The feature **builds on the Feature 020 and Feature 021 foundations** and **must not change their architecture or public APIs**; the layered architecture, the "only `PythonCanAdapter` imports `python-can`" rule, the `CaptureSession` single-lifecycle-owner model, and the receive-only capture behavior of Feature 021 are user-mandated constraints and remain in force. The CAN TX path is **strictly additive** and is the mechanism by which ISO-TP sends frames without bypassing `CaptureSession` and without breaking Feature 021's receive-only behavior.
- **This is an MVP, not a complete ISO-15765-2 implementation.** In scope: the additive CAN TX path, Single Frame, multi-frame receive/reassembly, basic CTS flow control, multi-frame transmit after CTS, and two basic bounded timeouts. Deferred: 32-bit escape length, full six-timer strict enforcement, advanced STmin encodings, WAIT/OVERFLOW negotiation, concurrent transfers, extended/mixed addressing, CAN FD, and UDS.
- **Classic CAN only (0–8 byte payloads)**, consistent with Feature 020 and Feature 021. CAN FD transport is out of scope and deferred.
- **Normal addressing only** (11-bit or 29-bit CAN IDs, payload begins at byte 0). Extended and mixed addressing are deferred.
- **Asymmetric RX/TX CAN arbitration IDs** are assumed (real ECUs typically use distinct request and response IDs); the transport supports configurable separate RX and TX IDs and does not assume symmetric IDs.
- **12-bit First Frame length only** (≤ 4095 bytes). The 32-bit escape sequence is deferred; oversized payloads and escape-indicator First Frames are rejected, not partially handled.
- **Block Size default 0 (unlimited)** and **STmin default 0**; both are configurable. STmin is interpreted for raw ms 0–127 only; structured encodings are deferred.
- **CTS only for emission**; on reception, WAIT and OVERFLOW are recognized but not negotiated — they trigger a safe abort with `IsoTpFlowControlError`. The transport does not emit WAIT or OVERFLOW in this MVP.
- **Two basic bounded timeouts** (wait-for-FC ≈ N_Bs concept, wait-for-CF ≈ N_Cr concept) with sane defaults; full strict six-timer enforcement is deferred.
- **Single transfer at a time**; concurrent multi-transfer support is deferred.
- **Single ownership of transport state**: `IsoTpTransport` is the only component that owns transfers, buffers, timeouts, and sequence validation. `CaptureSession` remains the only owner of capture lifecycle, drivers, logging, and statistics. The two responsibility sets do not overlap. `IsoTpTransport` never owns driver threads, USB, `python-can`, or adapter lifecycle.
- **Transport is diagnostic-agnostic**: payloads are opaque byte sequences. No VIN, DTC, ECU, session, security, or service-id knowledge belongs at this layer; the future UDS client will sit above `IsoTpTransport` and interpret payloads.
- **Real-vehicle validation is a manual step**, not a CI gate; CI runs entirely on the mock driver (and on a GS_USB virtual bus where possible). No test depends on real hardware or on an external local file path.
- **Receive-integration mechanism is unspecified**: the data flow is Driver → `CaptureSession` → `CanFrame` → `IsoTpTransport` → Payload (ownership and direction only); the mechanism (callbacks, queues, events, iterators, etc.) is an implementation decision for the planning phase.
- Exact naming of new internals beyond `IsoTpTransport` and the `send_frame` methods, file layout, the GS_USB virtual-bus test approach, the receive-integration mechanism, and the chosen timeout/concurrency implementation (threads, events, async, etc.) are **implementation decisions for the planning phase**; this specification requires only that the result is additive, backward-compatible, hardware-free testable, single-owner, ISO-15765-2-conformant for the in-scope subset, and consistent with the Feature 020 / Feature 021 architecture.
- Existing PrioraScan tests must continue to pass; this feature adds capability inside the `prioracan` library and must not modify any existing module outside it.

## Future Features *(non-normative, informational only)*

This section is provided for architectural context only. It is **non-normative** and introduces **no additional requirements** for this feature. The numbering is provisional and may change as the PrioraScan roadmap evolves. Any item here requires its own specification and PRD/SAD alignment before implementation.

- **ISO-TP Completeness**: lift the deferred ISO-15765-2 surface out of the MVP — 32-bit First Frame escape length, full strict six-timer enforcement (N_As/N_Bs/N_Cs/N_Ar/N_Br/N_Cr), WAIT Flow Control retry and OVERFLOW negotiation, advanced STmin microsecond/factor encodings, concurrent/multi transfers, and extended/mixed addressing. These extend or wrap the Feature 022 MVP without expanding `IsoTpTransport`'s responsibility set, per the Permanent Architectural Boundary.
- **CAN FD Transport**: extend ISO-TP for CAN FD frames (ISO-15765-2 CAN FD extensions), building on a future CAN FD-capable `CanDriver`.
- **UDS Client**: implement Unified Diagnostic Services on top of `IsoTpTransport`, consuming complete payloads from it and adding diagnostic semantics (Service IDs, sessions, Security Access, VIN/DTC reads). This is the direct downstream consumer of Feature 022 and MUST compose on top of `IsoTpTransport`, never extend it.
- **OBD-II Services / ECU Discovery**: implement OBD-II service handling and ECU discovery on top of `IsoTpTransport`, consuming complete payloads from it (compose-on-top, per the Permanent Architectural Boundary).
- **Replay Engine**: replay recorded captures through the mock / a replay driver, consuming frames recorded by `CaptureSession` (independent of ISO-TP).
- **Frame Filters**: ID/mask, whitelist/blacklist filters as a layer consuming `CaptureSession` frames.
- **DBC Decoder**: decode raw frames into physical signals using DBC definitions.
- **PrioraScan Integration**: integrate the CAN transport / UDS stack into the desktop agent / backend / frontend, following PRD/SAD updates and product approval.