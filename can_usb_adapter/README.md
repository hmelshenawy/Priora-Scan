# PrioraCAN

PrioraCAN is a standalone, read-only Python library for receiving raw Classic CAN frames from candleLight/GS_USB compatible USB-CAN adapters. It is isolated from the PrioraScan backend, frontend, desktop agent, and the existing ELM327 adapter.

## Install

```bash
cd can_usb_adapter
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate
pip install -e ".[dev]"
pytest -q
```

## Read-only Safety

The original capture foundation remains backward compatible. Feature 022 adds an additive `send_frame` path plus the first ISO-TP MVP, but does not change `prioracan.__all__`, `CanDriver`, `CanFrame`, capabilities, logging, or capture construction contracts.

## Platform and libusb Setup

Linux: install libusb packages, add a udev rule for the adapter VID/PID, reload rules, and ensure the user belongs to the correct device-access group such as `plugdev` or `uucp`.

macOS: install libusb with Homebrew (`brew install libusb`) before using a GS_USB adapter.

Windows: use Zadig to bind the adapter interface to WinUSB so libusb-backed Python drivers can claim the device.

## Minimal Usage

```python
from prioracan import CanFrame, CanUsbConfig
from prioracan.frame import Direction

config = CanUsbConfig()
frame = CanFrame(
    timestamp=1.0,
    channel=config.channel,
    direction=Direction.RX,
    arbitration_id=0x4D2,
    is_extended_id=False,
    is_remote_frame=False,
    is_error_frame=False,
    dlc=3,
    data=b"\x01\x02\x03",
    bitrate=config.bitrate,
)
print(frame.arbitration_id_hex, frame.data_hex)
```

## Mock Driver and JSONL Logging

```python
from prioracan import CanFrame, ConnectionService, JsonlLogger, MockDriver
from prioracan.frame import Direction

frames = [
    CanFrame(1.0, 0, Direction.RX, 0x100, False, False, False, 1, b"\x11"),
]
driver = MockDriver(frames)
logger = JsonlLogger("capture.jsonl")
service = ConnectionService(driver, [logger])
service.connect()
frame = service.receive_once()
service.disconnect()
```

See `examples/README.md` for a hardware-free mock example, a real-hardware GS_USB example, and a guide for adding future drivers without changing the stable public contracts.

## Capture Source Configuration

Capture examples select their driver from environment variables instead of code:

```env
CAN_SOURCE=MOCK
CAN_MOCK_TRACE=examples/fixtures/yaris_can_trace.asc

CAN_INTERFACE=gs_usb
CAN_CHANNEL=0
CAN_BITRATE=500000
```

`CAN_SOURCE=MOCK` parses the configured Vector ASC trace into `CanFrame`
objects and constructs a `MockDriver`. The adapter does not need to be connected.

`CAN_SOURCE=REAL` uses the configured GS_USB adapter. Developers switch modes by
editing `.env` or setting the variables in the shell before running examples.

## CAN Sniffer CaptureSession

`CaptureSession` is the single lifecycle owner for raw CAN capture. It owns the capture loop, cleanup, logger dispatch, and per-capture statistics.

Lifecycle:

```text
CREATED -> STARTING -> RUNNING -> STOPPING -> STOPPED -> DISPOSED
```

API summary:

```python
from prioracan import CaptureSession, CanUsbConfig, JsonlLogger, MockDriver

session = CaptureSession("demo", 0.0, MockDriver([]), CanUsbConfig(), loggers=(JsonlLogger("capture.jsonl"),))
stats = session.start()
print(stats.total_frames, stats.average_frame_rate)
```

Use a context manager when you want automatic cleanup:

```python
with CaptureSession("demo", 0.0, MockDriver([]), CanUsbConfig()) as session:
    stats = session.start()
```

Ready-made examples:

```bash
python examples/capture_mock.py --output capture_mock.jsonl
python examples/capture_gs_usb.py --duration 5 --output live.jsonl
```

Logging is optional. When one or more loggers are configured, every captured frame is forwarded to each logger. `session.statistics` returns the finalized `CaptureStatistics` after capture ends.

Troubleshooting:

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| No GS_USB adapter found | Device unplugged or not enumerated | Reconnect the adapter and verify OS detection. |
| Permission denied | OS driver or device access issue | Install udev rules on Linux or bind WinUSB with Zadig on Windows. |
| Empty capture | Quiet bus or wrong bitrate/channel | Verify bitrate, channel, and that the CAN bus is active. |
| Logger error | Output path not writable | Choose a writable output directory. |

## ASC Logging

`AscLogger` writes a minimal Vector ASC subset with a header and one line per frame. Full ASC fidelity, including bus events, detailed error-frame formatting, CAN FD, comments, and richer metadata, is deferred to a future logging feature.

## ISO-TP MVP

This is the first ISO-TP MVP, not a complete ISO-15765-2 implementation.

Supported now:
- Classic CAN normal addressing with 11-bit or 29-bit IDs.
- Single Frame payloads from 0 to 7 bytes.
- First Frame plus Consecutive Frame receive reassembly up to 4095 bytes.
- CTS Flow Control emission and parsing with raw millisecond STmin values 0 to 127.
- Multi-frame transmit after CTS, with Block Size handling and mod-16 sequence numbers.
- Two bounded waits: wait-for-Flow-Control and wait-for-Consecutive-Frame.

Deferred intentionally:
- 32-bit escape length, CAN FD, extended/mixed addressing, concurrent transfers, strict six-timer behavior, advanced STmin encodings, and WAIT/OVERFLOW negotiation.
- Diagnostic semantics such as UDS services, VIN, DTC, ECU discovery, DBC parsing, replay, filtering, and product integration.

Byte examples:
- Single Frame request `03 22 f1 90` declares 3 payload bytes.
- First Frame `10 0a 00 01 02 03 04 05` declares a 10-byte payload and carries the first 6 bytes.
- Consecutive Frame `21 06 07 08 09` carries sequence `1` and the remaining bytes.
- CTS Flow Control `30 00 00` means continue, unlimited block, zero STmin.

Transport lifecycle:
```text
create IsoTpTransport -> start -> send_payload/process_frame -> check_timeouts -> stop/dispose
```

Send path:
```text
IsoTpTransport -> CaptureSession.send_frame -> concrete driver -> adapter/bus
```

Receive integration:
```text
driver -> CaptureSession -> frame listener -> IsoTpTransport -> complete payload callback
```

TX state machine:
```text
Idle -> Single Frame complete
Idle -> First Frame -> wait CTS -> Consecutive Frames -> complete
Any wait -> timeout/error -> cleanup -> Idle
```

RX state machine:
```text
Idle -> Single Frame -> deliver
Idle -> First Frame -> CTS -> Consecutive Frames -> deliver
Any wait -> timeout/error -> cleanup -> Idle
```

Permanent architectural boundary: diagnostic/application protocols compose on top of `IsoTpTransport` and consume complete payloads. This layer remains transport-only.

## Optional Yaris Sample

`examples/load_sample.py` can load an optional sanitized `examples/fixtures/sample_yaris.jsonl` file for demos. The sample is not required by tests; when absent, the loader returns an empty frame list.
