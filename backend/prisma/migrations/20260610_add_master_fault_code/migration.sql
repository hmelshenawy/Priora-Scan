-- CreateEnum
CREATE TYPE "FaultSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "FaultCodeSystem" AS ENUM ('POWERTRAIN', 'BODY', 'CHASSIS', 'NETWORK', 'UNKNOWN');

-- CreateTable
CREATE TABLE "MasterFaultCode" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(10) NOT NULL,
    "title" VARCHAR(500),
    "description" VARCHAR(2000),
    "system" "FaultCodeSystem" NOT NULL DEFAULT 'UNKNOWN',
    "severity" "FaultSeverity" NOT NULL DEFAULT 'UNKNOWN',
    "commonCauses" JSONB,
    "recommendedChecks" JSONB,
    "source" VARCHAR(50) NOT NULL,
    "manufacturer" VARCHAR(100),
    "isGeneric" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "MasterFaultCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MasterFaultCode_code_key" ON "MasterFaultCode"("code");

-- CreateIndex
CREATE INDEX "MasterFaultCode_code_idx" ON "MasterFaultCode"("code");
