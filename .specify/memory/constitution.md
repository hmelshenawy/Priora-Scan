<!--
SYNC IMPACT REPORT
====================
Version Change: N/A → 1.0.0
Modified Principles: None (initial ratification)
Added Sections: All (initial ratification)
  - Core Principles: I through XV
  - Cross-Cutting Requirements
  - Development Workflow
  - Governance
Removed Sections: None
Templates Requiring Updates:
  - .specify/templates/plan-template.md: ✅ No changes required (generic constitution gate placeholder)
  - .specify/templates/spec-template.md: ✅ No changes required (generic template)
  - .specify/templates/tasks-template.md: ✅ No changes required (generic template)
  - .specify/templates/checklist-template.md: ✅ No changes required (generic template)
  - .specify/templates/commands/*.md: ⚠ Pending (directory does not exist; no command templates to verify)
Follow-up TODOs:
  - TODO(RATIFICATION_DATE): 2026-06-08 used as initial ratification date. Update if project has a prior formal adoption date.
  - docs/FRONTEND_ARCHITECTURE.md filename currently reads "frontend_archetict.md"; consider renaming to match constitution reference.
  - PROJECT_CONTEXT.md and CONVENTIONS.md are referenced by the constitution but do not yet exist in the repository.
-->

# PrioraScan Constitution

## Core Principles

### I. Documentation First

The Product Requirements Document (`docs/PRD.md`), System Analysis & Design (`docs/SAD.md`), and Frontend Architecture (`docs/FRONTEND_ARCHITECTURE.md`) are the single source of truth for product behavior, system structure, and UI design. `PROJECT_CONTEXT.md` and `CONVENTIONS.md` provide project-wide context and coding standards. No feature, task, or code change may contradict documented requirements. If documentation conflicts, clarification must be obtained and the documentation updated before implementation proceeds.

**Rationale**: Documentation-first alignment prevents drift between intent and implementation, ensures all stakeholders share the same understanding, and makes the system comprehensible to future maintainers.

### II. Design Before Implementation

Architecture and design decisions must be proposed, reviewed, and accepted before any implementation code is written. The mandatory progression is: Requirements → Analysis → Design → Implementation. Skipping design review to accelerate coding is prohibited.

**Rationale**: Early design review reduces costly rework, surfaces integration risks while they are still cheap to fix, and ensures that implementation choices are intentional rather than accidental.

### III. Layered Architecture

The system enforces strict separation of concerns across four layers:

- **Controller** = HTTP only. Handles request routing, response formatting, and status codes. No business logic.
- **Service** = Business logic only. Contains domain rules, orchestration, and transformations. No direct HTTP or database concerns.
- **Repository** = Database access only. Executes queries and persists entities. No business rules.
- **DTOs** = Validated contracts. Define request and response shapes with strict validation.

Cross-layer leakage is prohibited. A layer may only call the layer directly beneath it.

**Rationale**: Clear boundaries make units independently testable, allow layers to be replaced without cascading changes, and prevent the tight coupling that turns small changes into large refactors.

### IV. Modular Development

Each task or work item addresses exactly one feature or module. Modifications that cross module boundaries are forbidden unless explicitly required by the specification and justified in the design review. Modules must expose narrow, well-defined interfaces. Internal implementation details must not be visible to other modules.

**Rationale**: Modularity enables parallel development, limits the blast radius of defects, and keeps cognitive load low by allowing a developer to reason about one bounded area at a time.

### V. Code Quality

All code must adhere to the following non-negotiable standards:

- Small files: each file has a single, clear responsibility.
- Small functions: each function does one thing and does it well.
- No duplicate logic: shared behavior is extracted into reusable utilities or services.
- No unused code: dead code is removed rather than commented out.
- No hardcoded values: configuration belongs in environment variables or configuration files.
- Error handling required: every operation that can fail must have an explicit error path.
- No file exceeds 300 lines
- No function exceeds 30 lines

**Rationale**: Clean code is safer to change, easier to review, and cheaper to maintain over the lifetime of the product.

### VI. Multi-Tenant First

Organization-level data isolation is mandatory. Every business entity must carry a tenant identifier and every database query must be scoped to the requesting organization. Shared data (such as global fault code libraries) is read-only to tenants; tenant-specific data is strictly separated. Multi-tenancy is not an afterthought—it is the default assumption for all new features.

**Rationale**: PrioraScan is a SaaS platform serving multiple workshops. A single data leak between tenants would be catastrophic to trust and legal compliance.

### VII. API First

All core functionality must be exposed through versioned REST APIs. The frontend consumes these APIs and must not embed business logic, direct database access, or server-side orchestration. Any capability available in the UI must also be callable by an API client with the same authorization boundaries.

**Rationale**: API-first design enables headless integrations, third-party tools, mobile applications, and future partner connections without rewriting backend logic.

### VIII. Scan Source Agnostic

The system must support multiple diagnostic input sources without privileging any single vendor or protocol. The minimum viable product supports manual fault code entry and diagnostic scan report uploads. Future phases will add USB OBD, Bluetooth OBD, mobile application feeds, and OEM integrations. Every source, regardless of origin, maps into a common Diagnostic Session model so that downstream analysis, reporting, and history are source-agnostic.

**Rationale**: Workshops use many scan tools. Tying the product to one source would exclude the majority of users. A unified model ensures consistent behavior across all input methods.

### IX. AI Assists, Never Decides

Artificial intelligence provides recommendations, explanations, and guidance only. Human technicians retain full responsibility for diagnosis, repair decisions, and customer communication. All AI-generated outputs must include explainable reasoning or confidence indicators. The system must never present an AI recommendation as a definitive fact without human confirmation.

**Rationale**: Automotive repair carries safety, liability, and regulatory implications. Transparent AI output builds technician trust and ensures accountability remains with the qualified human operator.

### X. Standalone First

PrioraScan must operate as an independent, self-contained product. Integration with PrioraFlow is optional and additive. Core diagnostic workflows—session creation, fault code analysis, report generation, and history viewing—must function completely without PrioraFlow connectivity or data. No core feature may depend on a PrioraFlow API being available.

**Rationale**: Requiring an external system for basic operation creates a hard dependency that limits market reach and introduces failure modes outside the team's control.

### XI. Auditability

The system must preserve a complete, immutable history of diagnostic activity. Every diagnostic session, AI recommendation, technician action, and generated report must be traceable to a user, timestamp, and tenant. Deletion of diagnostic history is prohibited; only soft archival or anonymization per policy is permitted.

**Rationale**: Diagnostic records are valuable for warranty claims, regulatory compliance, technician training, and customer disputes. Incomplete history erodes trust and legal defensibility.

### XII. Security By Default

Security is not optional. Every endpoint, page, and operation must enforce:

- **Authentication**: identity verification is required for all access.
- **Authorization**: role and permission checks are required before executing any action.
- **Tenant Isolation**: data boundaries are enforced at the API, service, and repository layers.
- **Secure File Handling**: uploaded scan reports and generated PDFs are scanned, stored with restricted access, and served with appropriate content validation.

**Rationale**: Automotive data is sensitive. A security breach exposing customer vehicles, VINs, or diagnostic history would damage the brand and may violate data protection regulations.

### XIII. Progressive Hardware Integration

Hardware connectivity is delivered in a fixed, sequential order:

1. Manual entry
2. Scan report upload
3. USB OBD
4. Bluetooth OBD
5. OEM integrations

Business workflows and the user interface must not assume or depend on the availability of any hardware source. The system must gracefully degrade to manual entry when hardware is absent.

**Rationale**: Hardware development is slower and more variable than software. Delivering software value first ensures users benefit immediately while hardware capabilities are added over time.

### XIV. Git & Change Safety

All development occurs on feature or task branches. The `main` branch is protected and changes reach it only through reviewed merge requests. Breaking changes to public APIs, database schemas, or frontend contracts require explicit written approval and a migration plan. Existing public contracts should not change without documented justification.

**Rationale**: Protected mainlines prevent production incidents, enforce review discipline, and give the team confidence to release frequently.

### XV. Simplicity Over Complexity

PrioraScan is a diagnostic assistant. It is explicitly not a Dealer Management System, ERP, accounting platform, inventory system, or general workshop management system. Every feature must directly support a diagnostic workflow: entering or uploading scan data, analyzing fault codes, guiding repair decisions, or generating reports. Features that serve adjacent business concerns are out of scope unless they materially improve the diagnostic process.

**Rationale**: Scope creep is the primary killer of focused products. Maintaining a narrow mission delivers value faster, keeps the user interface comprehensible, and prevents the team from competing with established DMS vendors.

## Cross-Cutting Requirements

### Documentation Alignment

All specifications, plans, and tasks must reference the governing documents:

- `docs/PRD.md` for product requirements
- `docs/SAD.md` for system architecture and design constraints
- `docs/FRONTEND_ARCHITECTURE.md` for UI and frontend decisions
- `PROJECT_CONTEXT.md` for project-wide context and assumptions
- `CONVENTIONS.md` for coding and naming conventions

If a required document does not exist for a given topic, it must be created before implementation proceeds.

### Technology Stack Adherence

The approved frontend stack is Next.js, TypeScript, TailwindCSS, shadcn/ui, TanStack Query, React Hook Form, Zod, and Axios. Backend stack decisions must align with `docs/SAD.md`. Deviations require design review and documentation update.

## Development Workflow

### Analysis Gate

Before any specification is approved:

- Entity exists in SAD
- Business rule exists in SAD
- Actor exists in SAD
- Use case exists in SAD

If not, analysis must be updated first.

### Specification-Driven Work

Every feature begins with a specification that defines user stories, acceptance criteria, functional requirements, and success criteria. No implementation task may be generated without a linked specification.

### Branching and Delivery

- Create a feature branch for each specification.
- Foundational infrastructure tasks complete before user story implementation begins.
- User stories are implemented and validated independently.
- Merge only after review and compliance with the Constitution Check gates.

### Constitution Check Gates

Before implementation planning and again before coding begins, the team must verify:

- [ ] The feature does not contradict `docs/PRD.md`, `docs/SAD.md`, or `docs/FRONTEND_ARCHITECTURE.md`
- [ ] Multi-tenant boundaries are defined for all new entities
- [ ] API contracts are specified before backend implementation
- [ ] AI features include explainability and human-confirmation requirements
- [ ] No PrioraFlow dependency is introduced for core workflows
- [ ] Error handling and audit logging are included in the design

## Governance

### Supremacy

This constitution supersedes all other development practices, style guides, and team habits when a conflict arises. If a team convention contradicts a constitutional principle, the principle wins and the convention must be updated.

### Amendment Procedure

1. **Proposal**: Amendments are proposed in writing, referencing the principle(s) affected and the rationale for change.
2. **Impact Analysis**: The proposal must identify all dependent documents (`docs/PRD.md`, `docs/SAD.md`, templates, specifications) that require synchronization.
3. **Review**: The proposal is reviewed against the project's mission, existing principles, and downstream impact.
4. **Approval**: Amendments require explicit approval before taking effect.
5. **Propagation**: Approved amendments trigger updates to all linked templates and active specifications.

### Versioning Policy

Constitution versions follow semantic versioning:

- **MAJOR**: Backward-incompatible governance changes, principle removals, or redefinitions that alter compliance obligations.
- **MINOR**: New principles or sections added, or materially expanded guidance that creates new compliance obligations.
- **PATCH**: Clarifications, wording improvements, typo fixes, or non-semantic refinements that do not change compliance obligations.

# New Principle: Domain-Driven Implementation

All implementation must originate from documented analysis.

Development order:

PRD
→ SAD
→ Specification
→ Tasks
→ Implementation

Entities, APIs, permissions, workflows, and UI screens must be traceable to the SAD.

If a required entity, workflow, or business rule does not exist in the SAD, the SAD must be updated before implementation proceeds.

The AI must not invent:
- Database tables
- API endpoints
- User roles
- Permissions
- Business workflows

without documented approval.

## Technology Stack Adherence

Architecture Source of Truth

Backend architecture is governed by docs/SAD.md.

Frontend architecture is governed by docs/FRONTEND_ARCHITECTURE.md.

Generated code must follow documented module boundaries, naming conventions, routes, and responsibilities.

Implementation must not redefine architecture that already exists in documentation.

### Compliance Review

All implementation plans, specifications, and generated tasks must reference the specific constitutional principles they are designed to satisfy. During review, reviewers verify that the referenced principles are actually met by the proposed design or code.

**Version**: 1.0.0 | **Ratified**: 2026-06-08 | **Last Amended**: 2026-06-08
