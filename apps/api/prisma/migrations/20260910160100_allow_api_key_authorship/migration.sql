-- Phase 4.5: an API key with a write scope can create projects, tasks and
-- comments in its own name. It is never attributed to the person who created
-- the key (PHASE.md decisions 6-7), so each of these rows gains a second,
-- mutually exclusive author column pointing at ApiKey -- the same dual-actor
-- shape TaskActivity already uses since Phase 4.
--
-- Every existing row has its user column set (API keys couldn't write
-- before this migration), so each exactly-one-of CHECK holds immediately with
-- no backfill. The CHECKs aren't representable in schema.prisma, hence
-- hand-written here, like TaskActivity_actor_xor_check. The existing user
-- FKs keep ON DELETE RESTRICT and the new ones use it too: SET NULL on either
-- side would violate the CHECK.

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "authorApiKeyId" TEXT,
ALTER COLUMN "authorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "createdByApiKeyId" TEXT,
ALTER COLUMN "createdById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "createdByApiKeyId" TEXT,
ALTER COLUMN "createdById" DROP NOT NULL;

ALTER TABLE "Project" ADD CONSTRAINT "Project_creator_xor_check" CHECK (
  ("createdById" IS NOT NULL AND "createdByApiKeyId" IS NULL) OR ("createdById" IS NULL AND "createdByApiKeyId" IS NOT NULL)
);

ALTER TABLE "Task" ADD CONSTRAINT "Task_creator_xor_check" CHECK (
  ("createdById" IS NOT NULL AND "createdByApiKeyId" IS NULL) OR ("createdById" IS NULL AND "createdByApiKeyId" IS NOT NULL)
);

ALTER TABLE "Comment" ADD CONSTRAINT "Comment_author_xor_check" CHECK (
  ("authorId" IS NOT NULL AND "authorApiKeyId" IS NULL) OR ("authorId" IS NULL AND "authorApiKeyId" IS NOT NULL)
);

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdByApiKeyId_fkey" FOREIGN KEY ("createdByApiKeyId") REFERENCES "ApiKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdByApiKeyId_fkey" FOREIGN KEY ("createdByApiKeyId") REFERENCES "ApiKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorApiKeyId_fkey" FOREIGN KEY ("authorApiKeyId") REFERENCES "ApiKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
