# Quickstart: Vehicle Health Real Adapter Integration

**Feature**: 013-vehicle-health-real-adapter
**Date**: 2026-06-14

## Prerequisites

- PrioraScan desktop agent running (Feature 009+)
- WiFi ELM327 adapter connected to vehicle (or mock adapter for testing)
- VIN unsupported handler implemented (Feature 012)
- Mock profiles available (Feature 011)

## Running Vehicle Health with PID Discovery

### With Real WiFi Adapter

```bash
# Set adapter type to WiFi
export OBD_ADAPTER_TYPE=wifi

# Run the desktop agent
python -m src.main
```

When a Vehicle Health read is triggered (via the command queue), the agent will:
1. Connect to the WiFi ELM327 adapter
2. Send PID 0100 to discover supported PIDs
3. Follow the bitmap chain (0120, 0140) if indicated
4. Read only supported configured health PIDs
5. Emit VEHICLE_DATA_READ event with full results

### With Mock Adapter (Toyota Real Sample)

```bash
# Set adapter type to mock with Toyota profile
export OBD_ADAPTER_TYPE=mock
export OBD_MOCK_PROFILE=toyota_real_sample

# Run the desktop agent
python -m src.main
```

The Toyota real sample profile produces:
- RPM: 900
- Speed: 0 km/h
- Coolant: 86°C
- Engine Load: 46.3%
- Voltage: 13.417V
- Fuel Level: Unsupported (PID 012F)
- VIN: Unsupported (all-FF payload)

## Running Tests

```bash
# All agent tests
cd desktop-agent
python -m pytest tests/ -v

# PID discovery tests only
python -m pytest tests/test_pid_discovery.py -v

# Toyota regression test (SC-009)
python -m pytest tests/test_toyota_regression.py -v

# Vehicle health integration tests
python -m pytest tests/test_vehicle_health_integration.py -v
```

## Key Concepts

### PID Capability vs Availability

| State                    | supported | available | value | Display                  |
|--------------------------|-----------|-----------|-------|--------------------------|
| Not supported by vehicle | false     | false     | null  | "Not supported"          |
| Supported, NO DATA       | true      | false     | null  | "Unavailable this read"  |
| Supported, value read    | true      | true      | 900   | "900 RPM"               |

### Bitmap Chain Discovery

```
0100 → parse PIDs 01-20
  ↓ bit 32 set?
  Yes → 0120 → parse PIDs 21-40
    ↓ bit 32 set?
    Yes → 0140 → parse PIDs 41-60
    No → stop
  No → stop
```

The system never blindly queries all bitmap ranges. It follows the chain only when each bitmap indicates the next range exists.

### Configured Health PIDs

| PID | Name                   | Unit |
|-----|------------------------|------|
| 04  | Calculated Engine Load | %    |
| 05  | Coolant Temperature    | °C   |
| 0C  | Engine RPM             | RPM  |
| 0D  | Vehicle Speed          | km/h |
| 42  | Control Module Voltage | V    |
| 2F  | Fuel Level Input       | %    |

## Troubleshooting

### All PIDs show "Not supported"

- Verify the adapter is connected: check agent logs for "ADAPTER_CONNECTED"
- Verify PID 0100 returns a valid bitmap: check raw response in logs
- If PID 0100 itself returns NO DATA, the system falls back to attempting all PIDs

### Fuel Level always shows "Not supported"

- Many vehicles do not support PID 012F (Fuel Level Input). This is normal.
- If the vehicle's 0100 bitmap does not include bit 15 (PID 0F range), 012F will never be queried.

### RPM shows "Unavailable this read" but is in supported list

- The vehicle's bitmap declared PID 0C as supported, but the real-time read returned NO DATA.
- This can happen if the engine is not running when the read occurs.
- `supported: true, available: false` means the vehicle has the sensor but no data was available this time.