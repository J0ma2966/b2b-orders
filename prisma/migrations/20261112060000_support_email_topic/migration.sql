-- AlterTable
ALTER TABLE "SupportEmail" ADD COLUMN "topic" TEXT;

-- CreateIndex
CREATE INDEX "SupportEmail_topic_receivedAt_idx" ON "SupportEmail"("topic", "receivedAt");
