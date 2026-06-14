# Research: VIN Unsupported Handler Fix

**Feature**: 012-vin-unsupported-handler | **Date**: 2026-06-14

## Research Task 1: VinResult Type Design

**Question**: Should VinResult be a dataclass, NamedTuple, or TypedDict?

**Decision**: Use a Python `dataclass` with frozen=True for immutability.

**Rationale**: The spec requires a typed result shape `{status, vin, reason?}`. A frozen dataclass provides:
- Clear field names and types via type hints
- Immutability (frozen=True) matching the read-only nature of a result
- Auto-generated `__eq__` for test assertions
- `None` default for `reason` matching the optional field in the spec
- No external dependencies (stdlib only)

**Alternatives Considered**:
- `NamedTuple` — rejected because it lacks default values for optional fields cleanly and doesn't support `None` defaults idiomatically.
- `TypedDict` — rejected because it provides no runtime validation and creates dict objects that are harder to assert on in tests.
- Plain `dict` — rejected because it lacks type safety and makes the contract implicit.

The VinResult dataclass:

```python
@dataclass(frozen=True)
class VinResult:
    status: str   # "SUPPORTED" | "UNSUPPORTED"
    vin: str | None
    reason: str | None = None  # "NO_DATA" | "ALL_FF" | "MALFORMED" | "EMPTY_RESPONSE"
```

Factory methods for clarity:

```python
@classmethod
def supported(cls, vin: str) -> "VinResult":
    return cls(status="SUPPORTED", vin=vin, reason=None)

@classmethod
def unsupported(cls, reason: str) -> "VinResult":
    return cls(status="UNSUPPORTED", vin=None, reason=reason)
```

## Research Task 2: Impact on read_vin() Callers

**Question**: What code depends on `read_vin()` returning a bare string, and how must it be updated?

**Decision**: Two callers in `main.py` must be updated, plus test files. The change is mechanical — replace string usage with `result.vin` and handle the unsupported case.

**Callers identified**:

| File | Line | Current Usage | Change Required |
|------|------|---------------|-----------------|
| `main.py:80` | `execute_scan()` | `vin = read_vin(adapter)` used as string | Use `result.vin` when supported; emit VIN_UNSUPPORTED event when unsupported |
| `main.py:134` | `execute_vehicle_data_read()` | `vin = read_vin(adapter)` in try/except block | Replace try/except with `result.status` check; set vin dict from VinResult |
| `test_scan_events.py` | 3 test patches | `patch("src.main.read_vin", return_value="WDD2130041A123456")` | Update mock to return `VinResult.supported("WDD2130041A123456")` |
| `test_commands.py` | 3 VIN tests | Assert `read_vin()` returns string or raises | Assert `read_vin()` returns `VinResult` with correct fields |
| `test_vin_real.py` | 5 VIN tests | Assert `read_vin()` returns string or raises RuntimeError | Assert `read_vin()` returns `VinResult` — unsupported cases return VinResult instead of raising |
| `test_mock_profiles.py` | `TestVinAllFFHandling` | Assert `_read_vin_mock()` raises RuntimeError | Assert `_read_vin_mock()` returns `VinResult` with status UNSUPPORTED |

**Rationale**: The user's correction to FR-012 explicitly states: "Do not require old test assertions to remain literally unchanged if `read_vin()` now returns a typed result." Tests will be updated to assert on the VinResult shape. Behavior compatibility is maintained through `VinResult.vin` — callers that need the VIN string access it through the `.vin` attribute when `status == "SUPPORTED"`.

## Research Task 3: Mock vs Real Adapter Code Path

**Question**: How does `read_vin()` currently branch between mock and real adapters, and how does the new VinResult type affect each path?

**Decision**: Both paths return VinResult. The mock path (`_read_vin_mock`) detects all-FF, empty, and malformed payloads. The real path (`elm_parser.parse_vin`) already returns a dict with `supported`/`value` keys — map it to VinResult.

**Current code paths**:

