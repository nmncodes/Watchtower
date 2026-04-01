-- Set default monitor interval to 10 minutes (600 seconds)
ALTER TABLE "Monitor" ALTER COLUMN "interval" SET DEFAULT 600;

-- Migrate existing monitors still using the old 5-minute default
UPDATE "Monitor"
SET "interval" = 600
WHERE "interval" = 300;
