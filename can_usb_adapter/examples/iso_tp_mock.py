from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from prioracan.config import CanUsbConfig
from prioracan.drivers.mock import MockDriver
from prioracan.iso_tp import IsoTpConfig, IsoTpTransport
from prioracan.session import CaptureSession, CaptureState
from prioracan.frame import CanFrame, Direction


def frame(arbitration_id: int, data: bytes) -> CanFrame:
    return CanFrame(0.0, 0, Direction.RX, arbitration_id, False, False, False, len(data), data)


def running_transport(on_payload):
    driver = MockDriver(())
    driver.connect()
    session = CaptureSession("iso-tp-mock", 0.0, driver, CanUsbConfig())
    session._state = CaptureState.RUNNING
    config = IsoTpConfig(rx_arbitration_id=0x456, tx_arbitration_id=0x123)
    transport = IsoTpTransport(session, config=config, on_payload=on_payload)
    transport.start()
    return transport


def main() -> int:
    payloads: list[bytes] = []
    transport = running_transport(payloads.append)
    transport.send_payload(bytes.fromhex("22f190"))
    transport.process_frame(frame(0x456, bytes.fromhex("0362f190")))
    long_payload = bytes(range(10))
    transport.process_frame(frame(0x456, b"\x10\x0a" + long_payload[:6]))
    transport.process_frame(frame(0x456, b"\x21" + long_payload[6:]))
    print(f"single-frame payload: {payloads[0].hex()}")
    print(f"multi-frame payload: {payloads[1].hex()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
