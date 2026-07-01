import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from tests.fixtures.frames import DETERMINISTIC_FRAMES


class StubFrameLogger:
    def __init__(self) -> None:
        self.opened = False
        self.closed = False
        self.frames = []

    def open(self) -> None:
        self.opened = True

    def write_frame(self, frame) -> None:
        self.frames.append(frame)

    def close(self) -> None:
        self.closed = True


class FailingFrameLogger(StubFrameLogger):
    def __init__(self, *, fail_on_open: bool = False, fail_on_frame: int = 1) -> None:
        super().__init__()
        self.fail_on_open = fail_on_open
        self.fail_on_frame = fail_on_frame

    def open(self) -> None:
        from prioracan.errors import CanLoggingError

        if self.fail_on_open:
            raise CanLoggingError("logger open failed")
        super().open()

    def write_frame(self, frame) -> None:
        from prioracan.errors import CanLoggingError

        if len(self.frames) + 1 >= self.fail_on_frame:
            raise CanLoggingError("logger frame failed")
        super().write_frame(frame)


@pytest.fixture
def deterministic_frames():
    return list(DETERMINISTIC_FRAMES)


@pytest.fixture
def deterministic_rx_frames():
    return list(DETERMINISTIC_FRAMES)


@pytest.fixture
def deterministic_tx_frames():
    from prioracan.frame import CanFrame, Direction

    return [
        CanFrame(
            frame.timestamp,
            frame.channel,
            Direction.TX,
            frame.arbitration_id,
            frame.is_extended_id,
            frame.is_remote_frame,
            frame.is_error_frame,
            frame.dlc,
            frame.data,
            frame.bitrate,
        )
        for frame in DETERMINISTIC_FRAMES
    ]


@pytest.fixture
def stub_frame_logger():
    return StubFrameLogger


@pytest.fixture
def failing_frame_logger():
    return FailingFrameLogger


@pytest.fixture
def virtual_bus_config():
    import uuid

    from prioracan.config import CanUsbConfig

    return CanUsbConfig(interface="virtual", channel=f"prioracan-{uuid.uuid4()}")
