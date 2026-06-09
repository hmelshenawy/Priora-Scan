# Quickstart: OBD Foundation

**Feature**: OBD Foundation (Phase 004)
**Date**: 2026-06-09

---

## Prerequisites

- PostgreSQL 15+ running locally or accessible
- Node.js 20+ and npm
- Python 3.11+ with pip
- An ELM327-compatible OBD-II adapter (USB or Bluetooth)
- A compatible OBD-II vehicle (passenger vehicle, 1996+)

---

## 1. Backend Setup

### Install Dependencies

```bash
cd backend
npm install
```

### Run Database Migrations

```bash
npx prisma migrate dev --name add_obd_foundation
```

### Seed Test Data (Optional)

```bash
npx ts-node scripts/seed-obd-test-data.ts
```

This creates:
- A test vehicle with known VIN
- A test diagnostic session

### Start Backend

```bash
npm run start:dev
```

Backend runs on `http://localhost:3000`.

---

## 2. Frontend Setup

### Install Dependencies

```bash
cd frontend
npm install
```

### Start Frontend

```bash
npm run dev
```

Frontend runs on `http://localhost:3001`.

---

## 3. Desktop Agent Setup

### Create Virtual Environment

```bash
cd desktop-agent
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate
```

### Install Dependencies

```bash
pip install -r requirements.txt
```

Requirements include:
- `pyserial` (USB adapter support)
- `bleak` (Bluetooth adapter support)
- `httpx` (HTTP client)
- `python-dotenv` (configuration)

### Configure Agent

Create `.env`:

```
PRIORASCAN_API_URL=http://localhost:3000
```

### Start Agent

```bash
python -m src.main
```

---

## 4. Pair the Agent

1. Log into the PrioraScan web app (`http://localhost:3001`).
2. Navigate to the OBD page (`/obd`).
3. Click **"Pair Agent"**.
4. Copy the pairing token (e.g., `ABC-123-DEF`).
5. In the Desktop Agent terminal, enter the token when prompted.
6. Agent status in the web app changes to **"Online"**.

---

## 5. Connect Adapter

### USB Adapter

1. Plug the ELM327 adapter into the vehicle's OBD-II port.
2. Connect the USB cable to the computer running the Desktop Agent.
3. The agent auto-detects the serial port and connects.

### Bluetooth Adapter

1. Plug the ELM327 Bluetooth adapter into the vehicle's OBD-II port.
2. In the Desktop Agent, select **"Bluetooth"** mode.
3. Select the adapter from the discovered devices list.
4. The agent pairs and connects.

---

## 6. Start a Scan

1. In the web app, verify the adapter shows **"Connected"**.
2. Click **"Start Scan"**.
3. The scan progresses through:
   - Connecting adapter
   - Reading VIN
   - Resolving vehicle
   - Creating diagnostic session
   - Reading fault codes
   - Importing results
4. If the VIN is unknown, the **Vehicle Confirmation** modal opens. Confirm or edit the details.
5. When complete, the app redirects to the diagnostic session showing imported fault codes.

---

## 7. Verify Results

### Check Database

```sql
SELECT * FROM "ScanJob" WHERE status = 'COMPLETED';
SELECT * FROM "SessionFaultCode" WHERE "scanJobId" = '<scan-job-id>';
```

### Check Audit Records

```sql
SELECT * FROM "ScanJobAuditRecord" WHERE "scanJobId" = '<scan-job-id>';
```

---

## 8. Run Tests

### Backend Tests

```bash
cd backend
npm run test:unit -- obd
npm run test:integration -- obd
```

### Frontend Tests

```bash
cd frontend
npm run test -- obd
```

### Agent Tests

```bash
cd desktop-agent
pytest tests/
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Agent shows "Offline" | Check agent is running. Check `PRIORASCAN_API_URL` is correct. Check firewall. |
| "No adapter found" | Verify adapter is plugged into vehicle OBD-II port. Try different USB port. Ensure Bluetooth is enabled. |
| VIN read fails | Some vehicles don't expose VIN via OBD-II. Use manual vehicle confirmation. |
| Scan fails mid-way | Check adapter connection. Ensure vehicle ignition is ON (not just ACC). Retry. |
| Pairing token expired | Token is valid for 5 minutes. Generate a new one from the web app. |
