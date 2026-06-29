# PrioraCAN

PrioraCAN is a standalone, read-only Python library foundation for receiving raw Classic CAN frames from candleLight/GS_USB compatible USB-CAN adapters. It is intentionally isolated from the PrioraScan backend, frontend, desktop agent, and the existing ELM327 adapter.

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

This foundation is receive-only. It does not expose transmit, send, write, CAN FD, ISO-TP, UDS, DBC, replay, live streaming, or product integration APIs.

## Platform and libusb Setup

Linux: install libusb packages, add a udev rule for the adapter VID/PID, reload rules, and ensure the user belongs to the correct device-access group such as `plugdev` or `uucp`.

macOS: install libusb with Homebrew (`brew install libusb`) before using a GS_USB adapter.

Windows: use Zadig to bind the adapter interface to WinUSB so libusb-backed Python drivers can claim the device.

## Minimal Usage

```python
from prioracan.frame import CanFrame, Direction
from prioracan.config import CanUsbConfig

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

Future milestones add concrete GS_USB and mock drivers behind the `CanDriver` abstraction. Milestone 1 defines the stable domain objects and driver contract only.
