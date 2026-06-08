# Data Model: Vehicle Management

**Feature**: Vehicle Management
**Date**: 2026-06-08
**Related**: [spec.md](spec.md), [research.md](research.md)

---

## Entity Overview

```text
Organization
│
├── 1 → Many Vehicle
│
├── 1 → Many VehicleAuditRecord
│
└── 1 → Many User (contextual; not managed by this feature)
```

---

## Prisma Schema

The following models are defined in `backend/prisma/schema.prisma`.

### Vehicle

Represents a physical automobile registered in the workshop system.

```prisma
model Vehicle {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @db.Uuid
  make           String   @db.VarChar(100)
  model          String   @db.VarChar(100)
  year           Int
  vin            String?  @db.VarChar(25)
  plateNumber    String?  @db.VarChar(20)
  createdAt      DateTime @default(now()) @db.Timestamptz(6)
  updatedAt      DateTime @updatedAt @db.Timestamptz(6)

  @@index([organizationId])
  @@index([organizationId, make, model, year, vin, plateNumber])
  @@index([organizationId, createdAt(sort: Desc)])
}
```

### Field Definitions

| Field | Prisma Type | Database Type | Constraints | Description |
|-------|-------------|---------------|-------------|-------------|
| `id` | `String` | `UUID` | PK, auto-generated | Unique vehicle identifier |
| `organizationId` | `String` | `UUID` | NOT NULL, indexed | Tenant boundary |
| `make` | `String` | `VARCHAR(100)` | NOT NULL | Vehicle manufacturer |
| `model` | `String` | `VARCHAR(100)` | NOT NULL | Vehicle model name |
| `year` | `Int` | `INTEGER` | NOT NULL | Model year |
| `vin` | `String?` | `VARCHAR(25)` | NULL | Vehicle Identification Number (optional in MVP) |
| `plateNumber` | `String?` | `VARCHAR(20)` | NULL | License plate number (optional in MVP) |
| `createdAt` | `DateTime` | `TIMESTAMPTZ` | NOT NULL, default NOW() | Record creation timestamp |
| `updatedAt` | `DateTime` | `TIMESTAMPTZ` | NOT NULL, auto-updated | Last modification timestamp |

### Validation Rules (Application Layer)

- `make` and `model` must be non-empty after trimming.
- `year` must be between 1900 and current calendar year + 1.
- `vin`, if present, must match `^[A-Za-z0-9]{3,25}$`.
- `plateNumber`, if present, must be non-empty after trimming and ≤20 characters.

### Business Rules

- BR-VEHICLE-001: Every Vehicle belongs to exactly one Organization.
- BR-VEHICLE-002: Vehicles are visible only to users within the same Organization.
- BR-VEHICLE-003: Duplicate VIN or Plate Number within the same Organization triggers a warning (not a hard constraint in MVP).
- BR-VEHICLE-004: No delete operation is supported in MVP. Vehicle records are immutable except for updates to `make`, `model`, `year`, `vin`, and `plateNumber`.

---

### VehicleAuditRecord

Immutable record of every Vehicle mutation. Generated synchronously with create and update operations.

```prisma
model VehicleAuditRecord {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @db.Uuid
  userId         String   @db.Uuid
  entityId       String   @db.Uuid
  action         String   @db.VarChar(50)
  timestamp      DateTime @default(now()) @db.Timestamptz(6)
  metadata       Json?

  @@index([organizationId])
  @@index([entityId])
  @@index([organizationId, timestamp(sort: Desc)])
}
```

### Field Definitions

