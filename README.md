# PrioraScan — Automotive Diagnostic Intelligence Platform

**From vehicle data and fault codes to structured diagnostic workflows.**

PrioraScan is a full-stack automotive diagnostic platform connecting workshop vehicle records, diagnostic sessions, and live OBD-II communication through a local desktop agent. Its longer-term goal is to turn diagnostic evidence into useful guidance for technicians, service advisors, and workshops.

> **Beyond reading a DTC:** collect diagnostic evidence, preserve vehicle history, and build a foundation for explainable diagnostic assistance.

## What PrioraScan covers

| Area | Capability |
| --- | --- |
| Vehicle management | Vehicle profiles, VIN handling, and diagnostic history |
| Diagnostic sessions | Session lifecycle and association with vehicles |
| OBD connectivity | Local desktop agent for adapter communication |
| Fault codes | DTC reading and structured fault records |
| Vehicle health | Standard OBD-II measurements and readiness information |
| Live data | Standard PID polling and current sensor values |
| Workshop access | Authentication, roles, and organization-scoped data |
| Diagnostic intelligence | Foundation for future AI-assisted interpretation and reporting |

## System architecture

```text
           Technician / Service Advisor
                      |
                Next.js Frontend
                      |
                 NestJS REST API
                      |
          +-----------+-----------+
          |                       |
     PostgreSQL              Scan Jobs
  Vehicles / Sessions     Adapter / Agent State
                                  |
                           Python Desktop Agent
                                  |
                        ELM327 / OBD-II Adapter
                                  |
                            Vehicle ECUs
```

The web application manages workshop-facing workflows. The backend manages records, access control, sessions, and scan-job coordination. The Python desktop agent handles communication with the local diagnostic adapter, keeping hardware access separate from the web and API layers.

## Core workflows

### 1. Vehicle and session management

Register a vehicle, associate it with an organization, and open a diagnostic session. Sessions organize diagnostic activity and support a vehicle-centered history.

### 2. Adapter communication

The local Python agent connects to a supported adapter, reports its status, and handles OBD requests. The platform includes mock-adapter support alongside real-hardware experimentation.

### 3. Diagnostic data collection

Collect supported standard OBD-II values, readiness information, and DTC responses. Store diagnostic results against the relevant vehicle/session rather than treating them as isolated scanner output.

### 4. Diagnostic interpretation — roadmap

The planned intelligence layer will explain faults, suggest possible causes and next tests, and generate technician- and customer-facing reports. These are product goals, **not claims that AI diagnosis is already implemented**.

## Real vehicle testing

The project README documents testing with an **ELM327 Wi-Fi adapter** and **Toyota OBD-II vehicle data**. Reported observations include:

- Engine RPM and vehicle speed
- Coolant temperature and calculated engine load
- Control-module voltage
- Supported PID discovery
- Emissions readiness status
- DTC read responses
- Initial freeze-frame support

Example values recorded during testing:

```text
Engine RPM:             900
Vehicle speed:          0 km/h
Coolant temperature:    86 °C
Engine load:            46.3 %
Control module voltage: 13.417 V
Readiness:              Available
Active DTCs:            None detected
VIN:                    Unsupported by tested vehicle
```

These observations describe a tested adapter/vehicle combination, not universal support across makes, models, ECUs, or adapters.

## Technology stack

| Layer | Technologies |
| --- | --- |
| Frontend | Next.js, TypeScript |
| Backend | NestJS, REST APIs |
| Database | PostgreSQL, Prisma |
| Desktop agent | Python |
| Diagnostics | OBD-II, ELM327, standard PID requests |
| Research | CAN, ISO-TP, UDS, USB-to-CAN experiments |
| Development | Specification-driven documentation and feature planning |

## Engineering highlights

**Hardware/software separation.** A local Python agent owns adapter communication, while the backend exposes application-level diagnostic workflows.

**Session-oriented data model.** Vehicle, session, scan-job, and fault information are linked so diagnostic evidence can be revisited.

**Multi-tenant architecture.** Organization scoping and role-based access are part of the platform's design for workshop use.

**Mock and real adapter paths.** Mock-mode development supports workflow testing without requiring a vehicle for every change; real adapter testing validates actual OBD communication.

**Protocol-aware expansion.** Standard OBD-II support provides a foundation for deeper CAN, ISO-TP, and UDS research without presenting experimental work as production-grade ECU coverage.

**Safety-first diagnostics.** Current exploration prioritizes read-only requests, passive observation, and safe polling rather than ECU programming, coding, or actuator control.

## Repository structure

```text
backend/          NestJS API and diagnostic workflows
frontend/         Next.js workshop and diagnostic UI
desktop-agent/    Python OBD communication agent
specs/            Feature specifications and plans
research/         CAN / ISO-TP / UDS adapter experiments
docs/             Product and system architecture documents
```

## Technical documentation

- [Product Requirements Document](docs/PRD.md)
- [System Analysis & Design](docs/SAD.md)
- [Frontend Architecture](docs/FRONTEND_ARCHITECTURE.md)
- [Vehicle Management Specification](specs/001-vehicle-management/spec.md)
- [Diagnostic Sessions Plan](specs/003-diagnostic-sessions/DIAGNOSTIC_SESSIONS_PLAN.md)

## Current status and roadmap

**Implemented or documented as tested:** vehicle management, authentication foundation, diagnostic sessions, desktop-agent communication, OBD polling, real-adapter readings, fault-code handling, readiness support, and live-data foundations.

**In progress / exploratory:** extended PID coverage, CAN/ISO-TP research, ECU discovery, and deeper UDS capabilities.

**Planned:** AI-assisted fault analysis, professional diagnostic reporting, richer vehicle-specific diagnostic profiles, additional adapters, and PrioraFlow integration.

## Diagnostic safety and limitations

PrioraScan is an engineering project under active development. Standard OBD-II data availability depends on the vehicle, ECU, protocol, and adapter. A successful connection does not imply support for manufacturer-specific systems. Diagnostic suggestions must be verified by qualified technicians before repair decisions.

The project does not claim general-purpose ECU programming or manufacturer-level diagnostic coverage.

---

**PrioraScan aims to bridge diagnostic hardware, structured workshop data, and future AI-assisted reasoning — not simply replicate a fault-code reader.**
