# PrioraCAN Examples and Driver Guide

These examples are hardware-free unless a section explicitly says GS_USB hardware is required.

## Capture Source Configuration

Examples choose their driver through environment configuration:

```env
CAN_SOURCE=MOCK
CAN_MOCK_TRACE=examples/fixtures/yaris_can_trace.asc

CAN_INTERFACE=gs_usb
CAN_CHANNEL=0
CAN_BITRATE=500000
```

`CAN_SOURCE=MOCK` loads `examples/fixtures/yaris_can_trace.asc` through the
internal ASC loader and constructs a `MockDriver`. The adapter does not need to
be connected.

`CAN_SOURCE=REAL` uses the GS_USB adapter with `CAN_INTERFACE`, `CAN_CHANNEL`,
and `CAN_BITRATE`. For now, REAL means GS_USB; the source name stays generic so
additional sources can be added later.

Developers switch modes by editing `.env` or setting the same variables in the
shell before running an example.

## CAN Sniffer Mock Capture

Run a complete configured capture with no hardware when `CAN_SOURCE=MOCK`:

```bash
python examples/capture_mock.py --output capture_mock.jsonl
```

Expected output includes:

```text
total frames : <count>
rx / tx      : <count> / 0
avg rate     : <value> fps
output       : capture_mock.jsonl
```

The JSONL file contains one parseable record per captured frame.

## CAN Sniffer GS_USB Capture

Run this only when a candleLight/GS_USB-compatible adapter is connected:

```bash
CAN_SOURCE=REAL
python examples/capture_gs_usb.py --duration 5 --output live.jsonl
```

Expected output includes the number of captured frames, average rate, and output path. The script uses `CaptureSession`, the configured driver, and `JsonlLogger`, then releases the adapter when the duration elapses.

## Mock Driver Example

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
print(frame.arbitration_id_hex)
```

## GS_USB Example

```python
from prioracan import CanReceiveTimeout, CanUsbConfig, GsUsbDriver

driver = GsUsbDriver(CanUsbConfig(interface="gs_usb", channel=0, bitrate=500000))
driver.connect()
try:
    frame = driver.receive(timeout_seconds=1.0)
    print(frame.arbitration_id_hex, frame.data_hex)
except CanReceiveTimeout:
    print("no frame received")
finally:
    driver.disconnect()
```

This path requires candleLight/GS_USB-compatible hardware plus platform libusb setup. Unit tests use the virtual bus and do not require hardware.

## Optional Sample Loader

`examples/load_sample.py` loads `examples/fixtures/sample_yaris.jsonl` into `CanFrame` objects if the sanitized sample exists. The file is optional demo data only; tests never require it. If absent, the loader returns an empty list.

## Implementing Another Driver

Implement the `CanDriver` protocol: `connect`, `disconnect`, `is_connected`, `receive`, `iter_frames`, `get_status`, and `get_capabilities`. Do not add transmit, send, write, CAN FD, ISO-TP, UDS, DBC, or live-loop APIs to the public contract.

New backends such as SocketCAN, PCAN, Vector, Kvaser, Serial CAN, or MCP2515 should add their adapter-specific seam under `prioracan/drivers/adapters/` and a concrete driver under `prioracan/drivers/`. Keep `CanFrame`, `CanDriver`, `DriverStatus`, and `DriverCapabilities` unchanged; future drivers compose around those stable contracts.
