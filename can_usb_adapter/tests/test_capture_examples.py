import importlib.util
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = ROOT / "examples"


def test_mock_capture_example_runs_without_hardware(tmp_path) -> None:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
    trace = tmp_path / "tiny.asc"
    trace.write_text("0.000000 1 100 Rx d 1 11\n", encoding="utf-8")
    env["CAN_SOURCE"] = "MOCK"
    env["CAN_MOCK_TRACE"] = str(trace)
    output = tmp_path / "mock.jsonl"

    result = subprocess.run(
        [sys.executable, str(EXAMPLES / "capture_mock.py"), "--output", str(output)],
        cwd=ROOT,
        env=env,
        text=True,
        capture_output=True,
        timeout=5,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert "total frames" in result.stdout
    assert "avg rate" in result.stdout
    assert output.exists()
    assert len(output.read_text(encoding="utf-8").splitlines()) == 1


def test_gs_usb_example_imports_and_parses_args_without_hardware(tmp_path) -> None:
    module = _load_example("capture_gs_usb.py")

    args = module.parse_args(
        [
            "--duration",
            "0.1",
            "--output",
            str(tmp_path / "live.jsonl"),
        ]
    )

    assert args.duration == 0.1
    assert args.output == str(tmp_path / "live.jsonl")


def test_examples_do_not_import_product_layers() -> None:
    for path in (EXAMPLES / "capture_mock.py", EXAMPLES / "capture_gs_usb.py"):
        text = path.read_text(encoding="utf-8").lower()
        assert "desktop" not in text
        assert "backend" not in text
        assert "frontend" not in text


def _load_example(name: str):
    spec = importlib.util.spec_from_file_location(name.removesuffix(".py"), EXAMPLES / name)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module
