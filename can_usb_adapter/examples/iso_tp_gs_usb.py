import argparse
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from prioracan.config import CanUsbConfig
from prioracan.drivers.gs_usb import GsUsbDriver
from prioracan.iso_tp import IsoTpConfig, IsoTpTransport
from prioracan.session import CaptureSession, CaptureState


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="ISO-TP GS_USB example")
    parser.add_argument("--rx-id", default="0x7e8")
    parser.add_argument("--tx-id", default="0x7e0")
    parser.add_argument("--payload", default="22f190")
    parser.add_argument("--channel", default=0)
    parser.add_argument("--bitrate", default=500000, type=int)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    rx_id = int(str(args.rx_id), 0)
    tx_id = int(str(args.tx_id), 0)
    payload = bytes.fromhex(args.payload)
    if args.dry_run:
        print(f"gs_usb dry run: tx=0x{tx_id:x} rx=0x{rx_id:x} payload={payload.hex()}")
        return 0
    config = CanUsbConfig(interface="gs_usb", channel=args.channel, bitrate=args.bitrate)
    driver = GsUsbDriver(config)
    driver.connect()
    try:
        session = CaptureSession("iso-tp-gs-usb", 0.0, driver, config)
        session._state = CaptureState.RUNNING
        transport = IsoTpTransport(session, config=IsoTpConfig(rx_id, tx_id))
        transport.start()
        transport.send_payload(payload)
        print(f"sent payload: {payload.hex()}")
    finally:
        driver.disconnect()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
