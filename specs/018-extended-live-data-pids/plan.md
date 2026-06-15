# Implementation Plan: Real Vehicle Extended PID Validation

**Branch**: `018-extended-live-data-pids` | **Date**: 2026-06-15 | **Spec**: [spec.md](./spec.md)

## Summary

Add desktop-agent-only validation of 7 extended OBD-II Mode 01 PIDs (STFT/LTFT Banks 1&2, MAP, MAF, Throttle Position) to confirm real-vehicle support before building the full pipeline in Feature 018B. The validation reuses existing `_send_pid`, `_parse_bytes`, and three-state result factories from `health_pids.py`, adds new reader functions for each extended PID, orchestrates them through `read_extended_pid_validation()`, and produces a console report with support matrix. No backend, frontend, database, or API changes. No modifications to existing files except the mock profile registry. No re-exports through `vehicle_data.py`.

## Technical Context

**Language/Version**: Python 3.11+ (desktop-agent subsystem)

**Primary Dependencies**: pytest (testing), existing `src.obd.commands` modules

**Storage**: N/A (validation-only, no persistence)

**Testing**: pytest with MockObdAdapter profiles

**Target Platform**: Desktop (Windows/macOS/Linux) — ELM327 OBD adapter host

**Project Type**: Desktop agent module (sub-package of PrioraScan)

**Performance Goals**: Single OBD query per PID; no streaming or real-time requirements

**Constraints**: Must not modify existing health/readiness/freeze-frame/DTC/VIN behavior. Must abort on discovery failure (no fallback). No changes to `vehicle_data.py`, `toyota_real_sample.py`, or any other existing file except the profile registry.

**Scale/Scope**: 7 required PIDs + 2 optional; 7 reader functions; 1 orchestration function; 1 new mock profile; 2 new test files; 2 new source files; 1 registry update

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Documentation First**: Spec references no PRD/SAD entities — this is a validation-only feature with no new entities, APIs, or UI screens. No SAD update needed.
- [x] **Design Before Implementation**: This plan is the design document. Implementation proceeds after plan approval.
- [x] **Layered Architecture**: N/A — desktop agent is a standalone Python package, not a layered web service. The agent's internal pattern (adapter → reader → orchestrator) mirrors the layered separation.
- [x] **Modular Development**: Feature is contained entirely within two new files (`extended_pids.py`, `pid_validation.py`) plus one new mock profile. No cross-module boundary violations.
- [x] **Code Quality**: New files will follow existing patterns (single-responsibility, small functions, no duplication). Reuse of `_send_pid`, `_parse_bytes`, and result factories avoids duplication.
- [x] **Multi-Tenant First**: N/A — desktop agent is single-tenant per vehicle connection.
- [x] **API First**: N/A — no backend API changes.
- [x] **Scan Source Agnostic**: Validation works with any adapter (mock, USB ELM327, WiFi ELM327) via `BaseAdapter`.
- [x] **AI Assists, Never Decides**: N/A — no AI features.
- [x] **Standalone First**: N/A — no PrioraFlow integration.
- [x] **Auditability**: N/A — no persistent data.
- [x] **Security By Default**: N/A — no authentication/authorization concerns at agent level.
- [x] **Progressive Hardware Integration**: Validation uses existing adapter abstraction; works with any OBD source.
- [x] **Git & Change Safety**: Feature branch `018-extended-live-data-pids`.
- [x] **Simplicity Over Complexity**: Validation-only scope. No persistence, no API, no UI. No re-exports. No modifications to existing source files.
- [x] **Backend-Centric Business Logic**: N/A — no business logic changes.

