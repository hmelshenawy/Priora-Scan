# Research: Vehicle Health Real Adapter Integration

**Feature**: 013-vehicle-health-real-adapter
**Date**: 2026-06-14

## Research Tasks

### R-001: OBD-II PID Bitmap Discovery Chain Protocol

**Decision**: Follow the SAE J1979 standard bitmap chain — after querying PID 0100, check bit 32 (the last bit) of the 4-byte response. If set, PID 0120 is supported and should be queried. After 0120, check bit 32 for 0140 support. Continue until a bitmap response has bit 32 clear or returns NO DATA.

**Rationale**: The OBD-II standard defines PID 0100 bits 01-20, PID 0120 bits 21-40, PID 0140 bits 41-60, etc. Bit 32 of each response indicates whether the next range is supported. Blindly querying all ranges (as the current `read_supported_pids` does for 0120) wastes time and may cause timeout errors on vehicles that don't support those ranges. **Critical insight**: PID 0x2F (Fuel Level) is in the 0120 range and PID 0x42 (Control Module Voltage) is in the 0140 range — without proper chain-following through 0100 → 0120 → 0140, these PIDs cannot be correctly classified as supported or unsupported.

**Bitmap `4100BE1FB813` Verification**: The 4-byte response `BE1FB813` decodes as:
- Byte 0 (MSB): `0xBE` = 10111110 → PIDs 01,03,04,05,06,07 supported
- Byte 1: `0x1F` = 00011111 → PIDs 09,0A,0B,0C,0D supported
- Byte 2: `0xB8` = 10111000 → PIDs 0F,10,11,12,13 supported
- Byte 3 (LSB): `0x13` = 00010011 → PIDs 1A,1D,1E supported, **bit 32 = 1** → 0120 must be queried

The last byte `0x13` has bit 0 (value 1) set, confirming bit 32 of the 32-bit mask is 1. Per SAE J1979, this means PID 0120 MUST be queried.

**Alternatives considered**:
- Query all ranges unconditionally (current approach): Wastes ~300ms per unnecessary query on real adapters. Can cause timeout delays on vehicles with limited PID support.
- Cache bitmap results: Out of scope per spec constraints (no persistence in this feature).

**Impact on existing code**: `read_supported_pids()` in `vehicle_data.py` currently sends 0100, 0120, and 0900 unconditionally. Must be refactored to follow the bitmap chain for Mode 01 PIDs. The Toyota mock profile must be fixed — it currently has `0120` in UNSUPPORTED_COMMANDS but the 0100 bitmap declares bit 32 set, which is internally inconsistent.

### R-002: HealthPidResult Three-State Model (supported + available)

**Decision**: Introduce `available` field alongside existing `supported` field in health PID results. Three states:
- `supported: false, available: false` — vehicle does not support this PID
- `supported: true, available: false` — vehicle supports it but NO DATA/unparseable this read
- `supported: true, available: true` — value successfully read

**Rationale**: The current `VehicleDataPoint` shape uses `{value, unit, supported}` where `supported: false` conflates "vehicle doesn't have this sensor" with "sensor returned no data this time." For real vehicles, a supported PID returning NO DATA (e.g., engine not running yet) is fundamentally different from an unsupported PID. The three-state model gives the frontend enough information to display distinct UI states.

**Alternatives considered**:
- Keep binary `supported` only and add a separate `unavailable` list: Fragments information across the payload, harder for consumers.
- Add an `error` field instead of `available`: Overloaded semantics — "error" implies something went wrong, but NO DATA may be a normal transient state.

**Impact on existing code**: The `VehicleDataPoint` interface shape in the backend DTO and frontend types will need the `available` field. The agent's vehicle health result dict must include `available` for each PID. This is an additive change — existing `supported: false` results gain `available: false`, which is backward-compatible.

### R-003: PID Reader Functions for RPM, Coolant, Speed

**Decision**: Add `read_rpm()`, `read_coolant_temperature()`, and `read_vehicle_speed()` to `vehicle_data.py` following the exact same pattern as existing readers (`read_battery_voltage`, `read_engine_load`, etc.).

**Rationale**: The existing readers use `_send_pid()` → hex string → prefix check → byte parse → return dict pattern. Adding new readers in the same file preserves consistency and keeps all PID readers co-located. The formulas are well-defined by SAE J1979:
- RPM (010C): `(A * 256 + B) / 4`
- Coolant (0105): `A - 40`
- Speed (010D): `A` (direct km/h)

**Alternatives considered**:
- Create a new file for new PIDs: Unnecessary fragmentation; `vehicle_data.py` is only 287 lines (well under 300-line constitutional limit).
- Use a generic PID table with formula callbacks: Over-engineers for 3 new PIDs. The explicit function pattern is clearer and matches existing code.

**Impact on existing code**: Add 3 new functions to `vehicle_data.py`. Import them in `main.py`. No changes to existing functions.

### R-004: Vehicle Health Read Orchestration with PID Discovery

**Decision**: Refactor `execute_vehicle_data_read()` in `main.py` to:
1. Call `read_supported_pids(adapter)` first (already exists, needs chain-following update)
2. Compare discovered PIDs against configured health PID set
3. Only call reader functions for PIDs in the supported list
4. Report unsupported PIDs with `supported: false, available: false`
5. Report supported-but-unavailable PIDs with `supported: true, available: false`
6. Include `supportedHealthPids` and `unsupportedHealthPids` lists in the result

