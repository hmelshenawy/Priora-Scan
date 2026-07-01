from __future__ import annotations

import argparse
import threading
import time
from pathlib import Path

from prioracan import CaptureSession, JsonlLogger
from prioracan.capture_sources.factory import CaptureSourceFactory


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Capture CAN frames from the configured source.")
    parser.add_argument("--duration", type=float, default=30.0, help="Capture duration in seconds")
    parser.add_argument("--output", default="capture_gs_usb.jsonl", help="JSONL output path")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    factory = CaptureSourceFactory.from_environment()
    session = CaptureSession(
        "configured-example",
        time.monotonic(),
        factory.create_driver(),
        factory.create_config(),
        loggers=(JsonlLogger(Path(args.output)),),
    )
    timer = threading.Timer(args.duration, session.stop)
    timer.start()
    try:
        stats = session.start()
    finally:
        timer.cancel()
    print(f"captured {stats.total_frames} frames in {stats.duration:.2f}s")
    print(f"avg rate {stats.average_frame_rate:.1f} fps; output {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