**Gate Result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/018-extended-live-data-pids/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (N/A for this feature)
├── quickstart.md        # Phase 1 output
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
desktop-agent/
├── src/obd/commands/
│   ├── extended_pids.py          # NEW — reader functions for 7+2 extended PIDs
│   ├── pid_validation.py         # NEW — read_extended_pid_validation() orchestrator + report
│   ├── health_pids.py            # EXISTING — reuse helpers, do NOT modify
│   ├── vehicle_health.py         # EXISTING — do NOT modify
│   ├── vehicle_data.py           # EXISTING — do NOT modify (no re-exports)
│   ├── supported_pids.py         # EXISTING — reuse read_supported_pids() as-is
│   └── ...                       # EXISTING — all other files unchanged
├── src/obd/mock_profiles/
│   ├── extended_pid_validation_profile.py  # NEW — deterministic test profile
│   ├── toyota_real_sample.py      # EXISTING — do NOT modify (frozen reference)
│   ├── profile_registry.py        # EXISTING — add new profile registration
│   └── ...                        # EXISTING — all other profiles unchanged
└── tests/
    ├── test_extended_pids.py              # NEW — unit tests for extended PID decoders
    ├── test_pid_validation.py             # NEW — integration tests for validation + report
    ├── test_vehicle_health_integration.py  # EXISTING — must pass unchanged
    └── test_toyota_regression.py          # EXISTING — must pass unchanged
```

**Structure Decision**: Two new source modules (`extended_pids.py`, `pid_validation.py`) plus one new mock profile (`extended_pid_validation_profile.py`). No modifications to existing command modules or `vehicle_data.py`. The only existing file modified is `profile_registry.py` to register the new profile. `toyota_real_sample.py` remains frozen as a reference profile.

## Phase 0: Research

### Research Tasks

| # | Unknown | Resolution |
|---|---------|------------|
| R1 | Which PIDs already exist in `health_pids.py` vs need new readers? | PIDs 06, 07, 10, 11 are NOT in `CONFIGURED_HEALTH_PIDS` — they exist only in the backend PID seed. All 7 PIDs need new Python reader functions. |
| R2 | Can `_send_pid` and `_parse_bytes` be reused as-is? | Yes — they are module-level functions in `health_pids.py` that can be imported. No extraction needed. |
| R3 | Does the three-state result model cover all validation states? | Yes — matches FR-002 exactly. No new result types needed. |
| R4 | How does `read_vehicle_health` handle discovery failure? | It falls back to attempting all `CONFIGURED_HEALTH_PIDS`. FR-016 requires the **opposite** — abort on failure. The validation function must implement its own abort logic. |
| R5 | Mock profile strategy — modify existing or create new? | Create a new dedicated profile (`extended_pid_validation_profile.py`). The `toyota_real_sample.py` profile is a frozen reference representing real captured data and must not be modified. |
| R6 | What response prefix does each extended PID use? | Mode 01 responses prefix with `41` + PID hex: PID 06 → `4106`, PID 07 → `4107`, PID 0B → `410B`, PID 10 → `4110`, PID 11 → `4111`. Same pattern as existing readers. |
| R7 | Can the validation function be standalone? | Yes. Called directly with an adapter, not wired into the command queue. Produces console output only. |
| R8 | What exception convention does the agent use? | The agent uses **no custom exception classes**. It uses `RuntimeError` for infrastructure failures (adapter not connected, VIN read failed) and **result-dicts** for domain-level failures (unsupported PIDs, no data). Discovery failure is an infrastructure failure, so `RuntimeError` is the appropriate choice — consistent with `vin.py` line 100 which raises `RuntimeError("VIN read failed: adapter stopped")`. No new exception type needed. |

### Research Output

See [research.md](./research.md) for detailed findings.

## Phase 1: Design & Contracts

### Data Model

N/A — No database entities, no persistence. The validation result is an in-memory dict returned by `read_extended_pid_validation()`.

### Contracts

N/A — No API endpoints, no backend contracts. The only contract is the Python function signature:

```python
def read_extended_pid_validation(adapter: BaseAdapter) -> dict:
    """
    Validate extended PIDs on a connected vehicle.

    Returns:
        dict with keys:
          - "pids": dict mapping PID hex codes to three-state results
          - "report": str, the formatted console report
          - "support_matrix": str, the tabular PID|Name|Supported|Available|Value summary

    Raises:
        RuntimeError: if supported PID discovery fails (FR-016)
    """
