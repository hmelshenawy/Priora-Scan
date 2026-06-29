import pytest

from prioracan import errors


PUBLIC_ERRORS = [
    "CanAdapterError",
    "CanDriverNotFoundError",
    "CanDeviceNotFoundError",
    "CanPermissionError",
    "CanConfigurationError",
    "CanConnectionError",
    "CanReceiveTimeout",
    "CanLoggingError",
]


def test_public_error_names_are_exact() -> None:
    public = [name for name in PUBLIC_ERRORS if hasattr(errors, name)]
    assert public == PUBLIC_ERRORS


@pytest.mark.parametrize("name", PUBLIC_ERRORS[1:])
def test_errors_subclass_base(name: str) -> None:
    assert issubclass(getattr(errors, name), errors.CanAdapterError)


@pytest.mark.parametrize("name", PUBLIC_ERRORS[1:])
def test_errors_catchable_as_base(name: str) -> None:
    with pytest.raises(errors.CanAdapterError):
        raise getattr(errors, name)("boom")
