from __future__ import annotations

import argparse
import threading
import time
from pathlib import Path

from prioracan import CaptureSession, JsonlLogger
from prioracan.capture_sources.factory import CaptureSourceFactory


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run a configured CAN capture.")
    parser.add_argument("--duration", type=float, default=5.0, help="REAL capture duration in seconds")
    parser.add_argument("--output", default="capture_mock.jsonl", help="JSONL output path")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    factory = CaptureSourceFactory.from_environment()
    logger = JsonlLogger(Path(args.output))
    session = CaptureSession(
        "configured-example",
        time.monotonic(),
        factory.create_driver(),
        factory.create_config(),
        loggers=(logger,),
    )
    timer = threading.Timer(args.duration, session.stop)
    timer.start()
    try:
        stats = session.start()
    finally:
        timer.cancel()
    print_summary(stats, args.output)
    return 0


def print_summary(stats, output: str) -> None:
    print(f"total frames : {stats.total_frames}")
    print(f"rx / tx      : {stats.rx_frames} / {stats.tx_frames}")
    print(f"duration     : {stats.duration:.6f} s")
    print(f"avg rate     : {stats.average_frame_rate:.1f} fps")
    print(f"dropped      : {stats.dropped_frames}")
    print(f"output       : {output}")


if __name__ == "__main__":
    raise SystemExit(main())
