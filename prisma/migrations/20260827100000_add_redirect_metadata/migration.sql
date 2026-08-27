ALTER TABLE "Check"
  ADD COLUMN "redirectStatus" INTEGER,
  ADD COLUMN "finalUrl" TEXT;

ALTER TABLE "CheckRegionResult"
  ADD COLUMN "redirectStatus" INTEGER,
  ADD COLUMN "finalUrl" TEXT;
