-- AlterTable
ALTER TABLE "SupportEmail" ADD COLUMN "topic" TEXT;

-- CreateIndex
CREATE INDEX "SupportEmail_topic_receivedAt_idx" ON "SupportEmail"("topic", "receivedAt");

-- AlterTable
ALTER TABLE "SupportEmail" ADD COLUMN "spam" BOOLEAN NOT NULL DEFAULT false;
