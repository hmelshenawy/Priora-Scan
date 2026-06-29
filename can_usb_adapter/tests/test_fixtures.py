from prioracan.drivers.mock import MockDriver
from prioracan.frame import CanFrame
from tests.fixtures.frames import DETERMINISTIC_FRAMES


def test_deterministic_frames_are_valid_and_varied() -> None:
    assert all(isinstance(frame, CanFrame) for frame in DETERMINISTIC_FRAMES)
    assert any(frame.is_extended_id for frame in DETERMINISTIC_FRAMES)
    assert any(not frame.is_extended_id for frame in DETERMINISTIC_FRAMES)
    assert any(frame.is_remote_frame for frame in DETERMINISTIC_FRAMES)
    assert any(frame.dlc == 0 for frame in DETERMINISTIC_FRAMES)
    assert any(frame.dlc == 8 for frame in DETERMINISTIC_FRAMES)


def test_deterministic_frames_are_stable() -> None:
    assert DETERMINISTIC_FRAMES == list(DETERMINISTIC_FRAMES)


def test_mock_replays_fixtures_in_order() -> None:
    driver = MockDriver(DETERMINISTIC_FRAMES)
    driver.connect()
    assert [driver.receive() for _ in DETERMINISTIC_FRAMES] == DETERMINISTIC_FRAMES
