-- CreateEnum
CREATE TYPE "BillingMode" AS ENUM ('COMBINED', 'SEPARATE');

-- CreateEnum
CREATE TYPE "CreditChoice" AS ENUM ('CARRY_OVER', 'OFFSET_NEXT', 'REFUND');

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "costEntryId" TEXT;

-- AlterTable
ALTER TABLE "ChargeLine" ADD COLUMN     "creditSettlementId" TEXT;

-- AlterTable
ALTER TABLE "CostSettlement" ADD COLUMN     "carriedInCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "creditChoice" "CreditChoice",
ADD COLUMN     "creditRemainingCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "recommendedChoice" "CreditChoice";

-- AlterTable
ALTER TABLE "Tenancy" ADD COLUMN     "billingMode" "BillingMode" NOT NULL DEFAULT 'SEPARATE';

-- CreateTable
CREATE TABLE "CostEntry" (
    "id" TEXT NOT NULL,
    "tenancyId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "costType" "CostType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CostEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CostEntry_tenancyId_period_idx" ON "CostEntry"("tenancyId", "period");

-- One active entry per tenancy, month and cost type (soft-deleted rows do not count).
CREATE UNIQUE INDEX "CostEntry_active_key" ON "CostEntry"("tenancyId", "period", "costType") WHERE "deletedAt" IS NULL;

-- CreateIndex
CREATE INDEX "ChargeLine_creditSettlementId_idx" ON "ChargeLine"("creditSettlementId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_costEntryId_fkey" FOREIGN KEY ("costEntryId") REFERENCES "CostEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeLine" ADD CONSTRAINT "ChargeLine_creditSettlementId_fkey" FOREIGN KEY ("creditSettlementId") REFERENCES "CostSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostEntry" ADD CONSTRAINT "CostEntry_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
