-- CreateEnum
CREATE TYPE "PriceSource" AS ENUM ('SERVER', 'CLIENT', 'FALLBACK');

-- AlterTable
ALTER TABLE "operations"
  ADD COLUMN "entryPriceSource" "PriceSource" NOT NULL DEFAULT 'CLIENT',
  ADD COLUMN "exitPriceSource"  "PriceSource",
  ADD COLUMN "auditHash"        VARCHAR(64);
