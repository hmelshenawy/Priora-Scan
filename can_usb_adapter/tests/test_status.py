from dataclasses import FrozenInstanceError

import pytest

from prioracan.errors import CanAdapterError
from prioracan.status import DriverState, DriverStatus


def test_driver_states_are_exact() -> None:
    assert [state.value for state in DriverState] == [
        "disconnected",
        "connected",
        "listening",
        "error",
    ]


def test_status_accepts_optional_metadata() -> None:
    error = CanAdapterError("lost")
    status = DriverStatus(
        state=DriverState.ERROR,
        adapter_name="adapter",
        serial_number="serial",
        firmware="fw",
        bitrate=500000,
        channel="can0",
        last_error=error,
        received_frame_count=3,
    )
    assert status.last_error is error
    assert status.received_frame_count == 3


def test_status_defaults_and_frozen() -> None:
    status = DriverStatus(DriverState.DISCONNECTED)
    assert status.adapter_name is None
    with pytest.raises(FrozenInstanceError):
        status.received_frame_count = 1
