# PrioraScan System Analysis & Design (SAD)

## Version

v1.0

## Status

Draft

## Related Document

PRD.md

---

# 1. System Overview

PrioraScan is an AI-powered automotive diagnostic platform that helps technicians and service advisors convert fault codes and scan reports into actionable diagnostic guidance, recommendations, and professional reports.

The system supports manual fault code entry and scan report uploads during the MVP phase and is designed for future OBD integration.

PrioraScan can operate independently or integrate with PrioraFlow.

---

# 2. System Context

## External Systems

### PrioraFlow

Purpose:

* Receive diagnostic sessions
* Link diagnostics to job cards
* Store vehicle diagnostic history

Communication:

* REST API
* Webhooks

---

### AI Analysis Service

Purpose:

* Fault explanation
* Root cause analysis
* Diagnostic recommendations

Communication:

* Internal AI Service
* Future LLM Integration

---

### File Storage

Purpose:

* Store uploaded scan reports
* Store generated PDFs
* Store images and attachments

Examples:

* S3
* Cloudflare R2
* Local Storage

---

# 3. Actors

## Technician

Permissions:

* Create vehicles
* Create diagnostic sessions
* Enter fault codes
* Upload reports
* Generate reports
* View own scans

---

## Service Advisor

Permissions:

* View diagnostic sessions
* View AI recommendations
* Generate customer reports
* Share reports

---

## Workshop Manager

Permissions:

* View all scans
* View statistics
* Manage users
* Manage workshop settings

---

## System Administrator

Permissions:

* Manage subscriptions
* Manage organizations
* Manage fault code library
* View audit logs

---

## PrioraFlow System

Permissions:

* Receive diagnostic session data
* Synchronize vehicle information

---

# 4. Functional Requirements

## FR-001 Vehicle Management

The system shall allow users to:

* Create vehicle profile
* Edit vehicle profile
* View vehicle profile
* Search vehicles
* View vehicle diagnostic history

---

## FR-002 Diagnostic Sessions

The system shall allow users to:

* Create diagnostic session
* Save diagnostic session
* Edit diagnostic session
* Close diagnostic session
* View session history

---

## FR-003 Manual Fault Entry

The system shall allow technicians to:

* Add one or more fault codes
* Categorize faults
* Add technician observations
* Add customer complaints

---

## FR-004 Scan Report Upload

The system shall allow users to:

* Upload PDF reports
* Upload images
* Upload screenshots

The system shall:

* Store uploaded files
* Extract diagnostic information
* Associate files with sessions

---

## FR-005 AI Diagnostic Analysis

The system shall:

* Explain fault codes
* Suggest possible causes
* Recommend diagnostic steps
* Suggest repair actions

---

## FR-006 Reporting

The system shall:

* Generate diagnostic reports
* Generate customer reports
* Export PDF reports

---

## FR-007 Integrations

The system shall:

* Send session data via API
* Trigger webhooks
* Integrate with PrioraFlow

---

# 5. Use Cases

## UC-01 Create Vehicle

Actor:

Technician

Flow:

1. User selects Create Vehicle
2. User enters vehicle information
3. System validates data
4. System saves vehicle
5. Vehicle profile created

---

## UC-02 Create Diagnostic Session

Actor:

Technician

Flow:

1. Select vehicle
2. Create session
3. Enter mileage
4. Enter symptoms
5. Save session

Result:

Diagnostic session created

---

## UC-03 Add Fault Codes

Actor:

Technician

Flow:

1. Open diagnostic session
2. Enter one or more fault codes
3. Save fault codes
4. System validates codes
5. Session updated

---

## UC-04 Upload Scan Report

Actor:

Technician

Flow:

1. Open session
2. Upload scan report
3. System stores file
4. Session updated

---

## UC-05 Generate AI Analysis

Actor:

Technician

Flow:

1. Open diagnostic session
2. Request AI analysis
3. System analyzes session
4. System returns recommendations

---

## UC-06 Generate Report

Actor:

Technician

Flow:

1. Open session
2. Generate report
3. System creates PDF
4. User downloads report

---

## UC-07 Send to PrioraFlow

Actor:

System

Flow:

1. Session completed
2. User selects Send to PrioraFlow
3. System sends payload
4. PrioraFlow acknowledges receipt

---

# 6. Business Rules

## BR-001

A diagnostic session must belong to a vehicle.

---

## BR-002

