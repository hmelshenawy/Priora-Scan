-- Feature 009: Make LiveDataCommand.liveDataSessionId nullable
-- so that READ_VEHICLE_DATA and CLEAR_DTC commands can exist
-- without an associated LiveDataSession. These commands
-- reference a diagnosticSessionId (stored in payload JSONB)
-- instead of a liveDataSessionId.

ALTER TABLE "LiveDataCommand" ALTER COLUMN "liveDataSessionId" DROP NOT NULL;