from prioracan.config import CanUsbConfig
from prioracan.session import CaptureSession


class DummyDriver:
    pass


def test_session_defaults_and_refs() -> None:
    driver = DummyDriver()
    config = CanUsbConfig()
    session = CaptureSession("s1", 1.0, driver, config)
    assert session.active is True
    assert session.end_time is None
    assert session.stats is None
    assert session.driver is driver
    assert session.config is config


def test_mark_end_sets_end_time_and_inactive() -> None:
    session = CaptureSession("s1", 1.0, DummyDriver(), CanUsbConfig())
    session.mark_end(2.0)
    assert session.end_time == 2.0
    assert session.active is False


def test_session_has_no_streaming_methods() -> None:
    for name in ("stream", "run", "iter_frames", "receive"):
        assert not hasattr(CaptureSession, name)
