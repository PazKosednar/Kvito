-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('HOUSE', 'APARTMENT', 'COMMERCIAL');

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "type" "PropertyType" NOT NULL DEFAULT 'APARTMENT';
