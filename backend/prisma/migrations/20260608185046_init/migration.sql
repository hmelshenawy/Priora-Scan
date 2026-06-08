-- CreateTable
CREATE TABLE "Vehicle" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "make" VARCHAR(100) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "year" INTEGER NOT NULL,
    "vin" VARCHAR(25),
    "plateNumber" VARCHAR(20),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleAuditRecord" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "entityId" UUID NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "VehicleAuditRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vehicle_organizationId_idx" ON "Vehicle"("organizationId");

-- CreateIndex
CREATE INDEX "Vehicle_organizationId_make_model_year_vin_plateNumber_idx" ON "Vehicle"("organizationId", "make", "model", "year", "vin", "plateNumber");

-- CreateIndex
CREATE INDEX "Vehicle_organizationId_createdAt_idx" ON "Vehicle"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "VehicleAuditRecord_organizationId_idx" ON "VehicleAuditRecord"("organizationId");

-- CreateIndex
CREATE INDEX "VehicleAuditRecord_entityId_idx" ON "VehicleAuditRecord"("entityId");

-- CreateIndex
CREATE INDEX "VehicleAuditRecord_organizationId_timestamp_idx" ON "VehicleAuditRecord"("organizationId", "timestamp" DESC);
