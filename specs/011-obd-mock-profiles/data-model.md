# Data Model: Realistic OBD Mock Profiles

**Feature**: 011-obd-mock-profiles | **Date**: 2026-06-14

## Entities

### MockProfile (data container)

A named collection of raw OBD command-to-response byte mappings representing a specific vehicle's behavior. Profiles store raw ECU response bytes (not decoded values) so that the same parser code exercises both mock and real vehicle paths.

**Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `name` | `str` | Profile identifier (e.g., `"toyota_real_sample"`) |
| `description` | `str` | Human-readable description for logging |
| `pid_responses` | `dict[str, bytes]` | Map of OBD command string → raw bytes response (e.g., `"010C": bytes.fromhex("410C0E10")`) |
| `vin_response` | `bytes` | Raw response for command `"0902"` |
| `dtc_responses` | `dict[str, bytes]` | Map of DTC mode (`"03"`, `"07"`, `"0A"`) → raw response bytes |
| `clear_dtc_response` | `bytes` | Raw response for Mode 04 (clear DTC) |
| `fault_metadata` | `dict[str, dict]` | Map of DTC code → `{status, ecu}` for enrichment |
| `unsupported_commands` | `set[str]` | Commands that return `b""` (unsupported/no data) |
| `readiness_monitors` | `dict \| None` | Optional readiness monitor data for PID 0101. `None` means unsupported |

**Relationships**: None — each profile is self-contained and independent.

**Validation Rules**:
- `name` must be lowercase, underscore-separated (matches env var values)
- `pid_responses` keys must be valid OBD command strings (4-char hex), values must be raw bytes as a real ECU would return them
- `fault_metadata` keys must be valid DTC codes (format: `[A-Z][0-9]{4}`)
- `vin_response` must start with `"4902"` (Mode 09 PID 02 response prefix) or be empty bytes (unsupported)
- `clear_dtc_response` must be `b"44"` (positive response to Mode 04)
- `readiness_monitors` may be `None` (unsupported) or a dict with monitor names as keys; when `None`, PID 0101 returns `b""`

**State Transitions**: None — profiles are immutable data containers.

### ProfileRegistry (service)

Loads, validates, and returns the active mock profile based on environment configuration.

**Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `_profiles` | `dict[str, type]` | Map of profile name → profile class/module (lazy imports) |
| `_active_profile` | `MockProfile \| None` | Cached active profile instance |

**Methods**:

| Method | Returns | Description |
|--------|---------|-------------|
| `get_active_profile()` | `MockProfile` | Returns the active profile, loading it on first call |
| `get_profile(name)` | `MockProfile` | Returns a specific profile by name |
| `list_profiles()` | `list[str]` | Returns available profile names |
| `_load_profile(name)` | `MockProfile` | Internal: imports and instantiates a profile |

**Validation Rules**:
- Invalid profile name falls back to `"default"` with a logged warning
- Profile loading errors fall back to `"default"` with a logged error
- `OBD_MOCK_PROFILE` is only read when `OBD_MOCK=true`

## Entity Relationships

```text
ProfileRegistry
  ├── holds reference to → MockProfile ("default")
  ├── holds reference to → MockProfile ("toyota_real_sample")
  ├── holds reference to → MockProfile ("toyota_real_faults")
  ├── holds reference to → MockProfile ("no_faults")
  ├── holds reference to → MockProfile ("with_faults")
  └── holds reference to → MockProfile ("unsupported_vin")

MockObdAdapter
  └── delegates to → ProfileRegistry.get_active_profile()
                      └── returns → MockProfile
```

## Data Flow

```text
Environment (OBD_MOCK=true, OBD_MOCK_PROFILE=toyota_real_sample)
  │
  ▼
config.py (reads OBD_MOCK_PROFILE, falls back to "default")
  │
  ▼
ProfileRegistry (validates name, loads module, returns MockProfile)
  │
  ▼
MockObdAdapter (receives profile via registry)
  │
  ├── send("010C") → profile.pid_responses["010C"] → b"410C0E10"
  ├── send("0902") → profile.vin_response → b"4902..."
  ├── send("03")   → profile.dtc_responses["03"] → b"43020301C100"
  ├── send("04")   → adapter sets _dtcs_cleared=True, returns b"44"
  └── send("012F") → profile.unsupported_commands → b"" (if in set)
```