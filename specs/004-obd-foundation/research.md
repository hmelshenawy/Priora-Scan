# Research: OBD Foundation

**Date**: 2026-06-09
**Feature**: OBD Foundation (Phase 004)
**Purpose**: Resolve technical unknowns and document architectural decisions before design.

---

## Decision: ELM327 Connection Interfaces

**Decision**: USB and Bluetooth are in scope. Wi-Fi is out of scope for MVP.

**Rationale**:
- USB provides the most reliable, lowest-latency connection and is trivial to test in development.
- Bluetooth is the most common wireless ELM327 use case in workshops (technicians move around the vehicle).
- Wi-Fi adapters require network discovery (mDNS/SSDP), add firewall complexity, and are less common in the target market.

**Alternatives considered**:
- USB only: Rejected — too limiting for real-world workshop use.
- USB + Bluetooth + Wi-Fi: Rejected — adds significant scope without proportional user value for MVP.

---

## Decision: Desktop Agent Authentication Model

**Decision**: Short-lived pairing token from web app.

**Rationale**:
- The user explicitly initiates pairing, creating a clear security boundary.
- No long-lived API keys are stored on the agent disk, reducing breach impact.
- Token exchange happens once; subsequent communication uses an agent access token stored in memory.
- Easy to re-pair if the agent is moved to another user or workstation.

**Alternatives considered**:
- Device registration with persistent API key: Rejected — harder to revoke, creates orphan agents.
- WebSocket session pass-through: Rejected — requires persistent socket infrastructure; overkill for MVP polling.

---

## Decision: Scan Workflow Automation Level

**Decision**: Hybrid — fully automated except when VIN does not match an existing vehicle.

**Rationale**:
- 80%+ of scans will target vehicles already in the tenant; automation speeds the common case.
- Manual confirmation for new vehicles prevents data pollution from VIN misreads or ECU glitches.
- Aligns with the "Backend-Centric Business Logic" principle: the backend orchestrates, the user confirms only at decision points.

**Alternatives considered**:
- Fully automated: Rejected — risk of creating incorrect vehicle profiles silently.
- Step-by-step confirmations: Rejected — too slow; contradicts the goal of completing a scan in under 2 minutes.

---

## Decision: Agent-to-Backend Transport

**Decision**: HTTPS REST with short polling for MVP. WebSocket/SSE deferred.

**Rationale**:
- HTTPS REST is universally supported by all HTTP client libraries (Python `httpx`, `requests`).
- Short polling is simple to implement, debug, and scale horizontally.
- The scan event payload is small; polling every 2 seconds is acceptable for non-real-time scans.
- WebSockets introduce connection state management, reconnection logic, and load balancer sticky-session concerns that are unnecessary for the scan workflow.

**Future path**: WebSocket or SSE can be introduced later for Live Data streaming without changing the event schema.

---

## Decision: Fault Code Storage Model

**Decision**: `SessionFaultCode` directly linked to `DiagnosticSession`. No `MasterFaultCode` in this phase.

**Rationale**:
- The Fault Code Library (Phase 3 on roadmap) will define the master intelligence model. Introducing it now would create premature coupling.
- `SessionFaultCode` is sufficient to store raw scan results: code, status, ECU, source, timestamp.
- Future enrichment can be done via a lookup table without schema migration on `SessionFaultCode`.

---

## Decision: Python Agent Libraries

**Decision**: `pyserial` for USB, `bleak` for Bluetooth.

**Rationale**:
- `pyserial` is the de-facto standard for serial port communication in Python. Cross-platform (Windows, macOS, Linux).
- `bleak` (Bluetooth Low Energy client) is asyncio-native, actively maintained by the `hbldh` org, and supports both BLE and Bluetooth Classic via OS abstraction.
- Alternatives like `pybluez` are less maintained and have platform-specific installation issues.

---

## Decision: Heartbeat and Offline Detection

**Decision**: Heartbeat every 30 seconds; mark offline after 60 seconds of silence.

**Rationale**:
- 30 seconds is frequent enough for responsive UI status updates without excessive server load.
- 60-second offline threshold means 2 missed heartbeats before marking offline — tolerates one transient network blip.
- Agent status is a soft signal, not a critical safety system; brief delays are acceptable.

---

## Decision: Pairing Token Lifetime

**Decision**: 5 minutes.

**Rationale**:
- Long enough for a technician to read the token from the web app and type it into the agent (or copy-paste).
- Short enough that an unclaimed token poses minimal security risk.
- Aligns with common pairing patterns (e.g., TV casting codes, MFA TOTP windows).

---

## Decision: Prisma Transaction Isolation

**Decision**: Default Prisma/PostgreSQL `Serializable` isolation. Retry on `P2034` transaction conflict.

**Rationale**:
- MVP volume is low; serializable isolation is safe and correct.
- `ScanJob` status updates are the primary contention point. Optimistic locking via retry is sufficient.
- No need to downgrade to `ReadCommitted` unless load testing reveals contention at scale.

---

## Decision: Audit Record Immutability

**Decision**: Audit records are append-only. No update or delete endpoints.

**Rationale**:
- Constitutional Principle XI (Auditability) mandates complete, immutable history.
- PostgreSQL row-level security and application-level guards prevent modification.
- If archival is ever needed, an `archivedAt` field on the parent entity is used; audit records remain untouched.

---

## Research Artifacts

- ELM327 AT Command Set Reference: ISO 15765-4 (CAN), ISO 9141-2, ISO 14230-4 (KWP), SAE J1850
- OBD-II Service Modes: Mode 01 (Current Data), Mode 03 (Current DTCs), Mode 07 (Pending DTCs), Mode 09 (Vehicle Info), Mode 0A (Permanent DTCs)
- VIN Read Protocol: Mode 09 PID 02 (Vehicle Identification Number)
