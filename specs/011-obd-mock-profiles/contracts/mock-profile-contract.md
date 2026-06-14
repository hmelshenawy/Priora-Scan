# Contract: Mock Profile Interface

**Feature**: 011-obd-mock-profiles | **Date**: 2026-06-14

## Overview

This contract defines the interface that every mock profile module must implement. Profiles are internal to the Desktop Agent — no external API is exposed.

## Profile Module Contract

Each profile module under `desktop-agent/src/obd/mock_profiles/` MUST export the following constants:

### Required Attributes

```python
# Profile identity
PROFILE_NAME: str          # Lowercase, underscore-separated identifier (e.g., "toyota_real_sample")
PROFILE_DESCRIPTION: str   # Human-readable description for logging

# OBD PID responses (command string → bytes)
PID_RESPONSES: dict[str, bytes]  # e.g., {"010C": b"410C0E10", "0105": b"41057E", ...}

# VIN response (Mode 09 PID 02)
VIN_RESPONSE: bytes        # e.g., b"490257314B4146344742315246313234333231"

# DTC responses (mode string → bytes)
DTC_RESPONSES: dict[str, bytes]  # e.g., {"03": b"43020301C100", "07": b"47010171", "0A": b"4A00"}

# Mode 04 (Clear DTC) response
CLEAR_DTC_RESPONSE: bytes  # Always b"44" for success

# Fault metadata (DTC code → {status, ecu})
FAULT_METADATA: dict[str, dict]  # e.g., {"P0301": {"status": "ACTIVE", "ecu": "ECM"}}

# Commands that return empty bytes (unsupported PIDs)
UNSUPPORTED_COMMANDS: set[str]    # e.g., {"012F"} for fuel level unsupported

# Optional readiness monitors (omit or set to None for unsupported)
READINESS_MONITORS: dict | None   # e.g., {"misfire": True, "fuelSystem": True, ...} or None
```

**Important**: All response values MUST be raw OBD byte sequences exactly as a real ECU would return them. Decoded values (e.g., RPM=900) are never stored in profiles — the existing parser/decoder code is the single source of truth for converting raw bytes to user-facing values.

### Response Lookup Contract

When `MockObdAdapter.send(command)` is called, the lookup order is:

1. **Mode 04** (`"04"`): Always handled by the adapter (sets `_dtcs_cleared` flag). Returns `CLEAR_DTC_RESPONSE`.
2. **DTC modes** (`"03"`, `"07"`, `"0A"`): After DTC clear, return zero-code responses. Before clear, return `DTC_RESPONSES[mode]`.
3. **VIN** (`"0902"`): Return `VIN_RESPONSE`.
4. **Unsupported commands**: If command is in `UNSUPPORTED_COMMANDS`, return `b""`.
5. **PID responses**: Return `PID_RESPONSES[command]`.
6. **Readiness monitors** (`"0101"`): If `READINESS_MONITORS` is not None, return `PID_RESPONSES["0101"]` (raw readiness bytes). If None, return `b""` (unsupported).
7. **Unknown command**: Return `b""`.

### Profile Registry Contract

```python
class ProfileRegistry:
    def get_active_profile() -> MockProfile:
        """Return the profile specified by OBD_MOCK_PROFILE env var.
        Falls back to 'default' if profile name is invalid or missing.
        Logs a warning on fallback."""

    def get_profile(name: str) -> MockProfile:
        """Return a specific profile by name.
        Raises ValueError if name is not in PROFILES dict."""

    def list_profiles() -> list[str]:
        """Return sorted list of available profile names."""
```

### MockObdAdapter Modified Contract

```python
class MockObdAdapter:
    """Delegates OBD response generation to the active mock profile."""

    protocol: str          # "MOCK" (unchanged)
    adapter_type: str      # "MOCK" (unchanged)

    def __init__(self, profile_name: str | None = None):
        """Initialize with a specific profile, or auto-detect from config."""

    @property
    def fault_metadata(self) -> dict:
        """Delegate to the active profile's FAULT_METADATA."""

    def connect(self) -> bool:       # Always True (unchanged)
    def is_connected(self) -> bool:  # Always True (unchanged)
    def send(self, command: str) -> bytes:  # Delegate to profile
    def close(self):                 # No-op (unchanged)
```

### Config Contract

```python
# In config.py (addition)
OBD_MOCK_PROFILE: str  # Resolved from OBD_MOCK_PROFILE env var, default "default"
```

### Backward Compatibility Contract

| Aspect | Contract |
|--------|----------|
| `OBD_MOCK=true` without `OBD_MOCK_PROFILE` | Uses `default` profile (reproduces current behavior exactly) |
| `OBD_MOCK_PROFILE=default` | Explicit default, same as omitting the variable |
| `MockObdAdapter()` constructor (no args) | Auto-detects profile from `config.OBD_MOCK_PROFILE` |
| Existing test `MockObdAdapter()` | Works unchanged — creates `default` profile |
| `read_vin(adapter)` with mock | Still uses `_read_vin_mock()` path |
| `read_fault_codes(adapter)` with mock | Still reads `fault_metadata` attribute |
| `vehicle_data.read_*` functions | Work unchanged — `send()` still returns `bytes` |
| `clear_dtc(adapter)` | Works unchanged — adapter still tracks `_dtcs_cleared` |