```python
def read_vin(adapter) -> str:
    raw = adapter.send("0902")
    adapter_type = getattr(adapter, "adapter_type", None)

    if adapter_type is None or adapter_type == "MOCK":
        return _read_vin_mock(raw)  # Returns str or raises RuntimeError

    # Real adapter — use ELM327 parser
    cleaned = clean_raw_response(raw)
    result = parse_vin(cleaned)  # Returns dict with "supported"/"value"/"error"

    if not result.get("supported", False):
        if "error" in result:
            raise RuntimeError(f"VIN read failed: {result['error']}")
        raise RuntimeError("VIN not supported by vehicle")

    vin = result["value"]
    if len(vin) != 17:
        raise RuntimeError(f"Invalid VIN length: {len(vin)} (expected 17)")
    return vin
```

**New code paths**:

1. **Mock path** (`_read_vin_mock`):
   - Empty bytes (`b""`) → `VinResult.unsupported("EMPTY_RESPONSE")`
   - No `4902` prefix → `VinResult.unsupported("MALFORMED")`
   - All-0xFF data → `VinResult.unsupported("ALL_FF")`
   - Decoded VIN length ≠ 17 → `VinResult.unsupported("MALFORMED")`
   - Valid VIN → `VinResult.supported(decoded_vin)`

2. **Real adapter path** (ELM327):
   - `parse_vin()` returns `UNSUPPORTED` dict → `VinResult.unsupported("NO_DATA")`
   - `parse_vin()` returns `PARSE_ERROR` dict → `VinResult.unsupported("NO_DATA")`
   - `parse_vin()` returns `ADAPTER_STOPPED` dict → `RuntimeError` (genuine failure)
   - `parse_vin()` returns `INCOMPLETE_DATA` dict → `VinResult.unsupported("MALFORMED")`
   - `parse_vin()` returns supported with warning → `VinResult.supported(vin)` (keep the VIN even if length ≠ 17, as `parse_vin` already handles partial VINs)
   - `parse_vin()` returns supported with 17-char VIN → `VinResult.supported(vin)`

**Rationale**: The real adapter path already has structured error detection via `parse_vin()`. The key insight is that `ADAPTER_STOPPED` is a genuine transport failure (should still raise), while `UNSUPPORTED`, `PARSE_ERROR`, and `INCOMPLETE_DATA` are capability results (should return VinResult.unsupported). This matches FR-009: "only for genuine transport/adapter failures."

## Research Task 4: execute_scan() Event Emission for Unsupported VIN

**Question**: When VIN is unsupported in `execute_scan()`, what event should be emitted?

**Decision**: Emit a `VIN_READ` event with the VinResult shape, allowing the backend to distinguish supported vs unsupported VIN. Continue to DTC read regardless of VIN status.

**Current behavior** (`execute_scan`):
```python
if not job.vin:
    vin = read_vin(adapter)  # Can crash if VIN unsupported
    vin_result = _emit(api_client, job.id, "VIN_READ", {"vin": vin})
```

**New behavior**:
```python
if not job.vin:
    vin_result = read_vin(adapter)
    if vin_result.status == "SUPPORTED":
        _emit(api_client, job.id, "VIN_READ", {"vin": vin_result.vin})
    else:
        _emit(api_client, job.id, "VIN_READ", {"vin": None, "vinStatus": "UNSUPPORTED", "reason": vin_result.reason})
    # Continue to DTC read regardless
fault_codes = read_fault_codes(adapter)  # Always reached now
```

**Rationale**: The existing `VIN_READ` event is the right place to signal VIN status. Adding `vinStatus` and `reason` fields extends the event without breaking existing consumers. The scan always continues to DTC read — VIN is optional per FR-010.

## Research Task 5: execute_vehicle_data_read() Simplification

**Question**: How does the VinResult type simplify `execute_vehicle_data_read()`?

**Decision**: Replace the try/except block with direct VinResult usage.

**Current code**:
```python
try:
    vin = read_vin(adapter)
    vehicle_data["vin"] = {"value": vin, "supported": True}
except Exception:
    vehicle_data["vin"] = {"value": None, "supported": False}
```

