<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:

`specs/002-authentication-v1/plan.md`

# PrioraScan AI Agent Instructions

## Mandatory Reading Order

Before performing any task, always review the following documents:

1. Constitution
2. docs/PRD.md
3. docs/SAD.md
4. docs/FRONTEND_ARCHITECTURE.md
5. PROJECT_CONTEXT.md
6. CONVENTIONS.md

These documents are the source of truth.

Never implement anything that contradicts them.

---

## Development Workflow

The project follows a strict Specification-Driven Development process.

Required sequence:

Constitution
→ PRD
→ SAD
→ Frontend Architecture
→ Feature Specification
→ Tasks
→ Implementation

Never skip steps.

Never generate implementation before an approved feature specification exists.

---

## Analysis First

Before implementing any feature:

1. Verify the feature exists in the PRD.
2. Verify the workflow exists in the SAD.
3. Verify the UI exists in FRONTEND_ARCHITECTURE.md.
4. Verify the entity exists in the domain model.

If any item is missing:

STOP.

Request documentation updates before implementation.

Do not invent:

* Database tables
* API endpoints
* Roles
* Permissions
* Business rules
* UI screens

without documentation approval.

---

## Module Scope Control

Only work on one feature/module at a time.

Do not modify unrelated modules.

Do not perform opportunistic refactoring.

Do not redesign architecture during implementation.

---

## Architecture Rules

Controller:

* HTTP only
* No business logic

Service:

* Business logic only
* No database queries

Repository:

* Database access only

DTO:

* Validation only

Maintain strict separation of concerns.

---

## Multi-Tenant Requirements

All business entities must respect organization boundaries.

All queries must be tenant scoped.

Cross-tenant access is prohibited.

---

## API First

Backend capabilities must be exposed through APIs.

Frontend consumes APIs.

Business logic must never live only in frontend components.

---

## Change Safety

Never modify existing public contracts without approval.

Never rename entities without approval.

Never change function signatures without approval.

Explain architectural impact before making breaking changes.

---

## Git Rules

Work only on development branches.

Never touch main.

Suggest git commands only.

Human executes git commands.

Never commit automatically.

---

## Current Development Roadmap

Feature order:

1. Vehicle Management
2. Diagnostic Sessions
3. Fault Code Library
4. AI Analysis
5. Reports
6. PrioraFlow Integration

Do not jump ahead to future modules unless explicitly instructed.

Always complete the current feature before starting the next.

---

## If Uncertain

Do not assume.

Ask for clarification.

Prefer stopping over guessing.


<!-- SPECKIT END -->
