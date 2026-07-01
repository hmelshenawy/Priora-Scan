import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_iso_tp_mock_example_runs() -> None:
    result = subprocess.run(
        [sys.executable, "examples/iso_tp_mock.py"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0
    assert "single-frame payload: 62f190" in result.stdout
    assert "multi-frame payload: 00010203040506070809" in result.stdout


def test_iso_tp_gs_usb_example_dry_run() -> None:
    result = subprocess.run(
        [sys.executable, "examples/iso_tp_gs_usb.py", "--dry-run"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0
    assert "gs_usb dry run" in result.stdout
