import pytest

from prioracan.config import CanUsbConfig
from prioracan.drivers.mock import MockDriver
from prioracan.errors import CanAdapterError
from prioracan.session import CaptureSession, CaptureState


def make_session(frames=()):
    return CaptureSession("s1", 1.0, MockDriver(frames), CanUsbConfig())


def test_constructor_defaults_and_mark_end_compat() -> None:
    session = make_session()
    assert session.active is True
    assert session.end_time is None
    assert session.stats is None
    assert session.statistics is None
    session.mark_end(2.0)
    assert session.end_time == 2.0
    assert session.active is False


def test_capture_state_members_are_in_order() -> None:
    assert [state.name for state in CaptureState] == [
        "CREATED",
        "STARTING",
        "RUNNING",
        "STOPPING",
        "STOPPED",
        "DISPOSED",
    ]


def test_start_valid_transition_reaches_stopped(deterministic_frames) -> None:
    session = make_session(deterministic_frames)
    session.start()
    assert session.is_running is False
    assert session._state is CaptureState.STOPPED
    assert session.active is False
    assert session.end_time is not None


def test_stop_before_start_and_repeated_stop_are_safe() -> None:
    session = make_session()
    stats = session.stop()
    assert stats.total_frames == 0
    assert session._state is CaptureState.STOPPED
    assert session.stop() is stats
    assert session._state is CaptureState.STOPPED


def test_double_start_raises_can_adapter_error(deterministic_frames) -> None:
    session = make_session(deterministic_frames)
    session.start()
    with pytest.raises(CanAdapterError):
        session.start()


def test_context_manager_disposes_and_rejects_operations() -> None:
    session = make_session()
    with session as managed:
        assert managed is session
    assert session._state is CaptureState.DISPOSED
    with pytest.raises(CanAdapterError):
        session.start()
    with pytest.raises(CanAdapterError):
        session.stop()


def test_no_forbidden_runtime_method_names() -> None:
    for name in ("stream", "run", "iter_frames", "receive", "dispose"):
        assert not hasattr(CaptureSession, name)
