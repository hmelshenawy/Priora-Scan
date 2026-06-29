import inspect

import pytest

from prioracan.frame import CanFrame
from prioracan.logging.base import FrameLogger


class ConformingLogger:
    def open(self) -> None:
        pass

    def write_frame(self, frame: CanFrame) -> None:
        pass

    def close(self) -> None:
        pass


class MissingCloseLogger:
    def open(self) -> None:
        pass

    def write_frame(self, frame: CanFrame) -> None:
        pass


def test_frame_logger_protocol_conformance() -> None:
    assert isinstance(ConformingLogger(), FrameLogger)
    assert not isinstance(MissingCloseLogger(), FrameLogger)


def test_frame_logger_declares_only_three_methods() -> None:
    methods = {
        name
        for name, value in FrameLogger.__dict__.items()
        if inspect.isfunction(value) and not name.startswith("_")
    }
    assert methods == {"open", "write_frame", "close"}
    assert not methods & {"transmit", "send", "run", "stream"}
