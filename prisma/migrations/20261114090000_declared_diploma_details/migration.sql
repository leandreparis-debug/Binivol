-- CreateEnum
CREATE TYPE "DeclaredDiplomaIssuer" AS ENUM ('CRF', 'CIVIL_PROTECTION', 'SDIS', 'EMPLOYER', 'OTHER');

-- AlterTable
ALTER TABLE "person_declared_diplomas" ADD COLUMN     "code" TEXT,
ADD COLUMN     "issuer" "DeclaredDiplomaIssuer",
ADD COLUMN     "year" INTEGER;

-- Year obtained: four digits, plausible (written by hand: Prisma cannot express it).
ALTER TABLE "person_declared_diplomas"
  ADD CONSTRAINT "person_declared_diplomas_year_range" CHECK ("year" IS NULL OR "year" BETWEEN 1900 AND 2100);
