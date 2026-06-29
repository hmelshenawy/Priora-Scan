from pathlib import Path


def test_readme_contains_required_sections() -> None:
    text = Path("README.md").read_text(encoding="utf-8")
    lowered = text.lower()
    assert "install" in lowered
    assert "read-only" in lowered
    assert "libusb" in lowered
    assert "platform" in lowered


def test_readme_snippet_symbols_exist() -> None:
    from prioracan.config import CanUsbConfig
    from prioracan.frame import CanFrame, Direction

    assert CanFrame
    assert Direction.RX
    assert CanUsbConfig