**New code**:
```python
vin_result = read_vin(adapter)
vehicle_data["vin"] = {
    "value": vin_result.vin,
    "supported": vin_result.status == "SUPPORTED",
}
if vin_result.status == "UNSUPPORTED" and vin_result.reason:
    vehicle_data["vin"]["reason"] = vin_result.reason
```

**Rationale**: This is cleaner, more explicit, and doesn't silently catch real adapter failures. The `supported` boolean field already exists in the API contract (used by vehicle data events), so this aligns perfectly. Adding the optional `reason` field provides diagnostic information without breaking existing consumers.

## Research Task 6: Test Update Strategy

**Question**: How should existing tests be updated given the return type change from `str` to `VinResult`?

**Decision**: Update all tests that call `read_vin()` or `_read_vin_mock()` to assert on VinResult fields instead of bare strings or RuntimeError exceptions. This is the approach the user explicitly confirmed in FR-012.

**Test files to update**:

| File | Tests | Change |
|------|-------|--------|
| `test_commands.py::TestVinParser` | 3 tests | Assert `result.status == "SUPPORTED"` and `result.vin == "..."` instead of `result == "..."` |
| `test_commands.py::TestVinParser::test_read_vin_rejects_wrong_prefix` | 1 test | Assert `result.status == "UNSUPPORTED"` and `result.reason == "MALFORMED"` instead of `pytest.raises(RuntimeError)` |
| `test_commands.py::TestVinParser::test_read_vin_rejects_short_vin` | 1 test | Assert `result.status == "UNSUPPORTED"` and `result.reason == "MALFORMED"` instead of `pytest.raises(RuntimeError)` |
| `test_vin_real.py` | 5 tests | Update all assertions for VinResult return type |
| `test_mock_profiles.py::TestVinAllFFHandling` | 2 tests | Assert `result.status == "UNSUPPORTED"` instead of `pytest.raises(RuntimeError)` |
| `test_scan_events.py` | 3 tests | Update `patch` return values from strings to `VinResult.supported(...)` |
| `test_mock_obd_adapter.py` | 1 test | Update `read_vin()` call assertion |

**New tests to add**:
- Empty adapter response → `VinResult.unsupported("EMPTY_RESPONSE")`
- All-FF payload → `VinResult.unsupported("ALL_FF")`
- Malformed VIN (non-ASCII) → `VinResult.unsupported("MALFORMED")`
- Wrong prefix → `VinResult.unsupported("MALFORMED")`
- NO DATA from real adapter → `VinResult.unsupported("NO_DATA")`
- ADAPTER_STOPPED from real adapter → `RuntimeError` (genuine failure)

**Rationale**: The user explicitly corrected FR-012 to allow test assertion changes. Behavior compatibility is maintained through `VinResult.vin` — the VIN string is still accessible. The typed result makes tests clearer about what they're asserting.

## Research Task 7: VinResult Module Location

**Question**: Where should the VinResult dataclass live?

**Decision**: Define VinResult in `src/obd/commands/vin.py` alongside `read_vin()`.

**Rationale**: VinResult is the return type of `read_vin()`, so it belongs in the same module. This follows the Python convention of keeping a function and its return type together. Importing `VinResult` from `vin.py` is natural for callers. No new module is needed for a single dataclass.

## Research Task 8: Malformed VIN Detection

**Question**: How should `_read_vin_mock()` detect malformed VIN payloads beyond all-FF?

**Decision**: After decoding the hex data, check:
1. All bytes are 0xFF → `ALL_FF`
2. Decoded string contains non-printable characters (< 0x20 or > 0x7E) → `MALFORMED`
3. Decoded string length ≠ 17 → `MALFORMED`

**Rationale**: The spec requires FR-008 (malformed VIN → UNSUPPORTED with reason MALFORMED). Non-printable characters indicate corrupted ECU data. Length mismatch is already checked. The all-FF check must come first because 0xFF is also non-ASCII, but all-FF is a specific known pattern that gets the `ALL_FF` reason for diagnostic value.