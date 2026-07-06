# PrioraScan

**Intelligent vehicle diagnostic scanner and diagnostic intelligence platform.**

PrioraScan is a diagnostic software platform designed to connect workshop operations with real vehicle diagnostic data. It combines vehicle management, diagnostic sessions, OBD communication, fault code intelligence, live sensor monitoring, and AI-assisted diagnostic reporting.

The goal is not only to read fault codes, but to help technicians, advisors, and workshops understand vehicle health faster and make better diagnostic decisions.

---

## What PrioraScan Does

PrioraScan helps workshops:

* Manage vehicles and diagnostic sessions
* Connect to OBD adapters through a local desktop agent
* Read OBD-II data from supported vehicles
* Capture fault codes, readiness monitors, freeze frame data, and live sensor values
* Decode and structure diagnostic information
* Prepare the foundation for AI-assisted diagnostic analysis and reports

---

## Core Features

### Vehicle Management

* Create and manage customer vehicles
* Store VIN, make, model, year, engine, and body information
* Decode VIN data where supported
* Track diagnostic history per vehicle

### Authentication & Access Control

* Secure login system
* Role-based access control
* Protected workshop/user data

### Diagnostic Sessions

* Open, track, and close diagnostic sessions
* Prevent duplicate active sessions for the same vehicle
* Link scan jobs, fault codes, and live data to a session

### OBD Foundation

* Desktop Agent architecture for adapter communication
* Adapter pairing and heartbeat tracking
* Scan job lifecycle management
* Fault code import pipeline
* Support for mock mode and real adapter testing

### Real Adapter Support

Tested with:

* ELM327 WiFi adapter
* Toyota OBD-II vehicle data
* CAN / USB-to-CAN research adapter experiments

Confirmed real readings include:

* Engine RPM
* Vehicle speed
* Coolant temperature
* Engine load
* Control module voltage
* Supported PID list
* Readiness monitor status
* DTC read response
* Freeze frame foundation

### Fault Code Intelligence

* Stores diagnostic trouble codes
* Supports detected, pending, and cleared status flow
* Prepares fault data for AI analysis and reporting

### Live Data Monitoring

* Reads current sensor values
* Supports standard OBD-II Mode 01 PIDs
* Tracks latest values during a live data session
* Designed for future charting and technician-facing analysis

---

## Architecture

PrioraScan is built as a full-stack diagnostic platform.

### Frontend

* Next.js
* TypeScript
* Diagnostic dashboard
* Vehicle pages
* OBD agent dashboard
* Vehicle health panel
* Live data UI foundation

### Backend

* NestJS
* Prisma ORM
* PostgreSQL
* REST APIs
* Authentication and authorization
* Diagnostic session and scan job services

### Desktop Agent

* Python
* OBD adapter communication
* ELM327 WiFi support
* Mock adapter mode
* PID polling
* Fault code reading
* VIN and health probe handling

---

## Project Structure

```text
priorascan/
├── backend/          # NestJS backend API
├── frontend/         # Next.js frontend application
├── desktop-agent/    # Python local OBD communication agent
├── specs/            # Feature specifications and implementation plans
└── research/         # CAN, UDS, ISO-TP, and adapter experiments
```

---

## Current Development Status

PrioraScan has completed the main foundation features:

* Vehicle Management
* Authentication
* Diagnostic Sessions
* OBD Foundation
* Fault Code Intelligence
* Live Data Foundation
* VIN support handling
* Vehicle Health real adapter integration
* Real DTC read path
* Readiness monitor support
* Freeze frame foundation
* Extended PID validation research

The platform is currently moving toward deeper CAN / UDS exploration and improved diagnostic discovery.

---

## Safety Philosophy

PrioraScan is being developed with a safety-first approach.

Current diagnostic exploration focuses on:

* Read-only OBD requests
* Safe PID polling
* Passive sniffing
* ECU discovery
* ECU identification
* Service capability detection

The project avoids unsafe write operations, coding changes, ECU programming, or actuator commands unless explicitly researched, validated, and isolated.

---

## Example Real Vehicle Results

During real adapter testing, PrioraScan successfully captured values such as:

```text
RPM: 900
Speed: 0 km/h
Coolant Temperature: 86°C
Engine Load: 46.3%
Control Module Voltage: 13.417V
VIN: Unsupported by tested vehicle
Readiness: Available
DTCs: No active codes detected
```

---

## Roadmap

Planned future improvements include:

* Deeper ECU discovery
* UDS service capability detection
* Better vehicle-specific diagnostic profiles
* Diagnostic report generation
* AI-assisted fault analysis
* PrioraFlow integration
* Technician workflow improvements
* More adapter support
* CAN sniffing and ISO-TP analysis tools

---

## Purpose

PrioraScan is built to become more than a scanner.

The long-term vision is a diagnostic intelligence platform that helps workshops understand:

* What is wrong
* Which systems are affected
* What data supports the diagnosis
* What should be checked next
* How to explain the issue clearly to advisors, managers, and customers

---

## License

This project is currently private and under active development.

---

## Author

Built by Haitham Elshenawy as part of the Priora ecosystem:

* PrioraFlow: Workshop operations and priority management
* PrioraScan: Diagnostic intelligence and vehicle health analysis
