-- CreateTable
CREATE TABLE "SupportEmail" (
    "id" TEXT NOT NULL,
    "messageKey" TEXT NOT NULL,
    "uid" INTEGER NOT NULL,
    "fromAddress" TEXT,
    "fromName" TEXT,
    "replyTo" TEXT,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "attachments" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "handledAt" TIMESTAMP(3),
    "handledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportEmail_messageKey_key" ON "SupportEmail"("messageKey");

-- CreateIndex
CREATE INDEX "SupportEmail_handledAt_receivedAt_idx" ON "SupportEmail"("handledAt", "receivedAt");

-- CreateIndex
CREATE INDEX "SupportEmail_receivedAt_idx" ON "SupportEmail"("receivedAt");

