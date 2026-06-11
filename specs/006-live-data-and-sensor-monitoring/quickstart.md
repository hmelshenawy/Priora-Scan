# Quickstart: Live Data & Sensor Monitoring

**Feature**: 006-live-data-and-sensor-monitoring
**Branch**: `007-live-data-sensor-monitoring`
**Date**: 2026-06-11
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

This quickstart gets a developer from a clean clone to a working Phase A and Phase B local environment.

---

## Prerequisites

- Node.js 20+
- Python 3.11+
- PostgreSQL 15+
- The local reference data files in `backend/data/`:
  - `vpic.sqlite.xz` (~67 MB)
  - `model-pids.sqlite` (~24 KB)
  - `code-descriptions.sqlite` (already present from Feature 005)
- A paired Desktop Agent (Feature 004 setup; the agent is required for Phase B end-to-end testing)

---

## Phase A — VIN Intelligence

### 1. Apply the Phase A migration

```bash
cd backend
npx prisma migrate dev --name 20260611_add_vin_intelligence
```

This adds `Vehicle.engine` and `Vehicle.bodyStyle` columns and creates the `VehicleDecode` table.

### 2. Verify the VPIC asset is present

```bash
ls -la backend/data/vpic.sqlite.xz
```

If missing, restore it from the team's shared storage (see `docs/ops/data-assets.md` or your team lead).

### 3. Start the backend

```bash
cd backend
npm run start:dev
```

On first startup, `VpicAssetService` decompresses `vpic.sqlite.xz` to `backend/data/_runtime/vpic.sqlite`. The runtime file is git-ignored. The service opens the file in read-only mode and shares the connection across the process.

### 4. Smoke-test the endpoint

```bash
TOKEN="<your-jwt>"

# Replace with a real VIN known to the asset
curl -s "http://localhost:3000/vehicles/decode?vin=WDD2130041A123456" \
  -H "Authorization: Bearer $TOKEN" | jq
```

Expected response (illustrative):

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
  "cached": false,
  "source": "vpic.sqlite.xz"
}
```

A second call with the same VIN should have `"cached": true` and respond in < 100 ms.

### 5. Verify the audit record

```bash
psql $DATABASE_URL -c \
  "SELECT action, metadata, createdAt FROM \"DiagnosticSessionAuditRecord\" \
   WHERE action = 'VIN_DECODED_FROM_ASSET' \
   ORDER BY createdAt DESC LIMIT 5;"
```

### 6. UI smoke-test

1. Open the New Vehicle form (`/vehicles/new`).
2. Paste a VIN. Press "Decode VIN".
3. Verify Make/Model/Year/Engine/Body pre-fill.
4. Edit one field, save.
5. Open the same Vehicle in the list — the edited value persists.

### Phase A acceptance — go/no-go checklist

- [ ] `GET /vehicles/decode?vin=...` returns 200 with the expected fields for a known VIN.
- [ ] A second call returns the same payload in < 100 ms.
- [ ] A malformed VIN returns 400 with `INVALID_VIN`.
- [ ] A VIN not in the asset returns 200 with all-null fields.
- [ ] The Vehicle form pre-fills; user edits persist.
- [ ] A `VIN_DECODED_FROM_ASSET` audit record is written on every successful decode.
- [ ] Cross-tenant: a user in tenant A gets the same cached result as a user in tenant B for the same VIN (cache is global).

---

## Phase B — Live Data & Sensor Monitoring

### 1. Apply the Phase B migration

```bash
cd backend
npx prisma migrate dev --name 20260615_add_live_data
```

This creates the `PIDDefinition`, `LiveDataSession`, `LiveDataSnapshot`, `LiveDataReading`, and `LiveDataReadingCurrent` tables, and adds new relations on `DiagnosticSession`.

### 2. Seed the built-in MVP PID set

```bash
cd backend
npm run seed:pid-mvp
```

This inserts the 11 standard OBD-II Mode 01 PIDs in the MVP set. Verify:

```bash
psql $DATABASE_URL -c \
  "SELECT pid, name, unit FROM \"PIDDefinition\" WHERE model = 'STD_OBD2' ORDER BY pid;"
```

Expected: 11 rows.

### 3. Import the `model-pids` asset (first startup is automatic)

The first backend startup auto-imports `backend/data/model-pids.sqlite` into `PIDDefinition`. To trigger the import manually:

```bash
cd backend
npm run seed:pid-definitions
```

Verify:

```bash
psql $DATABASE_URL -c \
  "SELECT model, COUNT(*) FROM \"PIDDefinition\" GROUP BY model;"
```

Expected: 1 row for `STD_OBD2` with count 11; 1 row for `GME` with count 127.

### 4. Build the Desktop Agent

```bash
cd desktop-agent
pip install -e .
```

The agent must be built with the new `obd/commands/pid.py`, `obd/commands/pid_discovery.py`, `obd/poll.py`, and `live_data_client.py` modules. The `command_queue.py` is updated to probe the new `/v2/.../command-queue` endpoint first.

### 5. Start the agent

```bash
desktop-agent --config config/local.yaml
```

The agent registers itself, begins heartbeats, and begins polling the v2 command queue. It is now ready to receive `LIVE_DATA_*` commands.

### 6. Smoke-test: start a live data session from the UI

1. Open the OBD page (`/obd`).
2. Verify the agent shows ONLINE and the adapter shows CONNECTED.
3. Open or create an open Diagnostic Session.
4. Click "Start Live Data" (or navigate to `/sessions/:id/live-data` and press Start).
5. The dashboard should begin showing values for the 11 standard PIDs within 2 seconds.
6. Press "Save Snapshot". Verify a `LiveDataSnapshot` is created and visible on the session detail page.
7. Disconnect the adapter. Verify the dashboard transitions to "Adapter offline" within 5 seconds.

### 7. Smoke-test: agent push endpoint directly

```bash
TOKEN="<agent-token>"
AGENT_ID="<agent-uuid>"

