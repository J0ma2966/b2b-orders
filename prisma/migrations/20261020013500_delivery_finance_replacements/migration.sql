-- CreateEnum
CREATE TYPE "DebtEntryType" AS ENUM ('ORDER_CHARGE', 'ORDER_PAYMENT', 'DEBT_PAYMENT', 'CORRECTION');

-- CreateEnum
CREATE TYPE "ReplacementStatus" AS ENUM ('NEW', 'APPROVED', 'REJECTED', 'ASSIGNED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReturnedStatus" AS ENUM ('PENDING_CHECK', 'CHECKED', 'USABLE', 'DEFECTIVE', 'WRITTEN_OFF', 'DISPOSED', 'BACK_TO_STOCK');

-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'REPLACEMENT_OUT';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "balanceAfter" DECIMAL(14,2),
ADD COLUMN     "balanceBefore" DECIMAL(14,2),
ADD COLUMN     "cancelRequestReason" TEXT,
ADD COLUMN     "cancelRequestedAt" TIMESTAMP(3),
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "correctionTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "inTransitAt" TIMESTAMP(3),
ADD COLUMN     "orderDebt" DECIMAL(14,2),
ADD COLUMN     "orderedTotal" DECIMAL(14,2),
ADD COLUMN     "overpaid" DECIMAL(14,2),
ADD COLUMN     "paidToDebt" DECIMAL(14,2),
ADD COLUMN     "paidToOrder" DECIMAL(14,2),
ADD COLUMN     "problemNote" TEXT,
ADD COLUMN     "qrToken" TEXT,
ADD COLUMN     "qrUsedAt" TIMESTAMP(3),
ADD COLUMN     "receivedAmount" DECIMAL(14,2),
ADD COLUMN     "receivedMethod" "PaymentMethod",
ADD COLUMN     "statusBeforeRequest" "OrderStatus";

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "deliveredQty" DECIMAL(14,3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pushEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ShopAccount" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "creditAllowed" BOOLEAN NOT NULL DEFAULT false,
    "creditLimit" DECIMAL(14,2),
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtEntry" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "orderId" TEXT,
    "type" "DebtEntryType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "balanceAfter" DECIMAL(14,2) NOT NULL,
    "paymentMethod" "PaymentMethod",
    "comment" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "onBehalfOfUserId" TEXT,
    "correctsId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebtEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Replacement" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "shopId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "productUnitId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "unitLabel" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "reason" TEXT NOT NULL,
    "comment" TEXT,
    "photoPaths" TEXT[],
    "videoPaths" TEXT[],
    "status" "ReplacementStatus" NOT NULL DEFAULT 'NEW',
    "decisionComment" TEXT,
    "courierId" TEXT,
    "newOrderId" TEXT,
    "createdByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Replacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnedItem" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "replacementId" TEXT,
    "productUnitId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "unitLabel" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "reason" TEXT NOT NULL,
    "courierId" TEXT,
    "status" "ReturnedStatus" NOT NULL DEFAULT 'PENDING_CHECK',
    "comment" TEXT,
    "photoPaths" TEXT[],
    "videoPaths" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReturnedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopAccount_supplierId_idx" ON "ShopAccount"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopAccount_shopId_supplierId_key" ON "ShopAccount"("shopId", "supplierId");

-- CreateIndex
CREATE INDEX "DebtEntry_accountId_createdAt_idx" ON "DebtEntry"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "DebtEntry_orderId_idx" ON "DebtEntry"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Replacement_number_key" ON "Replacement"("number");

-- CreateIndex
CREATE INDEX "Replacement_supplierId_status_idx" ON "Replacement"("supplierId", "status");

-- CreateIndex
CREATE INDEX "Replacement_shopId_idx" ON "Replacement"("shopId");

-- CreateIndex
CREATE INDEX "Replacement_courierId_status_idx" ON "Replacement"("courierId", "status");

-- CreateIndex
CREATE INDEX "ReturnedItem_supplierId_status_idx" ON "ReturnedItem"("supplierId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_qrToken_key" ON "Order"("qrToken");

-- AddForeignKey
ALTER TABLE "ShopAccount" ADD CONSTRAINT "ShopAccount_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopAccount" ADD CONSTRAINT "ShopAccount_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtEntry" ADD CONSTRAINT "DebtEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ShopAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtEntry" ADD CONSTRAINT "DebtEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Replacement" ADD CONSTRAINT "Replacement_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Replacement" ADD CONSTRAINT "Replacement_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Replacement" ADD CONSTRAINT "Replacement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Replacement" ADD CONSTRAINT "Replacement_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Replacement" ADD CONSTRAINT "Replacement_productUnitId_fkey" FOREIGN KEY ("productUnitId") REFERENCES "ProductUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Replacement" ADD CONSTRAINT "Replacement_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Replacement" ADD CONSTRAINT "Replacement_newOrderId_fkey" FOREIGN KEY ("newOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnedItem" ADD CONSTRAINT "ReturnedItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnedItem" ADD CONSTRAINT "ReturnedItem_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnedItem" ADD CONSTRAINT "ReturnedItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnedItem" ADD CONSTRAINT "ReturnedItem_replacementId_fkey" FOREIGN KEY ("replacementId") REFERENCES "Replacement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnedItem" ADD CONSTRAINT "ReturnedItem_productUnitId_fkey" FOREIGN KEY ("productUnitId") REFERENCES "ProductUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Принятое не больше доставленного, доставленное не больше заказанного
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_accept_bounds" CHECK (
  ("deliveredQty" IS NULL OR ("deliveredQty" >= 0 AND "deliveredQty" <= "qty")) AND
  ("acceptedQty" IS NULL OR ("acceptedQty" >= 0 AND "acceptedQty" <= COALESCE("deliveredQty", "qty")))
);
ALTER TABLE "Replacement" ADD CONSTRAINT "Replacement_qty_positive" CHECK ("qty" > 0);
ALTER TABLE "ReturnedItem" ADD CONSTRAINT "ReturnedItem_qty_positive" CHECK ("qty" > 0);
