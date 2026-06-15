# Quickstart: Extended PID Validation

**Feature**: 018-extended-live-data-pids | **Date**: 2026-06-15

## Prerequisites

- Desktop agent codebase at `desktop-agent/`
- Python 3.11+ with pytest
- Mock adapter profiles available for testing

## Running Validation

### With Mock Adapter (Development/Testing)

```python
from src.obd.mock_adapter import MockObdAdapter
from src.obd.commands.pid_validation import read_extended_pid_validation

# Run validation with dedicated validation profile (all PIDs supported)
adapter = MockObdAdapter(profile_name="extended_pid_validation")
result = read_extended_pid_validation(adapter)

# Print the detailed report
print(result["report"])

# Print the support matrix
print(result["support_matrix"])

# Access structured results
for pid_hex, pid_result in result["pids"].items():
    print(f"PID {pid_hex}: supported={pid_result['supported']}, "
          f"available={pid_result['available']}, value={pid_result['value']}")
```

### With Real ELM327 Adapter

```python
from src.obd.usb_elm327 import Elm327Adapter
from src.obd.commands.pid_validation import read_extended_pid_validation

adapter = Elm327Adapter()
if adapter.connect():
    try:
        result = read_extended_pid_validation(adapter)
        print(result["report"])
        print(result["support_matrix"])
    except RuntimeError as e:
        if "Supported PID discovery failed" in str(e):
            print("Discovery failed — cannot validate PIDs")
        else:
            raise
    adapter.close()
```

### Discovery Failure Handling

Discovery failure raises `RuntimeError` (consistent with the agent's convention for infrastructure failures):

```python
from src.obd.commands.pid_validation import read_extended_pid_validation

try:
    result = read_extended_pid_validation(adapter)
except RuntimeError as e:
    if "Supported PID discovery failed" in str(e):
        print("Extended PID validation aborted. Supported PID discovery failed.")
    else:
        raise
```

## Running Tests

```bash
cd desktop-agent

# Run all extended PID tests
python -m pytest tests/test_extended_pids.py tests/test_pid_validation.py -v

# Run full regression suite (must pass)
python -m pytest tests/ -v

# Run specific decoder tests
python -m pytest tests/test_extended_pids.py::TestFuelTrimDecoding -v
python -m pytest tests/test_extended_pids.py::TestMafDecoding -v
python -m pytest tests/test_extended_pids.py::TestThrottleDecoding -v

# Run validation integration tests
python -m pytest tests/test_pid_validation.py -v
```

## Expected Output

### Support Matrix (Extended PID Validation Profile)

```
PID | Name              | Supported | Available | Value
06  | STFT Bank 1       | YES       | YES       | 0.0 %
07  | LTFT Bank 1       | YES       | YES       | 0.0 %
08  | STFT Bank 2       | YES       | YES       | -0.78 %
09  | LTFT Bank 2       | YES       | YES       | 10.16 %
0B  | MAP               | YES       | YES       | 42 kPa
10  | MAF               | YES       | YES       | 1.00 g/s
11  | Throttle Position | YES       | YES       | 1.96 %
```

### Detailed Report

```
===== EXTENDED PID VALIDATION =====

PID 06 STFT Bank 1
Supported: YES
Available: YES
Raw Response: 410680
Value: 0.0 %

PID 07 LTFT Bank 1
Supported: YES
Available: YES
Raw Response: 410780
Value: 0.0 %

PID 08 STFT Bank 2
Supported: YES
Available: YES
Raw Response: 41067F
Value: -0.78 %

...

===== END VALIDATION =====
```

## Key Files

| File | Purpose | Status |
|---|---|---|
| `src/obd/commands/extended_pids.py` | PID reader functions + CONFIGURED_EXTENDED_PIDS | NEW |
| `src/obd/commands/pid_validation.py` | Validation orchestrator + report generator | NEW |
| `src/obd/commands/health_pids.py` | Existing helpers (_send_pid, _parse_bytes, result factories) | UNCHANGED |
| `src/obd/commands/supported_pids.py` | Existing PID discovery (read_supported_pids) | UNCHANGED |
| `src/obd/commands/vehicle_data.py` | Re-export facade | UNCHANGED — no re-exports added |
| `src/obd/mock_profiles/extended_pid_validation_profile.py` | Dedicated validation profile with all PIDs | NEW |
| `src/obd/mock_profiles/toyota_real_sample.py` | Frozen reference profile | UNCHANGED |
| `src/obd/mock_profiles/profile_registry.py` | Profile registry — add new profile entry | MODIFIED (additive) |
| `tests/test_extended_pids.py` | Decoder unit tests | NEW |
| `tests/test_pid_validation.py` | Validation integration tests | NEW |