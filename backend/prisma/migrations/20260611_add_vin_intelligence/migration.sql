-- Feature 006 Phase A — Vehicle Intelligence
-- Adds Vehicle.engine / Vehicle.bodyStyle, and the global VehicleDecode
-- cache table (Correction 6: vin UNIQUE, no organizationId).

-- AlterTable
ALTER TABLE "Vehicle"
  ADD COLUMN "engine" VARCHAR(100),
  ADD COLUMN "bodyStyle" VARCHAR(100);

-- CreateTable
CREATE TABLE "VehicleDecode" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vin" VARCHAR(25) NOT NULL,
    "make" VARCHAR(100),
    "model" VARCHAR(100),
    "year" INTEGER,
    "engine" VARCHAR(100),
    "bodyStyle" VARCHAR(100),
    "manufacturer" VARCHAR(100),
    "source" VARCHAR(50) NOT NULL DEFAULT 'vpic-asset',
    "decodedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "VehicleDecode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VehicleDecode_vin_key" ON "VehicleDecode"("vin");

-- CreateIndex
CREATE INDEX "VehicleDecode_vin_idx" ON "VehicleDecode"("vin");
