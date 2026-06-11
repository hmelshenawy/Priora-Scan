-- Feature 006 Phase B.1 correction — split PID namespace from OBD mode.
-- `namespace` identifies the PID family/source (STD_OBD2, GME).
-- `mode` identifies the OBD service/mode (01, 22).

ALTER TABLE "PIDDefinition"
  ADD COLUMN "namespace" VARCHAR(20),
  ADD COLUMN "mode" VARCHAR(2);

UPDATE "PIDDefinition"
SET
  "namespace" = "model",
  "mode" = CASE
    WHEN "model" = 'GME' OR "pid" LIKE '22%' THEN '22'
    ELSE '01'
  END;

ALTER TABLE "PIDDefinition"
  ALTER COLUMN "namespace" SET NOT NULL,
  ALTER COLUMN "mode" SET NOT NULL;

DROP INDEX IF EXISTS "PIDDefinition_model_pid_key";
DROP INDEX IF EXISTS "PIDDefinition_model_idx";

ALTER TABLE "PIDDefinition"
  DROP COLUMN "model";

CREATE UNIQUE INDEX "PIDDefinition_namespace_mode_pid_key"
  ON "PIDDefinition"("namespace", "mode", "pid");

CREATE INDEX "PIDDefinition_mode_idx" ON "PIDDefinition"("mode");
CREATE INDEX "PIDDefinition_namespace_idx" ON "PIDDefinition"("namespace");
