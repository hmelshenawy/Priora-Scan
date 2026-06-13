-- Feature 009: Vehicle Health & DTC Clear
-- Add vehicleDataJson and vehicleDataReadAt to DiagnosticSession
-- Add READ_VEHICLE_DATA and CLEAR_DTC to LiveDataCommandType enum

-- AlterTable: DiagnosticSession
ALTER TABLE "DiagnosticSession" ADD COLUMN "vehicleDataJson" JSONB;
ALTER TABLE "DiagnosticSession" ADD COLUMN "vehicleDataReadAt" TIMESTAMPTZ(6);

-- AlterEnum: Add READ_VEHICLE_DATA and CLEAR_DTC to LiveDataCommandType
ALTER TYPE "LiveDataCommandType" ADD VALUE 'READ_VEHICLE_DATA';
ALTER TYPE "LiveDataCommandType" ADD VALUE 'CLEAR_DTC';