```

The function raises `RuntimeError` on discovery failure — consistent with the agent's existing convention for infrastructure failures (see `vin.py:100`, `usb_elm327.py:39`, `wifi_elm327.py:179`). No custom exception class is introduced.

### Key Design Decisions

1. **New modules, not modification of existing modules**: `extended_pids.py` and `pid_validation.py` are new files. `health_pids.py`, `vehicle_health.py`, and `vehicle_data.py` remain unchanged. This ensures zero regression risk and complete isolation.

2. **No re-exports through vehicle_data.py**: Feature 018A is an internal validation utility. Nothing in production should consume `read_extended_pid_validation()` yet. The implementation stays isolated in `extended_pids.py` and `pid_validation.py`. No import paths change. No existing consumers are affected.

3. **Reuse helpers via import**: `_send_pid`, `_parse_bytes`, `_health_pid_result`, `_unsupported_pid_result`, `_unavailable_pid_result` are imported from `health_pids.py`. No extraction into a shared module — they're already public functions.

4. **Discovery failure raises RuntimeError (FR-016)**: The validation function checks `read_supported_pids()` return value. If Mode 01 PIDs list is empty, it raises `RuntimeError("Extended PID validation aborted. Supported PID discovery failed.")`. This follows the agent's existing convention for infrastructure failures and avoids introducing a custom exception class. This differs from `read_vehicle_health` which falls back — the validation feature must not guess.

5. **Separate reader functions per PID**: Each extended PID gets its own reader function following the exact same pattern as `read_rpm`, `read_engine_load`, etc. This is consistent with the existing codebase and makes each PID independently testable.

6. **CONFIGURED_EXTENDED_PIDS dict**: Mirrors `CONFIGURED_HEALTH_PIDS` but maps the 7 (or 9) extended PID hex codes to their reader functions. This dict drives the validation loop.

7. **PID-to-display-name mapping**: A separate dict maps PID codes to human-readable names for the validation report (e.g., `"06": "STFT Bank 1"`).

8. **Report generation is separate from validation**: `read_extended_pid_validation()` returns both the structured result and the formatted report string. The report can be printed or captured.

9. **Dedicated validation profile, not modification of toyota_real_sample**: The `toyota_real_sample.py` profile is a frozen reference representing real captured vehicle data. It has been used for VIN, health, readiness, freeze frame, and DTC validation. It must not be modified. A new `extended_pid_validation_profile.py` provides deterministic responses for all 7 required PIDs plus 2 optional ones, specifically for Feature 018A testing.

## Implementation Phases

### Phase 1: Extended PID Readers (`extended_pids.py`)

**Files**: `desktop-agent/src/obd/commands/extended_pids.py` (NEW)

Create the extended PID reader module with:

1. **Reader functions** — one per PID, each following the established pattern:
   - `read_stft_bank1(adapter)` → PID 06, formula `(A - 128) * 100 / 128`, unit `%`, prefix `4106`
   - `read_ltft_bank1(adapter)` → PID 07, formula `(A - 128) * 100 / 128`, unit `%`, prefix `4107`
   - `read_stft_bank2(adapter)` → PID 08, formula `(A - 128) * 100 / 128`, unit `%`, prefix `4108`
   - `read_ltft_bank2(adapter)` → PID 09, formula `(A - 128) * 100 / 128`, unit `%`, prefix `4109`
   - `read_map(adapter)` → PID 0B, formula `A`, unit `kPa`, prefix `410B`
   - `read_maf(adapter)` → PID 10, formula `(A * 256 + B) / 100`, unit `g/s`, prefix `4110`
   - `read_throttle_position(adapter)` → PID 11, formula `A * 100 / 255`, unit `%`, prefix `4111`

   Optional PIDs:
   - `read_intake_air_temp(adapter)` → PID 0F, formula `A - 40`, unit `°C`, prefix `410F`
   - `read_barometric_pressure(adapter)` → PID 33, formula `A`, unit `kPa`, prefix `4133`

2. **CONFIGURED_EXTENDED_PIDS** dict mapping PID hex codes to reader functions.

3. **EXTENDED_PID_NAMES** dict mapping PID hex codes to display names.

4. **EXTENDED_PID_UNITS** dict mapping PID hex codes to units.

5. All readers import `_send_pid`, `_parse_bytes`, `_health_pid_result`, `_unavailable_pid_result`, `_unsupported_pid_result` from `health_pids.py`.

**No existing files modified in this phase.**

### Phase 2: Validation Orchestrator (`pid_validation.py`)

**Files**: `desktop-agent/src/obd/commands/pid_validation.py` (NEW)

Create the validation orchestration module with:

1. **read_extended_pid_validation(adapter)** function:
   - Call `read_supported_pids(adapter)` to get supported PIDs
   - If no Mode 01 PIDs discovered, raise `RuntimeError("Extended PID validation aborted. Supported PID discovery failed.")`
   - Classify extended PIDs into `supported` and `unsupported` based on bitmap
   - Read supported PIDs via `CONFIGURED_EXTENDED_PIDS` reader functions
   - If a reader returns `supported: False` for a PID that was in the bitmap, override to `unavailable`
   - Mark unsupported PIDs via `_unsupported_pid_result`
   - Build result dict mapping PID hex codes to three-state results
   - Generate formatted console report
   - Generate support matrix table
   - Return `{"pids": results, "report": report_str, "support_matrix": matrix_str}`

2. **format_validation_report(results, pid_names, pid_units)** function — generates the detailed report:
   ```
   ===== EXTENDED PID VALIDATION =====

   PID 06 STFT Bank 1
   Supported: YES
   Available: YES
   Raw Response: 410680
   Value: 0.0 %

   ...

   ===== END VALIDATION =====
   ```

3. **format_support_matrix(results, pid_names, pid_units)** function — generates the tabular summary:
   ```
   PID | Name | Supported | Available | Value
   06 | STFT B1 | YES | YES | 0.0 %
   07 | LTFT B1 | YES | YES | 8.6 %
   ...
   ```

**No existing files modified in this phase.**

### Phase 3: Validation Mock Profile

**Files**:
- `desktop-agent/src/obd/mock_profiles/extended_pid_validation_profile.py` (NEW)
- `desktop-agent/src/obd/mock_profiles/profile_registry.py` (MODIFY — add new profile registration)
- `desktop-agent/src/obd/mock_profiles/__init__.py` (NO CHANGE — `ProfileRegistry` auto-discovers via the registry)

Create a dedicated validation profile with deterministic responses for all required and optional PIDs:

1. **Profile identity**: `PROFILE_NAME = "extended_pid_validation"`, `PROFILE_DESCRIPTION = "Extended PID validation — deterministic responses for all target PIDs"`

2. **PID bitmap** (`0100` response): Include all 7 required PIDs (06, 07, 08, 09, 0B, 10, 11) and 2 optional PIDs (0F, 33) as supported. This differs from `toyota_real_sample` which only supports a subset.

3. **PID responses** with known decode outputs:
   - PID 06 (STFT B1): `410680` → 0.0% (center point)
   - PID 07 (LTFT B1): `410680` → 0.0% (same as STFT at center)
   - PID 08 (STFT B2): `41067F` → ~-0.78% (negative trim)
   - PID 09 (LTFT B2): `41078D` → ~10.16% (positive trim)
   - PID 0B (MAP): `410B2A` → 42 kPa
   - PID 10 (MAF): `41100064` → 1.00 g/s
   - PID 11 (Throttle): `411105` → ~1.96%
   - PID 0F (IAT, optional): `410F5A` → 50°C
   - PID 33 (Baro, optional): `413366` → 102 kPa

4. **Bitmap chain** (`0120`, `0140`): Include appropriate continuation bits and PID support for PIDs in the 21-40 and 41-60 ranges if needed for PID 33 (0x21).

5. **VIN_RESPONSE**: Valid VIN for completeness.
6. **DTC_RESPONSES**: No fault codes.
7. **CLEAR_DTC_RESPONSE**: Standard clear response.
8. **FAULT_METADATA**: Empty.

9. **UNSUPPORTED_COMMANDS**: No extended PIDs are unsupported in this profile (all are in the bitmap).

Register the new profile in `profile_registry.py` by adding a lazy-load lambda for `"extended_pid_validation"`.

**`toyota_real_sample.py` remains completely unchanged.**

### Phase 4: Unit & Integration Tests

**Files**:
- `desktop-agent/tests/test_extended_pids.py` (NEW)
- `desktop-agent/tests/test_pid_validation.py` (NEW)

#### `test_extended_pids.py` — Decoder Unit Tests

Test each extended PID reader against known hex inputs:

1. **Fuel Trim Tests (PIDs 06, 07, 08, 09)**:
   - `41067F` → STFT ≈ -0.78% (within ±0.5%)
   - `410680` → STFT = 0%
   - `4106FF` → STFT ≈ 99.22%
   - Same pattern for PIDs 07, 08, 09

2. **MAF Tests (PID 10)**:
   - `41100064` → 1.00 g/s
   - Multi-byte decoding verification

3. **Throttle Position Tests (PID 11)**:
   - `411105` → ≈ 1.96%
   - `411100` → 0%
   - `4111FF` → 100%

4. **MAP Tests (PID 0B)**:
   - `410B2A` → 42 kPa
   - `410B00` → 0 kPa

5. **Error Handling Tests**:
   - Unsupported PID (adapter returns empty) → `supported: False`
   - NO DATA response (adapter returns error marker) → `supported: False` from reader, then overridden to `unavailable` by orchestrator
   - Wrong prefix → `available: False`
   - Insufficient bytes → `available: False`

#### `test_pid_validation.py` — Integration Tests

1. **Full validation on extended_pid_validation profile** — all supported PIDs decoded correctly.

2. **Discovery failure abort** — mock adapter returns empty for `0100`, validation raises `RuntimeError`.

3. **Partial support** — custom mock with only some PIDs in bitmap, verify unsupported PIDs are skipped.

4. **Supported but unavailable** — PID in bitmap returns NO DATA → `supported: True, available: False`.

5. **Report format verification** — output contains header, per-PID sections with raw responses, footer.

6. **Support matrix format verification** — output contains `PID | Name | Supported | Available | Value` table.

7. **Raw response in report** — each successfully queried PID shows its raw hex response.

8. **Toyota regression still passes** — `test_vehicle_health_integration.py` passes unchanged.

9. **Bank 2 unsupported scenario** — mock profile with Bank 1 only (like Toyota real sample), verify Bank 2 PIDs are `supported: False`.

### Phase 5: Smoke Test

**Files**: None (manual verification)

Run the full test suite:

```bash
cd desktop-agent
python -m pytest tests/ -v
```

Verify:
- All new tests pass
- All existing tests pass (especially `test_vehicle_health_integration.py` and `test_toyota_regression.py`)
- No import errors
- `read_extended_pid_validation()` works with `MockObdAdapter(profile_name="extended_pid_validation")`
- No modifications to `vehicle_data.py`, `health_pids.py`, `vehicle_health.py`, or `toyota_real_sample.py`

## Dependencies

| Dependency | Type | Notes |
|---|---|---|
| `health_pids._send_pid` | Import reuse | Used by all new readers to send OBD commands |
| `health_pids._parse_bytes` | Import reuse | Used by all new readers to parse hex responses |
| `health_pids._health_pid_result` | Import reuse | Three-state result factory — supported+available |
| `health_pids._unsupported_pid_result` | Import reuse | Three-state result factory — unsupported |
| `health_pids._unavailable_pid_result` | Import reuse | Three-state result factory — supported but unavailable |
| `supported_pids.read_supported_pids` | Import reuse | PID bitmap discovery — aborts on failure per FR-016 |
| `mock_adapter.MockObdAdapter` | Test dependency | For mock-based testing |
| `mock_profiles.extended_pid_validation_profile` | Test dependency | New dedicated profile with all extended PID responses |
| `mock_profiles.profile_registry` | Runtime dependency | Register new profile (minimal change — add one lambda) |

## Test Strategy

| Test Type | File | Coverage |
|---|---|---|
| Unit — Decoder | `test_extended_pids.py` | Each PID reader with known hex inputs (FR-014) |
| Unit — Error paths | `test_extended_pids.py` | Unsupported, NO DATA, malformed, wrong prefix |
| Integration — Orchestrator | `test_pid_validation.py` | Full validation flow, discovery abort, partial support |
| Integration — Report | `test_pid_validation.py` | Report format, support matrix format, raw responses |
| Integration — Bank 2 | `test_pid_validation.py` | Bank 2 unsupported scenario |
| Regression — Existing | `test_vehicle_health_integration.py` | Must pass unchanged (FR-013) |
| Regression — Toyota | `test_toyota_regression.py` | Must pass unchanged (FR-013) |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Discovery failure abort breaks backward compatibility | Low | Medium | Validation is a **separate** function from `read_vehicle_health`. The fallback behavior in `read_vehicle_health` is unchanged. FR-016 only applies to `read_extended_pid_validation`. |
| Extended PID reader pattern divergence from health_pids | Low | Low | Follow exact same pattern: `_send_pid` → prefix check → `_parse_bytes` → formula → `_health_pid_result`. Copy the pattern, not the code. |
| Accidental modification of real Toyota mock profile | Low | High | Use dedicated `extended_pid_validation_profile.py` for testing. Preserve `toyota_real_sample.py` completely unchanged. The Toyota profile is a frozen reference for real-vehicle regression. |
| Profile registry registration breaks existing profiles | Low | Medium | Additive change only — one new lambda in `_PROFILES` dict. No existing entries modified. Run full regression suite to verify. |
| Introducing RuntimeError for discovery failure breaks convention | Low | Low | `RuntimeError` is the agent's existing convention for infrastructure failures (used in `vin.py:100`, `usb_elm327.py:39`, `wifi_elm327.py:179`). No custom exception class introduced. |
| Validation profile values unrealistic | Low | Low | Values are chosen for deterministic decode verification (known hex → known output), not for real-vehicle accuracy. The profile serves testing, not simulation. |

## Rollout Sequence

1. **Phase 1** — Create `extended_pids.py` with reader functions and dicts (no existing files modified)
2. **Phase 2** — Create `pid_validation.py` with orchestrator and report functions (no existing files modified)
3. **Phase 3** — Create `extended_pid_validation_profile.py` + register in `profile_registry.py` (only existing file change: one new lambda in registry)
4. **Phase 4** — Create test files (`test_extended_pids.py`, `test_pid_validation.py`) and verify all pass
5. **Phase 5** — Full regression suite + manual smoke test

Phases 1-2 make zero changes to existing source files. Phase 3 is a single additive line in the profile registry. Phase 4 adds new test files only. `toyota_real_sample.py`, `vehicle_data.py`, `health_pids.py`, and `vehicle_health.py` are never modified.

## Toyota Real-Vehicle Validation Procedure

After all tests pass, run the validation on a real vehicle:

1. Connect ELM327 adapter to the vehicle (USB or WiFi)
2. Start the desktop agent with the real adapter (not mock)
3. Call `read_extended_pid_validation(adapter)` from a Python REPL or test script
4. Capture the console output
5. Verify the support matrix shows expected PID support for the vehicle
6. Compare raw responses with a known OBD-II scan tool if available
7. Record the support matrix for Feature 018B planning

The support matrix output will directly inform which PIDs to include in the full pipeline implementation.