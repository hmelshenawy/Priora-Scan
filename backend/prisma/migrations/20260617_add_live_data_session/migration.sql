-- Feature 006 Phase B.2 — Live Data thin vertical slice
-- Adds the LiveDataSession + LiveDataCommand tables and the
-- LiveDataSessionStatus / LiveDataCommandType enums.
-- Per Correction 1: LiveDataSession belongs to DiagnosticSession.
-- Per Phase B.2 scope: Latest values are stored as JSONB on the
-- session; a separate LiveDataReading / LiveDataSnapshot table is NOT
-- created here — that work belongs to Phase B.3 (snapshots).

-- CreateEnum
CREATE TYPE "LiveDataSessionStatus" AS ENUM ('ACTIVE', 'STOPPED', 'STALE');

-- CreateEnum
CREATE TYPE "LiveDataCommandType" AS ENUM ('LIVE_DATA_POLL', 'LIVE_DATA_STOP');

-- CreateTable
CREATE TABLE "LiveDataSession" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "diagnosticSessionId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "status" "LiveDataSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "cadenceMs" INTEGER NOT NULL DEFAULT 1000,
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMPTZ(6),
    "lastActivityAt" TIMESTAMPTZ(6),
    "latestValues" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "LiveDataSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveDataCommand" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "liveDataSessionId" UUID NOT NULL,
    "commandType" "LiveDataCommandType" NOT NULL,
    "payload" JSONB,
    "consumedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveDataCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiveDataSession_organizationId_idx" ON "LiveDataSession"("organizationId");

-- CreateIndex
CREATE INDEX "LiveDataSession_diagnosticSessionId_idx" ON "LiveDataSession"("diagnosticSessionId");

-- CreateIndex
CREATE INDEX "LiveDataSession_agentId_status_idx" ON "LiveDataSession"("agentId", "status");

-- CreateIndex
CREATE INDEX "LiveDataSession_organizationId_status_idx" ON "LiveDataSession"("organizationId", "status");

-- CreateIndex
CREATE INDEX "LiveDataCommand_agentId_consumedAt_idx" ON "LiveDataCommand"("agentId", "consumedAt");

-- CreateIndex
CREATE INDEX "LiveDataCommand_liveDataSessionId_idx" ON "LiveDataCommand"("liveDataSessionId");

-- CreateIndex
CREATE INDEX "LiveDataCommand_organizationId_idx" ON "LiveDataCommand"("organizationId");

-- AddForeignKey
ALTER TABLE "LiveDataSession" ADD CONSTRAINT "LiveDataSession_diagnosticSessionId_fkey" FOREIGN KEY ("diagnosticSessionId") REFERENCES "DiagnosticSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveDataCommand" ADD CONSTRAINT "LiveDataCommand_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "DesktopAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
