import ast
import inspect
from pathlib import Path

import prioracan
from prioracan import errors as core_errors


SRC_ROOT = Path(__file__).resolve().parents[1] / "src" / "prioracan"


def test_iso_tp_subpackage_importable() -> None:
    import prioracan.iso_tp as iso_tp

    assert "IsoTpConfig" in iso_tp.__all__


def test_transport_errors_are_separate_from_core_errors() -> None:
    from prioracan.iso_tp import errors as transport_errors

    assert hasattr(transport_errors, "IsoTpTimeoutError")
    assert not hasattr(core_errors, "IsoTpTimeoutError")


def test_top_level_public_api_unchanged() -> None:
    assert len(prioracan.__all__) == 21
    assert "IsoTpConfig" not in prioracan.__all__


def test_core_error_module_unchanged() -> None:
    classes = {
        name
        for name, value in inspect.getmembers(core_errors, inspect.isclass)
        if value.__module__ == core_errors.__name__
    }
    assert len(classes) == 8


def test_no_forbidden_tokens_in_new_subpackage() -> None:
    forbidden = {"isotp", "uds", "dbc", "stream"}
    for path in (SRC_ROOT / "iso_tp").rglob("*.py"):
        lowered = path.read_text(encoding="utf-8").lower()
        assert not forbidden.intersection(lowered.replace("-", "_").split())


def test_python_can_import_only_at_adapter_seam() -> None:
    matches = []
    for path in SRC_ROOT.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import) and any(alias.name == "can" for alias in node.names):
                matches.append(path.relative_to(SRC_ROOT))
            if isinstance(node, ast.ImportFrom) and node.module == "can":
                matches.append(path.relative_to(SRC_ROOT))
    assert matches == [Path("drivers/adapters/python_can_adapter.py")]


def test_locked_contracts_remain_unchanged() -> None:
    from prioracan.capabilities import GS_USB_CAPABILITIES, MOCK_CAPABILITIES
    from prioracan.drivers.base import CanDriver
    from prioracan.services.connection import ConnectionService

    protocol_methods = _public_methods(CanDriver)
    service_methods = _public_methods(ConnectionService)
    assert protocol_methods == {
        "connect",
        "disconnect",
        "is_connected",
        "receive",
        "iter_frames",
        "get_status",
        "get_capabilities",
    }
    assert service_methods == {"connect", "receive_once", "get_status", "disconnect"}
    assert GS_USB_CAPABILITIES.transmit is False
    assert MOCK_CAPABILITIES.transmit is False


def test_no_forbidden_send_style_function_names() -> None:
    forbidden = {"transmit", "send", "write", "send_periodic"}
    found = []
    for path in SRC_ROOT.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        found.extend(node.name for node in ast.walk(tree) if isinstance(node, ast.FunctionDef))
    assert not forbidden.intersection(found)


def test_no_module_level_mutable_globals_in_source() -> None:
    offenders = []
    for path in SRC_ROOT.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in tree.body:
            if isinstance(node, ast.Assign) and _is_mutable_assignment(node.value):
                offenders.append(path.relative_to(SRC_ROOT))
    assert offenders == []


def test_no_product_integration_terms_in_iso_tp_source() -> None:
    forbidden = {"vin", "dtc", "ecu", "dbc", "replay", "filtering"}
    for path in (SRC_ROOT / "iso_tp").rglob("*.py"):
        lowered = path.read_text(encoding="utf-8").lower()
        assert not forbidden.intersection(lowered.replace("-", "_").split())


def test_two_transport_instances_do_not_interfere() -> None:
    from prioracan.config import CanUsbConfig
    from prioracan.drivers.mock import MockDriver
    from prioracan.iso_tp import IsoTpConfig, IsoTpTransport
    from prioracan.session import CaptureSession, CaptureState

    first_driver = MockDriver(())
    second_driver = MockDriver(())
    first_driver.connect()
    second_driver.connect()
    first = CaptureSession("a", 0.0, first_driver, CanUsbConfig())
    second = CaptureSession("b", 0.0, second_driver, CanUsbConfig())
    first._state = CaptureState.RUNNING
    second._state = CaptureState.RUNNING
    IsoTpTransport(first, config=IsoTpConfig(0x456, 0x123)).start()
    IsoTpTransport(second, config=IsoTpConfig(0x556, 0x223)).start()
    first_driver.disconnect()
    second_driver.disconnect()


def _public_methods(value: object) -> set[str]:
    return {
        name
        for name, member in value.__dict__.items()
        if callable(member) and not name.startswith("_")
    }


def _is_mutable_assignment(value: ast.expr) -> bool:
    if isinstance(value, (ast.List, ast.Dict, ast.Set)):
        return True
    return isinstance(value, ast.Call) and getattr(value.func, "id", "") == "set"
