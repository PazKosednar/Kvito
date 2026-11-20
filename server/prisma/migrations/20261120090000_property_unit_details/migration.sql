-- CreateEnum
CREATE TYPE "Furnishing" AS ENUM ('UNFURNISHED', 'PARTLY', 'FURNISHED');

-- CreateEnum
CREATE TYPE "UtilityKind" AS ENUM ('ELECTRICITY', 'GAS', 'WATER', 'HEATING', 'INTERNET', 'OTHER');

-- AlterEnum
ALTER TYPE "AttachmentKind" ADD VALUE 'PHOTO';

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN "propertyId" TEXT,
ADD COLUMN "unitId" TEXT;

-- AlterTable
ALTER TABLE "Property" ADD COLUMN "insurancePolicy" TEXT,
ADD COLUMN "insuranceValidUntil" DATE,
ADD COLUMN "insurer" TEXT,
ADD COLUMN "managerContact" TEXT,
ADD COLUMN "managerName" TEXT,
ADD COLUMN "reserveFundCents" INTEGER,
ADD COLUMN "yearBuilt" INTEGER,
ADD COLUMN "yearRenovated" INTEGER;

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN "areaM2" DOUBLE PRECISION,
ADD COLUMN "buildingPartId" TEXT,
ADD COLUMN "energyCertValidUntil" DATE,
ADD COLUMN "energyClass" TEXT,
ADD COLUMN "furnishing" "Furnishing",
ADD COLUMN "hasBalcony" BOOLEAN,
ADD COLUMN "hasParking" BOOLEAN,
ADD COLUMN "hasStorage" BOOLEAN,
ADD COLUMN "petsAllowed" BOOLEAN,
ADD COLUMN "rooms" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "UtilityPoint" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "kind" "UtilityKind" NOT NULL,
    "pointNumber" TEXT,
    "supplier" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UtilityPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeySet" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "holder" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeySet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UtilityPoint_unitId_idx" ON "UtilityPoint"("unitId");

-- CreateIndex
CREATE INDEX "KeySet_unitId_idx" ON "KeySet"("unitId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtilityPoint" ADD CONSTRAINT "UtilityPoint_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeySet" ADD CONSTRAINT "KeySet_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
