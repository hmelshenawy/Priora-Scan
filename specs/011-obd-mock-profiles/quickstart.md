# Quickstart: Realistic OBD Mock Profiles

**Feature**: 011-obd-mock-profiles | **Date**: 2026-06-14

## For Developers

### Selecting a Mock Profile

Set environment variables before starting the Desktop Agent:

```bash
# Use the Toyota real sample profile (captured vehicle data)
OBD_MOCK=true
OBD_MOCK_PROFILE=toyota_real_sample

# Use the clean vehicle profile (no faults, valid VIN)
OBD_MOCK=true
OBD_MOCK_PROFILE=no_faults

# Use the vehicle with fault codes
OBD_MOCK=true
OBD_MOCK_PROFILE=with_faults

# Use the vehicle with unsupported VIN
OBD_MOCK=true
OBD_MOCK_PROFILE=unsupported_vin

# Use the Toyota real faults profile (real health data + fault codes)
OBD_MOCK=true
OBD_MOCK_PROFILE=toyota_real_faults

# Use the default profile (backward compatible with existing behavior)
OBD_MOCK=true
OBD_MOCK_PROFILE=default
# Or simply:
OBD_MOCK=true
```

### Available Profiles

| Profile | Description | VIN | Fault Codes | Notable PIDs |
|---------|-------------|-----|-------------|--------------|
| `default` | Reproduces current MockObdAdapter behavior | W1KAF4GB1RF124321 | P0301, P0171, U0100 | All PIDs supported |
| `toyota_real_sample` | Captured Toyota vehicle data (no faults) | Unsupported (all-FF) | None | RPM=900, Coolant=86°C, Voltage=13.4V |
| `toyota_real_faults` | Captured Toyota data + fault codes | Unsupported (all-FF) | P0301, P0171, U0100 | RPM=900, Coolant=86°C, Voltage=13.4V |
| `no_faults` | Clean vehicle, valid VIN | JTDBR32E720123456 | None | Standard PIDs |
| `with_faults` | Vehicle with 3 fault codes | JTDBR32E720123456 | P0301, P0171, U0100 | Standard PIDs |
| `unsupported_vin` | Vehicle with all-FF VIN payload | Unsupported (all-FF) | None | Standard PIDs |

### Adding a New Profile

1. Create a new file `desktop-agent/src/obd/mock_profiles/your_profile.py`
2. Define the required constants: `PROFILE_NAME`, `PROFILE_DESCRIPTION`, `PID_RESPONSES`, `VIN_RESPONSE`, `DTC_RESPONSES`, `CLEAR_DTC_RESPONSE`, `FAULT_METADATA`, `UNSUPPORTED_COMMANDS`. Optionally define `READINESS_MONITORS`.
3. Add one line to `PROFILES` dict in `desktop-agent/src/obd/mock_profiles/profile_registry.py`
4. Set `OBD_MOCK_PROFILE=your_profile` and restart the agent

### Testing with a Specific Profile

```bash
# Run tests with the Toyota profile
OBD_MOCK=true OBD_MOCK_PROFILE=toyota_real_sample pytest

# Run tests with default profile (backward compatible)
OBD_MOCK=true pytest
```

### Profile Response Format

Profiles store raw OBD byte responses exactly as a real ECU would return them. The existing parsers and decoders are responsible for converting raw bytes to user-facing values — no separate mock-only decode logic exists.

```python
# Example: Toyota real sample RPM (raw ECU response)
PID_RESPONSES = {
    "010C": bytes.fromhex("410C0E10"),  # Raw bytes → parser decodes to 900 RPM
    "0105": bytes.fromhex("41057E"),     # Raw bytes → parser decodes to 86°C
    "0142": bytes.fromhex("41423469"),   # Raw bytes → parser decodes to 13.417V
}

# Example: Unsupported PID (returns empty bytes)
UNSUPPORTED_COMMANDS = {"012F"}  # Fuel level not supported → send() returns b""

# Example: Unsupported VIN (all-FF payload)
VIN_RESPONSE = bytes.fromhex("490201FFFFFF FFFFFFFFFFFFFFFF FFFFFFFFFFFFFF".replace(" ", ""))
# Parser detects all-0xFF data → "Not supported by vehicle"

# Example: Optional readiness monitors (omit for unsupported)
READINESS_MONITORS = None  # PID 0101 returns b"" (unsupported)
```

### Invalid Profile Fallback

If `OBD_MOCK_PROFILE` is set to a nonexistent name, the system falls back to the `default` profile and logs a warning:

```
WARNING: Mock profile 'nonexistent' not found, falling back to 'default'
```