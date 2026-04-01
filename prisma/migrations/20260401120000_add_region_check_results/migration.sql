-- CreateEnum
CREATE TYPE "ProbeErrorType" AS ENUM ('NONE', 'TIMEOUT', 'DNS', 'TLS', 'CONNECT', 'HTTP', 'UNKNOWN');

-- CreateTable
CREATE TABLE "CheckRegionResult" (
    "id" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "status" "CheckStatus" NOT NULL,
    "responseTime" INTEGER NOT NULL,
    "code" INTEGER,
    "errorType" "ProbeErrorType" NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckRegionResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CheckRegionResult_checkId_idx" ON "CheckRegionResult"("checkId");

-- CreateIndex
CREATE INDEX "CheckRegionResult_region_createdAt_idx" ON "CheckRegionResult"("region", "createdAt");

-- AddForeignKey
ALTER TABLE "CheckRegionResult" ADD CONSTRAINT "CheckRegionResult_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "Check"("id") ON DELETE CASCADE ON UPDATE CASCADE;
