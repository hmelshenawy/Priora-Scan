import json

import pytest

from prioracan.errors import CanLoggingError
from prioracan.logging.jsonl import JsonlLogger
from tests.fixtures.frames import DETERMINISTIC_FRAMES, make_standard_frame


def test_jsonl_writes_one_parseable_record_per_frame(tmp_path) -> None:
    path = tmp_path / "capture.jsonl"
    logger = JsonlLogger(path)
    logger.open()
    for frame in DETERMINISTIC_FRAMES[:2]:
        logger.write_frame(frame)
    logger.close()
    records = [json.loads(line) for line in path.read_text().splitlines()]
    assert len(records) == 2
    assert records[0]["arbitration_id_hex"] == "0x100"
    assert records[0]["data_hex"] == "11"
    assert records[0]["direction"] == "RX"


def test_jsonl_omits_none_bitrate(tmp_path) -> None:
    frame = make_standard_frame(0x123, b"")
    logger = JsonlLogger(tmp_path / "capture.jsonl")
    logger.open()
    logger.write_frame(frame)
    logger.close()
    record = json.loads((tmp_path / "capture.jsonl").read_text())
    assert "bitrate" not in record


def test_jsonl_errors_and_close_safe(tmp_path) -> None:
    logger = JsonlLogger(tmp_path / "missing" / "capture.jsonl")
    with pytest.raises(CanLoggingError):
        logger.open()
    logger.close()
    with pytest.raises(CanLoggingError):
        logger.write_frame(DETERMINISTIC_FRAMES[0])
