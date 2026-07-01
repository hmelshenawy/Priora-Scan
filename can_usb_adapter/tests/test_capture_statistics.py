import dataclasses

import pytest

from prioracan.config import CanUsbConfig
from prioracan.drivers.mock import MockDriver
from prioracan.errors import CanLoggingError
from prioracan.frame import CanFrame, Direction
from prioracan.session import CaptureSession
from prioracan.statistics import CaptureStatistics


class FailingLogger:
    def open(self) -> None:
        return None

    def write_frame(self, frame) -> None:
        raise CanLoggingError("frame failed")

    def close(self) -> None:
        return None


def tx_clone(frame: CanFrame) -> CanFrame:
    clone = object.__new__(CanFrame)
    for field in dataclasses.fields(CanFrame):
        object.__setattr__(clone, field.name, getattr(frame, field.name))
    object.__setattr__(clone, "direction", Direction.TX)
    return clone


def test_capture_statistics_counts_rx_tx_and_rate(deterministic_frames) -> None:
    frames = [deterministic_frames[0], tx_clone(deterministic_frames[1])]
    session = CaptureSession("s1", 1.0, MockDriver(frames), CanUsbConfig())

    stats = session.start()

    assert stats is session.statistics
    assert stats.total_frames == 2
    assert stats.rx_frames == 1
    assert stats.tx_frames == 1
    assert stats.dropped_frames == 0
    assert stats.duration > 0
    assert stats.average_frame_rate == pytest.approx(stats.total_frames / stats.duration)


def test_empty_capture_returns_zero_statistics() -> None:
    session = CaptureSession("s1", 1.0, MockDriver(()), CanUsbConfig())

    stats = session.start()

    assert stats.total_frames == 0
    assert stats.rx_frames == 0
    assert stats.tx_frames == 0
    assert stats.dropped_frames == 0
    assert stats.average_frame_rate == 0.0


def test_repeated_sessions_do_not_share_counters(deterministic_frames) -> None:
    first = CaptureSession("s1", 1.0, MockDriver(deterministic_frames[:1]), CanUsbConfig())
    second = CaptureSession("s2", 1.0, MockDriver(deterministic_frames[1:3]), CanUsbConfig())

    first_stats = first.start()
    second_stats = second.start()

    assert first_stats.total_frames == 1
    assert second_stats.total_frames == 2
    assert first.statistics.total_frames == 1


def test_statistics_has_exact_bounded_fields_and_is_frozen() -> None:
    expected = (
        "start_time",
        "end_time",
        "duration",
        "total_frames",
        "rx_frames",
        "tx_frames",
        "dropped_frames",
        "average_frame_rate",
    )
    forbidden = {"bus_utilization", "histogram", "bitrate", "protocol", "frequency"}

    stats = CaptureStatistics.build(1.0, 1.0, total_frames=0, rx_frames=0, tx_frames=0)

    assert tuple(field.name for field in dataclasses.fields(CaptureStatistics)) == expected
    assert forbidden.isdisjoint(field.name for field in dataclasses.fields(CaptureStatistics))
    assert stats.average_frame_rate == 0.0
    with pytest.raises(dataclasses.FrozenInstanceError):
        stats.total_frames = 1


def test_capture_statistics_not_top_level_exported() -> None:
    import prioracan

    assert "CaptureStatistics" not in prioracan.__all__


def test_partial_statistics_on_logger_failure(deterministic_frames) -> None:
    session = CaptureSession(
        "s1",
        1.0,
        MockDriver(deterministic_frames),
        CanUsbConfig(),
        loggers=(FailingLogger(),),
    )

    with pytest.raises(CanLoggingError):
        session.start()

    assert session.statistics.total_frames == 1
    assert session.statistics.rx_frames == 1
    assert session.statistics.tx_frames == 0
