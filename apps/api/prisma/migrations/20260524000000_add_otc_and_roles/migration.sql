-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "OtcAssetStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE "otc_assets" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "basePrice" DECIMAL(18,5) NOT NULL,
    "volatility" DECIMAL(8,6) NOT NULL DEFAULT 0.0010,
    "trend" DECIMAL(8,6) NOT NULL DEFAULT 0,
    "payout" INTEGER NOT NULL DEFAULT 85,
    "decimals" INTEGER NOT NULL DEFAULT 5,
    "status" "OtcAssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "sessionStartUtc" TEXT,
    "sessionEndUtc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "otc_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otc_candles" (
    "id" BIGSERIAL NOT NULL,
    "assetId" TEXT NOT NULL,
    "timeframe" INTEGER NOT NULL,
    "openTime" TIMESTAMP(3) NOT NULL,
    "open" DECIMAL(18,5) NOT NULL,
    "high" DECIMAL(18,5) NOT NULL,
    "low" DECIMAL(18,5) NOT NULL,
    "close" DECIMAL(18,5) NOT NULL,

    CONSTRAINT "otc_candles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "otc_assets_symbol_key" ON "otc_assets"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "otc_candles_assetId_timeframe_openTime_key" ON "otc_candles"("assetId", "timeframe", "openTime");

-- CreateIndex
CREATE INDEX "otc_candles_assetId_timeframe_openTime_idx" ON "otc_candles"("assetId", "timeframe", "openTime" DESC);

-- AddForeignKey
ALTER TABLE "otc_candles" ADD CONSTRAINT "otc_candles_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "otc_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
