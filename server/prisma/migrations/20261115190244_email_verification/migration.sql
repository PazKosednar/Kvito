-- CreateEnum
CREATE TYPE "CodePurpose" AS ENUM ('LOGIN', 'VERIFY_EMAIL', 'RESET_PASSWORD');

-- AlterTable
ALTER TABLE "LoginCode" ADD COLUMN     "purpose" "CodePurpose" NOT NULL DEFAULT 'LOGIN';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;

-- Existing accounts signed up with an e-mailed code (or come from the seed): their e-mail is proven.
UPDATE "User" SET "emailVerifiedAt" = COALESCE("lastLoginAt", "createdAt") WHERE "deletedAt" IS NULL;
