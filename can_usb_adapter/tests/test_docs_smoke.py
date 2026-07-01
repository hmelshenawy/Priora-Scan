import re
from pathlib import Path

import prioracan
from prioracan import CanFrame, ConnectionService, JsonlLogger, MockDriver
from prioracan.frame import Direction


def test_documented_mock_example_runs(tmp_path) -> None:
    frames = [
        CanFrame(1.0, 0, Direction.RX, 0x100, False, False, False, 1, b"\x11"),
    ]
    driver = MockDriver(frames)
    logger = JsonlLogger(tmp_path / "capture.jsonl")
    service = ConnectionService(driver, [logger])
    service.connect()
    frame = service.receive_once()
    service.disconnect()
    assert frame.arbitration_id_hex == "0x100"


def test_documented_top_level_symbols_are_public() -> None:
    docs = _read_doc("README.md") + _read_doc("examples/README.md") + _read_feature_doc("quickstart.md")
    imports = re.findall(r"from prioracan import ([^\n]+)", docs)
    names = {name.strip() for group in imports for name in group.split(",")}
    assert names <= set(prioracan.__all__)


def test_quickstart_mock_path_executes(tmp_path) -> None:
    from prioracan import CaptureSession, CanFrame, CanUsbConfig, JsonlLogger, MockDriver

    frames = [CanFrame(0.0, 0, Direction.RX, 0x100, False, False, False, 1, b"\x11")]
    session = CaptureSession(
        "quickstart", 0.0, MockDriver(frames), CanUsbConfig(), loggers=(JsonlLogger(tmp_path / "q.jsonl"),)
    )
    stats = session.start()
    assert stats.total_frames == 1
    assert stats.rx_frames == 1


def test_all_public_symbols_have_docstrings() -> None:
    for name in prioracan.__all__:
        assert getattr(prioracan, name).__doc__, name


def _read_doc(relative_path: str) -> str:
    root = Path(__file__).resolve().parents[1]
    return (root / relative_path).read_text(encoding="utf-8")


def _read_feature_doc(relative_path: str) -> str:
    root = Path(__file__).resolve().parents[2]
    return (root / "specs" / "021-can-sniffer-mvp" / relative_path).read_text(encoding="utf-8")
