import json

from prioracan.config import CanUsbConfig
from prioracan.drivers.mock import MockDriver
from prioracan.logging import AscLogger, JsonlLogger
from prioracan.session import CaptureSession


def test_jsonl_capture_writes_parseable_records(tmp_path, deterministic_frames) -> None:
    path = tmp_path / "capture.jsonl"
    session = CaptureSession(
        "s1", 1.0, MockDriver(deterministic_frames), CanUsbConfig(), loggers=(JsonlLogger(path),)
    )

    session.start()

    records = [json.loads(line) for line in path.read_text().splitlines()]
    assert len(records) == len(deterministic_frames)
    assert records[0]["timestamp"] == deterministic_frames[0].timestamp
    assert records[0]["channel"] == deterministic_frames[0].channel
    assert records[0]["direction"] == deterministic_frames[0].direction.value
    assert records[0]["arbitration_id"] == deterministic_frames[0].arbitration_id
    assert records[0]["arbitration_id_hex"] == deterministic_frames[0].arbitration_id_hex
    assert records[0]["dlc"] == deterministic_frames[0].dlc
    assert records[0]["data_hex"] == deterministic_frames[0].data_hex
    assert records[0]["is_extended_id"] == deterministic_frames[0].is_extended_id
    assert records[0]["is_remote_frame"] == deterministic_frames[0].is_remote_frame
    assert records[0]["is_error_frame"] == deterministic_frames[0].is_error_frame


def test_asc_capture_writes_one_frame_line_per_frame(tmp_path, deterministic_frames) -> None:
    path = tmp_path / "capture.asc"
    session = CaptureSession(
        "s1", 1.0, MockDriver(deterministic_frames), CanUsbConfig(), loggers=(AscLogger(path),)
    )

    session.start()

    lines = path.read_text().splitlines()
    frame_lines = lines[2:]
    assert len(frame_lines) == len(deterministic_frames)
    assert all("Rx d" in line for line in frame_lines)


def test_multiple_loggers_receive_every_frame(tmp_path, deterministic_frames) -> None:
    jsonl_path = tmp_path / "capture.jsonl"
    asc_path = tmp_path / "capture.asc"
    session = CaptureSession(
        "s1",
        1.0,
        MockDriver(deterministic_frames),
        CanUsbConfig(),
        loggers=(JsonlLogger(jsonl_path), AscLogger(asc_path)),
    )

    session.start()

    assert len(jsonl_path.read_text().splitlines()) == len(deterministic_frames)
    assert len(asc_path.read_text().splitlines()[2:]) == len(deterministic_frames)


def test_no_logger_capture_still_counts_frames(deterministic_frames) -> None:
    session = CaptureSession("s1", 1.0, MockDriver(deterministic_frames), CanUsbConfig())

    session.start()

    assert session._total == len(deterministic_frames)
