-- DropForeignKey
ALTER TABLE "TaskActivity" DROP CONSTRAINT "TaskActivity_actorId_fkey";

-- AlterTable
ALTER TABLE "TaskActivity" ADD COLUMN     "apiKeyActorId" TEXT,
ALTER COLUMN "actorId" DROP NOT NULL;

-- Exactly-one-of check: every entry predating this migration already has
-- `actorId` set (API keys didn't exist before), so this holds immediately
-- with no backfill needed. Not representable in schema.prisma (Prisma has no
-- CHECK constraint syntax), so it's hand-written here, same approach as
-- every other constraint schema.prisma can't express (Invitation's partial
-- unique index, Label's functional unique index).
ALTER TABLE "TaskActivity" ADD CONSTRAINT "TaskActivity_actor_xor_check" CHECK (
  ("actorId" IS NOT NULL AND "apiKeyActorId" IS NULL) OR ("actorId" IS NULL AND "apiKeyActorId" IS NOT NULL)
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "eventTypes" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "disabledReason" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "outboxEventId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "statusCode" INTEGER,
    "responseSnippet" TEXT,
    "error" TEXT,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "createdById" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutboxEvent_dispatchedAt_createdAt_idx" ON "OutboxEvent"("dispatchedAt", "createdAt");

-- Partial index backing the dispatcher's actual query
-- (`WHERE "dispatchedAt" IS NULL ORDER BY "createdAt" ... FOR UPDATE SKIP
-- LOCKED`): every row it ever touches has a null "dispatchedAt", so indexing
-- only those rows keeps the index small and the scan cheap no matter how
-- many already-dispatched rows have piled up. Not representable in
-- schema.prisma, hand-written here like Invitation's partial unique index.
CREATE INDEX "OutboxEvent_pending_idx" ON "OutboxEvent"("createdAt") WHERE "dispatchedAt" IS NULL;

-- CreateIndex
CREATE INDEX "WebhookEndpoint_organizationId_idx" ON "WebhookEndpoint"("organizationId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_endpointId_createdAt_idx" ON "WebhookDelivery"("endpointId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_organizationId_idx" ON "ApiKey"("organizationId");

-- AddForeignKey
ALTER TABLE "TaskActivity" ADD CONSTRAINT "TaskActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskActivity" ADD CONSTRAINT "TaskActivity_apiKeyActorId_fkey" FOREIGN KEY ("apiKeyActorId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_outboxEventId_fkey" FOREIGN KEY ("outboxEventId") REFERENCES "OutboxEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
