# Quickstart: ELM327 WiFi Adapter Integration

**Feature**: 010-elm327-wifi-adapter | **Date**: 2026-06-13

## Manual Smoke Test Procedure

### Prerequisites

- WiFi ELM327 OBD-II adapter (e.g., Veepeak, BAFX, or compatible)
- Vehicle with OBD-II port (1996+ US / 2001+ EU)
- Laptop connected to the ELM327 WiFi network
- PrioraScan backend running (`cd backend && npm run start:dev`)
- PrioraScan frontend running (`cd frontend && npm run dev`)

### Step 1: Verify Network Connectivity

```bash
# Connect to the ELM327 WiFi access point
# Default SSID varies by adapter (e.g., "WiFi_OBDII", "V-LINK")

# Verify you can reach the adapter
ping 192.168.0.10

# Verify TCP port is open
nc -zv 192.168.0.10 35000
# Expected: Connection succeeded
```

### Step 2: Configure Desktop Agent

Create or update `.env` in the project root:

```env
# WiFi adapter configuration
OBD_ADAPTER_TYPE=wifi
OBD_WIFI_HOST=192.168.0.10
OBD_WIFI_PORT=35000
OBD_WIFI_TIMEOUT_SECONDS=5

# Agent authentication (from pairing)
AGENT_ID=your-agent-id
AGENT_ACCESS_TOKEN=your-token

# Backend URL
PRIORASCAN_API_URL=http://localhost:3101
```

### Step 3: Start Desktop Agent

```bash
cd desktop-agent
python -m src.main --name "WiFi Agent"
```

**Expected output**:
```
Paired agent: <agent-id>
Connecting to ELM327 at 192.168.0.10:35000...
ELM327 initialized: ELM327 v2.3
Adapter connected: ELM327_WIFI (WIFI)
Heartbeat sent
```

### Step 4: Verify Agent Online in UI

1. Open PrioraScan at http://localhost:3000
2. Navigate to OBD Dashboard
3. Verify agent status shows:
   - Status: **ONLINE** (green)
   - Adapter: **Connected**
   - Adapter Type: **WiFi** (new field)
4. If pairing is needed, use the "Pair Agent" flow with the token shown in terminal

### Step 5: Read Real VIN

1. On the OBD Dashboard, click **Start Scan**
2. The agent will read the VIN from the vehicle via Mode 09 PID 02
3. After the scan completes, verify:
   - The VIN displayed matches the physical VIN plate on the vehicle
   - The scan results show fault codes (or "No fault codes found")
   - A diagnostic session was created automatically

### Step 6: Read Vehicle Health Data

1. Navigate to the Diagnostic Session detail page
2. In the Vehicle Health panel, click **Read Vehicle Data**
3. Verify:
   - Battery Voltage shows a realistic value (e.g., 12.4V)
   - Engine Load, Coolant Temperature show values if engine is running
   - Unsupported PIDs show "Not supported by vehicle / adapter"
   - Supported PID list shows the PIDs the vehicle supports

### Step 7: Start Live Data

1. In the Live Data section, add PIDs (e.g., RPM, Vehicle Speed)
2. Click **Start Session**
3. Verify:
   - RPM updates in near-real-time (if engine is running)
   - Values change as you rev the engine
   - Data is not frozen or stale

### Step 8: Clear Fault Codes (If Applicable)

> ⚠️ Only perform this if you have a vehicle with known DTCs and understand the consequences.

1. In the Control Unit Overview, click **Clear Fault Codes**
2. Read and acknowledge the warning in the confirmation modal
3. Confirm the clear action
4. Verify the result banner shows success or failure
5. Verify the audit trail shows DTC_CLEAR_REQUESTED and DTC_CLEAR_COMPLETED

### Step 9: Verify Mock Mode Still Works

```bash
# Stop the agent, switch to mock mode
OBD_ADAPTER_TYPE=mock python -m src.main --name "Mock Agent"
```

1. Verify the UI shows "Mock Adapter" as the adapter type
2. Verify all existing flows (scan, vehicle health, live data) still work with mock data
3. Verify no errors or crashes

### Step 10: Test Disconnection Handling

1. With WiFi adapter connected, disconnect the ELM327 from WiFi
2. Verify the agent detects the disconnection and logs it
3. Verify the UI shows "WiFi Adapter Disconnected"
4. Reconnect the adapter
5. Verify the agent reconnects and the UI shows "Connected" again

## Rollback

If any step fails, the agent can always fall back to mock mode:

```env
OBD_ADAPTER_TYPE=mock
```

No database changes are made by this feature, so rollback is purely a configuration change.