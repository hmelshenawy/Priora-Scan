-- Feature 006 Phase B.1 — PID Foundation
-- Adds the global PIDDefinition table (Correction 6: no organizationId,
-- standard OBD-II definitions are identical across tenants).
-- Phase B.2+ will add LiveDataSession, LiveDataSnapshot, LiveDataReadingCurrent.

-- CreateTable
CREATE TABLE "PIDDefinition" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "model" VARCHAR(20) NOT NULL,
    "pid" VARCHAR(8) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "formula" VARCHAR(200) NOT NULL,
    "min" DECIMAL(10,3),
    "max" DECIMAL(10,3),
    "source" VARCHAR(50) NOT NULL DEFAULT 'built-in-mvp',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PIDDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PIDDefinition_model_pid_key" ON "PIDDefinition"("model", "pid");

-- CreateIndex
CREATE INDEX "PIDDefinition_model_idx" ON "PIDDefinition"("model");
