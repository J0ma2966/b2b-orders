-- CreateEnum
CREATE TYPE "CommissionInvoiceStatus" AS ENUM ('ISSUED', 'PAID', 'CANCELLED');

-- AlterEnum
ALTER TYPE "ReplacementStatus" ADD VALUE 'CREDITED';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cartRemindedAt" TIMESTAMP(3),
ADD COLUMN     "problemAt" TIMESTAMP(3),
ADD COLUMN     "problemPhotoPaths" TEXT[],
ADD COLUMN     "problemReason" TEXT,
ADD COLUMN     "routeOrder" INTEGER,
ADD COLUMN     "staleRemindedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ProductUnit" ADD COLUMN     "lowStockThreshold" DECIMAL(14,3);

-- AlterTable
ALTER TABLE "Replacement" ADD COLUMN     "creditedAmount" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "ShopAccount" ADD COLUMN     "dueRemindedFor" TIMESTAMP(3),
ADD COLUMN     "overdueNotifiedFor" TIMESTAMP(3),
ADD COLUMN     "paymentTermDays" INTEGER;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "creditOverLimitBlock" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "minOrderTotal" DECIMAL(14,2),
ADD COLUMN     "orderCutoffHour" INTEGER,
ADD COLUMN     "skipAssembly" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SupplierTerritory" ADD COLUMN     "courierId" TEXT,
ADD COLUMN     "deliveryWeekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- CreateTable
CREATE TABLE "CashHandover" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "onHand" DECIMAL(14,2) NOT NULL,
    "comment" TEXT,
    "acceptedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashHandover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FavoriteProduct" (
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteProduct_pkey" PRIMARY KEY ("shopId","productId")
);

-- CreateTable
CREATE TABLE "CommissionInvoice" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "supplierId" TEXT NOT NULL,
    "period" DATE NOT NULL,
    "orders" INTEGER NOT NULL,
    "turnover" DECIMAL(14,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "CommissionInvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "paidAt" TIMESTAMP(3),
    "comment" TEXT,
    "remindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashHandover_supplierId_courierId_createdAt_idx" ON "CashHandover"("supplierId", "courierId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionInvoice_number_key" ON "CommissionInvoice"("number");

-- CreateIndex
CREATE INDEX "CommissionInvoice_status_dueDate_idx" ON "CommissionInvoice"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionInvoice_supplierId_period_key" ON "CommissionInvoice"("supplierId", "period");

-- AddForeignKey
ALTER TABLE "SupplierTerritory" ADD CONSTRAINT "SupplierTerritory_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashHandover" ADD CONSTRAINT "CashHandover_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashHandover" ADD CONSTRAINT "CashHandover_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteProduct" ADD CONSTRAINT "FavoriteProduct_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteProduct" ADD CONSTRAINT "FavoriteProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionInvoice" ADD CONSTRAINT "CommissionInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

