from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from prioracan.errors import CanConfigurationError


DEFAULT_CAN_SOURCE = "MOCK"
DEFAULT_MOCK_TRACE = "examples/fixtures/yaris_can_trace.asc"
DEFAULT_INTERFACE = "gs_usb"
DEFAULT_CHANNEL = "0"
DEFAULT_BITRATE = "500000"


@dataclass(frozen=True, slots=True)
class CaptureSourceConfig:
    """Environment-backed driver selection for capture examples."""

    source: str
    mock_trace: Path
    interface: str
    channel: int | str
    bitrate: int


def load_capture_source_config(
    env: Mapping[str, str] | None = None,
    *,
    env_file: str | Path | None = None,
) -> CaptureSourceConfig:
    values = _merged_values(env, env_file)
    source = values.get("CAN_SOURCE", DEFAULT_CAN_SOURCE).strip().upper()
    if source not in ("MOCK", "REAL"):
        raise CanConfigurationError("CAN_SOURCE must be MOCK or REAL")
    return CaptureSourceConfig(
        source=source,
        mock_trace=Path(values.get("CAN_MOCK_TRACE", DEFAULT_MOCK_TRACE)),
        interface=values.get("CAN_INTERFACE", DEFAULT_INTERFACE),
        channel=_parse_channel(values.get("CAN_CHANNEL", DEFAULT_CHANNEL)),
        bitrate=_parse_bitrate(values.get("CAN_BITRATE", DEFAULT_BITRATE)),
    )


def _merged_values(
    env: Mapping[str, str] | None,
    env_file: str | Path | None,
) -> Mapping[str, str]:
    file_values = _read_env_file(Path(env_file) if env_file is not None else Path(".env"))
    merged = dict(file_values)
    merged.update(os.environ if env is None else env)
    return merged


def _read_env_file(path: Path) -> Mapping[str, str]:
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        parsed = _parse_env_line(line)
        if parsed is not None:
            key, value = parsed
            values[key] = value
    return values


def _parse_env_line(line: str) -> tuple[str, str] | None:
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or "=" not in stripped:
        return None
    key, value = stripped.split("=", 1)
    return key.strip(), value.strip().strip('"').strip("'")


def _parse_channel(value: str) -> int | str:
    stripped = value.strip()
    return int(stripped) if stripped.isdigit() else stripped


def _parse_bitrate(value: str) -> int:
    try:
        bitrate = int(value)
    except ValueError as exc:
        raise CanConfigurationError("CAN_BITRATE must be an integer") from exc
    if bitrate <= 0:
        raise CanConfigurationError("CAN_BITRATE must be greater than zero")
    return bitrate
