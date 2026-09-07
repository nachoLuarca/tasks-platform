-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'MEMBER';

-- Backfill: every Membership row that predates this migration belongs to a
-- Phase 1 personal organization, whose single member is its owner.
UPDATE "Membership" SET "role" = 'OWNER';

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_organizationId_email_idx" ON "Invitation"("organizationId", "email");

-- Partial unique index: at most one *pending* invitation per (organization,
-- email). Not representable in schema.prisma (Prisma has no partial-index
-- syntax), so it's hand-written here. An accepted or revoked invitation
-- falls outside the predicate and never blocks a new one.
CREATE UNIQUE INDEX "Invitation_pending_org_email_key" ON "Invitation"("organizationId", "email") WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
