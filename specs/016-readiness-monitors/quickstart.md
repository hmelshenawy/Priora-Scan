# Quickstart: Readiness Monitors (Feature 016)

**Branch**: `016-readiness-monitors` | **Date**: 2026-06-14

## Prerequisites

- Desktop agent development environment set up
- WiFi ELM327 adapter available for real vehicle testing (Phase 0 probe)
- Toyota vehicle accessible for real adapter probe (same vehicle used in Feature 013)

## Key Files

| File | Change Type | Description |
|------|-------------|-------------|
| `desktop-agent/src/obd/commands/vehicle_data.py` | REFACTOR | Extract `parse_readiness_monitors()`, fix byte mapping, add MIL/DTC extraction, update return shape |
| `desktop-agent/src/obd/mock_profiles/default.py` | MODIFY | Remove `READINESS_MONITORS = None`, verify PID 0101 data |
| `desktop-agent/src/obd/mock_profiles/no_faults.py` | MODIFY | Remove `READINESS_MONITORS = None`, verify PID 0101 data |
| `desktop-agent/src/obd/mock_profiles/with_faults.py` | MODIFY | Remove `READINESS_MONITORS = None`, verify PID 0101 data |
| `desktop-agent/src/obd/mock_profiles/unsupported_vin.py` | MODIFY | Remove `READINESS_MONITORS = None`, verify PID 0101 data |
| `desktop-agent/src/obd/mock_profiles/toyota_real_sample.py` | MODIFY | Remove `READINESS_MONITORS = None`, ADD PID 0101 data after probe |
| `desktop-agent/src/obd/mock_profiles/toyota_real_faults.py` | MODIFY | Remove `READINESS_MONITORS = None`, ADD PID 0101 data after probe |
| `desktop-agent/src/main.py` | VERIFY | Verify `readinessMonitors` key uses new shape |
| `desktop-agent/tests/test_readiness_monitors.py` | CREATE | New test file for readiness parser and edge cases |
| `desktop-agent/tests/test_mock_profiles.py` | UPDATE | Add readiness monitor tests, remove `READINESS_MONITORS` assertions |
| `desktop-agent/tests/test_toyota_regression.py` | UPDATE | Add PID 0101 regression test |

## Running Tests

```bash
cd desktop-agent
pytest tests/test_readiness_monitors.py -v
pytest tests/test_mock_profiles.py -v
pytest tests/test_toyota_regression.py -v
pytest tests/ -v  # Full regression
```

## Phase 0 — Real Toyota Probe

Connect to the Toyota vehicle via WiFi ELM327 and capture the PID 0101 response:

```python
# In desktop-agent Python environment
from src.obd.wifi_elm327 import WifiElm327Adapter
adapter = WifiElm327Adapter()
adapter.connect()
raw = adapter.send("0101")
print(f"Raw 0101 response: {raw!r}")
adapter.close()
```

Document the captured response in `research.md`.

## Implementation Order

1. **Phase 0**: Real Toyota probe → document in research.md
2. **Phase 1**: Add `parse_readiness_monitors()` shared parser → fix byte mapping → add MIL/DTC extraction → update `read_readiness_monitors()` return shape → remove `READINESS_MONITORS` from profiles → add/update PID 0101 data
3. **Phase 2**: Tests → regression → integration verification

## Verification

After implementation, verify:

1. All 6 mock profiles decode PID 0101 correctly through the shared parser
2. MIL ON/OFF and DTC count decode correctly from test data
3. All 11 monitor names and states decode correctly
4. Unsupported/error responses produce graceful `ReadinessResult`
5. Real Toyota probe response decodes correctly (or is handled as unsupported)
6. No existing tests regress