curl -X POST "http://localhost:3000/v2/obd/agents/$AGENT_ID/live-cycles" \
  -H "X-Agent-Token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "commandId": "00000000-0000-0000-0000-000000000000",
    "liveDataSessionId": "<session-uuid>",
    "cycleStartedAt": "2026-06-11T12:34:58.000Z",
    "cycleEndedAt": "2026-06-11T12:34:58.123Z",
    "readings": [
      { "pid": "0C", "rawValue": "12 38", "errorCode": null },
      { "pid": "0D", "rawValue": "00", "errorCode": null }
    ]
  }'
```

### Phase B acceptance — go/no-go checklist

- [ ] Pressing Start on the Live Data dashboard shows fresh values within 2 seconds.
- [ ] Polling continues at the configured cadence (default 1 s).
- [ ] Disconnecting the adapter transitions the dashboard to "Adapter offline" within 5 seconds.
- [ ] A snapshot saved during polling persists and is visible on the session detail page.
- [ ] A 51st snapshot evicts the oldest and writes a `LIVE_DATA_SNAPSHOT_EVICTED` audit.
- [ ] Discovery stores a supported-PID mask; subsequent dashboards label unsupported PIDs as "Not supported" within 2 poll cycles.
- [ ] Feature 004 and Feature 005 flows continue to work; the new endpoints do not break the existing scan flow or the enrichment endpoint.
- [ ] Tenant isolation: a user in tenant A cannot read or modify a `LiveDataSession`/`LiveDataSnapshot` for a `DiagnosticSession` in tenant B.
- [ ] All four `LIVE_DATA_*` audit actions are written and visible in the session's audit history.

---

## Running the tests

### Backend

```bash
cd backend
npm test
```

Coverage: services, repositories, controllers, DTOs. Includes cross-tenant and backward-compat tests.

### Frontend

```bash
cd frontend
npm test                  # component / hook tests
npx playwright test       # E2E
```

### Desktop Agent

```bash
cd desktop-agent
pytest
```

Coverage: `pid.py`, `pid_discovery.py`, `poll.py`, `live_data_client.py`, `command_queue.py`.

---

## Configuration

| Env var | Default | Description |
|---|---|---|
| `LIVE_DATA_SNAPSHOT_CAP` | 50 | Max snapshots per Diagnostic Session |
| `LIVE_DATA_MIN_CADENCE_MS` | 200 | Minimum polling cadence |
| `LIVE_DATA_MAX_CADENCE_MS` | 5000 | Maximum polling cadence |
| `LIVE_DATA_DEFAULT_CADENCE_MS` | 1000 | Default polling cadence |
| `LIVE_DATA_STALE_TIMEOUT_MS` | 30000 | Time without agent activity before a session is marked STALE |
| `VPIC_ASSET_PATH` | `backend/data/vpic.sqlite.xz` | Path to the VPIC asset (override for tests) |
| `VPIC_RUNTIME_PATH` | `backend/data/_runtime/vpic.sqlite` | Path to the decompressed runtime file |
| `MODEL_PIDS_ASSET_PATH` | `backend/data/model-pids.sqlite` | Path to the model-pids asset |

---

## Troubleshooting

### "VPIC_ASSET_UNAVAILABLE" on `/vehicles/decode`

Check:
- `backend/data/vpic.sqlite.xz` is present and readable.
- The user the backend runs as has write access to `backend/data/_runtime/` (decompression target).
- The runtime file (`backend/data/_runtime/vpic.sqlite`) is not locked by another process. If locked, stop the backend, delete the file, and restart.

### Live Data dashboard shows "Adapter offline" immediately after Start

Check:
- The Desktop Agent is online (heartbeat < 60 s old): `GET /obd/agents/:id/status` should return `ONLINE`.
- The agent is connected to the ELM327 adapter: the agent's own log should show a successful ATZ + 0100 sequence.
- The agent can reach the backend at the configured URL: check the agent's log for HTTP errors.

### Polling works but values are wrong / missing

Check:
- The PID is in the MVP set (the standard 11 PIDs).
- The `PIDDefinition` row exists for `(model = 'STD_OBD2', pid = ...)`.
- The `rawValue` from the agent is in the expected format (space-separated hex, e.g., `"12 38"`).
- The `PidDecoderService` is configured to strip the Mode 01 response header (the leading `41` byte) before substitution.

### Snapshot save returns 409 NO_DATA_TO_CAPTURE

The dashboard is asking to capture a snapshot before any poll cycle has completed. Press Start, wait for at least one cycle to display values, then press Save Snapshot.

---

## Operational notes

- The `VpicAssetService` is a process-wide singleton. Multiple workers in a production deployment each open their own read-only connection; this is fine because the file is read-only and SQLite handles concurrent reads natively.
- The `PIDDefinition` asset import is idempotent and runs on first startup. It is safe to restart the backend; the import is a no-op after the first run.
- The 50-snapshot cap is enforced in the service layer. The MVP does not use a database constraint; if you bypass the service (e.g., direct Prisma writes), the cap is not enforced.
- Audit records are immutable. There is no API to delete or update them. Soft archival is by tenant offboarding (existing Feature 001/002 policy).
