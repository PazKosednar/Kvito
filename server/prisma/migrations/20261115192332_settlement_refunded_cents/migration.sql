-- AlterTable
ALTER TABLE "CostSettlement" ADD COLUMN     "refundedCents" INTEGER;

-- Overpayments returned before this column existed: advances + carried-in credit − actual costs.
UPDATE "CostSettlement" s
SET "refundedCents" = l.adv + s."carriedInCents" - l.act
FROM (SELECT "settlementId", SUM("advanceCents") AS adv, SUM("actualCents") AS act FROM "SettlementLine" GROUP BY "settlementId") l
WHERE l."settlementId" = s.id AND s."refundedOn" IS NOT NULL AND (s."creditChoice" IS NULL OR s."creditChoice" = 'REFUND');