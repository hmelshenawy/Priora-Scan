# SAD Addendum 001 – Desktop Agent Architecture

Date: 2026-06-09

## Purpose

This addendum introduces the planned Desktop Agent architecture required for OBD communication.

## Architectural Decision

PrioraScan remains a Modular Monolith.

Core Platform:

* Next.js Frontend
* NestJS Backend
* Prisma
* PostgreSQL

The Desktop Agent is an external component and not part of the monolith.

## Future Architecture

Technician Laptop

├── PrioraScan Web Application
├── PrioraScan Desktop Agent
└── OBD Adapter

Data Flow

OBD Adapter
→ Desktop Agent
→ NestJS API
→ PostgreSQL

## Desktop Agent Responsibilities

* Adapter discovery
* Connection management
* VIN retrieval
* Fault code retrieval
* Future live-data streaming
* Future protocol abstraction

## Backend Responsibilities

* Session creation
* Tenant isolation
* RBAC enforcement
* Audit logging
* Diagnostic data storage
* AI workflows
* Report generation

## Design Principle

The Desktop Agent is responsible only for vehicle communication.

Business logic remains exclusively in the backend according to the Backend-Centric Business Logic principle defined in the Constitution.
