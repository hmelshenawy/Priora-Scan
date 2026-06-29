import pytest

from prioracan.errors import CanLoggingError
from prioracan.logging import AscLogger, FrameLogger
import prioracan.logging.asc as asc_module
from tests.fixtures.frames import DETERMINISTIC_FRAMES


def test_asc_logger_conforms_and_documents_limits(tmp_path) -> None:
    logger = AscLogger(tmp_path / "capture.asc")
    assert isinstance(logger, FrameLogger)
    doc = asc_module.__doc__ or ""
    assert "Minimal" in doc
    assert "deferred" in doc


def test_asc_writes_header_and_frame_lines(tmp_path) -> None:
    path = tmp_path / "capture.asc"
    logger = AscLogger(path)
    logger.open()
    for frame in DETERMINISTIC_FRAMES[:2]:
        logger.write_frame(frame)
    logger.close()
    lines = path.read_text().splitlines()
    assert lines[0].startswith("date ")
    assert "base hex" in lines[1]
    assert len(lines) == 4
    assert "Rx d" in lines[2]


def test_asc_errors_and_close_safe(tmp_path) -> None:
    logger = AscLogger(tmp_path / "missing" / "capture.asc")
    with pytest.raises(CanLoggingError):
        logger.open()
    logger.close()
    with pytest.raises(CanLoggingError):
        logger.write_frame(DETERMINISTIC_FRAMES[0])
