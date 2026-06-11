# Contract: VIN Decode

**Service**: PrioraScan Backend
**Auth**: JWT (existing user session)
**Permission**: Inherits the existing DiagnosticSession read policy; no new permission is required.
**Source spec**: [spec.md](../spec.md) FR-001 … FR-005
**Source plan**: [plan.md §3](../plan.md)

---

## `GET /vehicles/decode`

Decodes a 17-character VIN against the local VPIC asset and returns a `VehicleDecode` payload. On a cache miss, queries the asset and writes a `VehicleDecode` row. On a cache hit, returns the cached row.

### Request

| Query | Type | Required | Description |
|---|---|---|---|
| `vin` | string | yes | The 17-character VIN, ISO 3779 (no I, O, Q). Case-insensitive; the backend uppercases before lookup. |

### Response — 200 OK (success)

```json
{
  "vin": "WDD2130041A123456",
  "make": "Mercedes-Benz",
  "model": "E 300",
  "year": 2021,
  "engine": "2.0L L4 Turbo",
  "bodyStyle": "Sedan",
  "manufacturer": "Daimler AG",
  "decodedAt": "2026-06-11T12:34:56.789Z",
  "cached": true,
  "source": "vpic.sqlite.xz"
}
```

| Field | Type | Description |
|---|---|---|
| `vin` | string | The VIN (uppercased) |
| `make` | string \| null | Decoded Make |
| `model` | string \| null | Decoded Model |
| `year` | integer \| null | Decoded Model Year |
| `engine` | string \| null | Decoded Engine Configuration |
| `bodyStyle` | string \| null | Decoded Body Style |
| `manufacturer` | string \| null | Decoded Manufacturer |
| `decodedAt` | string (ISO 8601) | When the decode was first performed |
| `cached` | boolean | `true` if served from the `VehicleDecode` cache; `false` if freshly decoded |
| `source` | string | Asset identifier (e.g., `'vpic.sqlite.xz'`) |

### Response — 200 OK (VIN not in asset)

```json
{
  "vin": "INVALIDVIN0000",
  "make": null,
  "model": null,
  "year": null,
  "engine": null,
  "bodyStyle": null,
  "manufacturer": null,
  "decodedAt": "2026-06-11T12:34:56.789Z",
  "cached": false,
  "source": "vpic.sqlite.xz"
}
```

The endpoint returns 200 with all-null fields when the VIN is not in the asset. The caller treats this as "no pre-fill available".

### Response — 400 Bad Request (malformed VIN)

```json
{
  "code": "INVALID_VIN",
  "message": "VIN must be 17 characters matching [A-HJ-NPR-Z0-9].",
  "details": { "vin": "WDD2130041" }
}
```

### Response — 401 Unauthorized (no token / expired token)

```json
{
  "code": "UNAUTHORIZED",
  "message": "Authentication required."
}
```

### Response — 503 Service Unavailable (asset failure)

```json
{
  "code": "VPIC_ASSET_UNAVAILABLE",
  "message": "The local vehicle database is currently unavailable. Please try again or enter details manually."
}
```

### Side Effects

- On a successful decode (cache miss → asset → cache write), a `DiagnosticSessionAuditRecord` with `action: 'VIN_DECODED_FROM_ASSET'` is written, scoped to the caller's `organizationId` and including `metadata.vin`, `metadata.cached: false`, and `metadata.make/model/year`.
- On a cache hit, a `DiagnosticSessionAuditRecord` with `action: 'VIN_DECODED_FROM_ASSET'` is also written with `metadata.cached: true`.

### Performance Targets

- Cache hit: p95 < 100 ms.
- Cache miss: p95 < 1 s (asset lookup + cache write + audit).

### Idempotency

The endpoint is idempotent. Repeated calls with the same VIN return the same payload (the `cached` field changes from `false` to `true` after the first call, but the rest of the payload is identical).

### Example

```bash
curl -X GET \
  'https://api.priorascan.local/vehicles/decode?vin=WDD2130041A123456' \
  -H 'Authorization: Bearer <jwt>'
```
