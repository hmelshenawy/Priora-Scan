# Quickstart: `prioracan` (CAN USB Adapter Foundation)

**Feature**: 020-can-usb-adapter | **Date**: 2026-06-29 | **Spec**: [spec.md](spec.md) | **Contract**: [contracts/library-api-contract.md](contracts/library-api-contract.md)

A minimal, hardware-free introduction to the `prioracan` library. Every example below runs with **no USB-CAN adapter** by using the `MockDriver`. The library is **read-only** — there is no transmit.

## 1. Install (editable, for development)

```bash
cd can_usb_adapter
python -m venv .venv
# Windows: .venv\Scripts\activate   |   Linux/macOS: source .venv/bin/activate
pip install -e ".[dev]"
pytest -q          # full suite, no hardware required
```

Import check:

```bash
python -c "import prioracan; print(prioracan.__name__)"
```

## 2. Build a frame (handcrafted, deterministic)

```python
from prioracan import CanFrame

frame = CanFrame(
    timestamp=1719700000.123,
    channel=0,
    direction="RX",                 # RX is the only allowed direction in this feature
    arbitration_id=0x4D2,
    is_extended_id=False,
    is_remote_frame=False,
    is_error_frame=False,
    dlc=3,
    data=bytes([0x01, 0x02, 0x03]),
)
print(frame.arbitration_id_hex)     # "0x4D2"
print(frame.data_hex)               # "01 02 03"
```

Invalid frames raise a domain error:

```python
from prioracan import CanConfigurationError

try:
    CanFrame(timestamp=0.0, channel=0, direction="RX",
             arbitration_id=0x800, is_extended_id=False,   # > 11-bit range
             is_remote_frame=False, is_error_frame=False,
             dlc=0, data=b"")
except CanConfigurationError as e:
    print("rejected:", e)
```

## 3. Receive frames with the mock driver (no hardware)

```python
from prioracan import MockDriver, CanReceiveTimeout

frames = [
    CanFrame(timestamp=1.0, channel=0, direction="RX",
             arbitration_id=0x100, is_extended_id=False,
             is_remote_frame=False, is_error_frame=False, dlc=1, data=b"\x11"),
    CanFrame(timestamp=2.0, channel=0, direction="RX",
             arbitration_id=0x200, is_extended_id=False,
             is_remote_frame=False, is_error_frame=False, dlc=2, data=b"\x22\x33"),
]

driver = MockDriver(frames)
driver.connect()
print(driver.get_status().state)           # CONNECTED -> LISTENING
print(driver.get_capabilities().receive)   # True

first = driver.receive()
second = driver.receive()

try:
    driver.receive(timeout_seconds=0)      # bus exhausted
except CanReceiveTimeout:
    print("empty bus -> timeout")

driver.disconnect()
```

## 4. Log frames to JSONL

```python
from prioracan import MockDriver, JsonlLogger, ConnectionService

frames = [ ... ]  # as above
driver = MockDriver(frames)
logger = JsonlLogger(path="capture.jsonl")

svc = ConnectionService(driver=driver, loggers=[logger])
svc.connect()
frame = svc.receive_once()    # writes one JSONL record, returns the frame
print(frame.arbitration_id_hex)
svc.disconnect()
```

`capture.jsonl` now contains one valid JSON object per received frame, payload serialized as `data_hex`:

```json
{"timestamp":1.0,"channel":0,"direction":"RX","arbitration_id":256,"arbitration_id_hex":"0x100","is_extended_id":false,"is_remote_frame":false,"is_error_frame":false,"dlc":1,"data_hex":"11","bitrate":null}
```

## 5. Use the GS_USB driver (real hardware — not required for tests)

```python
from prioracan import GsUsbDriver, CanUsbConfig, CanReceiveTimeout

config = CanUsbConfig(interface="gs_usb", channel=0, bitrate=500000, receive_timeout_seconds=1.0)
driver = GsUsbDriver(config)
driver.connect()
try:
    frame = driver.receive(timeout_seconds=1.0)
    print(frame.arbitration_id_hex, frame.data_hex)
except CanReceiveTimeout:
    print("no frame within timeout")
finally:
    driver.disconnect()
```

> Requires a candleLight/GS_USB compatible adapter and OS-specific libusb setup (see README). CI and unit tests never run this path — they use `MockDriver` and python-can's `"virtual"` bus.

## 6. Iterate frames (thin iterator, stoppable)

```python
import threading
from prioracan import MockDriver

driver = MockDriver(frames)
driver.connect()
stop = threading.Event()

for frame in driver.iter_frames(stop_event=stop):
    print(frame.arbitration_id_hex)
    if some_condition:
        stop.set()        # iterator exits on next check

driver.disconnect()
```

`iter_frames` is a thin iterator over `receive()` — it is **not** a streaming engine and owns no threads. Full live streaming is deferred to a later feature.

## 7. What this foundation does NOT do

No transmit/write, no CAN FD, no ISO-TP, no UDS, no DBC decoding, no replay engine, no live streaming, no desktop-agent/backend/frontend integration. See the spec's out-of-scope list and the Future Features section.