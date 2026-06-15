# Quickstart: Extended Live Data PIDs

**Feature**: 018-extended-live-data-pids | **Date**: 2026-06-15

## Prerequisites

- Desktop agent codebase at `desktop-agent/`
- Backend codebase at `backend/`
- Frontend codebase at `frontend/`
- Python 3.11+ with pytest
- Node.js 18+ with npm

## Feature 018A: Validation Only

### Running Validation

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

### Running 018A Tests

```bash
cd desktop-agent

# Run all extended PID tests
python -m pytest tests/test_extended_pids.py tests/test_pid_validation.py -v

# Run full regression suite (must pass)
python -m pytest tests/ -v
```

## Feature 018B: Full Pipeline

### Agent Integration

Extended PIDs are now integrated into `read_vehicle_health()`. No separate call is needed:

```python
from src.obd.mock_adapter import MockObdAdapter
from src.obd.commands.vehicle_health import read_vehicle_health

# Standard vehicle health read now includes extended PIDs
adapter = MockObdAdapter(profile_name="extended_pid_validation")
health = read_vehicle_health(adapter)

# Extended PID fields are in the result dict:
print(health["stftBank1"])   # {"pid": "06", "value": 0.0, "unit": "%", "supported": true, ...}
print(health["ltftBank1"])   # {"pid": "07", "value": -3.12, "unit": "%", "supported": true, ...}
print(health["map"])         # {"pid": "0B", "value": 42, "unit": "kPa", "supported": true, ...}
print(health["maf"])         # {"pid": "10", "value": 1.0, "unit": "g/s", "supported": true, ...}
print(health["throttlePosition"])  # {"pid": "11", "value": 1.96, "unit": "%", "supported": true, ...}

# Unsupported PIDs show "Not Supported" state:
print(health["stftBank2"])  # {"pid": "08", "value": null, "unit": "%", "supported": false, ...}

# Discovery failure is represented inside each PID result:
# Each PID result has reason: "PID_DISCOVERY_FAILED" when discovery fails
# No top-level metadata fields (extendedPidsDiscoveryFailed, supportedExtendedPids, unsupportedExtendedPids)
```

### Discovery Failure Handling

```python
# When PID discovery fails, extended PIDs are marked unavailable
# but standard health PIDs still use fallback behavior
health = read_vehicle_health(adapter)

# Check for discovery failure by examining PID results:
for field in ["stftBank1", "ltftBank1", "stftBank2", "ltftBank2", "map", "maf", "throttlePosition"]:
    pid_data = health.get(field, {})
    if pid_data.get("reason") == "PID_DISCOVERY_FAILED":
        print(f"  {field}: discovery failed — Not Available")
```

### Fuel Trim Hint Logic (Frontend)

```typescript
function getFuelTrimHint(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value < -10) return "Rich Tendency";
  if (value > 10) return "Lean Tendency";
  return "Normal";
}
```

### Frontend: Fuel & Air Data Section

```tsx
// In VehicleHealthPanel.tsx, the extended PID data renders as:
// - Supported + Available: "STFT Bank 1: 2.3 %" with fuel trim hint badge
// - Supported + Unavailable: "STFT Bank 1: No Data"
// - Unsupported: "STFT Bank 1: Not Supported"
// - Missing field (pre-018B data): "STFT Bank 1: Not Supported"
// - Discovery failed: "STFT Bank 1: Not Available"
```

### Running 018B Tests

```bash
# Agent integration tests
cd desktop-agent
python -m pytest tests/test_vehicle_health_integration.py -v -k "extended"

# Full regression suite (must pass — includes 018A tests)
python -m pytest tests/ -v

# Backend DTO tests
cd ../backend
npm run test -- --testPathPattern="vehicle-data-response"

# Frontend component tests
cd ../frontend
npm run test -- --testPathPattern="VehicleHealthPanel"
```

## Key Files

| File | Purpose | Feature |
|---|---|---|
| `desktop-agent/src/obd/commands/extended_pids.py` | PID reader functions + CONFIGURED_EXTENDED_PIDS | 018A (frozen) |
| `desktop-agent/src/obd/commands/pid_validation.py` | Validation orchestrator + report generator | 018A (frozen) |
| `desktop-agent/src/obd/commands/vehicle_health.py` | Production health polling (MODIFIED for 018B) | 018B |
| `desktop-agent/src/agent/scan_executor.py` | Agent event emission (REVIEW for 018B) | 018B |
| `desktop-agent/src/obd/mock_profiles/extended_pid_validation_profile.py` | Validation mock profile | 018A (frozen) |
| `desktop-agent/src/obd/mock_profiles/toyota_real_sample.py` | Frozen reference profile | UNCHANGED |
| `backend/src/vehicle-data/dtos/vehicle-data-response.dto.ts` | Backend DTO types (MODIFIED for 018B) | 018B |
| `frontend/src/services/vehicle-data-api.ts` | Frontend API types (MODIFIED for 018B) | 018B |
| `frontend/src/components/vehicle-data/VehicleHealthPanel.tsx` | Health panel UI (MODIFIED for 018B) | 018B |