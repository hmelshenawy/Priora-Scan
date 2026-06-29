from pathlib import Path


def test_import_prioracan_resolves_to_local_src() -> None:
    import prioracan

    package_path = Path(prioracan.__file__).resolve()
    assert "can_usb_adapter" in package_path.parts
    assert "src" in package_path.parts