A vehicle can have multiple diagnostic sessions.

---

## BR-003

A diagnostic session can contain multiple fault codes.

---

## BR-004

A fault code may appear in multiple sessions.

---

## BR-005

A report cannot be generated without a diagnostic session.

---

## BR-006

Uploaded files must be associated with a diagnostic session.

---

## BR-007

Only authorized users may view organization data.

---

## BR-008

Only workshop managers may manage users.

---

## BR-009

Only administrators may manage subscriptions.

---

# 7. Domain Model

## Organization

Represents workshop or company.

---

## User

Represents technician, advisor, manager, or administrator.

---

## Vehicle

Represents customer vehicle.

---

## DiagnosticSession

Represents a diagnostic activity performed on a vehicle.

---

## FaultCode

Represents known diagnostic fault codes.

---

## SessionFault

Represents fault codes associated with a session.

---

## Attachment

Represents uploaded files.

---

## Analysis

Represents AI-generated recommendations.

---

## Report

Represents generated PDF reports.

---

## Integration

Represents external system connection.

---

# 8. Entity Relationship Model

Organization

1 → Many Users

Organization

1 → Many Vehicles

Vehicle

1 → Many DiagnosticSessions

DiagnosticSession

1 → Many SessionFaults

FaultCode

1 → Many SessionFaults

DiagnosticSession

1 → Many Attachments

DiagnosticSession

1 → One Analysis

DiagnosticSession

1 → Many Reports

Organization

1 → Many Integrations

---

# 9. API Design

## Vehicles

POST /vehicles

GET /vehicles

GET /vehicles/:id

PATCH /vehicles/:id

DELETE /vehicles/:id

---

## Diagnostic Sessions

POST /sessions

GET /sessions

GET /sessions/:id

PATCH /sessions/:id

POST /sessions/:id/close

---

## Fault Codes

POST /sessions/:id/faults

GET /sessions/:id/faults

DELETE /sessions/:id/faults/:faultId

---

## Attachments

POST /sessions/:id/attachments

GET /sessions/:id/attachments

DELETE /attachments/:id

---

## Analysis

POST /sessions/:id/analyze

GET /sessions/:id/analysis

---

## Reports

POST /sessions/:id/report

GET /reports/:id

---

## Integration

POST /integrations/prioraflow/session

POST /webhooks

GET /webhooks

---

# 10. Frontend Modules

## Authentication

* Login
* Logout
* Forgot Password

---

## Dashboard

* Recent Sessions
* Statistics
* Activity Feed

---

## Vehicles

* Vehicle List
* Vehicle Details
* Vehicle History

---

## Diagnostic Sessions

* Session List
* Session Details
* Session Creation

---

## Fault Management

* Add Fault Codes
* View Fault Codes
* Search Fault Codes

---

## Analysis

* AI Recommendations
* Diagnostic Guidance

---

## Reports

* Generate Report
* Download Report

---

## Integrations

* PrioraFlow Connection
* Webhook Management

---

## Administration

* Users
* Roles
* Organization Settings
* Subscription

---

# 11. Non-Functional Requirements

## Security

* JWT Authentication
* Role-Based Access Control
* Audit Logging

---

## Performance

* API response < 500ms
* Dashboard load < 3 seconds

---

## Scalability

* Multi-tenant architecture
* Horizontal API scaling

---

## Reliability

* Daily backups
* File redundancy

---

## Availability

* Target uptime 99.9%

---

# 12. Suggested Technical Architecture

Frontend

* Next.js
* TypeScript
* TailwindCSS
* TanStack Query

Backend

* NestJS
* Prisma ORM
* PostgreSQL

Storage

* S3 / R2

Authentication

* JWT
* Refresh Tokens

AI Layer

* OpenAI / Gemini
* Future custom diagnostic engine

Deployment

* Docker
* VPS / Cloud Infrastructure

---

# 13. Product Roadmap

## Completed

001 Vehicle Management ✅

002 Authentication ✅

003 Diagnostic Sessions ✅

004 OBD Foundation ✅ MVP COMPLETE

## Next

005 Fault Code Intelligence

006 Live Data & Sensor Monitoring

007 AI Analysis

008 Reports

009 PrioraFlow Integration

## Future

010 Freeze Frame Data

011 Graphing & Trend Analysis

012 Service Functions & Special Tests

013 OEM Integrations

014 Coding & Programming