| Field | Prisma Type | Database Type | Constraints | Description |
|-------|-------------|---------------|-------------|-------------|
| `id` | `String` | `UUID` | PK, auto-generated | Unique audit record identifier |
| `organizationId` | `String` | `UUID` | NOT NULL, indexed | Tenant boundary |
| `userId` | `String` | `UUID` | NOT NULL | User who performed the action |
| `entityId` | `String` | `UUID` | NOT NULL, indexed | ID of the Vehicle that was mutated |
| `action` | `String` | `VARCHAR(50)` | NOT NULL | Type of mutation (`vehicle:created`, `vehicle:updated`) |
| `timestamp` | `DateTime` | `TIMESTAMPTZ` | NOT NULL, default NOW() | When the action occurred |
| `metadata` | `Json?` | `JSONB` | NULL | Optional snapshot of changed fields (future enhancement) |

### Immutability Guarantee

- No `updatedAt` field — audit records are append-only.
- Application layer must reject any UPDATE or DELETE operations on this table.
- Repository layer enforces write-only access to `VehicleAuditRecord`.

### Business Rules

- BR-AUDIT-001: Every Vehicle creation generates exactly one `vehicle:created` audit record.
- BR-AUDIT-002: Every Vehicle update generates exactly one `vehicle:updated` audit record.
- BR-AUDIT-003: Audit records are written synchronously with the Vehicle mutation. If audit writing fails, the Vehicle mutation MUST also fail (transactional guarantee).
- BR-AUDIT-004: Audit records are tenant-scoped and queryable only within the same Organization.

---

## Multi-Tenancy Enforcement

### Application Layer

1. **Authentication Guard**: Extracts `userId` and `organizationId` from JWT.
2. **Tenant Guard**: Injects `organizationId` into every repository query.
3. **RBAC Guard**: Validates permission against JWT `permissions` array.

### Repository Layer (Prisma)

Every Prisma query on `Vehicle` and `VehicleAuditRecord` MUST include:

```typescript
where: { organizationId: organizationId }
```

No repository method accepts `organizationId` from request body or query parameters. It is always derived from the authenticated user's JWT context.

### Database Layer (Defense in Depth)

PostgreSQL Row-Level Security (RLS) policies can be applied as a secondary safeguard:

```sql
CREATE POLICY vehicle_tenant_isolation ON vehicles
  USING (organization_id = current_setting('app.current_org')::UUID);
```

Application sets `app.current_org` on each connection based on JWT context.

---

## State Transitions

Vehicle has no lifecycle state machine in MVP. It exists from creation onward. The only mutation path is:

```
[Created] → [Updated] (partial, via PATCH)
```

No delete, no archive, no status changes.

---

## Audit Record Generation Flow

```
User submits POST /api/v1/vehicles
  → AuthGuard validates JWT
  → TenantGuard extracts organizationId
  → RbacGuard checks create:vehicle permission
  → VehicleController receives DTO
  → VehicleService.validateAndCreate(dto, orgId, userId)
    → VehicleRepository.create(vehicle) via Prisma
    → VehicleAuditRepository.create(auditRecord) via Prisma
    → Both operations in Prisma $transaction
  → VehicleResponseDto returned
```

Same flow for PATCH, with action = `vehicle:updated`.

---

## Migration Notes

### Prisma Migration Workflow

All database schema changes are managed via Prisma Migrate:

```bash
cd backend
npx prisma migrate dev --name init_vehicle_management
npx prisma generate
```

### Initial Migration

1. Define `Vehicle` and `VehicleAuditRecord` models in `prisma/schema.prisma`.
2. Run `prisma migrate dev` to create the initial migration in `backend/prisma/migrations/`.
3. Run `prisma generate` to generate the Prisma Client types.

### Prisma Client Usage

Repositories inject `PrismaService` (a NestJS-wrapped `PrismaClient`) and use it for all database operations:

```typescript
@Injectable()
export class VehicleRepository {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.VehicleCreateInput) {
    return this.prisma.vehicle.create({ data });
  }
}
```

### Future Migrations (Out of Scope)

- Soft-delete support (when Administration feature implements deletion).
- Vehicle status field (e.g., active, archived).
- Additional vehicle identifiers (internal workshop reference number).
- Normalized make/model lookup table.
