-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PLACED', 'ACCEPTED', 'ASSEMBLING', 'READY', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'CANCELLED_BY_SHOP', 'CANCELLED_BY_SUPPLIER', 'REJECTED', 'NOT_DELIVERED', 'PARTIALLY_ACCEPTED', 'NEEDS_CONFIRMATION', 'DELIVERY_PROBLEM');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'TRANSFER');

-- CreateEnum
CREATE TYPE "OrderItemKind" AS ENUM ('REGULAR', 'FORCED', 'BONUS');

-- CreateEnum
CREATE TYPE "CancelSide" AS ENUM ('SHOP', 'SUPPLIER', 'PLATFORM');

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "number" INTEGER,
    "supplierId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT,
    "paymentMethod" "PaymentMethod",
    "comment" TEXT,
    "deliveryAddress" TEXT,
    "deliveryLat" DOUBLE PRECISION,
    "deliveryLng" DOUBLE PRECISION,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "deliveryDate" DATE,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "commissionRate" DECIMAL(5,2),
    "courierId" TEXT,
    "placedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" "CancelSide",
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productUnitId" TEXT NOT NULL,
    "kind" "OrderItemKind" NOT NULL DEFAULT 'REGULAR',
    "productName" TEXT NOT NULL,
    "unitLabel" TEXT NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "acceptedQty" DECIMAL(14,3),
    "bonusPromotionId" TEXT,
    "addedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus",
    "userId" TEXT,
    "onBehalfOfUserId" TEXT,
    "actorRole" TEXT,
    "comment" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BonusPromotion" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerUnitId" TEXT NOT NULL,
    "triggerQty" DECIMAL(14,3) NOT NULL,
    "giftUnitId" TEXT NOT NULL,
    "giftQty" DECIMAL(14,3) NOT NULL,
    "repeatable" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BonusPromotion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_number_key" ON "Order"("number");

-- CreateIndex
CREATE INDEX "Order_shopId_status_idx" ON "Order"("shopId", "status");

-- CreateIndex
CREATE INDEX "Order_supplierId_status_placedAt_idx" ON "Order"("supplierId", "status", "placedAt");

-- CreateIndex
CREATE INDEX "Order_courierId_status_idx" ON "Order"("courierId", "status");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productUnitId_idx" ON "OrderItem"("productUnitId");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "BonusPromotion_supplierId_isActive_idx" ON "BonusPromotion"("supplierId", "isActive");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productUnitId_fkey" FOREIGN KEY ("productUnitId") REFERENCES "ProductUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_bonusPromotionId_fkey" FOREIGN KEY ("bonusPromotionId") REFERENCES "BonusPromotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonusPromotion" ADD CONSTRAINT "BonusPromotion_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonusPromotion" ADD CONSTRAINT "BonusPromotion_triggerUnitId_fkey" FOREIGN KEY ("triggerUnitId") REFERENCES "ProductUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonusPromotion" ADD CONSTRAINT "BonusPromotion_giftUnitId_fkey" FOREIGN KEY ("giftUnitId") REFERENCES "ProductUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Номер заказа выдаётся при оформлении, черновики номер не расходуют
CREATE SEQUENCE "order_number_seq" START 1001;

-- Одна корзина (черновик) на магазин у одного поставщика
CREATE UNIQUE INDEX "Order_one_draft_per_shop_supplier" ON "Order"("shopId", "supplierId") WHERE "status" = 'DRAFT';

-- Количество в позиции всегда положительное
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_qty_positive" CHECK ("qty" > 0);
