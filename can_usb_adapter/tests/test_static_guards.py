import ast
import dataclasses
import inspect
from pathlib import Path


SRC_ROOT = Path(__file__).resolve().parents[1] / "src" / "prioracan"
PYTHON_CAN_SEAM = Path("drivers/adapters/python_can_adapter.py")


def python_files() -> list[Path]:
    return sorted(SRC_ROOT.rglob("*.py"))


def test_python_can_import_only_at_adapter_seam() -> None:
    matches = []
    for path in python_files():
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import) and any(alias.name == "can" for alias in node.names):
                matches.append(path.relative_to(SRC_ROOT))
            if isinstance(node, ast.ImportFrom) and node.module == "can":
                matches.append(path.relative_to(SRC_ROOT))
    assert matches == [PYTHON_CAN_SEAM]


def test_no_transmit_style_public_methods() -> None:
    forbidden = {"transmit", "send", "write", "send_periodic"}
    found = []
    for path in python_files():
        tree = ast.parse(path.read_text(encoding="utf-8"))
        found.extend(node.name for node in ast.walk(tree) if isinstance(node, ast.FunctionDef))
    assert not forbidden.intersection(found)


def test_no_out_of_scope_protocol_identifiers() -> None:
    forbidden = {"isotp", "uds", "dbc", "stream"}
    for path in python_files():
        lowered = path.read_text(encoding="utf-8").lower()
        assert not forbidden.intersection(lowered.replace("-", "_").split())


def test_no_module_level_mutable_globals() -> None:
    offenders = []
    for path in python_files():
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in tree.body:
            if isinstance(node, ast.Assign) and _is_mutable_assignment(node.value):
                offenders.append(path.relative_to(SRC_ROOT))
    assert offenders == []


def test_no_required_example_fixture_imports_in_tests() -> None:
    tests_root = Path(__file__).resolve().parents[0]
    for path in tests_root.rglob("test_*.py"):
        if path == Path(__file__).resolve():
            continue
        text = path.read_text(encoding="utf-8")
        assert "examples.fixtures" not in text
        assert "sample_yaris.jsonl" not in text


def test_capture_statistics_not_top_level_exported() -> None:
    import prioracan

    assert "CaptureStatistics" not in prioracan.__all__


def test_capture_session_has_no_forbidden_capture_methods() -> None:
    from prioracan.session import CaptureSession

    for name in ("stream", "run", "iter_frames", "receive"):
        assert not hasattr(CaptureSession, name)


def test_no_new_error_subclass_was_added() -> None:
    from prioracan import errors

    classes = {
        name
        for name, value in inspect.getmembers(errors, inspect.isclass)
        if value.__module__ == errors.__name__
    }
    assert classes == {
        "CanAdapterError",
        "CanDriverNotFoundError",
        "CanDeviceNotFoundError",
        "CanPermissionError",
        "CanConfigurationError",
        "CanConnectionError",
        "CanReceiveTimeout",
        "CanLoggingError",
    }


def test_connection_service_public_method_set_unchanged() -> None:
    from prioracan.services.connection import ConnectionService

    methods = {
        name
        for name, value in ConnectionService.__dict__.items()
        if callable(value) and not name.startswith("_")
    }
    assert methods == {"connect", "receive_once", "get_status", "disconnect"}


def test_capture_statistics_has_no_bus_statistics_fields() -> None:
    from prioracan.statistics import CaptureStatistics

    fields = {field.name for field in dataclasses.fields(CaptureStatistics)}
    assert fields == {
        "start_time",
        "end_time",
        "duration",
        "total_frames",
        "rx_frames",
        "tx_frames",
        "dropped_frames",
        "average_frame_rate",
    }
    assert fields.isdisjoint({"bus_utilization", "histogram", "bitrate", "protocol", "frequency"})


def test_no_lifecycle_module_created() -> None:
    assert not (SRC_ROOT / "lifecycle.py").exists()


def _is_mutable_assignment(value: ast.expr) -> bool:
    if isinstance(value, (ast.List, ast.Dict, ast.Set)):
        return True
    return isinstance(value, ast.Call) and getattr(value.func, "id", "") == "set"
