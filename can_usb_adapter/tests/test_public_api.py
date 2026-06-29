def test_current_public_api_exports() -> None:
    import prioracan

    expected = [
        "CanFrame",
        "CanUsbConfig",
        "DriverStatus",
        "DriverState",
        "DriverCapabilities",
        "CaptureSession",
        "CanDriver",
        "GsUsbDriver",
        "MockDriver",
        "FrameLogger",
        "JsonlLogger",
        "AscLogger",
        "ConnectionService",
        "CanAdapterError",
        "CanDriverNotFoundError",
        "CanDeviceNotFoundError",
        "CanPermissionError",
        "CanConfigurationError",
        "CanConnectionError",
        "CanReceiveTimeout",
        "CanLoggingError",
    ]
    assert prioracan.__all__ == expected
    for name in expected:
        assert getattr(prioracan, name)


def test_public_api_does_not_reexport_python_can_or_transmit() -> None:
    import prioracan

    assert not hasattr(prioracan, "can")
    assert not any(name in prioracan.__all__ for name in ["transmit", "send", "write"])
