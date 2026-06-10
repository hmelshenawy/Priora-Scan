# PrioraScan Product Roadmap (Updated)

## Completed

### 001 Vehicle Management ✅

* Vehicle records
* VIN management
* Vehicle lookup

### 002 Authentication ✅

* Authentication
* RBAC
* Tenant isolation

### 003 Diagnostic Sessions ✅

* Session creation
* Session management
* Session history

### 004 OBD Foundation ✅

* Desktop Agent
* Pairing
* Heartbeat
* VIN read
* Fault code read
* Vehicle confirmation
* Session creation
* Fault code import
* OBD Dashboard

---

## Next Phase

### 005 Fault Code Intelligence

Purpose:

Transform raw fault codes into diagnostic knowledge.

Features:

* MasterFaultCode database
* Generic OBD-II fault library
* Fault code descriptions
* Severity classification
* Common causes
* Recommended diagnostic checks
* SessionFaultCode ↔ MasterFaultCode linking
* Fault detail UI

Output Example:

P0301

* Cylinder 1 Misfire Detected
* Severity: Medium
* Common Causes
* Recommended Checks

---

### 006 Live Data & Sensor Monitoring

Purpose:

Read and visualize live ECU sensor values.

Features:

* PID discovery
* Live PID polling
* RPM
* Coolant temperature
* Battery voltage
* Vehicle speed
* Throttle position
* Fuel trims
* O2 sensors
* MAF/MAP values
* Sensor dashboard
* PID decoding using model-pids database

Output Example:

RPM: 750
Coolant Temp: 92°C
Fuel Trim: +18%
Battery Voltage: 13.8V

---

### 007 AI Analysis

Purpose:

Provide intelligent diagnostic guidance.

Inputs:

* Fault codes
* Live data
* Vehicle information
* Mileage
* Customer complaint

Outputs:

* Probable root causes
* Confidence score
* Recommended next diagnostic action
* Technician guidance

---

### 008 Reports

Purpose:

Generate customer-facing and technician-facing reports.

Features:

* Diagnostic reports
* Fault summaries
* AI findings
* PDF export
* Shareable links

---

### 009 PrioraFlow Integration

Purpose:

Connect diagnostics with workshop operations.

Features:

* Diagnostic session sync
* Job card integration
* Approval workflows
* Workshop insights
* Repair recommendations inside PrioraFlow

---

## Future Advanced Diagnostics

### 010 Freeze Frame Data

### 011 Graphing & Trend Analysis

### 012 Service Functions & Special Tests

### 013 OEM Integrations

### 014 Coding & Programming (Long-Term)
