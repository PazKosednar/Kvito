-- CreateEnum
CREATE TYPE "PaymentSource" AS ENUM ('TENANT', 'BANK_IMPORT', 'LANDLORD');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('AWAITING_PAYMENT', 'HELD', 'RETURN_PROPOSED', 'RETURN_DISPUTED', 'RETURN_AGREED', 'RETURNED');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('DRAFT', 'SENT', 'DISPUTED', 'ACCEPTED', 'CLOSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ChargeType" ADD VALUE 'DEPOSIT';
ALTER TYPE "ChargeType" ADD VALUE 'ADVANCE';
ALTER TYPE "ChargeType" ADD VALUE 'SETTLEMENT';

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "settlementId" TEXT;

-- AlterTable
ALTER TABLE "Charge" ADD COLUMN     "autoKey" TEXT;

-- AlterTable
ALTER TABLE "PaymentReport" ADD COLUMN     "bankEntryRef" TEXT,
ADD COLUMN     "source" "PaymentSource" NOT NULL DEFAULT 'TENANT';

-- AlterTable
ALTER TABLE "Tenancy" ADD COLUMN     "noticePeriodDays" INTEGER,
ADD COLUMN     "paymentNote" TEXT,
ADD COLUMN     "rentReviewMonth" INTEGER;

-- CreateTable
CREATE TABLE "ChargeLine" (
    "id" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "costType" "CostType" NOT NULL,
    "label" TEXT,
    "amountCents" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChargeLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "tenancyId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "DepositStatus" NOT NULL,
    "chargeId" TEXT,
    "receivedOn" DATE,
    "returnCents" INTEGER,
    "proposalNote" TEXT,
    "proposedAt" TIMESTAMP(3),
    "disputeReason" TEXT,
    "agreedAt" TIMESTAMP(3),
    "agreedById" TEXT,
    "returnedOn" DATE,
    "receiptConfirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositDeduction" (
    "id" TEXT NOT NULL,
    "depositId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "handoverItemId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepositDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostAdvance" (
    "id" TEXT NOT NULL,
    "tenancyId" TEXT NOT NULL,
    "costType" "CostType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CostAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostSettlement" (
    "id" TEXT NOT NULL,
    "tenancyId" TEXT NOT NULL,
    "periodFrom" DATE NOT NULL,
    "periodTo" DATE NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "dueDate" DATE,
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "disputeReason" TEXT,
    "chargeId" TEXT,
    "refundedOn" DATE,
    "refundConfirmedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CostSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementLine" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "costType" "CostType" NOT NULL,
    "advanceCents" INTEGER NOT NULL,
    "actualCents" INTEGER NOT NULL,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SettlementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentChange" (
    "id" TEXT NOT NULL,
    "tenancyId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "rentCents" INTEGER NOT NULL,
    "previousCents" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RentChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChargeLine_chargeId_idx" ON "ChargeLine"("chargeId");

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_tenancyId_key" ON "Deposit"("tenancyId");

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_chargeId_key" ON "Deposit"("chargeId");

-- CreateIndex
CREATE INDEX "DepositDeduction_depositId_idx" ON "DepositDeduction"("depositId");

-- CreateIndex
CREATE INDEX "CostAdvance_tenancyId_idx" ON "CostAdvance"("tenancyId");

-- CreateIndex
CREATE UNIQUE INDEX "CostSettlement_chargeId_key" ON "CostSettlement"("chargeId");

-- CreateIndex
CREATE INDEX "CostSettlement_tenancyId_idx" ON "CostSettlement"("tenancyId");

-- CreateIndex
CREATE INDEX "SettlementLine_settlementId_idx" ON "SettlementLine"("settlementId");

-- CreateIndex
CREATE INDEX "RentChange_tenancyId_effectiveFrom_idx" ON "RentChange"("tenancyId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "Charge_tenancyId_autoKey_key" ON "Charge"("tenancyId", "autoKey");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "CostSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeLine" ADD CONSTRAINT "ChargeLine_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositDeduction" ADD CONSTRAINT "DepositDeduction_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "Deposit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositDeduction" ADD CONSTRAINT "DepositDeduction_handoverItemId_fkey" FOREIGN KEY ("handoverItemId") REFERENCES "HandoverItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostAdvance" ADD CONSTRAINT "CostAdvance_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostSettlement" ADD CONSTRAINT "CostSettlement_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostSettlement" ADD CONSTRAINT "CostSettlement_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementLine" ADD CONSTRAINT "SettlementLine_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "CostSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentChange" ADD CONSTRAINT "RentChange_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

