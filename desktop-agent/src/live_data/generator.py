"""Mock raw-byte generator for the MVP live data PIDs.

The backend's :class:`PidDecoderService` (Feature 006 Phase B.1) is
the source of truth for decoding — this module only has to produce
hex byte strings that decode cleanly through that pipeline.

For each short-name the generator returns a space-separated hex
byte string that matches the OBD-II Service 01 response shape:

* Single-byte PIDs (mode 01) are answered with the data byte(s)
  directly — the backend's decoder strips a leading ``0x41`` (the
  Mode 01 response header) automatically, so we never need to emit
  it.
* Two-byte PIDs (RPM and Battery Voltage) are answered as ``A B``
  hex pairs, e.g. ``0C 1A`` (≈ 850 RPM) or ``56 38`` (≈ 13.9 V).

The supported short names are exactly the six shipped in the MVP
PID set (see ``LiveDataSessionService.MVP_PIDS`` in the backend).
Any other short name is ignored.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Iterable


@dataclass
class PidDescriptor:
    short_name: str
    namespace: str
    mode: str
    pid: str

    @classmethod
    def from_command_payload(cls, payload_pid: dict) -> "PidDescriptor":
        return cls(
            short_name=payload_pid["shortName"],
            namespace=payload_pid["namespace"],
            mode=payload_pid["mode"],
            pid=payload_pid["pid"],
        )


# --- byte builders ------------------------------------------------------


def _rpm_bytes() -> str:
    """Engine RPM drifts around 850 ± a small random delta.

    RPM = (A * 256 + B) / 4, so for 850 RPM we need A*256+B = 3400.
    We pick A = 13 (0x0D) and B = 0x38 (= 56 → 13*256+56 = 3384 → 846)
    with a small jitter on B.
    """

    base_rpm_x4 = 3400  # 850 RPM
    jitter = random.randint(-40, 40)
    total = max(0, min(0xFFFF, base_rpm_x4 + jitter))
    a = (total >> 8) & 0xFF
    b = total & 0xFF
    return f"{a:02X} {b:02X}"


def _speed_bytes() -> str:
    """Vehicle speed stays at 0 km/h in the mock (parked vehicle)."""

    return "00"


def _coolant_temp_bytes() -> str:
    """Coolant temperature held at a stable 92 °C (A - 40 = 92 → A = 132)."""

    return "84"  # 0x84 = 132


def _battery_voltage_bytes() -> str:
    """Battery / control module voltage held at 13.9 V.

    Voltage = (A * 256 + B) / 1000, so 13.9 V → 13900 = 0x364C,
    A = 0x36, B = 0x4C.
    """

    return "36 4C"


def _throttle_position_bytes() -> str:
    """Throttle position held around 0% (closed throttle)."""

    return "00"


def _engine_load_bytes() -> str:
    """Calculated engine load held at a stable ~20% (A*100/255)."""

    # 20% → A = 51 (0x33) → 51*100/255 ≈ 20.0
    return "33"


# Map short-name → (mode, pid, byte-builder)
_BYTE_BUILDERS = {
    "rpm": ("01", "0C", _rpm_bytes),
    "speed": ("01", "0D", _speed_bytes),
    "coolantTemp": ("01", "05", _coolant_temp_bytes),
    "batteryVoltage": ("01", "42", _battery_voltage_bytes),
    "throttlePosition": ("01", "11", _throttle_position_bytes),
    "engineLoad": ("01", "04", _engine_load_bytes),
}


class MockLiveDataGenerator:
    """Generate raw hex byte strings for the MVP live data PID set.

    The generator is stateful only in the sense that :meth:`tick`
    draws new random values for the PIDs that change between polls
    (currently only RPM). All other PIDs return the same bytes on
    every tick.
    """

    def __init__(self, pids: Iterable[dict] | None = None, rng: random.Random | None = None):
        self._descriptors: list[PidDescriptor] = []
        if pids:
            for p in pids:
                self._descriptors.append(PidDescriptor.from_command_payload(p))
        self._rng = rng or random.Random()

    def descriptors(self) -> list[PidDescriptor]:
        return list(self._descriptors)

    def tick(self) -> list[dict]:
        """Return the readings for one poll cycle.

        Each reading is a dict shaped exactly like the agent's
        ``POST /api/v1/obd/agents/:id/live-data/:sessionId/poll-result``
        body — keyed by short-name.
        """

        readings: list[dict] = []
        for d in self._descriptors:
            builder = _BYTE_BUILDERS.get(d.short_name)
            if builder is None:
                # Unknown short name — skip. The backend will surface
                # PID_NOT_DEFINED if the operator chose a different
                # PID set in a future phase.
                continue
            _, _, fn = builder
            readings.append(
                {
                    "shortName": d.short_name,
                    "namespace": d.namespace,
                    "mode": d.mode,
                    "pid": d.pid,
                    "rawValue": fn(),
                }
            )
        return readings
