-- AlterTable
ALTER TABLE "PortalAccount" ADD COLUMN     "mfaEnrolledAt" TIMESTAMP(3),
ADD COLUMN     "mfaLastStep" INTEGER,
ADD COLUMN     "mfaSecretSealed" TEXT NOT NULL DEFAULT '';