**Rationale**: The current `execute_vehicle_data_read` calls every reader unconditionally. For a real adapter, sending an unsupported PID command wastes ~100ms and returns NO DATA, which the individual reader functions already handle as `supported: false`. With discovery, we skip unsupported PIDs entirely (no command sent) and can distinguish between "not supported" and "supported but unavailable."

**Alternatives considered**:
- Create a separate `VehicleHealthReader` class: Over-engineering for a single orchestration function. The function is straightforward conditional dispatch.
- Keep unconditional reads and post-filter: Still sends unnecessary commands, wastes time, and can't distinguish unsupported from unavailable.

**Impact on existing code**: `execute_vehicle_data_read()` in `main.py` is rewritten. The individual reader functions (`read_battery_voltage`, etc.) remain unchanged — they still handle the case where they're called without prior discovery (backward compatible).

### R-005: Mock Adapter and Real Adapter Parser Consistency

**Decision**: Both mock and real adapters already use the same parser path. The mock adapter converts raw profile bytes to ASCII hex via `.hex().upper().encode("ascii")` before returning, and the real adapter returns ASCII hex from the ELM327 TCP stream. Both feed into `_send_pid()` → hex string → prefix check → byte parse. No new divergence is introduced.

**Rationale**: The mock adapter's `send()` method (line 76 of `mock_adapter.py`) explicitly converts raw bytes to ASCII hex for parser compatibility. This design decision was made in Feature 011 and works correctly. The Toyota real sample profile stores `bytes.fromhex("410C0E10")` which the mock adapter converts to `b"410C0E10"`, identical to what a real ELM327 would return.

**Alternatives considered**:
- None needed — the existing design already ensures consistency.

**Impact on existing code**: No changes needed to mock adapter or parser infrastructure. Verify via tests.

### R-006: Toyota Real Vehicle Regression Verification

**Decision**: Create a dedicated test that feeds the exact Toyota capture data through the health read flow and verifies all decoded values match expectations.

**Input data** (from real Toyota capture, with bitmap chain corrections):
- `0100 → 4100BE1FB813` — Bitmap: PIDs 01,03,04,05,06,07,0F,10,11,12,13,1A,1D,1E supported. Bit 32 SET → 0120 must be queried.
- `0120 → 412000000001` — Bitmap: no PIDs 21-3F supported (including 0x2F Fuel Level). Bit 32 SET → 0140 must be queried.
- `0140 → 414040000000` — Bitmap: PID 0x42 (Control Module Voltage) supported. Bit 32 CLEAR → chain stops.
- `010C → 410C0E10` — RPM: (0x0E * 256 + 0x10) / 4 = (14*256+16)/4 = 3600/4 = 900
- `010D → 410D00` — Speed: 0 km/h
- `0105 → 41057E` — Coolant: 0x7E - 40 = 126 - 40 = 86°C
- `0104 → 410476` — Load: (0x76/255)*100 = 118/255*100 = 46.3% (corrected from `41045E`)

**SC-009 Hex Correction**: The original SC-009 listed `0104 → 41045E` but `0x5E` = 94 gives 36.9%, not 46.3%. Corrected to `0104 → 410476` where `0x76` = 118 gives `118 * 100 / 255 = 46.3%`, matching the Toyota mock profile's verified real capture data.

**Bitmap Chain Correction**: The original R-006 analysis assumed the Toyota profile marks 0120 as unsupported. Bitmap `4100BE1FB813` analysis proves bit 32 IS set (0x13 LSB = 1), meaning 0120 MUST be queried. The Toyota mock profile currently has `0120` in UNSUPPORTED_COMMANDS, which contradicts the bitmap. This must be fixed: add `0120 → 412000000001` and `0140 → 414040000000` to PID_RESPONSES, remove `0120` from UNSUPPORTED_COMMANDS.

**Alternatives considered**:
- Use SC-009 hex values as-is: Would produce 36.9% for engine load, contradicting the "Expected: 46.3%" in the same SC-009. Internally inconsistent.
- Use mock profile hex values: Produces 46.3% as expected. Consistent with real capture.

**Impact on existing code**: The regression test uses the mock profile data (corrected to `410476` for 0104). The Toyota mock profile must be fixed to include 0120/0140 bitmap responses for consistent chain-following (T001). The spec SC-009 raw hex for 0104 has been corrected from `41045E` to `410476`.

### R-007: No Persistence — Runtime Discovery Only

**Decision**: PID capability is discovered at the start of each Vehicle Health read. Results are included in the VEHICLE_DATA_READ event payload. No persistent storage, Redis, cache, or external capability database is introduced.

**Rationale**: The spec explicitly forbids Redis, cache, and persistent VehicleCapabilityProfile in this feature. Runtime discovery is the simplest approach and ensures stale capability data can never cause incorrect behavior. The VehicleCapabilityProfile PostgreSQL table is documented as a future extension.

**Alternatives considered**:
- In-memory LRU cache with TTL: Adds complexity, still not persistent, and the spec forbids cache infrastructure.
- Session-scoped caching: Would require state management that doesn't belong in this feature's scope.

**Impact on existing code**: None — no new storage infrastructure.